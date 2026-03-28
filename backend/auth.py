"""
JWT helpers for DN FACE.

Uses a small HS256 implementation so the project can run without adding a
separate JWT dependency.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Dict


JWT_SECRET = os.getenv("DNFACE_JWT_SECRET", "dnface-dev-secret-change-me")
JWT_TTL_SECONDS = int(os.getenv("DNFACE_JWT_TTL_SECONDS", "604800"))
DEMO_NO_TOKEN_EXPIRY = os.getenv("DNFACE_DEMO_NO_TOKEN_EXPIRY", "1").strip().lower() in {"1", "true", "yes", "on"}


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def _json_dumps(value: Dict[str, Any]) -> bytes:
    return json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")


def create_access_token(payload: Dict[str, Any], expires_in: int = JWT_TTL_SECONDS) -> str:
    now = int(time.time())
    full_payload = {**payload, "iat": now}
    if not DEMO_NO_TOKEN_EXPIRY and expires_in > 0:
        full_payload["exp"] = now + expires_in
    header = {"alg": "HS256", "typ": "JWT"}
    encoded_header = _b64url_encode(_json_dumps(header))
    encoded_payload = _b64url_encode(_json_dumps(full_payload))
    signing_input = f"{encoded_header}.{encoded_payload}"
    signature = hmac.new(
        JWT_SECRET.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
    except ValueError as exc:
        raise ValueError("Invalid token format") from exc

    signing_input = f"{encoded_header}.{encoded_payload}"
    expected_signature = hmac.new(
        JWT_SECRET.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    provided_signature = _b64url_decode(encoded_signature)
    if not hmac.compare_digest(expected_signature, provided_signature):
        raise ValueError("Invalid token signature")

    try:
        header = json.loads(_b64url_decode(encoded_header).decode("utf-8"))
        payload = json.loads(_b64url_decode(encoded_payload).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("Invalid token payload") from exc

    if header.get("alg") != "HS256":
        raise ValueError("Unsupported token algorithm")

    if "exp" in payload and int(payload.get("exp", 0)) <= int(time.time()):
        raise ValueError("Token has expired")

    return payload
