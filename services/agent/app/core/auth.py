"""Backend service-to-service bearer authentication helpers."""

from __future__ import annotations

import hmac
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import config

_bearer_scheme = HTTPBearer(auto_error=False, description="Private Next.js-to-agent service token")


def token_matches(provided: Optional[str], expected: Optional[str]) -> bool:
    """Compare a supplied token in constant time; missing configuration fails closed."""
    if not provided or not expected:
        return False
    return hmac.compare_digest(provided, expected)


async def require_backend_auth(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(_bearer_scheme)],
) -> None:
    if credentials is None or credentials.scheme.lower() != "bearer" or not token_matches(
        credentials.credentials, config.backend_api_token
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing service credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
