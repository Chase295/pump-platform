"""
Metadata Features for ML Training.

Computes features from discovered_coins metadata and exchange_rates
for use in the training pipeline. These capture token-level properties
(creator investment, social presence, risk indicators) and market context
(SOL price) that are available at discovery time.
"""

import logging
from typing import List, Dict, Optional
from datetime import datetime

import numpy as np

from backend.database import get_pool

logger = logging.getLogger(__name__)

# Feature names exported by this module
METADATA_FEATURE_NAMES = [
    "meta_initial_buy_sol",
    "meta_initial_buy_ratio",
    "meta_token_supply_log",
    "meta_has_socials",
    "meta_social_count",
    "meta_metadata_mutable",
    "meta_metadata_mutable_known",
    "meta_mint_authority",
    "meta_mint_authority_known",
    "meta_risk_score",
    "meta_top10_holders_pct",
    "meta_liquidity_sol",
    "meta_is_mayhem",
    "meta_sol_price_usd",
    "meta_sol_price_change_1h",
]


async def compute_metadata_features(
    mints: List[str],
    timestamps: Optional[Dict[str, datetime]] = None,
) -> Dict[str, Dict[str, float]]:
    """Compute metadata features for a list of mints.

    Queries discovered_coins for token metadata and exchange_rates
    for SOL price context at discovery time.

    Args:
        mints: List of mint addresses (token_address).
        timestamps: Optional {mint: discovery_timestamp} for SOL price lookup.

    Returns {mint: {feature_name: value}}.
    Falls back to zeros if tables are empty or unavailable.
    """
    result: Dict[str, Dict[str, float]] = {}
    default_features = {name: 0.0 for name in METADATA_FEATURE_NAMES}

    try:
        pool = get_pool()

        # Batch query: all metadata from discovered_coins
        rows = await pool.fetch(
            """
            SELECT
                token_address,
                initial_buy_sol,
                market_cap_sol,
                token_supply,
                has_socials,
                social_count,
                metadata_is_mutable,
                mint_authority_enabled,
                risk_score,
                top_10_holders_pct,
                liquidity_sol,
                is_mayhem_mode,
                discovered_at
            FROM discovered_coins
            WHERE token_address = ANY($1)
            """,
            mints,
        )

        # Index by mint
        coin_data = {}
        for row in rows:
            coin_data[row["token_address"]] = row

        # Get SOL prices for the discovery timestamps
        sol_prices = await _get_sol_prices(pool, mints, coin_data, timestamps)

        for mint in mints:
            feats = dict(default_features)
            coin = coin_data.get(mint)

            if coin:
                # meta_initial_buy_sol: raw, capped at 100
                ibs = float(coin["initial_buy_sol"] or 0)
                feats["meta_initial_buy_sol"] = min(ibs, 100.0)

                # meta_initial_buy_ratio: initial_buy_sol / market_cap_sol
                mc = float(coin["market_cap_sol"] or 0)
                feats["meta_initial_buy_ratio"] = (ibs / mc) if mc > 0 else 0.0

                # meta_token_supply_log: log10(supply)
                supply = float(coin["token_supply"] or 0)
                feats["meta_token_supply_log"] = float(np.log10(supply)) if supply > 0 else 0.0

                # meta_has_socials: boolean 0/1
                feats["meta_has_socials"] = 1.0 if coin["has_socials"] else 0.0

                # meta_social_count: 0-4 raw
                feats["meta_social_count"] = float(coin["social_count"] or 0)

                # meta_metadata_mutable: null → 0.5 (unknown), known → 0/1
                mm = coin["metadata_is_mutable"]
                feats["meta_metadata_mutable_known"] = 0.0 if mm is None else 1.0
                feats["meta_metadata_mutable"] = 0.5 if mm is None else (1.0 if mm else 0.0)

                # meta_mint_authority: null → 0.5 (unknown), known → 0/1
                ma = coin["mint_authority_enabled"]
                feats["meta_mint_authority_known"] = 0.0 if ma is None else 1.0
                feats["meta_mint_authority"] = 0.5 if ma is None else (1.0 if ma else 0.0)

                # meta_risk_score: 0-100 -> 0-1
                rs = coin["risk_score"]
                feats["meta_risk_score"] = (float(rs) / 100.0) if rs is not None else 0.0

                # meta_top10_holders_pct: 0-100 -> 0-1
                th = coin["top_10_holders_pct"]
                feats["meta_top10_holders_pct"] = (float(th) / 100.0) if th is not None else 0.0

                # meta_liquidity_sol: log10(liq + 1)
                liq = float(coin["liquidity_sol"] or 0)
                feats["meta_liquidity_sol"] = float(np.log10(liq + 1))

                # meta_is_mayhem: boolean 0/1
                feats["meta_is_mayhem"] = 1.0 if coin["is_mayhem_mode"] else 0.0

            # SOL price features
            price_data = sol_prices.get(mint)
            if price_data:
                feats["meta_sol_price_usd"] = price_data["price"]
                feats["meta_sol_price_change_1h"] = price_data["change_1h"]

            result[mint] = feats

        logger.info("Metadata features computed for %d mints", len(result))
        return result

    except Exception as e:
        logger.warning("Metadata features computation failed: %s", e)
        return {mint: dict(default_features) for mint in mints}


async def _get_sol_prices(
    pool,
    mints: List[str],
    coin_data: Dict,
    timestamps: Optional[Dict[str, datetime]],
) -> Dict[str, Dict[str, float]]:
    """Look up SOL price at discovery time for each mint.

    Returns {mint: {"price": float, "change_1h": float}}.
    """
    result: Dict[str, Dict[str, float]] = {}

    # Collect discovery timestamps
    discovery_times = {}
    for mint in mints:
        if timestamps and mint in timestamps:
            discovery_times[mint] = timestamps[mint]
        elif mint in coin_data and coin_data[mint]["discovered_at"]:
            discovery_times[mint] = coin_data[mint]["discovered_at"]

    if not discovery_times:
        return result

    try:
        for mint, ts in discovery_times.items():
            # Get the closest SOL price at discovery time
            row = await pool.fetchrow(
                """
                SELECT sol_price_usd, created_at
                FROM exchange_rates
                WHERE created_at <= $1
                ORDER BY created_at DESC
                LIMIT 1
                """,
                ts,
            )

            if row:
                price = float(row["sol_price_usd"])
                result[mint] = {"price": price, "change_1h": 0.0}

                # Get price from 1h before for change calculation
                row_1h = await pool.fetchrow(
                    """
                    SELECT sol_price_usd
                    FROM exchange_rates
                    WHERE created_at <= $1 - INTERVAL '1 hour'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    ts,
                )

                if row_1h:
                    price_1h = float(row_1h["sol_price_usd"])
                    if price_1h > 0:
                        result[mint]["change_1h"] = ((price - price_1h) / price_1h) * 100.0

    except Exception as e:
        logger.debug("SOL price lookup failed: %s", e)

    return result
