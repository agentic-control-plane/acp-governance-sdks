"""Proxy plane — point model clients at ACP so calls are priced and metered.

The governance hook (`governed`) covers the *interception* plane: what the agent
actually executes. This module covers the *proxy* plane: what it spends. Both
run against the same gateway, so every URL here is derived from the one
`Config.base_url` in `_config.py` rather than hardcoding the host again.
"""
from __future__ import annotations

import os
import warnings

from ._config import configure, get_config

#: The three model API shapes the gateway speaks. Each is mounted on a
#: *different* path — a client configured for one shape cannot serve another.
#:
#:   anthropic         POST {base}/anthropic/v1/messages
#:   openai            POST {base}/v1/chat/completions
#:   openai-responses  POST {base}/openai/v1/responses
#:
#: Note `openai` and `openai-responses` are NOT interchangeable: /v1 serves
#: chat completions only, /openai/v1 serves responses only. Picking the wrong
#: one gives a 404, not a fallback — which is most of why this helper exists.
_SHAPE_PATHS = {
    "anthropic": "/anthropic",
    "openai": "/v1",
    "openai-responses": "/openai/v1",
}

#: Which env vars each shape's official SDK reads. Both the Anthropic and
#: OpenAI SDKs resolve base URL and key from the environment at construction
#: time, which is what lets `init()` wire the proxy plane in one call.
_SHAPE_ENV = {
    "anthropic": ("ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY"),
    "openai": ("OPENAI_BASE_URL", "OPENAI_API_KEY"),
    "openai-responses": ("OPENAI_BASE_URL", "OPENAI_API_KEY"),
}

_API_KEY_ENV = "ACP_API_KEY"


class ModelConfigError(RuntimeError):
    """Raised when the proxy plane can't be configured (bad shape, missing key)."""


def _check_shape(shape: str) -> str:
    if shape not in _SHAPE_PATHS:
        valid = ", ".join(sorted(_SHAPE_PATHS))
        raise ModelConfigError(f"unknown model shape {shape!r} — expected one of: {valid}")
    return shape


def model_base_url(shape: str = "anthropic") -> str:
    """Return the ACP proxy base URL for one model API shape.

    Pass the result as `base_url` to the matching official SDK client.
    """
    _check_shape(shape)
    return get_config().base_url.rstrip("/") + _SHAPE_PATHS[shape]


def api_key() -> str:
    """The ACP workspace key (`gsk_...`) used to authenticate proxied calls."""
    key = os.environ.get(_API_KEY_ENV)
    if not key:
        raise ModelConfigError(
            f"{_API_KEY_ENV} is not set — create a workspace key at "
            "https://cloud.agenticcontrolplane.com and export it as "
            f"{_API_KEY_ENV}=gsk_..."
        )
    return key


def model_client_kwargs(shape: str = "anthropic") -> dict:
    """Constructor kwargs that point an official SDK client at the ACP proxy.

        from anthropic import Anthropic
        from acp_governance import model_client_kwargs

        client = Anthropic(**model_client_kwargs("anthropic"))

    The gateway accepts the ACP key as `x-api-key`, which is the header both
    SDKs send for `api_key`, so no auth override is needed.
    """
    _check_shape(shape)
    return {"base_url": model_base_url(shape), "api_key": api_key()}


def init(
    *,
    proxy: bool = True,
    shapes: "tuple[str, ...] | list[str]" = ("anthropic", "openai"),
    base_url: "str | None" = None,
    timeout_s: "float | None" = None,
    client_header: "str | None" = None,
) -> "dict[str, str]":
    """Wire both planes in one call.

    Configures the governance hook, then points the model SDKs at the ACP proxy
    by setting their environment variables. Call it **before** constructing any
    model client — the SDKs read the environment at construction time.

        import acp_governance as acp
        acp.init()

        client = Anthropic()     # now routed through ACP, priced and metered

    Routing per provider is all-or-nothing. If a provider's base URL is already
    set to something other than ACP, that provider is left completely alone
    (base URL *and* key) and a warning names it — a half-applied provider, ACP's
    URL against a real vendor key, is just a 401. Set `proxy=False` to configure
    the interception plane only.

    Returns a map of what happened, keyed by shape: the URL applied, or a
    "skipped: ..." reason. Useful in logs to prove the plane is on.
    """
    configure(base_url=base_url, timeout_s=timeout_s, client_header=client_header)

    result: dict[str, str] = {}
    if not proxy:
        return result

    key = api_key()
    for shape in shapes:
        _check_shape(shape)
        url_env, key_env = _SHAPE_ENV[shape]
        target = model_base_url(shape)
        current = os.environ.get(url_env)

        if current and current.rstrip("/") != target.rstrip("/"):
            result[shape] = f"skipped: {url_env} already set to {current}"
            warnings.warn(
                f"acp.init(): {url_env} is already set to {current!r}, so {shape} "
                f"calls are NOT routed through ACP and won't be priced. Unset it, "
                f"or pass the proxy config explicitly with model_client_kwargs({shape!r}).",
                RuntimeWarning,
                stacklevel=2,
            )
            continue

        os.environ[url_env] = target
        os.environ[key_env] = key
        result[shape] = target

    return result
