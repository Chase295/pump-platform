# MCP OAuth Authentication - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add OAuth 2.0 Authorization Code + PKCE authentication to the MCP server so Claude.ai can securely connect with Client ID + Client Secret.

**Architecture:** Self-hosted OAuth 2.0 Authorization Server built into the FastAPI backend. Claude.ai redirects user to a React consent page, user authenticates, backend generates auth code, Claude.ai exchanges it for an access token. The access token is then used for all MCP tool calls and forwarded to internal API endpoints.

**Tech Stack:** FastAPI, fastapi-mcp AuthConfig, React MUI consent page, in-memory token store, PKCE (S256)

---

## Task 1: Dependencies + Config

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/config.py`
- Modify: `.env.example`

**Step 1: Update fastapi-mcp version**

In `backend/requirements.txt`, change:
```
fastapi-mcp>=0.3.0
```
to:
```
fastapi-mcp>=0.4.0
```

The `AuthConfig` class and `mount()` with auth support require v0.4.0+.

**Step 2: Add OAuth config to Settings**

In `backend/config.py`, add to the Auth section:
```python
# Auth
AUTH_USER: str = ""
AUTH_PASSWORD: str = ""

# OAuth (MCP authentication for Claude.ai)
OAUTH_CLIENT_ID: str = ""
OAUTH_CLIENT_SECRET: str = ""
OAUTH_BASE_URL: str = ""  # e.g. "https://pump-platform.chase295.de"
OAUTH_ACCESS_TOKEN_EXPIRY: int = 3600      # 1 hour
OAUTH_REFRESH_TOKEN_EXPIRY: int = 604800   # 7 days
OAUTH_AUTH_CODE_EXPIRY: int = 300           # 5 minutes
```

**Step 3: Update .env.example**

Add:
```
# === OAuth (MCP Authentication for Claude.ai) ===
OAUTH_CLIENT_ID=pump-mcp-client
OAUTH_CLIENT_SECRET=changeme-oauth-secret
OAUTH_BASE_URL=https://pump-platform.chase295.de
```

**Step 4: Commit**

---

## Task 2: OAuth Authorization Server (Backend)

**Files:**
- Create: `backend/modules/auth/oauth.py`

This is the core OAuth 2.0 AS with in-memory token storage, PKCE support, and all required endpoints.

**Step 1: Create `backend/modules/auth/oauth.py`**

```python
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
from dataclasses import dataclass, field

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


@router.get("/.well-known/oauth-authorization-server")
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


@router.get("/oauth/authorize")
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


@router.post("/api/auth/oauth/approve", response_model=OAuthApproveResponse)
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


@router.post("/oauth/token")
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


@router.post("/oauth/register")
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
```

**Step 2: Commit**

---

## Task 3: Update main.py, AuthMiddleware, and MCP Config

**Files:**
- Modify: `backend/main.py`

**Step 1: Add OAuth imports**

Add to imports:
```python
from backend.modules.auth.oauth import (
    router as oauth_router,
    validate_oauth_token,
    verify_oauth_dependency,
)
```

**Step 2: Update AuthMiddleware to accept OAuth tokens**

Update the `dispatch` method to check OAuth tokens alongside the existing SHA-256 token:
```python
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not _auth_enabled():
            return await call_next(request)

        path = request.url.path

        if path in _PUBLIC_PATHS:
            return await call_next(request)

        if not path.startswith("/api/"):
            return await call_next(request)

        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

        token = auth_header.removeprefix("Bearer ").strip()

        # Check existing platform token
        if token == _generate_token():
            return await call_next(request)

        # Check OAuth access token
        if validate_oauth_token(token):
            return await call_next(request)

        return JSONResponse(status_code=401, content={"detail": "Invalid token"})
