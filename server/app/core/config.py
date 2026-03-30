from __future__ import annotations

import json
import os
import socket
from functools import lru_cache
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "KSOR API"
    app_env: str = "development"
    app_debug: bool = False
    app_node_name: str = Field(default_factory=lambda: socket.gethostname())
    app_load_balancer_id: str | None = None
    public_base_url: str = "http://127.0.0.1:8000"
    api_prefix: str = "/api"
    cors_origins: list[str] = Field(default_factory=list)
    trust_x_forwarded_for: bool = True

    database_dsn: str = Field('postgresql://ksor_app:change-me@127.0.0.1:5432/ksor', alias="DATABASE_DSN")
    db_pool_min_size: int = 10
    db_pool_max_size: int = 80
    db_pool_timeout_seconds: int = 30
    db_statement_timeout_ms: int = 15000
    db_idle_in_transaction_timeout_ms: int = 15000

    jwt_secret_key: str = Field('change-me-super-secret-key-at-least-32-bytes', alias="JWT_SECRET_KEY")
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "ksor-api"
    jwt_audience: str = "ksor-web"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30
    survey_token_expire_minutes: int = 30

    fernet_keys: list[str] = Field(default_factory=list)
    password_regex: str = r"^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,128}$"

    default_prom_request_expire_days: int = 7
    login_failure_lock_count: int = 5
    login_throttle_window_seconds: int = 60
    login_throttle_max_per_ip: int = 30
    login_throttle_max_per_login_id: int = 10
    last_active_write_interval_seconds: int = 300

    alimtalk_vendor_mode: str = "noop"
    alimtalk_api_base_url: str | None = None
    alimtalk_send_path: str = "/send"
    alimtalk_api_key: str | None = None
    alimtalk_api_secret: str | None = None
    alimtalk_sender_key: str | None = None
    alimtalk_timeout_seconds: float = 8.0
    alimtalk_template_fallback_vendor_code: str = "generic"

    outbox_batch_size: int = 100
    outbox_lease_seconds: int = 60
    outbox_poll_interval_seconds: float = 1.0
    outbox_max_concurrency: int = 50

    security_headers_enabled: bool = True

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, value: Any) -> list[str]:
        if value is None or value == "":
            return []
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                return json.loads(text)
            return [item.strip() for item in text.split(",") if item.strip()]
        raise TypeError("Invalid cors_origins value")

    @field_validator("fernet_keys", mode="before")
    @classmethod
    def parse_fernet_keys(cls, value: Any) -> list[str]:
        if value is None or value == "":
            return []
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                return json.loads(text)
            return [item.strip() for item in text.split(",") if item.strip()]
        raise TypeError("Invalid fernet_keys value")

    @property
    def survey_base_url(self) -> str:
        return self.public_base_url.rstrip("/") + "/survey"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[arg-type]


settings = get_settings()
