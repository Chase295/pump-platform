"""
Phase management and stream lifecycle for the Find module.

Handles:
- Loading phase configuration from the database (ref_coin_phases)
- Phase advancement based on coin age
- Stream activation from cache, deactivation of expired streams
- Database operations for coin_streams and ref_coin_phases tables

Phase lifecycle:
    Baby Zone (0-10m, 5s) -> Survival Zone (10-60m, 30s) -> Mature Zone (60-1440m, 60s) -> Finished/Graduated
"""

import asyncio
import time
import logging
from datetime import datetime, timezone

from backend.database import get_pool, fetch, fetchrow, execute
from backend.config import settings
from backend.shared.prometheus import find_phase_switches, find_active_streams

logger = logging.getLogger(__name__)



async def load_phases_config(pool=None) -> tuple[dict, list]:
    """Load phase configuration from the database.

    Args:
        pool: Optional asyncpg pool. If None, uses the global pool.

    Returns:
        Tuple of (phases_config dict, sorted_phase_ids list).
        phases_config: ``{phase_id: {"interval": int, "max_age": int, "name": str}}``
    """
    if pool is None:
        pool = get_pool()

    rows = await pool.fetch("SELECT * FROM ref_coin_phases ORDER BY id ASC")
    phases_config = {}
    for row in rows:
        phases_config[row["id"]] = {
            "interval": row["interval_seconds"],
            "max_age": row["max_age_minutes"],
            "name": row["name"],
        }
    sorted_phase_ids = sorted(phases_config.keys())
    return phases_config, sorted_phase_ids


async def reload_phases_for_watchlist(watchlist: dict, phases_config: dict) -> int:
    """Reload phase configuration and update intervals for active watchlist entries.

    Args:
        watchlist: The global watchlist ``{mint: entry}``.
        phases_config: The current phases config dict.

    Returns:
        Number of streams whose interval was updated.
    """
    updated_count = 0
    current_time = time.time()

    for mint, entry in watchlist.items():
        phase_id = entry["meta"].get("phase_id", 1)
        if phase_id in phases_config:
            old_interval = entry.get("interval", 0)
            new_interval = phases_config[phase_id]["interval"]

            if old_interval != new_interval:
                entry["interval"] = new_interval
                entry["next_flush"] = current_time + new_interval
                updated_count += 1

    logger.info("Phase config reloaded: %d phases, %d streams updated",
                len(phases_config), updated_count)
    return updated_count


async def get_active_streams_from_db(ath_cache: dict, pool=None) -> dict:
    """Load active coin streams from the database.

    Also populates/updates the ATH cache from DB values.

    Args:
        ath_cache: ``{mint: ath_price}`` -- updated in place.
        pool: Optional asyncpg pool.

    Returns:
        Dict of ``{mint: {"phase_id": int, "created_at": datetime, "started_at": datetime, "creator_address": str|None}}``.
    """
    if pool is None:
        pool = get_pool()

    # Repair missing streams (best effort)
    try:
        await pool.execute("SELECT repair_missing_streams()")
    except Exception:
        pass

    sql = """
        SELECT cs.token_address, cs.current_phase_id, dc.token_created_at,
               cs.started_at, dc.trader_public_key, cs.ath_price_sol
        FROM coin_streams cs
        JOIN discovered_coins dc ON cs.token_address = dc.token_address
        WHERE cs.is_active = TRUE
    """
    try:
        async with pool.acquire(timeout=10) as conn:
            rows = await conn.fetch(sql)
    except asyncio.TimeoutError:
        logger.error("get_active_streams_from_db: pool.acquire timeout")
        return {}

    results = {}

    for row in rows:
        mint = row["token_address"]
        created_at = row["token_created_at"]
        started_at = row["started_at"]

        if not created_at:
            created_at = datetime.now(timezone.utc)
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if started_at and started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)

        # ATH from DB
        db_ath = row.get("ath_price_sol")
        db_ath = float(db_ath) if db_ath is not None else 0.0

        if mint not in ath_cache:
            ath_cache[mint] = db_ath
        elif ath_cache[mint] < db_ath:
            ath_cache[mint] = db_ath

        results[mint] = {
            "phase_id": row["current_phase_id"],
            "created_at": created_at,
            "started_at": started_at or created_at,
            "creator_address": row.get("trader_public_key"),
        }

    return results


