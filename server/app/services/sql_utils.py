from __future__ import annotations

import json
from typing import Any


def _serialize_value(value: Any) -> Any:
    """Serialize Python list/dict values to JSON strings for PostgreSQL jsonb columns."""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return value


def build_set_clause(payload: dict[str, Any]) -> tuple[str, list[Any]]:
    if not payload:
        return "", []
    columns = list(payload.keys())
    clause = ", ".join(f"{col} = %s" for col in columns)
    values = [_serialize_value(payload[col]) for col in columns]
    return clause, values



def build_insert_clause(payload: dict[str, Any]) -> tuple[str, str, list[Any]]:
    columns = list(payload.keys())
    col_sql = ", ".join(columns)
    placeholder_sql = ", ".join(["%s"] * len(columns))
    values = [_serialize_value(payload[col]) for col in columns]
    return col_sql, placeholder_sql, values
