"""
Metrics calculation and flushing for the Find module.

Handles OHLCV calculation from trade buffers, whale detection,
ATH tracking, and INSERT into the coin_metrics table.

Called by the streamer on each flush cycle.
"""

import asyncio
import time
import logging
from collections import Counter
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from backend.database import get_pool, execute_many
from backend.config import settings
from backend.shared.prometheus import find_metrics_saved, find_transactions_saved

logger = logging.getLogger(__name__)

GERMAN_TZ = ZoneInfo("Europe/Berlin")


def get_empty_buffer() -> dict:
    """Return a fresh empty buffer for a new tracking interval."""
    return {
        "open": None, "high": -1, "low": float("inf"), "close": 0,
        "vol": 0, "vol_buy": 0, "vol_sell": 0, "buys": 0, "sells": 0,
        "micro_trades": 0, "max_buy": 0, "max_sell": 0,
        "wallets": set(), "v_sol": 0, "mcap": 0,
        "whale_buy_vol": 0, "whale_sell_vol": 0, "whale_buys": 0, "whale_sells": 0,
        "dev_sold_amount": 0,
        "trades": [],
    }


def process_trade(watchlist: dict, data: dict, ath_cache: dict, dirty_aths: set,
                   last_trade_timestamps: dict, subscription_watchdog: dict) -> None:
    """Process a single trade event and update the buffer in-place.

    Args:
        watchlist: The global watchlist dict ``{mint: entry}``.
        data: Raw trade event from the WebSocket.
        ath_cache: ``{mint: ath_price}`` ATH price cache.
        dirty_aths: Set of mints whose ATH has been updated but not flushed.
        last_trade_timestamps: ``{mint: timestamp}`` for zombie detection.
        subscription_watchdog: ``{mint: last_heartbeat}`` for watchdog.
    """
    mint = data.get("mint")
    if not mint or mint not in watchlist:
        return

    entry = watchlist[mint]
    buf = entry["buffer"]
    now_ts = time.time()

    try:
        sol = float(data["solAmount"])
        price = float(data["vSolInBondingCurve"]) / float(data["vTokensInBondingCurve"])
        is_buy = data["txType"] == "buy"
        trader_key = data.get("traderPublicKey", "")
    except (KeyError, ValueError, ZeroDivisionError):
        return

    # Zombie detection: track trade timestamp
    last_trade_timestamps[mint] = now_ts
    subscription_watchdog[mint] = now_ts

    # ATH tracking
    known_ath = ath_cache.get(mint, 0.0)
    if price > known_ath:
        ath_cache[mint] = price
        dirty_aths.add(mint)

    # Aggregate trade data
    if buf["open"] is None:
        buf["open"] = price
    buf["close"] = price
    buf["high"] = max(buf["high"], price)
    buf["low"] = min(buf["low"], price)
    buf["vol"] += sol

    whale_threshold = settings.WHALE_THRESHOLD_SOL

    if is_buy:
        buf["buys"] += 1
        buf["vol_buy"] += sol
        buf["max_buy"] = max(buf["max_buy"], sol)
        if sol >= whale_threshold:
            buf["whale_buy_vol"] += sol
            buf["whale_buys"] += 1
    else:
        buf["sells"] += 1
        buf["vol_sell"] += sol
        buf["max_sell"] = max(buf["max_sell"], sol)
        if sol >= whale_threshold:
            buf["whale_sell_vol"] += sol
            buf["whale_sells"] += 1
        # Dev tracking
        creator_address = entry["meta"].get("creator_address")
        if creator_address and trader_key and trader_key == creator_address:
            buf["dev_sold_amount"] += sol

    if sol < 0.01:
        buf["micro_trades"] += 1
    buf["wallets"].add(trader_key)
    buf["v_sol"] = float(data["vSolInBondingCurve"])
    buf["mcap"] = price * 1_000_000_000

    # Collect individual trade for coin_transactions
    buf["trades"].append((
        mint,
        trader_key,
        sol,
        "buy" if is_buy else "sell",
        price,
        sol >= whale_threshold,
    ))


def calculate_advanced_metrics(buf: dict) -> dict:
    """Compute derived metrics from the raw buffer."""
    net_volume = buf["vol_buy"] - buf["vol_sell"]

    if buf["open"] and buf["open"] > 0:
        volatility = ((buf["high"] - buf["low"]) / buf["open"]) * 100
    else:
        volatility = 0.0

    total_trades = buf["buys"] + buf["sells"]
    avg_trade_size = buf["vol"] / total_trades if total_trades > 0 else 0.0

    total_volume = buf["vol_buy"] + buf["vol_sell"]
    buy_pressure_ratio = buf["vol_buy"] / total_volume if total_volume > 0 else 0.0

    unique_signer_ratio = len(buf["wallets"]) / total_trades if total_trades > 0 else 0.0

    return {
        "net_volume_sol": net_volume,
        "volatility_pct": volatility,
        "avg_trade_size_sol": avg_trade_size,
        "whale_buy_volume_sol": buf["whale_buy_vol"],
        "whale_sell_volume_sol": buf["whale_sell_vol"],
        "num_whale_buys": buf["whale_buys"],
        "num_whale_sells": buf["whale_sells"],
        "buy_pressure_ratio": buy_pressure_ratio,
        "unique_signer_ratio": unique_signer_ratio,
    }


