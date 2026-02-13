"""
WebSocket streaming client for the Find module.

Connects to wss://pumpportal.fun/api/data, subscribes to newToken and
tokenTrade events, and manages:
- Reconnection with exponential backoff
- Ping/pong keep-alive
- Coin cache (120s TTL)
- n8n webhook forwarding
- Phase advancement and metrics flushing via background tasks

Usage:
    streamer = CoinStreamer()
    await streamer.start()   # creates background asyncio tasks
    ...
    await streamer.stop()
"""

import asyncio
import json
import random
import re
import ssl
import time
import logging
from datetime import datetime, timezone

import httpx
import websockets

from backend.config import settings
from backend.database import get_pool
from backend.shared.prometheus import (
    find_coins_discovered,
    find_coins_filtered,
    find_ws_reconnects,
    find_active_streams,
    find_cache_size,
    find_n8n_batches_sent,
    find_ws_connected,
    find_db_connected,
)

from backend.modules.find.metrics import (
    get_empty_buffer,
    process_trade,
    flush_metrics_batch,
    flush_transactions_batch,
    flush_ath_updates,
)
from backend.modules.find.phases import (
    load_phases_config,
    reload_phases_for_watchlist,
    get_active_streams_from_db,
    check_lifecycle_and_advance,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Coin Cache
# ---------------------------------------------------------------------------

class CoinCache:
    """120-second cache for newly discovered coins.

    Collects new coins and their trades until they are activated for full
    tracking or expire.
    """

    def __init__(self, cache_seconds: int = 120, max_size: int = 0):
        self.cache_seconds = cache_seconds
        self.max_size = max_size
        self.cache: dict = {}
        self.last_cleanup = time.time()

    def _evict_oldest(self) -> None:
        """Evict the oldest non-activated coin from cache."""
        oldest_mint = None
        oldest_time = float("inf")
        for mint, data in self.cache.items():
            if not data["activated"] and data["discovered_at"] < oldest_time:
                oldest_time = data["discovered_at"]
                oldest_mint = mint
        if oldest_mint:
            del self.cache[oldest_mint]
            logger.debug("Cache evicted oldest coin %s (%.0fs old)", oldest_mint[:8], time.time() - oldest_time)

    def add_coin(self, mint: str, coin_data: dict) -> None:
        # Enforce max size before adding
        if self.max_size > 0 and len(self.cache) >= self.max_size:
            self._evict_oldest()

        now = time.time()
        self.cache[mint] = {
            "discovered_at": now,
            "metadata": coin_data.copy(),
            "trades": [],
            "n8n_sent": False,
            "activated": False,
            "subscription_active": True,
        }
        find_cache_size.set(len(self.cache))
        logger.info("Coin %s placed in %ds cache", mint[:8], self.cache_seconds)

    def add_trade(self, mint: str, trade_data: dict) -> None:
        if mint in self.cache and not self.cache[mint]["activated"]:
            self.cache[mint]["trades"].append((time.time(), trade_data))

    def activate_coin(self, mint: str) -> list:
        if mint in self.cache:
            self.cache[mint]["activated"] = True
            trades = self.cache[mint]["trades"].copy()
            find_cache_size.set(len(self.cache))
            logger.info("Coin %s activated - %d cached trades available", mint[:8], len(trades))
            return trades
        return []

    def remove_coin(self, mint: str) -> None:
        if mint in self.cache:
            was_activated = self.cache[mint]["activated"]
            del self.cache[mint]
            find_cache_size.set(len(self.cache))
            if not was_activated:
                logger.info("Coin %s cache expired - removed", mint[:8])

    def cleanup_expired_coins(self, current_time: float | None = None) -> int:
        if current_time is None:
            current_time = time.time()

        expired_mints = [
            mint for mint, data in self.cache.items()
            if (current_time - data["discovered_at"]) > self.cache_seconds and not data["activated"]
        ]
        for mint in expired_mints:
            self.remove_coin(mint)

        self.last_cleanup = current_time
        return len(expired_mints)

    def get_cache_stats(self) -> dict:
        total_coins = len(self.cache)
        activated_coins = sum(1 for d in self.cache.values() if d["activated"])
        expired_coins = total_coins - activated_coins

        if self.cache:
            oldest_age = min(time.time() - d["discovered_at"] for d in self.cache.values())
            newest_age = max(time.time() - d["discovered_at"] for d in self.cache.values())
        else:
            oldest_age = newest_age = 0

        return {
            "total_coins": total_coins,
            "activated_coins": activated_coins,
            "expired_coins": expired_coins,
            "oldest_age_seconds": int(oldest_age),
            "newest_age_seconds": int(newest_age),
        }


# ---------------------------------------------------------------------------
# Coin Filter
# ---------------------------------------------------------------------------

class CoinFilter:
    """Filters coins based on bad names and spam-burst detection."""

    def __init__(self, spam_burst_window: int = 30):
        self.recent_coins: list = []
        self.spam_burst_window = spam_burst_window
        self._bad_names_re = re.compile(
            rf'({settings.BAD_NAMES_PATTERN})', re.IGNORECASE,
        )

    def should_filter_coin(self, coin_data: dict) -> tuple[bool, str | None]:
        name = coin_data.get("name", "").strip()
        symbol = coin_data.get("symbol", "").strip()

        # Bad names filter
        if self._bad_names_re.search(name):
            find_coins_filtered.labels(reason="bad_name").inc()
            return True, "bad_name"

        # Spam burst filter
        now = time.time()
        recent_identical = [
            ts for ts, n, s in self.recent_coins
            if (n == name or s == symbol) and (now - ts) < self.spam_burst_window
        ]
        if recent_identical:
            find_coins_filtered.labels(reason="spam_burst").inc()
            return True, "spam_burst"

        # Coin is OK
        self.recent_coins.append((now, name, symbol))
        cutoff = now - (self.spam_burst_window * 2)
        self.recent_coins = [(ts, n, s) for ts, n, s in self.recent_coins if ts > cutoff]

        return False, None


# ---------------------------------------------------------------------------
# n8n integration
# ---------------------------------------------------------------------------

async def send_batch_to_n8n(batch: list, status: dict) -> bool:
    """Send a batch of discovered coins to n8n via webhook.

    Args:
        batch: List of coin data dicts.
        status: Shared status dict (updated with n8n_available).

    Returns:
        True if the batch was sent successfully.
    """
    webhook_url = settings.N8N_FIND_WEBHOOK_URL
    webhook_method = settings.N8N_FIND_WEBHOOK_METHOD
    status["n8n_no_url"] = not bool(webhook_url)

    if not webhook_url:
        # No webhook configured - silently discard batch
        status["n8n_available"] = False
        return True

    max_retries = 3
    retry_count = 0

    payload = {
        "source": "pump_find_backend",
        "count": len(batch),
        "timestamp": datetime.utcnow().isoformat(),
        "data": batch,
    }

    while retry_count < max_retries:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                if webhook_method == "GET":
                    import urllib.parse
                    json_data = json.dumps(payload)
                    encoded_data = urllib.parse.quote(json_data)
                    url_with_params = f"{webhook_url}?data={encoded_data}"
                    resp = await client.get(url_with_params)
                else:
                    resp = await client.post(webhook_url, json=payload)

                http_status = resp.status_code

            if http_status == 200:
                logger.info("Batch (%d coins) sent to n8n", len(batch))
                status["n8n_available"] = True
                status["n8n_no_url"] = False
                status["last_n8n_success"] = time.time()
                find_n8n_batches_sent.inc()
                return True
            elif http_status == 404:
                logger.error("n8n 404 - check webhook URL")
                status["n8n_available"] = False
                return False
            else:
                logger.warning("n8n status %d (retry %d/%d)", http_status, retry_count + 1, max_retries)
                status["n8n_available"] = False
                retry_count += 1

        except httpx.TimeoutException:
            logger.warning("n8n timeout (retry %d/%d)", retry_count + 1, max_retries)
            status["n8n_available"] = False
            retry_count += 1
        except httpx.RequestError as e:
            logger.warning("n8n connection error: %s (retry %d/%d)", e, retry_count + 1, max_retries)
            status["n8n_available"] = False
            retry_count += 1
        except Exception as e:
            logger.warning("n8n unexpected error: %s", e)
            status["n8n_available"] = False
            return False

        if retry_count < max_retries:
            await asyncio.sleep(5 * retry_count)

    logger.error("n8n unreachable after all retries")
    status["n8n_available"] = False
    return False


# ---------------------------------------------------------------------------
# CoinStreamer
# ---------------------------------------------------------------------------

class CoinStreamer:
    """WebSocket streaming client that discovers tokens and tracks trades.

    Manages the full lifecycle: discovery -> cache -> tracking -> phase
    advancement -> metrics flush.
    """

    def __init__(self):
        # Phase config
        self.phases_config: dict = {}
        self.sorted_phase_ids: list = []

        # Cache & filter
        self.coin_cache = CoinCache(settings.COIN_CACHE_SECONDS, max_size=settings.COIN_CACHE_MAX_SIZE)
        self.coin_filter = CoinFilter(settings.SPAM_BURST_WINDOW)

        # Watchlist for active coins
        self.watchlist: dict = {}
        self.subscribed_mints: set = set()

        # Trade buffer
        self.trade_buffer: dict = {}
        self.last_buffer_cleanup = time.time()

        # ATH tracking
        self.ath_cache: dict = {}
        self.dirty_aths: set = set()
        self.last_ath_flush = time.time()

        # Zombie coin detection
        self.last_trade_timestamps: dict = {}
        self.subscription_watchdog: dict = {}
        self.stale_data_warnings: dict = {}
        self.last_saved_signatures: dict = {}

        # Watchdog timing
        self.last_watchdog_check = time.time()

        # WebSocket batching
        self.pending_subscriptions: set = set()
        self.batching_task: asyncio.Task | None = None
        self.last_batch_flush = time.time()

        # Discovery buffer (for n8n)
        self.discovery_buffer: list = []
        self.last_discovery_flush = time.time()

        # WebSocket reference
        self.websocket = None

        # Status tracking
        self.status: dict = {
            "db_connected": False,
            "ws_connected": False,
            "n8n_available": False,
            "n8n_no_url": False,
            "last_error": None,
            "start_time": time.time(),
            "connection_start": None,
            "last_message_time": None,
            "reconnect_count": 0,
            "total_coins_discovered": 0,
            "total_trades": 0,
            "total_metrics_saved": 0,
        }

        # Background tasks
        self._tasks: list[asyncio.Task] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the streamer as a set of background asyncio tasks."""
        # Load phases config first
        pool = get_pool()
        self.phases_config, self.sorted_phase_ids = await load_phases_config(pool)
        logger.info("Loaded phases: %s", self.sorted_phase_ids)
        self.status["db_connected"] = True
        find_db_connected.set(1)

        # Start main websocket loop as a task
        task = asyncio.create_task(self._websocket_loop())
        self._tasks.append(task)

    async def stop(self) -> None:
        """Flush all pending data, then cancel background tasks."""
        logger.info("CoinStreamer shutdown: flushing buffers...")

        # 1. Flush discovery buffer to DB
        try:
            if self.discovery_buffer:
                persisted = await self._persist_discovered_coins(self.discovery_buffer)
                logger.info("Shutdown: %d discovery coins persisted", persisted)
                self.discovery_buffer = []
        except Exception as e:
            logger.warning("Shutdown: discovery flush failed: %s", e)

        # 2. Force-flush all watchlist metric buffers
        try:
            results, trades_for_flush = await check_lifecycle_and_advance(
                watchlist=self.watchlist,
                phases_config=self.phases_config,
                sorted_phase_ids=self.sorted_phase_ids,
                subscribed_mints=self.subscribed_mints,
                dirty_aths=self.dirty_aths,
                status=self.status,
                now_ts=time.time() + 99999,  # force all next_flush to trigger
                last_trade_timestamps=self.last_trade_timestamps,
                last_saved_signatures=self.last_saved_signatures,
                stale_data_warnings=self.stale_data_warnings,
                force_resubscribe_fn=None,
            )
            if results:
                batch_data = [r[0] for r in results]
                phases_in_batch = [r[1] for r in results]
                await flush_metrics_batch(batch_data, phases_in_batch, self.status)
                logger.info("Shutdown: %d metric batches flushed", len(batch_data))
            if trades_for_flush:
                await flush_transactions_batch(trades_for_flush, self.status)
                logger.info("Shutdown: %d transactions flushed", len(trades_for_flush))
        except Exception as e:
            logger.warning("Shutdown: metrics flush failed: %s", e)

        # 3. Flush dirty ATHs
        try:
            if self.dirty_aths:
                await flush_ath_updates(self.ath_cache, self.dirty_aths, self.status)
                logger.info("Shutdown: ATH updates flushed")
        except Exception as e:
            logger.warning("Shutdown: ATH flush failed: %s", e)

        # Cancel tasks
        for task in self._tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._tasks.clear()
        logger.info("CoinStreamer stopped")

    # ------------------------------------------------------------------
    # Accessors used by the router
    # ------------------------------------------------------------------

    def get_status(self) -> dict:
        return self.status

    def get_cache_stats(self) -> dict:
        return self.coin_cache.get_cache_stats()

    async def reload_phases_config(self) -> int:
        """Reload phase configuration from DB and update watchlist."""
        pool = get_pool()
        self.phases_config, self.sorted_phase_ids = await load_phases_config(pool)
        return await reload_phases_for_watchlist(self.watchlist, self.phases_config)

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------

    async def _process_new_coin(self, coin_data: dict) -> None:
        """Process a newly discovered coin."""
        mint = coin_data.get("mint")
        if not mint:
            return

        should_filter, reason = self.coin_filter.should_filter_coin(coin_data)
        if should_filter:
            logger.debug("Coin %s filtered: %s", coin_data.get("symbol", "???"), reason)
            return

        # Calculations
        v_tokens = coin_data.get("vTokensInBondingCurve", 0)
        market_cap = coin_data.get("marketCapSol", 0)
        price_sol = market_cap / v_tokens if v_tokens and v_tokens > 0 else 0

        social_count = 0
        if coin_data.get("twitter_url") or coin_data.get("twitter"):
            social_count += 1
        if coin_data.get("telegram_url") or coin_data.get("telegram"):
            social_count += 1
        if coin_data.get("website_url") or coin_data.get("website"):
            social_count += 1
        if coin_data.get("discord_url") or coin_data.get("discord"):
            social_count += 1

        coin_data["price_sol"] = price_sol
        coin_data["pool_address"] = coin_data.get("bondingCurveKey", "")
        coin_data["social_count"] = social_count

        # Add to cache
        self.coin_cache.add_coin(mint, coin_data)

        # Subscribe to trades immediately
        self.pending_subscriptions.add(mint)

        # Add to discovery buffer for n8n
        self.discovery_buffer.append(coin_data)

        self.status["total_coins_discovered"] += 1
        find_coins_discovered.inc()

        logger.info("New coin: %s (cache: %d)", coin_data.get("symbol", "???"), len(self.coin_cache.cache))

    async def _persist_discovered_coins(self, coins: list) -> int:
        """Persist discovered coins directly to DB (discovered_coins + coin_streams).

        Non-fatal: catches all exceptions and logs warnings.
        Returns number of coins persisted.
        """
        if not coins:
            return 0

        dc_rows = []
        cs_rows = []
        for coin in coins:
            mint = coin.get("mint")
            if not mint:
                continue
            dc_rows.append((
                mint,
                coin.get("symbol", ""),
                coin.get("name", ""),
                coin.get("traderPublicKey", ""),
                float(coin.get("vTokensInBondingCurve", 0)),
                float(coin.get("vSolInBondingCurve", 0)),
                float(coin.get("marketCapSol", 0)),
                coin.get("bondingCurveKey", ""),
                coin.get("twitter_url") or coin.get("twitter") or "",
                coin.get("telegram_url") or coin.get("telegram") or "",
                coin.get("website_url") or coin.get("website") or "",
                coin.get("discord_url") or coin.get("discord") or "",
                float(coin.get("price_sol", 0)),
                int(coin.get("social_count", 0)),
            ))
            cs_rows.append((
                mint,
                1,      # phase_id
                True,   # is_active
            ))

        try:
            pool = get_pool()
            async with pool.acquire(timeout=5) as conn:
                await conn.executemany("""
                    INSERT INTO discovered_coins (
                        token_address, symbol, name, trader_public_key,
                        v_tokens_in_bonding_curve, v_sol_in_bonding_curve,
                        market_cap_sol, bonding_curve_key,
                        twitter_url, telegram_url, website_url, discord_url,
                        price_sol, social_count
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                    ON CONFLICT (token_address) DO NOTHING
                """, dc_rows)

                await conn.executemany("""
                    INSERT INTO coin_streams (token_address, current_phase_id, is_active)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (token_address) DO NOTHING
                """, cs_rows)

            logger.info("Persisted %d coins to DB (discovered_coins + coin_streams)", len(dc_rows))
            return len(dc_rows)

        except asyncio.TimeoutError:
            logger.warning("_persist_discovered_coins: pool.acquire timeout")
            return 0
        except Exception as e:
            logger.warning("_persist_discovered_coins failed (non-fatal): %s", e)
            return 0

    async def _flush_discovery_buffer(self) -> None:
        """Persist discovery buffer to DB, then optionally send to n8n."""
        if not self.discovery_buffer:
            return

        is_full = len(self.discovery_buffer) >= settings.BATCH_SIZE
        is_timeout = (time.time() - self.last_discovery_flush) > settings.BATCH_TIMEOUT

        if is_full or is_timeout:
            # 1. Always persist to DB first
            await self._persist_discovered_coins(self.discovery_buffer)

            # 2. Send to n8n (optional, best-effort)
            success = await send_batch_to_n8n(self.discovery_buffer, self.status)
            if success:
                for coin in self.discovery_buffer:
                    mint = coin.get("mint")
                    if mint in self.coin_cache.cache:
                        self.coin_cache.cache[mint]["n8n_sent"] = True

            # 3. Always clear buffer (data is safe in DB)
            self.discovery_buffer = []
            self.last_discovery_flush = time.time()

    # ------------------------------------------------------------------
    # Cache management
    # ------------------------------------------------------------------

    async def _check_cache_activation(self) -> tuple[int, int]:
        """Check cache for coins ready to activate or expire."""
        current_time = time.time()
        active_streams = await get_active_streams_from_db(self.ath_cache)
        active_mints = set(active_streams.keys())

        activated_count = 0
        expired_count = 0

        for mint in list(self.coin_cache.cache.keys()):
            cache_data = self.coin_cache.cache[mint]
            age = current_time - cache_data["discovered_at"]

            if age >= settings.COIN_CACHE_SECONDS:
                if mint in active_mints:
                    trades = self.coin_cache.activate_coin(mint)
                    await self._process_cached_trades(mint, trades, active_streams[mint])
                    activated_count += 1
                else:
                    self.coin_cache.remove_coin(mint)
                    expired_count += 1

        cleaned = self.coin_cache.cleanup_expired_coins(current_time)

        if activated_count > 0 or expired_count > 0 or cleaned > 0:
            logger.info("Cache management: %d activated, %d removed", activated_count, expired_count + cleaned)

        return activated_count, expired_count + cleaned

    async def _process_cached_trades(self, mint: str, cached_trades: list, stream_data: dict) -> None:
        """Process cached trades for a newly activated coin."""
        if not cached_trades:
            return

        p_id = stream_data["phase_id"]
        if p_id not in self.phases_config:
            p_id = self.sorted_phase_ids[0] if self.sorted_phase_ids else 1

        interval = self.phases_config[p_id]["interval"]
        self.watchlist[mint] = {
            "meta": stream_data,
            "buffer": get_empty_buffer(),
            "next_flush": time.time() + interval,
            "interval": interval,
        }
        self.subscribed_mints.add(mint)

        cached_trades.sort(key=lambda x: x[0])
        processed_count = 0

        for trade_ts, trade_data in cached_trades:
            if mint in self.watchlist:
                process_trade(
                    self.watchlist, trade_data, self.ath_cache, self.dirty_aths,
                    self.last_trade_timestamps, self.subscription_watchdog,
                )
                processed_count += 1

        logger.info("%d cached trades processed for %s", processed_count, mint[:8])

    # ------------------------------------------------------------------
    # WebSocket batching
    # ------------------------------------------------------------------

    async def _run_subscription_batching_task(self, ws) -> None:
        """Background task that batches pending WebSocket subscriptions."""
        batch_interval = 2.0
        max_batch_size = 50

        while True:
            try:
                await asyncio.sleep(batch_interval)

                if not self.pending_subscriptions:
                    continue

                batch_mints = list(self.pending_subscriptions)[:max_batch_size]
                for mint in batch_mints:
                    self.pending_subscriptions.discard(mint)

                if batch_mints:
                    try:
                        await ws.send(json.dumps({"method": "subscribeTokenTrade", "keys": batch_mints}))
                        logger.info("Batch subscription: %d coins subscribed", len(batch_mints))
                        self.subscribed_mints.update(batch_mints)
                    except Exception as e:
                        logger.error("Batch subscription error: %s", e)
                        self.pending_subscriptions.update(batch_mints)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("Batch task error: %s", e)
                await asyncio.sleep(1.0)

    # ------------------------------------------------------------------
    # Zombie / Watchdog
    # ------------------------------------------------------------------

    async def _force_resubscribe(self, mint: str) -> None:
        """Force re-subscribe for a coin to renew the WebSocket subscription."""
        if mint not in self.watchlist:
            return
        try:
            if self.websocket:
                await self.websocket.send(json.dumps({"method": "unsubscribeTokenTrade", "keys": [mint]}))
                await asyncio.sleep(0.1)
                await self.websocket.send(json.dumps({"method": "subscribeTokenTrade", "keys": [mint]}))
                self.subscription_watchdog[mint] = time.time()
                logger.debug("Re-subscription sent for %s", mint[:8])
            else:
                logger.warning("No active WebSocket for re-subscribe of %s", mint[:8])
        except Exception as e:
            logger.error("Re-subscribe error for %s: %s", mint[:8], e)

    async def _check_subscription_watchdog(self, now_ts: float) -> None:
        """Check all active coins for prolonged inactivity."""
        inactive_coins = []
        for mint in self.watchlist:
            last_trade = self.last_trade_timestamps.get(mint, 0)
            time_since_trade = now_ts - last_trade
            if time_since_trade > 600:  # 10 minutes
                inactive_coins.append((mint, time_since_trade))

        if inactive_coins:
            logger.warning("[Watchdog] %d coins without trades for >10 min", len(inactive_coins))
            for mint, inactive_time in inactive_coins:
                await self._force_resubscribe(mint)

    # ------------------------------------------------------------------
    # Buffer cleanup
    # ------------------------------------------------------------------

    def _cleanup_old_trades_from_buffer(self, now_ts: float) -> int:
        cutoff_time = now_ts - settings.TRADE_BUFFER_SECONDS
        total_removed = 0

        for mint in list(self.trade_buffer.keys()):
            original_len = len(self.trade_buffer[mint])
            self.trade_buffer[mint] = [
                (ts, data) for ts, data in self.trade_buffer[mint]
                if ts > cutoff_time
            ]
            total_removed += original_len - len(self.trade_buffer[mint])
            if not self.trade_buffer[mint]:
                del self.trade_buffer[mint]

        return total_removed

    # ------------------------------------------------------------------
    # Emergency flush (before reconnect)
    # ------------------------------------------------------------------

    async def _emergency_flush(self) -> None:
        """Flush critical buffers before reconnect. Non-fatal."""
        try:
            if self.discovery_buffer:
                persisted = await self._persist_discovered_coins(self.discovery_buffer)
                self.discovery_buffer = []
                logger.info("Emergency flush: %d discovery coins persisted", persisted)
        except Exception as e:
            logger.warning("Emergency flush (discovery) failed: %s", e)

        try:
            if self.dirty_aths:
                await flush_ath_updates(self.ath_cache, self.dirty_aths, self.status)
                logger.info("Emergency flush: ATH updates flushed")
        except Exception as e:
            logger.warning("Emergency flush (ATH) failed: %s", e)

    # ------------------------------------------------------------------
    # Main WebSocket loop
    # ------------------------------------------------------------------

    async def _websocket_loop(self) -> None:
        """Main loop: connect, subscribe, receive messages, manage lifecycle."""
        reconnect_count = 0

        while True:
            try:
                logger.info("Connecting to WebSocket (attempt #%d)...", reconnect_count + 1)

                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE

                async with websockets.connect(
                    settings.WS_URI,
                    ping_interval=settings.WS_PING_INTERVAL,
                    ping_timeout=settings.WS_PING_TIMEOUT,
                    close_timeout=10,
                    max_size=2**23,
                    compression=None,
                    ssl=ssl_context,
                ) as ws:
                    self.websocket = ws
                    self.status["ws_connected"] = True
                    self.status["connection_start"] = time.time()
                    self.status["last_error"] = None
                    find_ws_connected.set(1)
                    reconnect_count = 0
                    self.status["reconnect_count"] = 0

                    logger.info("WebSocket connected! Unified service running.")

                    # Subscribe to new tokens
                    await ws.send(json.dumps({"method": "subscribeNewToken"}))

                    # Restore existing subscriptions in chunks
                    if self.subscribed_mints:
                        restore_list = list(self.subscribed_mints)
                        logger.info("Restoring %d existing subscriptions in chunks...", len(restore_list))
                        chunk_size = 50
                        try:
                            for i in range(0, len(restore_list), chunk_size):
                                chunk = restore_list[i:i + chunk_size]
                                await ws.send(json.dumps({"method": "subscribeTokenTrade", "keys": chunk}))
                                if i + chunk_size < len(restore_list):
                                    await asyncio.sleep(0.2)
                        except Exception as e:
                            logger.warning("Error restoring subscriptions: %s", e)
                            self.pending_subscriptions.update(self.subscribed_mints)

                    # Sync with DB
                    try:
                        db_streams = await get_active_streams_from_db(self.ath_cache)
                        current_set = set(db_streams.keys())
                        to_add = current_set - self.subscribed_mints
                        if to_add:
                            self.pending_subscriptions.update(to_add)
                        logger.info("DB sync: %d active streams, %d subscribed, %d pending",
                                    len(current_set), len(self.subscribed_mints), len(self.pending_subscriptions))
                    except Exception as e:
                        logger.warning("Error loading active streams: %s", e)

                    # Start batching task
                    self.batching_task = asyncio.create_task(self._run_subscription_batching_task(ws))

                    last_refresh = 0
                    last_message_time = time.time()

                    while True:
                        now_ts = time.time()

                        # Periodic DB sync
                        if now_ts - last_refresh > settings.DB_REFRESH_INTERVAL:
                            try:
                                activated, expired = await self._check_cache_activation()

                                db_streams = await get_active_streams_from_db(self.ath_cache)
                                current_set = set(db_streams.keys())
                                to_remove = self.subscribed_mints - current_set

                                for mint in to_remove:
                                    self.watchlist.pop(mint, None)
                                    self.subscribed_mints.discard(mint)

                                to_add = current_set - self.subscribed_mints
                                for mint in to_add:
                                    if mint in db_streams:
                                        p_id = db_streams[mint]["phase_id"]
                                        if p_id not in self.phases_config:
                                            p_id = self.sorted_phase_ids[0] if self.sorted_phase_ids else 1
                                        interval = self.phases_config[p_id]["interval"]
                                        self.watchlist[mint] = {
                                            "meta": db_streams[mint],
                                            "buffer": get_empty_buffer(),
                                            "next_flush": now_ts + interval,
                                            "interval": interval,
                                        }
                                        self.subscribed_mints.add(mint)

                                self.status["db_connected"] = True
                                find_db_connected.set(1)
                                find_active_streams.set(len(self.watchlist))
                                last_refresh = now_ts

                            except Exception as e:
                                logger.warning("DB sync error: %s", e)
                                self.status["db_connected"] = False
                                find_db_connected.set(0)

                        # Receive WebSocket message
                        try:
                            msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                            last_message_time = time.time()
                            self.status["last_message_time"] = last_message_time

                            data = json.loads(msg)

                            if data.get("txType") == "create" and "mint" in data:
                                await self._process_new_coin(data)
                            elif "txType" in data and data["txType"] in ["buy", "sell"]:
                                mint = data.get("mint")
                                if mint:
                                    if mint in self.watchlist:
                                        process_trade(
                                            self.watchlist, data, self.ath_cache, self.dirty_aths,
                                            self.last_trade_timestamps, self.subscription_watchdog,
                                        )
                                        self.status["total_trades"] += 1
                                    elif mint in self.coin_cache.cache:
                                        self.coin_cache.add_trade(mint, data)

                        except asyncio.TimeoutError:
                            if now_ts - last_message_time > settings.WS_CONNECTION_TIMEOUT and now_ts % 30 < 1:
                                logger.warning("No messages for %ds - reconnecting", settings.WS_CONNECTION_TIMEOUT)
                                self.status["ws_connected"] = False
                                self.status["last_error"] = "timeout: no messages"
                                find_ws_connected.set(0)
                                if self.batching_task and not self.batching_task.done():
                                    self.batching_task.cancel()
                                    try:
                                        await self.batching_task
                                    except asyncio.CancelledError:
                                        pass
                                await self._emergency_flush()
                                break

                        except websockets.exceptions.ConnectionClosed as e:
                            logger.warning("WebSocket connection closed: %s", e)
                            self.status["ws_connected"] = False
                            self.status["last_error"] = f"ws_closed: {str(e)[:100]}"
                            find_ws_connected.set(0)
                            if self.batching_task and not self.batching_task.done():
                                self.batching_task.cancel()
                                try:
                                    await self.batching_task
                                except asyncio.CancelledError:
                                    pass
                            await self._emergency_flush()
                            break

                        except json.JSONDecodeError as e:
                            logger.warning("JSON decode error: %s", e)
                            continue

                        except Exception as e:
                            logger.warning("WS receive error: %s", e)
                            self.status["last_error"] = f"ws_error: {str(e)[:100]}"
                            await self._emergency_flush()
                            break

                        # Buffer cleanup
                        if now_ts - self.last_buffer_cleanup > 10:
                            removed = self._cleanup_old_trades_from_buffer(now_ts)
                            if removed > 0:
                                logger.debug("Buffer cleanup: %d old trades removed", removed)
                            self.last_buffer_cleanup = now_ts

                        # Discovery buffer flush
                        await self._flush_discovery_buffer()

                        # Lifecycle checks and metric flush
                        results, trades_for_flush = await check_lifecycle_and_advance(
                            watchlist=self.watchlist,
                            phases_config=self.phases_config,
                            sorted_phase_ids=self.sorted_phase_ids,
                            subscribed_mints=self.subscribed_mints,
                            dirty_aths=self.dirty_aths,
                            status=self.status,
                            now_ts=now_ts,
                            last_trade_timestamps=self.last_trade_timestamps,
                            last_saved_signatures=self.last_saved_signatures,
                            stale_data_warnings=self.stale_data_warnings,
                            force_resubscribe_fn=self._force_resubscribe,
                        )
                        if results:
                            batch_data = [r[0] for r in results]
                            phases_in_batch = [r[1] for r in results]
                            await flush_metrics_batch(batch_data, phases_in_batch, self.status)

                        if trades_for_flush:
                            await flush_transactions_batch(trades_for_flush, self.status)

                        # Zombie watchdog (every 60s)
                        if now_ts - self.last_watchdog_check >= 60:
                            await self._check_subscription_watchdog(now_ts)
                            self.last_watchdog_check = now_ts

                        # ATH updates
                        if now_ts - self.last_ath_flush > 5:
                            await flush_ath_updates(self.ath_cache, self.dirty_aths, self.status)
                            self.last_ath_flush = now_ts

            except websockets.exceptions.WebSocketException as e:
                self.status["ws_connected"] = False
                self.status["last_error"] = f"ws_exception: {str(e)[:100]}"
                find_ws_connected.set(0)
                find_ws_reconnects.inc()
                self.websocket = None
                logger.error("WebSocket exception: %s", e)
                reconnect_count += 1
                self.status["reconnect_count"] = reconnect_count

            except asyncio.CancelledError:
                logger.info("WebSocket loop cancelled")
                return

            except Exception as e:
                self.status["ws_connected"] = False
                self.status["last_error"] = f"unexpected: {str(e)[:100]}"
                find_ws_connected.set(0)
                find_ws_reconnects.inc()
                self.websocket = None
                logger.error("Unexpected error: %s", e)
                reconnect_count += 1
                self.status["reconnect_count"] = reconnect_count

            # Reconnect delay with exponential backoff + jitter
            base_delay = min(
                settings.WS_RETRY_DELAY * (1 + reconnect_count * 0.5),
                settings.WS_MAX_RETRY_DELAY,
            )
            jitter = random.uniform(0, base_delay * 0.3)
            delay = base_delay + jitter
            logger.info("Reconnect in %.1fs (base=%.1f, jitter=%.1f)...", delay, base_delay, jitter)
            await asyncio.sleep(delay)