async def switch_phase(mint: str, old_phase: int, new_phase: int) -> None:
    """Update the current phase for a coin stream in the database.

    Raises on failure so the caller can decide whether to update in-memory state.

    Args:
        mint: Token address.
        old_phase: Previous phase ID (for logging).
        new_phase: New phase ID.
    """
    pool = get_pool()
    try:
        async with pool.acquire(timeout=10) as conn:
            await conn.execute(
                "UPDATE coin_streams SET current_phase_id = $1 WHERE token_address = $2",
                new_phase, mint,
            )
    except asyncio.TimeoutError:
        raise Exception(f"switch_phase pool.acquire timeout for {mint[:8]}")
    find_phase_switches.inc()
    logger.info("Phase %d -> %d for %s", old_phase, new_phase, mint[:8])


async def stop_tracking(mint: str, is_graduation: bool, watchlist: dict,
                         subscribed_mints: set, dirty_aths: set) -> None:
    """Stop tracking a coin -- mark it as finished or graduated in the database.

    Also cleans up in-memory state (watchlist, subscribed_mints, dirty_aths).

    Args:
        mint: Token address.
        is_graduation: True if the coin graduated to Raydium.
        watchlist: Global watchlist dict.
        subscribed_mints: Set of currently subscribed mints.
        dirty_aths: Set of mints with pending ATH updates.
    """
    try:
        if is_graduation:
            final_phase = 100
            graduated_flag = True
            logger.info("GRADUATION: %s goes to Raydium!", mint[:8])
        else:
            final_phase = 99
            graduated_flag = False
            logger.info("FINISHED: %s lifecycle ended", mint[:8])

        pool = get_pool()
        async with pool.acquire(timeout=10) as conn:
            await conn.execute("""
                UPDATE coin_streams
                SET is_active = FALSE, current_phase_id = $2, is_graduated = $3
                WHERE token_address = $1
            """, mint, final_phase, graduated_flag)
    except asyncio.TimeoutError:
        logger.error("Stop tracking pool.acquire timeout for %s", mint[:8])
    except Exception as e:
        logger.error("Stop tracking error for %s: %s", mint[:8], e)
    finally:
        watchlist.pop(mint, None)
        subscribed_mints.discard(mint)
        dirty_aths.discard(mint)
        find_active_streams.set(len(watchlist))


