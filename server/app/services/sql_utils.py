from __future__ import annotations

from typing import Any



def build_set_clause(payload: dict[str, Any]) -> tuple[str, list[Any]]:
    if not payload:
        return "", []
    columns = list(payload.keys())
    clause = ", ".join(f"{col} = %s" for col in columns)
    values = [payload[col] for col in columns]
    return clause, values



def build_insert_clause(payload: dict[str, Any]) -> tuple[str, str, list[Any]]:
    columns = list(payload.keys())
    col_sql = ", ".join(columns)
    placeholder_sql = ", ".join(["%s"] * len(columns))
    values = [payload[col] for col in columns]
    return col_sql, placeholder_sql, values
