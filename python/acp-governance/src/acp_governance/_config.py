"""Global governance config — base URL, timeout, client header."""
from __future__ import annotations

import os
from dataclasses import dataclass

_DEFAULT_BASE_URL = "https://api.agenticcontrolplane.com"
_DEFAULT_TIMEOUT_S = 5.0
_DEFAULT_CLIENT = "acp-governance-py/0.1.0"


@dataclass
class Config:
    base_url: str
    timeout_s: float
    client_header: str


_current = Config(
    base_url=os.environ.get("ACP_BASE_URL", _DEFAULT_BASE_URL),
    timeout_s=_DEFAULT_TIMEOUT_S,
    client_header=_DEFAULT_CLIENT,
)


def get_config() -> Config:
    return _current


def configure(
    *,
    base_url: str | None = None,
    timeout_s: float | None = None,
    client_header: str | None = None,
) -> None:
    """Override global config. Safe to call at process startup; affects
    all subsequent pre/post calls."""
    global _current
    _current = Config(
        base_url=base_url or _current.base_url,
        timeout_s=timeout_s if timeout_s is not None else _current.timeout_s,
        client_header=client_header or _current.client_header,
    )
