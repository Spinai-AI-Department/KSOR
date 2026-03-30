from __future__ import annotations

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.core.config import settings


class Database:
    def __init__(self) -> None:
        self.pool = AsyncConnectionPool(
            conninfo=settings.database_dsn,
            min_size=settings.db_pool_min_size,
            max_size=settings.db_pool_max_size,
            timeout=settings.db_pool_timeout_seconds,
            kwargs={
                "autocommit": False,
                "row_factory": dict_row,
            },
            open=False,
        )

    async def open(self) -> None:
        await self.pool.open(wait=True)

    async def close(self) -> None:
        await self.pool.close()


db = Database()
