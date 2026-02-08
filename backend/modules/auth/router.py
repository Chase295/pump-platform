"""
Auth module - Login, token verification, auth status.

Token is deterministic: SHA-256 of "{user}:{password}:pump-platform"
so it survives backend restarts without any DB or secret key.
"""

import hashlib

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel

from backend.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_token() -> str:
    """Deterministic token from configured credentials."""
    raw = f"{settings.AUTH_USER}:{settings.AUTH_PASSWORD}:pump-platform"
    return hashlib.sha256(raw.encode()).hexdigest()


def _auth_enabled() -> bool:
    return bool(settings.AUTH_USER and settings.AUTH_PASSWORD)


def verify_token(authorization: str | None = Header(None)) -> None:
    """FastAPI dependency that checks Bearer token.

    Only active when AUTH_USER + AUTH_PASSWORD are set.
    """
    if not _auth_enabled():
        return

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = authorization.removeprefix("Bearer ").strip()
    if token != _generate_token():
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str


class AuthStatusResponse(BaseModel):
    auth_required: bool


class AuthCheckResponse(BaseModel):
    authenticated: bool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    """Authenticate with username + password, receive a token."""
    if not _auth_enabled():
        raise HTTPException(status_code=400, detail="Auth is disabled")

    if body.username != settings.AUTH_USER or body.password != settings.AUTH_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return LoginResponse(token=_generate_token(), username=body.username)


@router.get("/status", response_model=AuthStatusResponse)
async def auth_status():
    """Check whether authentication is required."""
    return AuthStatusResponse(auth_required=_auth_enabled())


@router.get("/check", response_model=AuthCheckResponse)
async def auth_check(authorization: str | None = Header(None)):
    """Verify that the provided Bearer token is valid."""
    if not _auth_enabled():
        return AuthCheckResponse(authenticated=True)

    if not authorization or not authorization.startswith("Bearer "):
        return AuthCheckResponse(authenticated=False)

    token = authorization.removeprefix("Bearer ").strip()
    return AuthCheckResponse(authenticated=token == _generate_token())
