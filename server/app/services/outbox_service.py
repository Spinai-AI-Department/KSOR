from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx
from psycopg import AsyncConnection

from app.core.config import settings
from app.core.encryption import crypto
from app.db.queries import execute, fetch_all, fetch_one

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class VendorSendResult:
    success: bool
    status_code: int
    vendor_request_id: str | None = None
    vendor_message_id: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    payload: dict[str, Any] | None = None


class GenericAlimtalkClient:
    async def send(self, *, phone: str, payload: dict[str, Any], body: str | None) -> VendorSendResult:
        if settings.alimtalk_vendor_mode == "noop" or not settings.alimtalk_api_base_url:
            vendor_message_id = f"noop-{uuid4()}"
            return VendorSendResult(
                success=True,
                status_code=200,
                vendor_request_id=str(uuid4()),
                vendor_message_id=vendor_message_id,
                payload={"mode": "noop", "phone": phone, "payload": payload},
            )

        request_body = {
            "sender_key": settings.alimtalk_sender_key,
            "recipient": phone,
            "body": body,
            "payload": payload,
        }
        headers = {
            "Authorization": f"Bearer {settings.alimtalk_api_key}",
        }
        async with httpx.AsyncClient(timeout=settings.alimtalk_timeout_seconds) as client:
            resp = await client.post(
                settings.alimtalk_api_base_url.rstrip("/") + settings.alimtalk_send_path,
                json=request_body,
                headers=headers,
            )
        data = {}
        try:
            data = resp.json()
        except Exception:  # noqa: BLE001
            data = {"raw": resp.text}
        ok = 200 <= resp.status_code < 300
        return VendorSendResult(
            success=ok,
            status_code=resp.status_code,
            vendor_request_id=str(data.get("request_id") or data.get("id") or uuid4()),
            vendor_message_id=str(data.get("message_id") or data.get("msg_id") or uuid4()),
            error_code=None if ok else str(data.get("error_code") or resp.status_code),
            error_message=None if ok else str(data.get("message") or resp.text[:200]),
            payload=data,
        )


vendor_client = GenericAlimtalkClient()


async def lease_next_batch(conn: AsyncConnection, *, node_name: str, batch_size: int, lease_seconds: int) -> list[dict[str, Any]]:
    lease_token = str(uuid4())
    return await fetch_all(
        conn,
        """
        WITH candidate AS (
            SELECT mo.message_id
            FROM messaging.message_outbox mo
            WHERE mo.status IN ('QUEUED', 'FAILED')
              AND mo.next_attempt_at <= now()
            ORDER BY mo.priority DESC, mo.queued_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT %s
        )
        UPDATE messaging.message_outbox mo
           SET status = 'LEASED',
               lease_token = %s,
               leased_by_node = %s,
               lease_until = now() + make_interval(secs => %s),
               attempt_count = attempt_count + 1,
               updated_at = now()
          FROM candidate
         WHERE mo.message_id = candidate.message_id
     RETURNING mo.message_id, mo.hospital_code, mo.case_id, mo.patient_id, mo.request_id,
               mo.payload_jsonb, mo.message_body_snapshot, mo.recipient_phone_sha256,
               mo.attempt_count, mo.max_attempts, mo.vendor_code
        """,
        (batch_size, lease_token, node_name, lease_seconds),
    )


async def _load_recipient_phone(conn: AsyncConnection, patient_id: str) -> str | None:
    row = await fetch_one(conn, "SELECT phone_enc FROM vault.patient_identity WHERE patient_id = %s", (patient_id,))
    if not row:
        return None
    return crypto.decrypt_text(row["phone_enc"])


async def _mark_sent(conn: AsyncConnection, message_id: str, result: VendorSendResult) -> None:
    await execute(
        conn,
        """
        UPDATE messaging.message_outbox
           SET status = 'SENT',
               vendor_request_id = %s,
               vendor_message_id = %s,
               response_payload = %s::jsonb,
               sent_at = now(),
               lease_until = NULL,
               updated_at = now()
         WHERE message_id = %s
        """,
        (
            result.vendor_request_id,
            result.vendor_message_id,
            json.dumps(result.payload or {}, ensure_ascii=False),
            message_id,
        ),
    )
    await execute(
        conn,
        """
        UPDATE survey.prom_request
           SET token_status = 'SENT',
               latest_message_id = %s,
               updated_at = now()
         WHERE request_id = (
            SELECT request_id FROM messaging.message_outbox WHERE message_id = %s
         )
        """,
        (message_id, message_id),
    )