```

**Step 3: Update _PUBLIC_PATHS**

Add OAuth paths:
```python
_PUBLIC_PATHS = frozenset({
    "/", "/health", "/metrics",
    "/api/auth/login", "/api/auth/status",
    "/api/auth/oauth/approve",  # Called by React consent page
})
```

Note: `/oauth/*` and `/.well-known/*` are NOT under `/api/` so AuthMiddleware already skips them.

**Step 4: Mount OAuth router**

Add before MCP setup:
```python
app.include_router(oauth_router)
```

**Step 5: Update MCP configuration with AuthConfig**

Replace existing MCP setup with:
```python
from fastapi_mcp import FastApiMCP, AuthConfig
from fastapi import Depends

if settings.OAUTH_CLIENT_ID and settings.OAUTH_CLIENT_SECRET and settings.OAUTH_BASE_URL:
    base = settings.OAUTH_BASE_URL.rstrip("/")
    mcp = FastApiMCP(
        app,
        name="pump-platform",
        description="Unified Crypto Trading Platform - Discovery, Training, Predictions, Trading",
        auth_config=AuthConfig(
            issuer=base,
            authorize_url=f"{base}/oauth/authorize",
            oauth_metadata_url=f"{base}/.well-known/oauth-authorization-server",
            audience="pump-platform",
            client_id=settings.OAUTH_CLIENT_ID,
            client_secret=settings.OAUTH_CLIENT_SECRET,
            dependencies=[Depends(verify_oauth_dependency)],
            setup_proxies=True,
            setup_fake_dynamic_registration=True,
        ),
    )
else:
    # No OAuth configured - MCP without auth (local development)
    mcp = FastApiMCP(
        app,
        name="pump-platform",
        description="Unified Crypto Trading Platform - Discovery, Training, Predictions, Trading",
    )

mcp.mount()
```

**Step 6: Commit**

---

## Task 4: Nginx Configuration

**Files:**
- Modify: `frontend/nginx.conf`

**Step 1: Add OAuth proxy locations**

Add BEFORE the `/api/` location block (order matters in nginx):
```nginx
# OAuth endpoints proxy to backend
location ^~ /oauth/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
    proxy_connect_timeout 10s;
}

# OAuth metadata endpoint
location ^~ /.well-known/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Step 2: Commit**

---

## Task 5: React OAuth Consent Page

**Files:**
- Create: `frontend/src/pages/OAuthAuthorize.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/services/api.ts`

**Step 1: Add API method for OAuth approval**

In `frontend/src/services/api.ts`, add to exports:
```typescript
export const oauthApi = {
  approve: (data: {
    username: string;
    password: string;
    client_id: string;
    redirect_uri: string;
    state: string;
    scope: string;
    code_challenge: string;
    code_challenge_method: string;
  }) => axios.post<{ redirect_url: string }>('/api/auth/oauth/approve', data),
};
```

Note: This should use a raw axios instance (not the `api` one) since the user might not have a platform token yet.

**Step 2: Create OAuthAuthorize page**

Create `frontend/src/pages/OAuthAuthorize.tsx`:

- Parse OAuth params from URL query string (`client_id`, `redirect_uri`, `state`, `scope`, `code_challenge`, `code_challenge_method`)
- Show consent UI:
  - Title: "Pump Platform" + "Authorize Application"
  - Show which app is requesting access (client_id)
  - Show requested scope
  - Login form (username + password) if not already authenticated
  - "Authorize" button and "Deny" button
- On Authorize:
  - Call `POST /api/auth/oauth/approve` with credentials + OAuth params
  - On success: `window.location.href = response.redirect_url`
  - On error: show error message
- On Deny:
  - Redirect back to `redirect_uri` with `error=access_denied&state=...`
- Style: Same dark theme as Login page, similar Card layout

**Step 3: Update App.tsx routing**

The OAuth consent page needs to work even when the user is NOT logged into the platform (they may only have OAuth credentials). So it must be rendered outside the auth-gated section.

In App.tsx, add the Router wrapping the entire app (including Login), and add the OAuth route:

```tsx
function App() {
  const { token, authRequired, checkAuthStatus, logout } = useAuthStore();

  useEffect(() => { checkAuthStatus(); }, [checkAuthStatus]);
  useEffect(() => {
    const handleLogout = () => { logout(); };
    window.addEventListener('auth-logout', handleLogout);
    return () => window.removeEventListener('auth-logout', handleLogout);
  }, [logout]);

  // Still checking
  if (authRequired === null) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Routes>
            <Route path="/oauth-consent" element={<OAuthAuthorize />} />
            <Route path="*" element={<LoadingScreen />} />
          </Routes>
        </Router>
      </ThemeProvider>
    );
  }

  // Auth required, no token
  if (authRequired && !token) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Routes>
            <Route path="/oauth-consent" element={<OAuthAuthorize />} />
            <Route path="*" element={<Login />} />
          </Routes>
        </Router>
      </ThemeProvider>
    );
  }

  // Normal app
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/oauth-consent" element={<OAuthAuthorize />} />
          <Route path="/*" element={
            <Layout>
              <Routes>
                {/* existing routes */}
              </Routes>
            </Layout>
          } />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}