async def flush_metrics_batch(batch_data: list[tuple], phases_in_batch: list[int],
                               status: dict) -> None:
    """Write a batch of metric rows to coin_metrics.

    Args:
        batch_data: List of tuples matching the INSERT parameter order.
        phases_in_batch: Phase IDs corresponding to each row (for logging).
        status: The shared ``unified_status`` dict to update counters.
    """
    if not batch_data:
        return

    sql = """
        INSERT INTO coin_metrics (
            mint, timestamp, phase_id_at_time, price_open, price_high, price_low, price_close,
            market_cap_close, bonding_curve_pct, virtual_sol_reserves, is_koth, volume_sol,
            buy_volume_sol, sell_volume_sol, num_buys, num_sells, unique_wallets, num_micro_trades,
            dev_sold_amount, max_single_buy_sol, max_single_sell_sol, net_volume_sol,
            volatility_pct, avg_trade_size_sol, whale_buy_volume_sol, whale_sell_volume_sol,
            num_whale_buys, num_whale_sells, buy_pressure_ratio, unique_signer_ratio
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
            $27, $28, $29, $30
        )
    """
    pool = get_pool()
    max_attempts = 2
    for attempt in range(1, max_attempts + 1):
        try:
            async with pool.acquire(timeout=10) as conn:
                await conn.executemany(sql, batch_data)

            find_metrics_saved.inc(len(batch_data))
            status["total_metrics_saved"] += len(batch_data)

            counts = Counter(phases_in_batch)
            details = ", ".join([f"Phase {k}: {v}" for k, v in sorted(counts.items())])
            logger.info("Saved metrics for %d coins (%s)", len(batch_data), details)
            return

        except asyncio.TimeoutError:
            logger.error("Metrics flush attempt %d/%d: pool.acquire timeout", attempt, max_attempts)
        except Exception as e:
            logger.error("Metrics flush attempt %d/%d: %s", attempt, max_attempts, e)

        if attempt < max_attempts:
            await asyncio.sleep(1.0)

    # Both attempts failed
    logger.error("Metrics flush failed after %d attempts - %d rows lost", max_attempts, len(batch_data))
    status["db_connected"] = False
    from backend.shared.prometheus import find_db_connected
    find_db_connected.set(0)


async def flush_transactions_batch(trades_data: list[tuple], status: dict) -> None:
    """Write individual trade records to coin_transactions (non-fatal).

    This is called AFTER flush_metrics_batch and is completely independent.
    Failures here never affect coin_metrics or the main pipeline.

    Args:
        trades_data: List of tuples (mint, timestamp, trader_key, sol, tx_type, price, is_whale, phase_id).
        status: Shared status dict (NOT modified on failure).
    """
    if not trades_data:
        return

    sql = """
        INSERT INTO coin_transactions (
            mint, timestamp, trader_public_key, sol_amount,
            tx_type, price_sol, is_whale, phase_id_at_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    """
    try:
        pool = get_pool()
        async with pool.acquire(timeout=10) as conn:
            await conn.executemany(sql, trades_data)
        find_transactions_saved.inc(len(trades_data))
        logger.debug("Saved %d transactions", len(trades_data))
    except asyncio.TimeoutError:
        logger.warning("coin_transactions flush timed out (non-fatal)")
    except Exception as e:
        logger.warning("coin_transactions flush failed (non-fatal): %s", e)


async def flush_ath_updates(ath_cache: dict, dirty_aths: set, status: dict) -> None:
    """Write pending ATH updates to the coin_streams table.

    Args:
        ath_cache: ``{mint: ath_price}`` cache.
        dirty_aths: Set of mints needing an ATH DB update.
        status: The shared status dict.
    """
    if not dirty_aths:
        return

    if not status.get("db_connected", False):
        return

    updates = []
    for mint in dirty_aths:
        new_ath = ath_cache.get(mint, 0.0)
        if new_ath > 0:
            updates.append((new_ath, mint))

    if not updates:
        dirty_aths.clear()
        return

    try:
        pool = get_pool()
        query = """
            UPDATE coin_streams
            SET ath_price_sol = $1, ath_timestamp = NOW()
            WHERE token_address = $2
        """
        async with pool.acquire(timeout=10) as conn:
            await conn.executemany(query, updates)

        updated_count = len(updates)
        dirty_aths.clear()

        if updated_count > 10:
            logger.info("ATH-Update: %d coins written to DB", updated_count)

    except asyncio.TimeoutError:
        logger.error("ATH-Update: pool.acquire timeout")
    except Exception as e:
        logger.error("ATH-Update error: %s", e)