async def _mark_failed(conn: AsyncConnection, row: dict[str, Any], result: VendorSendResult) -> None:
    await execute(
        conn,
        """
        UPDATE messaging.message_outbox
           SET status = CASE WHEN attempt_count >= max_attempts THEN 'EXPIRED' ELSE 'FAILED' END,
               failed_at = now(),
               last_error_code = %s,
               last_error_message = %s,
               response_payload = %s::jsonb,
               next_attempt_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE now() + make_interval(secs => LEAST(300, 15 * GREATEST(1, attempt_count))) END,
               lease_until = NULL,
               updated_at = now()
         WHERE message_id = %s
        """,
        (
            result.error_code,
            result.error_message,
            json.dumps(result.payload or {}, ensure_ascii=False),
            row["message_id"],
        ),
    )


async def process_message(conn: AsyncConnection, row: dict[str, Any]) -> None:
    phone = await _load_recipient_phone(conn, str(row["patient_id"]))
    if not phone:
        await _mark_failed(
            conn,
            row,
            VendorSendResult(success=False, status_code=400, error_code="PHONE_NOT_FOUND", error_message="recipient phone not found"),
        )
        return
    payload = dict(row["payload_jsonb"] or {})
    result = await vendor_client.send(phone=phone, payload=payload, body=row["message_body_snapshot"])
    await fetch_one(
        conn,
        """
        INSERT INTO messaging.message_attempt (
            attempt_id, message_id, hospital_code, attempt_no, worker_node, request_id,
            requested_at, responded_at, http_status, success, error_code, error_message,
            request_payload, response_payload
        ) VALUES (
            gen_random_uuid(), %s, %s, %s, %s, %s,
            now(), now(), %s, %s, %s, %s,
            %s::jsonb, %s::jsonb
        )
        RETURNING attempt_id
        """,
        (
            row["message_id"],
            row["hospital_code"],
            row["attempt_count"],
            settings.app_node_name,
            str(row["request_id"]) if row.get("request_id") else None,
            result.status_code,
            result.success,
            result.error_code,
            result.error_message,
            json.dumps(payload, ensure_ascii=False),
            json.dumps(result.payload or {}, ensure_ascii=False),
        ),
    )
    if result.success:
        await _mark_sent(conn, str(row["message_id"]), result)
    else:
        await _mark_failed(conn, row, result)


async def process_outbox_batch(conn: AsyncConnection, *, batch_size: int | None = None) -> int:
    rows = await lease_next_batch(
        conn,
        node_name=settings.app_node_name,
        batch_size=batch_size or settings.outbox_batch_size,
        lease_seconds=settings.outbox_lease_seconds,
    )
    processed = 0
    for row in rows:
        await process_message(conn, row)
        processed += 1
    return processed


async def write_node_heartbeat(conn: AsyncConnection) -> None:
    await execute(
        conn,
        """
        INSERT INTO ops.node_heartbeat (node_name, node_role, node_ip, app_version, started_at, last_seen_at, meta_jsonb)
        VALUES (%s, 'WORKER', NULL, '1.0.0', now(), now(), '{}'::jsonb)
        ON CONFLICT (node_name)
        DO UPDATE SET last_seen_at = now(), node_role = 'WORKER'
        """,
        (settings.app_node_name,),
    )


async def register_webhook(conn: AsyncConnection, *, vendor_code: str, payload: dict[str, Any], remote_ip: str | None) -> None:
    vendor_message_id = str(payload.get("message_id") or payload.get("msg_id") or "") or None
    event_type = str(payload.get("event_type") or payload.get("status") or "UNKNOWN")
    message = await fetch_one(
        conn,
        "SELECT message_id, hospital_code FROM messaging.message_outbox WHERE vendor_message_id = %s",
        (vendor_message_id,),
    )
    await execute(
        conn,
        """
        INSERT INTO messaging.vendor_webhook_event (
            webhook_event_id, hospital_code, vendor_code, vendor_message_id, message_id,
            request_id, event_type, payload_jsonb, remote_ip, signature_verified,
            processing_status, received_at
        ) VALUES (
            gen_random_uuid(), %s, %s, %s, %s,
            NULL, %s, %s::jsonb, %s::inet, false,
            'RECEIVED', now()
        )
        """,
        (
            message["hospital_code"] if message else None,
            vendor_code,
            vendor_message_id,
            str(message["message_id"]) if message else None,
            event_type,
            json.dumps(payload, ensure_ascii=False),
            remote_ip,
        ),
    )
    if message:
        new_status = None
        if event_type.upper() in {"DELIVERED", "SUCCESS", "RECEIVED"}:
            new_status = "DELIVERED"
        elif event_type.upper() in {"OPENED", "CLICKED"}:
            new_status = "OPENED"
        elif event_type.upper() in {"FAILED", "ERROR"}:
            new_status = "FAILED"
        if new_status:
            await execute(
                conn,
                "UPDATE messaging.message_outbox SET status = %s::messaging.message_status, updated_at = now() WHERE message_id = %s",
                (new_status, str(message["message_id"])),
            )