```

**Step 4: Commit**

---

## Task 6: Environment Setup + Integration Test

**Files:**
- Modify: `.env` (add OAuth credentials)

**Step 1: Add OAuth credentials to .env**

```
OAUTH_CLIENT_ID=pump-mcp-client
OAUTH_CLIENT_SECRET=<generate-secure-secret>
OAUTH_BASE_URL=https://pump-platform.chase295.de
```

**Step 2: Rebuild and test**

```bash
docker compose build backend frontend
docker compose up -d
```

**Step 3: Test OAuth metadata**

```bash
curl -s https://pump-platform.chase295.de/.well-known/oauth-authorization-server | jq
```

Expected: JSON with issuer, authorization_endpoint, token_endpoint, etc.

**Step 4: Test authorization flow manually**

Open in browser:
```
https://pump-platform.chase295.de/oauth/authorize?client_id=pump-mcp-client&redirect_uri=https://example.com/callback&response_type=code&state=test123&code_challenge=test&code_challenge_method=plain
```

Expected: Redirects to `/oauth-consent?...` showing consent page.

**Step 5: Test token exchange**

After getting auth code from consent page:
```bash
curl -X POST https://pump-platform.chase295.de/oauth/token \
  -d "grant_type=authorization_code" \
  -d "code=<AUTH_CODE>" \
  -d "redirect_uri=https://example.com/callback" \
  -d "code_verifier=test" \
  -d "client_id=pump-mcp-client" \
  -d "client_secret=<SECRET>"
```

Expected: JSON with access_token, refresh_token, expires_in.

**Step 6: Test MCP with token**

```bash
curl -N -H "Authorization: Bearer <ACCESS_TOKEN>" https://pump-platform.chase295.de/mcp
```

Expected: SSE stream with `event: endpoint` (not 401).

**Step 7: Configure in Claude.ai**

In Claude.ai settings, add remote MCP server:
- URL: `https://pump-platform.chase295.de/mcp`
- Client ID: `pump-mcp-client`
- Client Secret: `<SECRET>`

**Step 8: Commit**

---

## Summary

| Component | Change |
|-----------|--------|
| `backend/config.py` | +6 OAuth settings |
| `backend/modules/auth/oauth.py` | NEW: Full OAuth 2.0 AS (~300 lines) |
| `backend/main.py` | AuthMiddleware + MCP AuthConfig |
| `backend/requirements.txt` | fastapi-mcp >=0.4.0 |
| `frontend/nginx.conf` | +2 proxy locations |
| `frontend/src/pages/OAuthAuthorize.tsx` | NEW: Consent page |
| `frontend/src/App.tsx` | OAuth route (outside auth gate) |
| `frontend/src/services/api.ts` | +1 API method |
| `.env.example` | +3 env vars |
