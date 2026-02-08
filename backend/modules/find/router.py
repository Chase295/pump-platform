"""
FastAPI APIRouter for the Find module.

Contains all HTTP endpoints for configuration, phase management,
stream monitoring, metrics retrieval, and coin analytics.

Mounted at ``/api/find`` by the main application.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import settings
from backend.database import get_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/find", tags=["find"])

# ---------------------------------------------------------------------------
# Module-level reference to the CoinStreamer instance.
# Set by the application lifespan handler after creating the streamer.
# ---------------------------------------------------------------------------

_streamer = None


def set_streamer(streamer) -> None:
    """Register the CoinStreamer instance so route handlers can access it.

    Called during application startup.
    """
    global _streamer
    _streamer = streamer


def _get_streamer():
    """Return the CoinStreamer or raise 503 if not initialised."""
    if _streamer is None:
        raise HTTPException(status_code=503, detail="Find streamer not initialised")
    return _streamer


def _get_pool():
    """Return the database pool or raise 503."""
    try:
        return get_pool()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Database not connected")


# =====================================================================
# Pydantic Models
# =====================================================================

class ConfigUpdateRequest(BaseModel):
    n8n_webhook_url: Optional[str] = None
    n8n_webhook_method: Optional[str] = None
    coin_cache_seconds: Optional[int] = None
    db_refresh_interval: Optional[int] = None
    batch_size: Optional[int] = None
    batch_timeout: Optional[int] = None
    bad_names_pattern: Optional[str] = None
    spam_burst_window: Optional[int] = None


class ConfigUpdateResponse(BaseModel):
    status: str
    message: str
    updated_fields: List[str]
    new_config: Dict[str, Any]


class ConfigReloadResponse(BaseModel):
    status: str
    message: str
    config: Dict[str, Any]


class PhaseUpdateRequest(BaseModel):
    name: Optional[str] = None
    interval_seconds: Optional[int] = None
    min_age_minutes: Optional[int] = None
    max_age_minutes: Optional[int] = None


class PhaseCreateRequest(BaseModel):
    name: str
    interval_seconds: int
    min_age_minutes: int
    max_age_minutes: int


class PhaseUpdateResponse(BaseModel):
    status: str
    message: str
    phase: Dict[str, Any]
    updated_streams: int


class PhaseCreateResponse(BaseModel):
    status: str
    message: str
    phase: Dict[str, Any]


class PhaseDeleteResponse(BaseModel):
    status: str
    message: str
    deleted_phase_id: int
    affected_streams: int


class WindowAnalytics(BaseModel):
    price_change_pct: Optional[float] = None
    old_price: Optional[float] = None
    trend: str
    data_found: bool
    data_age_seconds: Optional[int] = None


class AnalyticsResponse(BaseModel):
    mint: str
    current_price: float
    last_updated: str
    is_active: bool
    performance: Dict[str, WindowAnalytics]


# =====================================================================
# Health Endpoint
# =====================================================================

@router.get("/health", operation_id="find_health")
async def health_check():
    """Health check for the find module."""
    import time as _time

    try:
        pool = _get_pool()
        row = await pool.fetchrow("SELECT 1 AS ok")
        db_ok = row is not None
    except Exception:
        db_ok = False

    streamer = _streamer
    ws_connected = False
    uptime_seconds = 0.0
    last_message_ago = None
    reconnect_count = 0
    last_error = None
    cache_stats = {"total_coins": 0, "activated_coins": 0, "expired_coins": 0, "oldest_age_seconds": 0, "newest_age_seconds": 0}
    tracking_stats = {"active_coins": 0, "total_trades": 0, "total_metrics_saved": 0}
    discovery_stats = {"total_coins_discovered": 0, "n8n_available": False, "n8n_buffer_size": 0}

    if streamer:
        status_info = streamer.get_status()
        ws_connected = status_info.get("ws_connected", False)
        reconnect_count = status_info.get("reconnect_count", 0)
        last_error = status_info.get("last_error")

        start = status_info.get("start_time")
        if start:
            uptime_seconds = round(_time.time() - start, 1)

        last_msg = status_info.get("last_message_time")
        if last_msg:
            last_message_ago = round(_time.time() - last_msg, 1)

        cache_stats = streamer.get_cache_stats()

        tracking_stats = {
            "active_coins": len(streamer.watchlist),
            "total_trades": status_info.get("total_trades", 0),
            "total_metrics_saved": status_info.get("total_metrics_saved", 0),
        }

        discovery_stats = {
            "total_coins_discovered": status_info.get("total_coins_discovered", 0),
            "n8n_available": status_info.get("n8n_available", False),
            "n8n_buffer_size": len(streamer.discovery_buffer),
        }

    return {
        "status": "healthy" if db_ok else "degraded",
        "db_connected": db_ok,
        "ws_connected": ws_connected,
        "uptime_seconds": uptime_seconds,
        "last_message_ago": last_message_ago,
        "reconnect_count": reconnect_count,
        "last_error": last_error,
        "cache_stats": cache_stats,
        "tracking_stats": tracking_stats,
        "discovery_stats": discovery_stats,
        "module": "find",
    }


# =====================================================================
# Configuration Endpoints
# =====================================================================

@router.get("/config", operation_id="find_get_config")
async def get_current_config():
    """Zeigt die aktuelle Konfiguration an"""
    try:
        config = {
            "n8n_webhook_url": settings.N8N_FIND_WEBHOOK_URL,
            "n8n_webhook_method": settings.N8N_FIND_WEBHOOK_METHOD,
            "coin_cache_seconds": settings.COIN_CACHE_SECONDS,
            "db_refresh_interval": settings.DB_REFRESH_INTERVAL,
            "batch_size": settings.BATCH_SIZE,
            "batch_timeout": settings.BATCH_TIMEOUT,
            "bad_names_pattern": settings.BAD_NAMES_PATTERN,
            "spam_burst_window": settings.SPAM_BURST_WINDOW,
            "sol_reserves_full": settings.SOL_RESERVES_FULL,
            "whale_threshold_sol": settings.WHALE_THRESHOLD_SOL,
            "trade_buffer_seconds": settings.TRADE_BUFFER_SECONDS,
        }
        return config

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get config: {str(e)}")


@router.put("/config", response_model=ConfigUpdateResponse, operation_id="find_update_config")
async def update_config(config_update: ConfigUpdateRequest):
    """Aktualisiert die Konfiguration zur Laufzeit und speichert sie persistent"""
    try:
        updated_fields: list[str] = []

        if config_update.n8n_webhook_url is not None:
            settings.N8N_FIND_WEBHOOK_URL = config_update.n8n_webhook_url
            updated_fields.append("n8n_webhook_url")

        if config_update.n8n_webhook_method is not None:
            method = config_update.n8n_webhook_method.upper()
            if method not in ["GET", "POST"]:
                raise HTTPException(status_code=400, detail="n8n_webhook_method must be 'GET' or 'POST'")
            settings.N8N_FIND_WEBHOOK_METHOD = method
            updated_fields.append("n8n_webhook_method")

        if config_update.coin_cache_seconds is not None:
            if config_update.coin_cache_seconds < 10 or config_update.coin_cache_seconds > 3600:
                raise HTTPException(status_code=400, detail="coin_cache_seconds must be between 10 and 3600")
            settings.COIN_CACHE_SECONDS = config_update.coin_cache_seconds
            updated_fields.append("coin_cache_seconds")

        if config_update.db_refresh_interval is not None:
            if config_update.db_refresh_interval < 5 or config_update.db_refresh_interval > 300:
                raise HTTPException(status_code=400, detail="db_refresh_interval must be between 5 and 300")
            settings.DB_REFRESH_INTERVAL = config_update.db_refresh_interval
            updated_fields.append("db_refresh_interval")

        if config_update.batch_size is not None:
            if config_update.batch_size < 1 or config_update.batch_size > 100:
                raise HTTPException(status_code=400, detail="batch_size must be between 1 and 100")
            settings.BATCH_SIZE = config_update.batch_size
            updated_fields.append("batch_size")

        if config_update.batch_timeout is not None:
            if config_update.batch_timeout < 10 or config_update.batch_timeout > 300:
                raise HTTPException(status_code=400, detail="batch_timeout must be between 10 and 300 seconds")
            settings.BATCH_TIMEOUT = config_update.batch_timeout
            updated_fields.append("batch_timeout")

        if config_update.bad_names_pattern is not None:
            if not config_update.bad_names_pattern.strip():
                raise HTTPException(status_code=400, detail="bad_names_pattern cannot be empty")
            settings.BAD_NAMES_PATTERN = config_update.bad_names_pattern
            updated_fields.append("bad_names_pattern")

        if config_update.spam_burst_window is not None:
            if config_update.spam_burst_window < 5 or config_update.spam_burst_window > 300:
                raise HTTPException(status_code=400, detail="spam_burst_window must be between 5 and 300 seconds")
            settings.SPAM_BURST_WINDOW = config_update.spam_burst_window
            updated_fields.append("spam_burst_window")

        if not updated_fields:
            raise HTTPException(status_code=400, detail="No valid configuration fields provided")

        return ConfigUpdateResponse(
            status="success",
            message=f"Konfiguration aktualisiert: {', '.join(updated_fields)}",
            updated_fields=updated_fields,
            new_config={
                "n8n_webhook_url": settings.N8N_FIND_WEBHOOK_URL,
                "n8n_webhook_method": settings.N8N_FIND_WEBHOOK_METHOD,
                "coin_cache_seconds": settings.COIN_CACHE_SECONDS,
                "db_refresh_interval": settings.DB_REFRESH_INTERVAL,
                "batch_size": settings.BATCH_SIZE,
                "batch_timeout": settings.BATCH_TIMEOUT,
                "bad_names_pattern": settings.BAD_NAMES_PATTERN,
                "spam_burst_window": settings.SPAM_BURST_WINDOW,
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Config update failed: {str(e)}")


@router.post("/reload-config", response_model=ConfigReloadResponse, operation_id="find_reload_config")
async def reload_config():
    """Laedt die Konfiguration und Phasen neu"""
    try:
        streamer = _get_streamer()
        await streamer.reload_phases_config()
        logger.info("Configuration and phases reloaded")

        return ConfigReloadResponse(
            status="success",
            message="Konfiguration wurde neu geladen",
            config={
                "COIN_CACHE_SECONDS": settings.COIN_CACHE_SECONDS,
                "DB_REFRESH_INTERVAL": settings.DB_REFRESH_INTERVAL,
                "BATCH_SIZE": settings.BATCH_SIZE,
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Config reload failed: {str(e)}")


# =====================================================================
# Phase Management Endpoints
# =====================================================================

@router.get("/phases", operation_id="find_list_phases")
async def get_phases():
    """Gibt alle Phasen aus der ref_coin_phases Tabelle zurueck"""
    try:
        pool = _get_pool()
        rows = await pool.fetch("SELECT * FROM ref_coin_phases ORDER BY id ASC")
        phases = [dict(row) for row in rows]
        return {"phases": phases, "count": len(phases)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get phases: {str(e)}")


@router.put("/phases/{phase_id}", response_model=PhaseUpdateResponse, operation_id="find_update_phase")
async def update_phase(phase_id: int, phase_data: PhaseUpdateRequest):
    """Aktualisiert eine Phase und laedt Konfiguration fuer aktive Streams neu"""
    try:
        pool = _get_pool()
        streamer = _get_streamer()

        if phase_id >= 99:
            raise HTTPException(status_code=400, detail="System-Phasen (99, 100) koennen nicht bearbeitet werden")

        if phase_data.interval_seconds is not None and phase_data.interval_seconds < 1:
            raise HTTPException(status_code=400, detail="interval_seconds muss mindestens 1 sein")

        current = await pool.fetchrow("SELECT * FROM ref_coin_phases WHERE id = $1", phase_id)
        if not current:
            raise HTTPException(status_code=404, detail=f"Phase {phase_id} nicht gefunden")

        new_name = phase_data.name if phase_data.name is not None else current["name"]
        new_interval = phase_data.interval_seconds if phase_data.interval_seconds is not None else current["interval_seconds"]
        new_min_age = phase_data.min_age_minutes if phase_data.min_age_minutes is not None else current["min_age_minutes"]
        new_max_age = phase_data.max_age_minutes if phase_data.max_age_minutes is not None else current["max_age_minutes"]

        if new_max_age <= new_min_age:
            raise HTTPException(status_code=400, detail="max_age_minutes muss groesser als min_age_minutes sein")

        await pool.execute("""
            UPDATE ref_coin_phases
            SET name = $1, interval_seconds = $2, min_age_minutes = $3, max_age_minutes = $4
            WHERE id = $5
        """, new_name, new_interval, new_min_age, new_max_age, phase_id)

        updated_streams = await streamer.reload_phases_config()

        updated = await pool.fetchrow("SELECT * FROM ref_coin_phases WHERE id = $1", phase_id)

        logger.info("Phase %d updated: %s, interval=%ds, %d streams updated",
                     phase_id, new_name, new_interval, updated_streams)

        return PhaseUpdateResponse(
            status="success",
            message=f"Phase {phase_id} erfolgreich aktualisiert",
            phase=dict(updated),
            updated_streams=updated_streams,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Phase update error: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to update phase: {str(e)}")


@router.post("/phases", response_model=PhaseCreateResponse, operation_id="find_create_phase")
async def create_phase(phase_data: PhaseCreateRequest):
    """Erstellt eine neue Phase zwischen den bestehenden Phasen"""
    try:
        pool = _get_pool()
        streamer = _get_streamer()

        if phase_data.interval_seconds < 1:
            raise HTTPException(status_code=400, detail="interval_seconds muss mindestens 1 sein")
        if phase_data.max_age_minutes <= phase_data.min_age_minutes:
            raise HTTPException(status_code=400, detail="max_age_minutes muss groesser als min_age_minutes sein")
        if phase_data.min_age_minutes < 0:
            raise HTTPException(status_code=400, detail="min_age_minutes darf nicht negativ sein")

        existing_ids = await pool.fetch("SELECT id FROM ref_coin_phases WHERE id < 99 ORDER BY id")
        used_ids = {row['id'] for row in existing_ids}

        new_id = None
        for i in range(1, 99):
            if i not in used_ids:
                new_id = i
                break

        if new_id is None:
            raise HTTPException(status_code=400, detail="Maximale Anzahl an Phasen erreicht (98)")

        await pool.execute("""
            INSERT INTO ref_coin_phases (id, name, interval_seconds, min_age_minutes, max_age_minutes)
            VALUES ($1, $2, $3, $4, $5)
        """, new_id, phase_data.name, phase_data.interval_seconds, phase_data.min_age_minutes, phase_data.max_age_minutes)

        await streamer.reload_phases_config()

        new_phase = await pool.fetchrow("SELECT * FROM ref_coin_phases WHERE id = $1", new_id)

        logger.info("New phase %d created: %s", new_id, phase_data.name)

        return PhaseCreateResponse(
            status="success",
            message=f"Phase {new_id} '{phase_data.name}' erfolgreich erstellt",
            phase=dict(new_phase),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Phase create error: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to create phase: {str(e)}")


@router.delete("/phases/{phase_id}", response_model=PhaseDeleteResponse, operation_id="find_delete_phase")
async def delete_phase(phase_id: int):
    """Loescht eine Phase und verschiebt betroffene Streams zur naechsten Phase"""
    try:
        pool = _get_pool()
        streamer = _get_streamer()

        if phase_id >= 99:
            raise HTTPException(status_code=400, detail="System-Phasen (99, 100) koennen nicht geloescht werden")

        phase = await pool.fetchrow("SELECT * FROM ref_coin_phases WHERE id = $1", phase_id)
        if not phase:
            raise HTTPException(status_code=404, detail=f"Phase {phase_id} nicht gefunden")

        remaining_count = await pool.fetchval(
            "SELECT COUNT(*) FROM ref_coin_phases WHERE id < 99 AND id != $1", phase_id
        )
        if remaining_count < 1:
            raise HTTPException(status_code=400, detail="Mindestens eine regulaere Phase muss erhalten bleiben")

        next_phase = await pool.fetchrow("""
            SELECT id FROM ref_coin_phases
            WHERE id > $1 AND id < 99
            ORDER BY id ASC
            LIMIT 1
        """, phase_id)

        target_phase_id = next_phase['id'] if next_phase else 99

        affected_count = await pool.fetchval(
            "SELECT COUNT(*) FROM coin_streams WHERE current_phase_id = $1 AND is_active = true",
            phase_id,
        )

        if affected_count > 0:
            await pool.execute("""
                UPDATE coin_streams
                SET current_phase_id = $1
                WHERE current_phase_id = $2 AND is_active = true
            """, target_phase_id, phase_id)

        await pool.execute("DELETE FROM ref_coin_phases WHERE id = $1", phase_id)

        await streamer.reload_phases_config()

        logger.info("Phase %d '%s' deleted, %d streams moved to phase %d",
                     phase_id, phase['name'], affected_count, target_phase_id)

        return PhaseDeleteResponse(
            status="success",
            message=f"Phase {phase_id} '{phase['name']}' geloescht. {affected_count} Streams zu Phase {target_phase_id} verschoben.",
            deleted_phase_id=phase_id,
            affected_streams=affected_count,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Phase delete error: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to delete phase: {str(e)}")


# =====================================================================
# Stream Endpoints
# =====================================================================

@router.get("/streams", operation_id="find_get_streams")
async def get_streams(limit: int = 50):
    """Gibt Streams aus der coin_streams Tabelle zurueck"""
    try:
        pool = _get_pool()
        rows = await pool.fetch("""
            SELECT * FROM coin_streams
            ORDER BY id DESC
            LIMIT $1
        """, limit)

        streams = [dict(row) for row in rows]
        return {"streams": streams, "count": len(streams), "limit": limit}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get streams: {str(e)}")


@router.get("/streams/stats", operation_id="find_get_stream_stats")
async def get_streams_stats():
    """Gibt Statistiken ueber Streams und Phasen zurueck"""
    try:
        pool = _get_pool()

        phase_counts = await pool.fetch("""
            SELECT current_phase_id, COUNT(*) as count
            FROM coin_streams
            GROUP BY current_phase_id
            ORDER BY current_phase_id ASC
        """)

        total_count = await pool.fetchval("SELECT COUNT(*) FROM coin_streams")

        active_count = await pool.fetchval("""
            SELECT COUNT(*) FROM coin_streams
            WHERE is_active = TRUE
        """)

        return {
            "total_streams": total_count,
            "active_streams": active_count,
            "ended_streams": total_count - active_count,
            "streams_by_phase": {row["current_phase_id"]: row["count"] for row in phase_counts},
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stream stats: {str(e)}")


# =====================================================================
# Metrics Endpoint
# =====================================================================

@router.get("/metrics", operation_id="find_get_recent_metrics")
async def get_recent_metrics(limit: int = 100, mint: Optional[str] = None):
    """Gibt die letzten Metriken aus der coin_metrics Tabelle zurueck

    Query-Parameter:
    - limit: Anzahl der zurueckzugebenden Eintraege (Standard: 100)
    - mint: Optional - Filter nach spezifischem Token-Mint
    """
    try:
        pool = _get_pool()

        query = "SELECT * FROM coin_metrics"
        params: list = []

        if mint and mint.strip():
            query += " WHERE mint = $1"
            params.append(mint.strip())

        if params:
            query += " ORDER BY timestamp DESC LIMIT $2"
            params.append(limit)
        else:
            query += " ORDER BY timestamp DESC LIMIT $1"
            params.append(limit)

        rows = await pool.fetch(query, *params)
        metrics = [dict(row) for row in rows]

        return {
            "metrics": metrics,
            "count": len(metrics),
            "limit": limit,
            "mint_filter": mint,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get metrics: {str(e)}")


# =====================================================================
# Coin Detail Endpoint
# =====================================================================

@router.get("/coins/{mint}", operation_id="find_get_coin_detail")
async def get_coin_detail(mint: str):
    """Gibt vollstaendige Coin-Daten zurueck: Stammdaten, Stream, letzte Metriken und Live-Tracking"""
    try:
        pool = _get_pool()
        streamer = _get_streamer()

        # 1. Base data from discovered_coins
        coin_row = await pool.fetchrow(
            "SELECT * FROM discovered_coins WHERE token_address = $1", mint
        )
        if not coin_row:
            raise HTTPException(status_code=404, detail=f"Coin {mint} nicht gefunden")

        # 2. Stream data with phase name
        stream_row = await pool.fetchrow("""
            SELECT cs.*, rcp.name as phase_name
            FROM coin_streams cs
            LEFT JOIN ref_coin_phases rcp ON cs.current_phase_id = rcp.id
            WHERE cs.token_address = $1
        """, mint)

        # 3. Latest metrics
        metrics_row = await pool.fetchrow(
            "SELECT * FROM coin_metrics WHERE mint = $1 ORDER BY timestamp DESC LIMIT 1", mint
        )

        # 4. Live tracking from in-memory data
        import time as _time
        live_tracking = None
        if mint in streamer.watchlist:
            entry = streamer.watchlist[mint]
            buf = entry["buffer"]
            now_ts = _time.time()
            live_tracking = {
                "price_open": buf["open"],
                "price_high": buf["high"] if buf["high"] != -1 else None,
                "price_low": buf["low"] if buf["low"] != float("inf") else None,
                "price_close": buf["close"],
                "volume_sol": buf["vol"],
                "buy_volume_sol": buf["vol_buy"],
                "sell_volume_sol": buf["vol_sell"],
                "num_buys": buf["buys"],
                "num_sells": buf["sells"],
                "unique_wallets": len(buf["wallets"]),
                "market_cap_sol": buf["mcap"],
                "interval_seconds": entry["interval"],
                "next_flush_seconds": round(entry["next_flush"] - now_ts, 1),
            }
        elif mint in streamer.coin_cache.cache:
            cache_entry = streamer.coin_cache.cache[mint]
            live_tracking = {
                "status": "in_cache",
                "discovered_at": cache_entry["discovered_at"],
                "n8n_sent": cache_entry["n8n_sent"],
                "activated": cache_entry["activated"],
                "cached_trades": len(cache_entry["trades"]),
            }

        return {
            "coin": dict(coin_row),
            "stream": dict(stream_row) if stream_row else None,
            "latest_metrics": dict(metrics_row) if metrics_row else None,
            "live_tracking": live_tracking,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get coin detail: {str(e)}")


# =====================================================================
# Analytics Endpoint
# =====================================================================

def _parse_time_windows(windows_str: str) -> dict:
    """Parse time window string into dict with seconds values."""
    windows = {}
    for window in windows_str.split(','):
        window = window.strip()
        if not window:
            continue
        if window.endswith('s'):
            seconds = int(window[:-1])
        elif window.endswith('m'):
            seconds = int(window[:-1]) * 60
        elif window.endswith('h'):
            seconds = int(window[:-1]) * 3600
        else:
            seconds = int(window) * 60
        windows[window] = {'seconds': seconds}
    return windows


def _calculate_window_analytics(current_data: dict, historical_data: list, target_time: datetime) -> dict:
    """Calculate analytics for a specific time window."""
    if not historical_data:
        return {
            "price_change_pct": None,
            "old_price": None,
            "trend": "NO_DATA",
            "data_found": False,
            "data_age_seconds": None,
        }

    best_match = None
    best_diff = float('inf')

    for data_point in historical_data:
        diff = abs((data_point['timestamp'] - target_time).total_seconds())
        if diff < best_diff:
            best_diff = diff
            best_match = data_point

    if not best_match:
        return {
            "price_change_pct": None,
            "old_price": None,
            "trend": "NO_DATA",
            "data_found": False,
            "data_age_seconds": None,
        }

    current_price = current_data['price_close']
    old_price = best_match['price_close']

    if old_price and old_price > 0:
        price_change_pct = ((current_price - old_price) / old_price) * 100
    else:
        price_change_pct = None

    if price_change_pct is None:
        trend = "NO_DATA"
    elif price_change_pct > 5:
        trend = "PUMP"
    elif price_change_pct < -5:
        trend = "DUMP"
    else:
        trend = "FLAT"

    return {
        "price_change_pct": round(price_change_pct, 2) if price_change_pct is not None else None,
        "old_price": old_price,
        "trend": trend,
        "data_found": True,
        "data_age_seconds": int(best_diff),
    }


@router.get("/analytics/{mint}", operation_id="find_get_coin_analytics")
async def get_coin_analytics(mint: str, windows: str = "30s,1m,3m,5m,15m,30m,1h"):
    """Coin-Performance-Analyse ueber verschiedene Zeitfenster"""
    try:
        pool = _get_pool()

        # Check if coin is active
        active_row = await pool.fetchrow(
            "SELECT is_active FROM coin_streams WHERE token_address = $1", mint
        )
        is_active = active_row['is_active'] if active_row else False

        # Get current data
        current_row = await pool.fetchrow(
            "SELECT * FROM coin_metrics WHERE mint = $1 ORDER BY timestamp DESC LIMIT 1", mint
        )
        if not current_row:
            raise HTTPException(status_code=404, detail=f"No metrics found for {mint}")

        current_data = dict(current_row)

        # Parse windows
        time_windows = _parse_time_windows(windows)
        max_seconds = max(w['seconds'] for w in time_windows.values()) if time_windows else 3600

        # Get historical data
        historical_rows = await pool.fetch(
            "SELECT * FROM coin_metrics WHERE mint = $1 ORDER BY timestamp ASC", mint
        )
        historical_data = [dict(row) for row in historical_rows]

        # Calculate analytics for each window
        now = datetime.now(timezone.utc)
        performance = {}
        for window_name, window_info in time_windows.items():
            from datetime import timedelta
            target_time = now - timedelta(seconds=window_info['seconds'])
            performance[window_name] = _calculate_window_analytics(current_data, historical_data, target_time)

        return {
            "mint": mint,
            "current_price": current_data.get("price_close", 0),
            "last_updated": current_data.get("timestamp", now).isoformat() if current_data.get("timestamp") else now.isoformat(),
            "is_active": is_active,
            "performance": performance,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get analytics: {str(e)}")
