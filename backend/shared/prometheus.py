"""
Unified Prometheus Metrics for Pump Platform

Combines metrics from all four service modules (find, training, server, buy)
into a single registry so they can be scraped from one /metrics endpoint.

Usage:
    from backend.shared.prometheus import (
        find_coins_discovered,
        training_jobs_total,
        server_predictions_total,
        buy_trades_total,
        get_metrics,
    )

    find_coins_discovered.inc()
    training_jobs_total.labels(job_type="TRAIN", status="COMPLETED").inc()
    server_predictions_total.labels(model_id="42").inc()
    buy_trades_total.labels(action="BUY", status="success").inc()

    metrics_bytes = get_metrics()
"""

from prometheus_client import Counter, Gauge, Histogram, generate_latest

# =====================================================================
# Find module metrics
# =====================================================================

find_coins_discovered = Counter(
    "find_coins_discovered_total",
    "Total coins discovered via WebSocket",
)

find_coins_filtered = Counter(
    "find_coins_filtered_total",
    "Coins filtered out before tracking",
    ["reason"],
)

find_ws_reconnects = Counter(
    "find_ws_reconnects_total",
    "WebSocket reconnection attempts",
)

find_active_streams = Gauge(
    "find_active_streams",
    "Number of coins currently being streamed / tracked",
)

find_cache_size = Gauge(
    "find_cache_size",
    "Number of coins in the discovery cache",
)

find_metrics_saved = Counter(
    "find_metrics_saved_total",
    "Total metric snapshots flushed to the database",
)

find_phase_switches = Counter(
    "find_phase_switches_total",
    "Number of phase transitions for tracked coins",
)

find_n8n_batches_sent = Counter(
    "find_n8n_batches_sent_total",
    "Number of discovery batches sent to n8n",
)

find_ws_connected = Gauge(
    "find_ws_connected",
    "WebSocket connection status (1=connected, 0=disconnected)",
)

find_db_connected = Gauge(
    "find_db_connected",
    "Database connection status for find module (1=connected, 0=disconnected)",
)

# =====================================================================
# Training module metrics
# =====================================================================

training_jobs_total = Counter(
    "training_jobs_total",
    "Total ML jobs by type and final status",
    ["job_type", "status"],
)

training_jobs_active = Gauge(
    "training_jobs_active",
    "Number of currently running ML jobs",
)

training_job_duration = Histogram(
    "training_job_duration_seconds",
    "Duration of ML jobs in seconds",
    ["job_type"],
    buckets=[1, 5, 10, 30, 60, 120, 300, 600],
)

training_models_total = Gauge(
    "training_models_total",
    "Total number of ML models in the database",
)

# =====================================================================
# Server module metrics
# =====================================================================

server_predictions_total = Counter(
    "server_predictions_total",
    "Total predictions made, labelled by active model",
    ["model_id"],
)

server_prediction_duration = Histogram(
    "server_prediction_duration_seconds",
    "Time taken for a single prediction",
    ["model_id"],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0],
)

server_alerts_total = Counter(
    "server_alerts_total",
    "Total alerts by evaluation status",
    ["status"],
)

server_alerts_evaluated = Counter(
    "server_alerts_evaluated_total",
    "Number of alerts that have been evaluated",
)

server_active_models = Gauge(
    "server_active_models",
    "Number of currently active prediction models",
)

server_coins_tracked = Gauge(
    "server_coins_tracked",
    "Number of coins being tracked by the prediction server",
)

# =====================================================================
# Buy module metrics
# =====================================================================

buy_trades_total = Counter(
    "buy_trades_total",
    "Total trades executed",
    ["action", "status"],
)

buy_active_positions = Gauge(
    "buy_active_positions",
    "Number of currently open positions",
)

buy_trade_volume_sol = Counter(
    "buy_trade_volume_sol_total",
    "Cumulative trade volume in SOL",
)

buy_wallets_active = Gauge(
    "buy_wallets_active",
    "Number of active wallets",
)

# =====================================================================
# Shared / platform-wide metrics
# =====================================================================

platform_db_connected = Gauge(
    "platform_db_connected",
    "Shared database connection status (1=connected, 0=disconnected)",
)

platform_uptime_seconds = Gauge(
    "platform_uptime_seconds",
    "Platform uptime in seconds",
)


# =====================================================================
# Metrics export
# =====================================================================

def get_metrics() -> bytes:
    """Generate the latest Prometheus metrics in the exposition format.

    Returns:
        bytes in the Prometheus text exposition format.
    """
    return generate_latest()
