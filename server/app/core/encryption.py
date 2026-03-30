from __future__ import annotations

import base64
import hashlib
import re
from dataclasses import dataclass
from typing import Iterable

from cryptography.fernet import Fernet, MultiFernet

from app.core.config import settings
from app.core.exceptions import ValidationError


_PHONE_DIGIT_RE = re.compile(r"\D+")


@dataclass(slots=True)
class CryptoManager:
    cipher: MultiFernet

    @classmethod
    def from_keys(cls, keys: Iterable[str]) -> "CryptoManager":
        prepared: list[Fernet] = []
        for raw in keys:
            key = raw.encode("utf-8") if isinstance(raw, str) else raw
            prepared.append(Fernet(key))
        if not prepared:
            generated = Fernet.generate_key()
            prepared.append(Fernet(generated))
        return cls(cipher=MultiFernet(prepared))

    def encrypt_text(self, value: str | None) -> bytes | None:
        if value is None:
            return None
        text = value.strip()
        if not text:
            return None
        return self.cipher.encrypt(text.encode("utf-8"))

    def decrypt_text(self, value: bytes | None) -> str | None:
        if value is None:
            return None
        return self.cipher.decrypt(value).decode("utf-8")

    @staticmethod
    def sha256_hex(value: str | bytes | None) -> str | None:
        if value is None:
            return None
        payload = value if isinstance(value, bytes) else value.encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    @staticmethod
    def normalize_phone(value: str | None) -> str | None:
        if value is None:
            return None
        digits = _PHONE_DIGIT_RE.sub("", value)
        if not digits:
            return None
        return digits

    def phone_hash(self, value: str | None) -> str | None:
        normalized = self.normalize_phone(value)
        return self.sha256_hex(normalized)

    def phone_last4_hash(self, value: str | None) -> str | None:
        normalized = self.normalize_phone(value)
        if not normalized or len(normalized) < 4:
            return None
        return self.sha256_hex(normalized[-4:])

    def birth_ymd_hash(self, ymd: str | None) -> str | None:
        if ymd is None:
            return None
        normalized = ymd.replace("-", "").strip()
        if len(normalized) != 8 or not normalized.isdigit():
            return None
        return self.sha256_hex(normalized)


crypto = CryptoManager.from_keys(settings.fernet_keys)


def mask_name(name: str | None) -> str | None:
    if not name:
        return name
    if len(name) <= 2:
        return name[0] + "*"
    return name[0] + "*" * (len(name) - 2) + name[-1]
