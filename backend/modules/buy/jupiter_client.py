"""
JupiterClient - Quote API integration for real market prices.

Fetches live quotes from Jupiter aggregator for any Solana token pair.
Used in TEST mode to replace hardcoded mock prices with real DEX prices.

Migrated from pump-buy/backend/app/services/jupiter_client.py
"""

import time
import logging
from dataclasses import dataclass
from typing import Optional

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

SOL_MINT = "So11111111111111111111111111111111111111112"
LAMPORTS_PER_SOL = 1_000_000_000

JUPITER_QUOTE_URL = "https://api.jup.ag/swap/v1/quote"
CACHE_TTL_SECONDS = 10


class JupiterQuoteError(Exception):
    """Raised when Jupiter quote request fails."""
    pass


@dataclass
class JupiterQuote:
    in_amount: int       # smallest unit (lamports for SOL, token units for tokens)
    out_amount: int      # smallest unit
    price_impact_pct: float


class JupiterClient:
    """
    Async client for Jupiter Quote API with time-based caching.

    Usage:
        quote = await jupiter_client.get_buy_quote("TokenMint...", 1.0, 100)
        tokens = quote.out_amount  # in token's smallest unit
    """

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._cache: dict = {}  # key -> (timestamp, JupiterQuote)
        self._api_key: str = ""

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {}
            if self._api_key:
                headers["x-api-key"] = self._api_key
            self._client = httpx.AsyncClient(
                timeout=10.0,
                headers=headers,
            )
        return self._client

    def set_api_key(self, key: str):
        """Set API key. If client already exists, recreate it."""
        self._api_key = key
        if self._client is not None and not self._client.is_closed:
            # Will be recreated on next request with new headers
            self._client = None

    async def close(self):
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    def _cache_key(self, input_mint: str, output_mint: str, amount: int) -> str:
        return f"{input_mint}:{output_mint}:{amount}"

    def _get_cached(self, key: str) -> Optional[JupiterQuote]:
        if key in self._cache:
            ts, quote = self._cache[key]
            if time.time() - ts < CACHE_TTL_SECONDS:
                return quote
            del self._cache[key]
        return None

    def _set_cached(self, key: str, quote: JupiterQuote):
        self._cache[key] = (time.time(), quote)

    async def _fetch_quote(
        self,
        input_mint: str,
        output_mint: str,
        amount: int,
        slippage_bps: int,
    ) -> JupiterQuote:
        cache_key = self._cache_key(input_mint, output_mint, amount)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        client = self._get_client()
        params = {
            "inputMint": input_mint,
            "outputMint": output_mint,
            "amount": str(amount),
            "slippageBps": str(slippage_bps),
        }

        try:
            resp = await client.get(JUPITER_QUOTE_URL, params=params)
            resp.raise_for_status()
        except httpx.TimeoutException:
            raise JupiterQuoteError("Jupiter API timeout")
        except httpx.HTTPStatusError as e:
            raise JupiterQuoteError(f"Jupiter API HTTP {e.response.status_code}")
        except httpx.HTTPError as e:
            raise JupiterQuoteError(f"Jupiter API error: {e}")

        data = resp.json()

        out_amount = int(data.get("outAmount", 0))
        if out_amount == 0:
            raise JupiterQuoteError(
                "Jupiter returned outAmount=0 (token may be unlisted or illiquid)"
            )

        price_impact_pct = float(data.get("priceImpactPct", 0))

        quote = JupiterQuote(
            in_amount=int(data.get("inAmount", amount)),
            out_amount=out_amount,
            price_impact_pct=price_impact_pct,
        )

        self._set_cached(cache_key, quote)
        return quote

    async def get_buy_quote(
        self,
        token_mint: str,
        amount_sol: float,
        slippage_bps: int = 100,
    ) -> JupiterQuote:
        """
        Get a quote for buying tokens with SOL.

        Args:
            token_mint: Token mint address to buy
            amount_sol: Amount of SOL to spend
            slippage_bps: Slippage tolerance in basis points

        Returns:
            JupiterQuote with out_amount in token's smallest unit
        """
        lamports = int(amount_sol * LAMPORTS_PER_SOL)
        return await self._fetch_quote(SOL_MINT, token_mint, lamports, slippage_bps)

    async def get_sell_quote(
        self,
        token_mint: str,
        token_amount: int,
        slippage_bps: int = 100,
    ) -> JupiterQuote:
        """
        Get a quote for selling tokens for SOL.

        Args:
            token_mint: Token mint address to sell
            token_amount: Amount of tokens in smallest unit
            slippage_bps: Slippage tolerance in basis points

        Returns:
            JupiterQuote with out_amount in lamports
        """
        return await self._fetch_quote(token_mint, SOL_MINT, token_amount, slippage_bps)


def init_jupiter_client() -> JupiterClient:
    """Create and configure a JupiterClient from settings."""
    client = JupiterClient()
    if settings.JUPITER_API_KEY:
        client.set_api_key(settings.JUPITER_API_KEY)
    return client


# Global instance
jupiter_client = init_jupiter_client()
