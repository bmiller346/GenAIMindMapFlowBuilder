from __future__ import annotations

import os
from contextvars import ContextVar

try:
    from fastapi import HTTPException, status
except ModuleNotFoundError:
    HTTPException = None

    class status:
        HTTP_503_SERVICE_UNAVAILABLE = 503


class MissingConfigurationError(RuntimeError):
    pass


_request_settings: ContextVar[dict[str, str]] = ContextVar(
    "request_settings", default={}
)


def set_request_settings(settings: dict[str, str] | None):
    return _request_settings.set(settings or {})


def reset_request_settings(token) -> None:
    _request_settings.reset(token)


def get_setting(name: str) -> str | None:
    return _request_settings.get().get(name) or os.getenv(name)


def require_settings(*names: str) -> None:
    missing = [name for name in names if not get_setting(name)]
    if not missing:
        return

    missing_list = ", ".join(missing)
    raise MissingConfigurationError(f"Missing required environment variable(s): {missing_list}.")


def configuration_http_error(error: MissingConfigurationError) -> HTTPException:
    if HTTPException is None:
        raise error
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=str(error),
    )
