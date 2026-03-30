from __future__ import annotations

import asyncio
import logging

from app.core.config import settings
from app.core.logging import configure_logging
from app.db.pool import db
from app.services import outbox_service

logger = logging.getLogger(__name__)


async def _process_row(row: dict) -> None:
    async with db.pool.connection() as conn:
        await outbox_service.process_message(conn, row)


async def main() -> None:
    configure_logging()
    await db.open()
    logger.info("outbox_dispatcher_started")
    semaphore = asyncio.Semaphore(settings.outbox_max_concurrency)
    try:
        while True:
            async with db.pool.connection() as conn:
                await outbox_service.write_node_heartbeat(conn)
                rows = await outbox_service.lease_next_batch(
                    conn,
                    node_name=settings.app_node_name,
                    batch_size=settings.outbox_batch_size,
                    lease_seconds=settings.outbox_lease_seconds,
                )
            if not rows:
                await asyncio.sleep(settings.outbox_poll_interval_seconds)
                continue

            async def _run(row: dict) -> None:
                async with semaphore:
                    try:
                        await _process_row(row)
                    except Exception:  # noqa: BLE001
                        logger.exception("outbox_message_processing_failed", extra={"message_id": str(row.get("message_id"))})

            await asyncio.gather(*[_run(row) for row in rows])
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
