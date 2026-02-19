"""
OAuth 2.0 Authorization Server for MCP authentication.

Implements Authorization Code + PKCE flow so Claude.ai can
authenticate and obtain access tokens for MCP tool calls.

Endpoints:
  GET  /.well-known/oauth-authorization-server  →  OAuth metadata
  GET  /oauth/authorize   →  Redirect to React consent page
  POST /oauth/token       →  Exchange auth code for access token
  POST /oauth/register    →  Dynamic Client Registration (fake)
  POST /api/auth/oauth/approve  →  Called by React after user consent
"""

import hashlib
import secrets
import time
import base64
import logging
from dataclasses import dataclass

from fastapi import APIRouter, HTTPException, Request, Header, Form, Query
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from backend.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory stores
# ---------------------------------------------------------------------------

@dataclass
class AuthCode:
    code: str
    client_id: str
    redirect_uri: str
    code_challenge: str
    code_challenge_method: str
    scope: str
    created_at: float
    used: bool = False

@dataclass
class AccessToken:
    token: str
    client_id: str
    scope: str
    created_at: float
    expires_at: float

@dataclass
class RefreshToken:
    token: str
    client_id: str
    scope: str
    created_at: float
    expires_at: float

_auth_codes: dict[str, AuthCode] = {}
_access_tokens: dict[str, AccessToken] = {}
_refresh_tokens: dict[str, RefreshToken] = {}


def _cleanup_expired():
    """Remove expired entries from stores."""
    now = time.time()
    for code, data in list(_auth_codes.items()):
        if now - data.created_at > settings.OAUTH_AUTH_CODE_EXPIRY:
            del _auth_codes[code]
    for token, data in list(_access_tokens.items()):
        if now > data.expires_at:
            del _access_tokens[token]
    for token, data in list(_refresh_tokens.items()):
        if now > data.expires_at:
            del _refresh_tokens[token]


def _oauth_enabled() -> bool:
    """OAuth is enabled when client credentials are configured."""
    return bool(settings.OAUTH_CLIENT_ID and settings.OAUTH_CLIENT_SECRET)


def _verify_pkce(code_verifier: str, code_challenge: str, method: str) -> bool:
    """Verify PKCE code_verifier against stored code_challenge."""
    if method == "S256":
        digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
        computed = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
        return computed == code_challenge
    elif method == "plain":
        return code_verifier == code_challenge
    return False


# ---------------------------------------------------------------------------
# Token validation (used by fastapi-mcp dependency + AuthMiddleware)
# ---------------------------------------------------------------------------

def validate_oauth_token(token: str) -> bool:
    """Check if an OAuth access token is valid and not expired."""
    _cleanup_expired()
    data = _access_tokens.get(token)
    if not data:
        return False
    if time.time() > data.expires_at:
        del _access_tokens[token]
        return False
    return True


