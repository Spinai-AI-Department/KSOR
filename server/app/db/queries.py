from __future__ import annotations

from typing import Any, Iterable, Sequence

from psycopg import AsyncConnection


async def fetch_one(conn: AsyncConnection, query: str, params: Sequence[Any] | None = None):
    async with conn.cursor() as cur:
        await cur.execute(query, params or ())
        return await cur.fetchone()


async def fetch_all(conn: AsyncConnection, query: str, params: Sequence[Any] | None = None):
    async with conn.cursor() as cur:
        await cur.execute(query, params or ())
        return await cur.fetchall()


async def fetch_val(conn: AsyncConnection, query: str, params: Sequence[Any] | None = None, default=None):
    row = await fetch_one(conn, query, params)
    if row is None:
        return default
    if isinstance(row, dict):
        return next(iter(row.values()))
    return row[0]


async def execute(conn: AsyncConnection, query: str, params: Sequence[Any] | None = None) -> int:
    async with conn.cursor() as cur:
        await cur.execute(query, params or ())
        return cur.rowcount


async def executemany(conn: AsyncConnection, query: str, seq_of_params: Iterable[Sequence[Any]]):
    async with conn.cursor() as cur:
        await cur.executemany(query, seq_of_params)
        return cur.rowcount