async def check_lifecycle_and_advance(
    watchlist: dict,
    phases_config: dict,
    sorted_phase_ids: list,
    subscribed_mints: set,
    dirty_aths: set,
    status: dict,
    now_ts: float,
    last_trade_timestamps: dict,
    last_saved_signatures: dict,
    stale_data_warnings: dict,
    force_resubscribe_fn=None,
) -> list[tuple]:
    """Run lifecycle checks (graduation, phase advance) and collect metrics to flush.

    This is the central function called every iteration of the main loop.
    It checks each coin in the watchlist for graduation, phase advancement,
    and whether its buffer should be flushed.

    Args:
        watchlist: Global watchlist.
        phases_config: Phase config dict.
        sorted_phase_ids: Sorted list of phase IDs.
        subscribed_mints: Set of subscribed mints.
        dirty_aths: Set of mints with dirty ATH.
        status: Shared status dict.
        now_ts: Current timestamp (time.time()).
        last_trade_timestamps: For zombie detection.
        last_saved_signatures: ``{mint: signature}`` for stale data detection.
        stale_data_warnings: ``{mint: count}`` of stale data warnings.
        force_resubscribe_fn: Optional async callable for re-subscribing.

    Returns:
        Tuple of (metrics_results, trades_for_flush):
        - metrics_results: List of ``(batch_tuple, phase_id)`` pairs for ``flush_metrics_batch``.
        - trades_for_flush: List of tuples for ``flush_transactions_batch``.
    """
    from backend.modules.find.metrics import get_empty_buffer, calculate_advanced_metrics
    from zoneinfo import ZoneInfo

    GERMAN_TZ = ZoneInfo("Europe/Berlin")
    sol_reserves_full = settings.SOL_RESERVES_FULL

    batch_data = []
    phases_in_batch = []
    trades_for_flush = []
    now_utc = datetime.now(timezone.utc)
    now_berlin = datetime.now(GERMAN_TZ)

    for mint, entry in list(watchlist.items()):
        buf = entry["buffer"]
        current_bonding_pct = (buf["v_sol"] / sol_reserves_full) * 100 if sol_reserves_full > 0 else 0

        # Graduation check
        if current_bonding_pct >= 99.5:
            await stop_tracking(mint, is_graduation=True, watchlist=watchlist,
                                subscribed_mints=subscribed_mints, dirty_aths=dirty_aths)
            continue

        # Phase upgrade check -- find the correct phase for the coin's age
        created_at = entry["meta"]["created_at"]
        current_pid = entry["meta"]["phase_id"]
        diff = now_utc - created_at
        age_minutes = diff.total_seconds() / 60

        phase_cfg = phases_config.get(current_pid)
        if phase_cfg and age_minutes > phase_cfg["max_age"]:
            # Find the correct target phase (may skip multiple phases)
            target_pid = None
            for pid in sorted_phase_ids:
                if pid <= current_pid:
                    continue
                p_cfg = phases_config.get(pid)
                if p_cfg and age_minutes <= p_cfg["max_age"]:
                    target_pid = pid
                    break

            # If no suitable phase found, coin has outlived all phases
            if target_pid is None or target_pid >= 99:
                await stop_tracking(mint, is_graduation=False, watchlist=watchlist,
                                    subscribed_mints=subscribed_mints, dirty_aths=dirty_aths)
                continue

            # Advance phase -- only update in-memory state after DB succeeds
            try:
                await switch_phase(mint, current_pid, target_pid)
            except Exception as e:
                logger.error("Phase switch failed for %s (%d->%d): %s -- will retry next cycle",
                             mint[:8], current_pid, target_pid, e)
            else:
                entry["meta"]["phase_id"] = target_pid
                new_interval = phases_config[target_pid]["interval"]
                entry["interval"] = new_interval
                entry["next_flush"] = now_ts + new_interval

                if force_resubscribe_fn:
                    try:
                        await force_resubscribe_fn(mint)
                    except Exception as e:
                        logger.warning("Re-subscribe after phase switch failed for %s: %s", mint[:8], e)

        # Flush check
        if now_ts >= entry["next_flush"]:
            last_trade = last_trade_timestamps.get(mint, 0)
            time_since_last_trade = now_ts - last_trade

            should_save = False
            if buf["vol"] > 0:
                current_signature = f"{buf['close']:.10f}_{buf['vol']:.6f}_{buf['buys'] + buf['sells']}"
                last_saved_sig = last_saved_signatures.get(mint)

                if last_saved_sig != current_signature:
                    should_save = True
                    last_saved_signatures[mint] = current_signature
                else:
                    warning_count = stale_data_warnings.get(mint, 0) + 1
                    stale_data_warnings[mint] = warning_count

                    if warning_count <= 3:
                        logger.warning("[Zombie Alert] %s - identical data for %d saves",
                                       mint[:8], warning_count)

                    is_stale = time_since_last_trade > 300
                    if is_stale and warning_count >= 2 and force_resubscribe_fn:
                        logger.warning("[Watchdog] %s - no trades for %.0fs, triggering re-subscribe",
                                       mint[:8], time_since_last_trade)
                        await force_resubscribe_fn(mint)

            if should_save:
                is_koth = buf["mcap"] > 30000
                advanced = calculate_advanced_metrics(buf)

                batch_data.append((
                    mint, now_berlin, entry["meta"]["phase_id"],
                    buf["open"], buf["high"], buf["low"], buf["close"], buf["mcap"],
                    current_bonding_pct, buf["v_sol"], is_koth,
                    buf["vol"], buf["vol_buy"], buf["vol_sell"],
                    buf["buys"], buf["sells"], len(buf["wallets"]), buf["micro_trades"],
                    buf["dev_sold_amount"], buf["max_buy"], buf["max_sell"],
                    advanced["net_volume_sol"], advanced["volatility_pct"],
                    advanced["avg_trade_size_sol"], advanced["whale_buy_volume_sol"],
                    advanced["whale_sell_volume_sol"], advanced["num_whale_buys"],
                    advanced["num_whale_sells"], advanced["buy_pressure_ratio"],
                    advanced["unique_signer_ratio"],
                ))
                phases_in_batch.append(entry["meta"]["phase_id"])

                # Reset stale warning on successful save
                stale_data_warnings.pop(mint, None)

            # Collect individual trades for coin_transactions before reset
            if buf.get("trades"):
                phase_id = entry["meta"]["phase_id"]
                for t in buf["trades"]:
                    trades_for_flush.append((
                        t[0], now_berlin, t[1], t[2], t[3], t[4], t[5], phase_id,
                    ))

            # Always reset buffer
            entry["buffer"] = get_empty_buffer()
            entry["next_flush"] = now_ts + entry["interval"]

    metrics_results = list(zip(batch_data, phases_in_batch)) if batch_data else []
    return metrics_results, trades_for_flush