async def verify_oauth_dependency(authorization: str | None = Header(None)):
    """FastAPI dependency for fastapi-mcp AuthConfig.dependencies.

    Validates the Bearer token as either:
    1. The existing SHA-256 platform token
    2. A valid OAuth access token
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = authorization.removeprefix("Bearer ").strip()

    # Check platform token (existing auth)
    from backend.modules.auth.router import _auth_enabled, _generate_token
    if _auth_enabled() and token == _generate_token():
        return

    # Check OAuth token
    if validate_oauth_token(token):
        return

    raise HTTPException(status_code=401, detail="Invalid token")


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(tags=["oauth"])


@router.get("/.well-known/oauth-authorization-server", operation_id="oauth_metadata")
async def oauth_metadata():
    """OAuth 2.0 Authorization Server Metadata (RFC 8414)."""
    base = settings.OAUTH_BASE_URL.rstrip("/")
    return {
        "issuer": base,
        "authorization_endpoint": f"{base}/oauth/authorize",
        "token_endpoint": f"{base}/oauth/token",
        "registration_endpoint": f"{base}/oauth/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256", "plain"],
        "token_endpoint_auth_methods_supported": [
            "client_secret_post",
            "client_secret_basic",
        ],
        "scopes_supported": ["mcp:tools", "openid"],
        "service_documentation": f"{base}/",
    }


@router.get("/oauth/authorize", operation_id="oauth_authorize")
async def oauth_authorize(
    client_id: str = Query(...),
    redirect_uri: str = Query(...),
    response_type: str = Query("code"),
    state: str = Query(""),
    scope: str = Query("mcp:tools"),
    code_challenge: str = Query(""),
    code_challenge_method: str = Query("S256"),
):
    """Authorization endpoint - redirects to React consent page."""
    if response_type != "code":
        raise HTTPException(400, "Only response_type=code is supported")

    if not _oauth_enabled():
        raise HTTPException(503, "OAuth is not configured")

    # Redirect to React consent page with all OAuth params
    from urllib.parse import urlencode
    params = urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": scope,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
    })
    return RedirectResponse(f"/oauth-consent?{params}")


class OAuthApproveRequest(BaseModel):
    username: str
    password: str
    client_id: str
    redirect_uri: str
    state: str = ""
    scope: str = "mcp:tools"
    code_challenge: str = ""
    code_challenge_method: str = "S256"


class OAuthApproveResponse(BaseModel):
    redirect_url: str


@router.post("/api/auth/oauth/approve", response_model=OAuthApproveResponse, operation_id="oauth_approve")
async def oauth_approve(body: OAuthApproveRequest):
    """Called by React consent page after user enters credentials.

    Validates credentials, generates auth code, returns redirect URL.
    """
    # Validate user credentials (same as regular login)
    if not settings.AUTH_USER or not settings.AUTH_PASSWORD:
        raise HTTPException(400, "Auth is disabled on this server")

    if body.username != settings.AUTH_USER or body.password != settings.AUTH_PASSWORD:
        raise HTTPException(401, "Invalid credentials")

    # Validate client_id
    if body.client_id != settings.OAUTH_CLIENT_ID:
        raise HTTPException(400, "Unknown client_id")

    # Generate auth code
    code = secrets.token_urlsafe(48)
    _auth_codes[code] = AuthCode(
        code=code,
        client_id=body.client_id,
        redirect_uri=body.redirect_uri,
        code_challenge=body.code_challenge,
        code_challenge_method=body.code_challenge_method,
        scope=body.scope,
        created_at=time.time(),
    )

    # Build redirect URL
    redirect = body.redirect_uri
    separator = "&" if "?" in redirect else "?"
    redirect_url = f"{redirect}{separator}code={code}"
    if body.state:
        redirect_url += f"&state={body.state}"

    logger.info("OAuth code issued for client %s", body.client_id)
    return OAuthApproveResponse(redirect_url=redirect_url)


@router.post("/oauth/token", operation_id="oauth_token")
async def oauth_token(
    grant_type: str = Form(...),
    code: str = Form(""),
    redirect_uri: str = Form(""),
    code_verifier: str = Form(""),
    client_id: str = Form(""),
    client_secret: str = Form(""),
    refresh_token: str = Form(""),
):
    """Token endpoint - exchanges auth code or refresh token for access token."""
    _cleanup_expired()

    # Validate client credentials
    if client_id != settings.OAUTH_CLIENT_ID or client_secret != settings.OAUTH_CLIENT_SECRET:
        return JSONResponse(
            status_code=401,
            content={"error": "invalid_client", "error_description": "Invalid client credentials"},
        )

    if grant_type == "authorization_code":
        # Validate auth code
        auth_code = _auth_codes.get(code)
        if not auth_code:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_grant", "error_description": "Invalid or expired authorization code"},
            )

        if auth_code.used:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_grant", "error_description": "Authorization code already used"},
            )

        if time.time() - auth_code.created_at > settings.OAUTH_AUTH_CODE_EXPIRY:
            del _auth_codes[code]
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_grant", "error_description": "Authorization code expired"},
            )

        if auth_code.client_id != client_id:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_grant", "error_description": "Client mismatch"},
            )

        if auth_code.redirect_uri != redirect_uri:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_grant", "error_description": "Redirect URI mismatch"},
            )

        # PKCE verification
        if auth_code.code_challenge and code_verifier:
            if not _verify_pkce(code_verifier, auth_code.code_challenge, auth_code.code_challenge_method):
                return JSONResponse(
                    status_code=400,
                    content={"error": "invalid_grant", "error_description": "PKCE verification failed"},
                )

        # Mark code as used
        auth_code.used = True

        # Generate tokens
        now = time.time()
        access_tok = secrets.token_urlsafe(48)
        refresh_tok = secrets.token_urlsafe(48)

        _access_tokens[access_tok] = AccessToken(
            token=access_tok,
            client_id=client_id,
            scope=auth_code.scope,
            created_at=now,
            expires_at=now + settings.OAUTH_ACCESS_TOKEN_EXPIRY,
        )
        _refresh_tokens[refresh_tok] = RefreshToken(
            token=refresh_tok,
            client_id=client_id,
            scope=auth_code.scope,
            created_at=now,
            expires_at=now + settings.OAUTH_REFRESH_TOKEN_EXPIRY,
        )

        logger.info("OAuth access token issued for client %s", client_id)
        return {
            "access_token": access_tok,
            "token_type": "Bearer",
            "expires_in": settings.OAUTH_ACCESS_TOKEN_EXPIRY,
            "refresh_token": refresh_tok,
            "scope": auth_code.scope,
        }

    elif grant_type == "refresh_token":
        # Validate refresh token
        ref_data = _refresh_tokens.get(refresh_token)
        if not ref_data:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_grant", "error_description": "Invalid refresh token"},
            )

        if time.time() > ref_data.expires_at:
            del _refresh_tokens[refresh_token]
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_grant", "error_description": "Refresh token expired"},
            )

        if ref_data.client_id != client_id:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_grant", "error_description": "Client mismatch"},
            )

        # Rotate: delete old, generate new
        del _refresh_tokens[refresh_token]
        now = time.time()
        new_access = secrets.token_urlsafe(48)
        new_refresh = secrets.token_urlsafe(48)

        _access_tokens[new_access] = AccessToken(
            token=new_access,
            client_id=client_id,
            scope=ref_data.scope,
            created_at=now,
            expires_at=now + settings.OAUTH_ACCESS_TOKEN_EXPIRY,
        )
        _refresh_tokens[new_refresh] = RefreshToken(
            token=new_refresh,
            client_id=client_id,
            scope=ref_data.scope,
            created_at=now,
            expires_at=now + settings.OAUTH_REFRESH_TOKEN_EXPIRY,
        )

        logger.info("OAuth token refreshed for client %s", client_id)
        return {
            "access_token": new_access,
            "token_type": "Bearer",
            "expires_in": settings.OAUTH_ACCESS_TOKEN_EXPIRY,
            "refresh_token": new_refresh,
            "scope": ref_data.scope,
        }

    else:
        return JSONResponse(
            status_code=400,
            content={"error": "unsupported_grant_type"},
        )


@router.post("/oauth/register", operation_id="oauth_register")
async def oauth_register(request: Request):
    """Dynamic Client Registration (DCR) - returns pre-configured credentials.

    Some MCP clients (Claude Code) require DCR support.
    We return our static client credentials.
    """
    if not _oauth_enabled():
        raise HTTPException(503, "OAuth is not configured")

    body = await request.json()
    base = settings.OAUTH_BASE_URL.rstrip("/")

    return JSONResponse(
        status_code=201,
        content={
            "client_id": settings.OAUTH_CLIENT_ID,
            "client_secret": settings.OAUTH_CLIENT_SECRET,
            "client_name": body.get("client_name", "MCP Client"),
            "redirect_uris": body.get("redirect_uris", []),
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "client_secret_post",
        },
    )
