"""
Prediction Scanner for Server module.

Polls coin_metrics for new entries and automatically runs predictions
with all active models. Saves results to model_predictions and sends
n8n webhooks.

Migrated from pump-server/backend/app/prediction/event_handler.py.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional

from backend.config import settings
from backend.database import get_pool
from backend.modules.server.predictor import predict_coin_all_models
from backend.modules.server.alerts import send_n8n_webhook
from backend.modules.buy.workflow_engine import get_buy_workflow_engine

logger = logging.getLogger(__name__)


class PredictionScanner:
    """Polls coin_metrics and runs predictions automatically."""

    def __init__(
        self,
        polling_interval: int = 30,
        batch_size: int = 50,
    ):
        self.polling_interval = polling_interval
        self.batch_size = batch_size
        self.running = False
        self.active_models: List[Dict[str, Any]] = []
        self.last_models_update = datetime.min.replace(tzinfo=timezone.utc)
        self.last_processed_timestamp = datetime.now(timezone.utc) - timedelta(minutes=5)
        self.last_heartbeat = datetime.now(timezone.utc)
        self.stats = {
            'total_processed': 0,
            'total_ignored': 0,
            'total_errors': 0,
            'polls': 0,
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def start(self):
        """Start the scanner background loop."""
        self.running = True
        logger.info("Prediction scanner starting...")

        # Reload active models
        await self._refresh_models()

        # Determine start timestamp
        await self._init_start_timestamp()

        logger.info(
            f"Prediction scanner started (interval: {self.polling_interval}s, "
            f"start: {self.last_processed_timestamp}, "
            f"models: {len(self.active_models)})"
        )

        while self.running:
            try:
                self.last_heartbeat = datetime.now(timezone.utc)
                await self._poll_once()
                self.stats['polls'] += 1
            except Exception as e:
                logger.error(f"Error in scanner poll loop: {e}", exc_info=True)
                self.stats['total_errors'] += 1

            await asyncio.sleep(self.polling_interval)

    async def stop(self):
        """Stop the scanner."""
        self.running = False
        logger.info("Prediction scanner stopped")

    def get_stats(self) -> Dict[str, Any]:
        return {
            **self.stats,
            'running': self.running,
            'active_models': len(self.active_models),
            'last_heartbeat': self.last_heartbeat.isoformat() if self.last_heartbeat else None,
            'last_processed_timestamp': self.last_processed_timestamp.isoformat(),
        }

    # ------------------------------------------------------------------
    # Internal: initialisation
    # ------------------------------------------------------------------

    async def _init_start_timestamp(self):
        """Find a sensible start timestamp so we don't replay history."""
        pool = get_pool()

        # Check last prediction timestamp
        row = await pool.fetchrow("""
            SELECT MAX(prediction_timestamp) as max_ts
            FROM model_predictions
            WHERE active_model_id IN (
                SELECT id FROM prediction_active_models WHERE is_active = true
            )
        """)

        if row and row['max_ts']:
            self.last_processed_timestamp = row['max_ts']
            logger.info(f"Scanner resuming from last prediction: {self.last_processed_timestamp}")
            return

        # No predictions yet – start from recent coin_metrics
        row = await pool.fetchrow("SELECT MAX(timestamp) as max_ts FROM coin_metrics")
        if row and row['max_ts']:
            # Don't go further back than 5 minutes
            five_min_ago = datetime.now(timezone.utc) - timedelta(minutes=5)
            self.last_processed_timestamp = max(row['max_ts'] - timedelta(minutes=1), five_min_ago)
            logger.info(f"Scanner starting near latest coin_metrics: {self.last_processed_timestamp}")
        else:
            self.last_processed_timestamp = datetime.now(timezone.utc) - timedelta(minutes=5)
            logger.info(f"Scanner starting from 5 minutes ago (no data yet)")

    async def _refresh_models(self):
        """Reload active models from DB (every 10s)."""
        from backend.modules.server.db_queries import get_active_models

        now = datetime.now(timezone.utc)
        if (now - self.last_models_update).total_seconds() < 10:
            return

        try:
            self.active_models = await get_active_models(include_inactive=False)
            self.last_models_update = now
        except Exception as e:
            logger.error(f"Error refreshing active models: {e}")

    # ------------------------------------------------------------------
    # Internal: polling loop
    # ------------------------------------------------------------------

    async def _poll_once(self):
        """One polling cycle: fetch new entries, run predictions."""
        pool = get_pool()

        await self._refresh_models()

        if not self.active_models:
            logger.debug("No active models – skipping scan")
            return

        # Get new coin_metrics entries since last processed
        rows = await pool.fetch("""
            WITH latest_entries AS (
                SELECT DISTINCT
                    mint,
                    MAX(timestamp) as latest_timestamp
                FROM coin_metrics
                WHERE timestamp > $1
                GROUP BY mint
            )
            SELECT
                le.mint,
                le.latest_timestamp,
                cm.phase_id_at_time as phase_id
            FROM latest_entries le
            JOIN coin_metrics cm ON cm.mint = le.mint
                AND cm.timestamp = le.latest_timestamp
            ORDER BY le.latest_timestamp ASC
            LIMIT $2
        """, self.last_processed_timestamp, self.batch_size)

        if not rows:
            logger.debug(f"No new coin_metrics since {self.last_processed_timestamp}")
            return

        logger.info(f"Scanner: {len(rows)} new coin entries since {self.last_processed_timestamp}")

        entries = [
            {
                'mint': row['mint'],
                'timestamp': row['latest_timestamp'],
                'phase_id': row['phase_id'],
            }
            for row in rows
        ]

        await self._process_entries(entries, pool)

        # Advance cursor
        self.last_processed_timestamp = max(e['timestamp'] for e in entries)

    # ------------------------------------------------------------------
    # Internal: process a batch of coin entries
    # ------------------------------------------------------------------

    async def _process_entries(self, entries: List[Dict[str, Any]], pool):
        """Run predictions for each coin entry."""
        for entry in entries:
            coin_id = entry['mint']
            timestamp = entry['timestamp']
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)

            # Determine which models should process this coin
            models_to_run = []
            for model in self.active_models:
                if not self._should_process(coin_id, entry, model):
                    self.stats['total_ignored'] += 1
                    continue

                # Check coin_scan_cache ignore status
                ignored = await self._check_ignore(pool, coin_id, model['id'])
                if ignored:
                    self.stats['total_ignored'] += 1
                    continue

                models_to_run.append(model)

            if not models_to_run:
                continue

            try:
                results = await predict_coin_all_models(
                    coin_id=coin_id,
                    timestamp=timestamp,
                    active_models=models_to_run,
                    pool=pool,
                )

                if not results:
                    continue

                # Get metrics at prediction time for saving
                metrics = await self._get_metrics(pool, coin_id, timestamp)

                for result in results:
                    await self._save_and_notify(
                        pool, coin_id, timestamp, entry, result, models_to_run, metrics,
                    )

                self.stats['total_processed'] += len(results)

            except Exception as e:
                logger.error(f"Error processing coin {coin_id[:8]}...: {e}", exc_info=True)
                self.stats['total_errors'] += 1

    # ------------------------------------------------------------------
    # Filtering helpers
    # ------------------------------------------------------------------

    def _should_process(self, coin_id: str, entry: Dict, model: Dict) -> bool:
        """Check whitelist and phase filters."""
        # Coin whitelist
        filter_mode = model.get('coin_filter_mode') or 'all'
        whitelist = model.get('coin_whitelist') or []
        if filter_mode == 'whitelist' and (not whitelist or coin_id not in whitelist):
            return False

        # Phase filter
        model_phases = model.get('phases')
        coin_phase = entry.get('phase_id')
        if model_phases and len(model_phases) > 0:
            if coin_phase is None or coin_phase not in model_phases:
                return False

        return True

    async def _check_ignore(self, pool, coin_id: str, active_model_id: int) -> bool:
        """Check coin_scan_cache for ignore status."""
        row = await pool.fetchrow("""
            SELECT ignore_until, ignore_reason
            FROM coin_scan_cache
            WHERE coin_id = $1 AND active_model_id = $2
        """, coin_id, active_model_id)

        if row and row['ignore_until']:
            now = datetime.now(timezone.utc)
            if now < row['ignore_until']:
                return True

        return False

    # ------------------------------------------------------------------
    # Save prediction + update cache + send n8n
    # ------------------------------------------------------------------

    async def _save_and_notify(
        self,
        pool,
        coin_id: str,
        timestamp: datetime,
        entry: Dict,
        result: Dict,
        models_to_run: List[Dict],
        metrics: Optional[Dict],
    ):
        """Save a single prediction result to DB, update cache, send n8n."""
        active_model_id = result.get('active_model_id')
        prediction = result['prediction']
        probability = result['probability']

        model_config = next(
            (m for m in models_to_run if m.get('id') == active_model_id), None
        )
        if not model_config:
            return

        alert_threshold = model_config.get('alert_threshold', 0.7)
        future_minutes = model_config.get('future_minutes', 10)

        # Determine tag
        if probability < 0.5:
            tag = 'negativ'
        elif probability < alert_threshold:
            tag = 'positiv'
        else:
            tag = 'alert'

        # Max log entries check
        max_entries = 0
        if tag == 'negativ':
            max_entries = model_config.get('max_log_entries_per_coin_negative', 0)
        elif tag == 'positiv':
            max_entries = model_config.get('max_log_entries_per_coin_positive', 0)
        else:
            max_entries = model_config.get('max_log_entries_per_coin_alert', 0)

        if max_entries > 0:
            current_count = await pool.fetchval("""
                SELECT COUNT(*)
                FROM model_predictions
                WHERE coin_id = $1
                  AND active_model_id = $2
                  AND tag = $3
                  AND status = 'aktiv'
            """, coin_id, active_model_id, tag)

            if current_count >= max_entries:
                logger.debug(
                    f"Max log entries reached for {coin_id[:8]}... "
                    f"model {active_model_id} tag={tag} ({current_count}/{max_entries})"
                )
                return

        # Save to model_predictions
        evaluation_ts = timestamp + timedelta(minutes=future_minutes)

        price_close = None
        price_open = None
        price_high = None
        price_low = None
        market_cap = None
        volume = None
        phase_id = entry.get('phase_id')

        if metrics:
            price_close = metrics.get('price_close')
            price_open = metrics.get('price_open')
            price_high = metrics.get('price_high')
            price_low = metrics.get('price_low')
            market_cap = metrics.get('market_cap_close')
            volume = metrics.get('volume_sol')

        try:
            await pool.execute("""
                INSERT INTO model_predictions (
                    coin_id, model_id, active_model_id,
                    prediction, probability, tag, status,
                    prediction_timestamp, evaluation_timestamp,
                    price_close_at_prediction, price_open_at_prediction,
                    price_high_at_prediction, price_low_at_prediction,
                    market_cap_at_prediction, volume_at_prediction,
                    phase_id_at_prediction,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3,
                    $4, $5, $6, 'aktiv',
                    $7, $8,
                    $9, $10, $11, $12, $13, $14, $15,
                    NOW(), NOW()
                )
            """,
                coin_id, result.get('model_id'), active_model_id,
                prediction, probability, tag,
                timestamp, evaluation_ts,
                price_close, price_open, price_high, price_low,
                market_cap, volume, phase_id,
            )
        except Exception as e:
            logger.error(f"Error saving prediction for {coin_id[:8]}...: {e}")
            return

        # Update coin_scan_cache
        await self._update_scan_cache(
            pool, coin_id, active_model_id, prediction, probability, model_config,
        )

        # Update last_prediction_at on model
        await pool.execute("""
            UPDATE prediction_active_models
            SET last_prediction_at = $1, total_predictions = COALESCE(total_predictions, 0) + 1,
                updated_at = NOW()
            WHERE id = $2
        """, timestamp, active_model_id)

        # Send n8n webhook
        await self._send_n8n(coin_id, timestamp, result, model_config, tag)

        # Trigger BUY workflow engine
        engine = get_buy_workflow_engine()
        if engine:
            logger.info(
                f"Dispatching to BuyWorkflowEngine: {coin_id[:8]}... "
                f"model={active_model_id} tag={tag} prob={probability:.3f}"
            )
            asyncio.create_task(engine.on_prediction(
                coin_id=coin_id,
                model_id=result.get('model_id'),
                active_model_id=active_model_id,
                probability=probability,
                prediction=prediction,
                tag=tag,
                timestamp=timestamp,
            ))
        else:
            logger.warning(
                f"BuyWorkflowEngine not available! Prediction for {coin_id[:8]}... "
                f"model={active_model_id} tag={tag} will NOT trigger any workflow"
            )

    async def _update_scan_cache(
        self, pool, coin_id: str, active_model_id: int,
        prediction: int, probability: float, model_config: Dict,
    ):
        """Update coin_scan_cache with ignore timing."""
        now = datetime.now(timezone.utc)
        alert_threshold = model_config.get('alert_threshold', 0.7)
        was_alert = probability >= alert_threshold

        ignore_seconds = 0
        ignore_reason = None

        if was_alert and model_config.get('ignore_alert_seconds', 0) > 0:
            ignore_seconds = model_config['ignore_alert_seconds']
            ignore_reason = 'alert'
        elif prediction == 1 and model_config.get('ignore_positive_seconds', 0) > 0:
            ignore_seconds = model_config['ignore_positive_seconds']
            ignore_reason = 'positive'
        elif prediction == 0 and model_config.get('ignore_bad_seconds', 0) > 0:
            ignore_seconds = model_config['ignore_bad_seconds']
            ignore_reason = 'bad'

        ignore_until = now + timedelta(seconds=ignore_seconds) if ignore_seconds > 0 else None

        try:
            await pool.execute("""
                INSERT INTO coin_scan_cache (
                    coin_id, active_model_id,
                    last_scan_at, last_prediction, last_probability, was_alert,
                    ignore_until, ignore_reason
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (coin_id, active_model_id)
                DO UPDATE SET
                    last_scan_at = EXCLUDED.last_scan_at,
                    last_prediction = EXCLUDED.last_prediction,
                    last_probability = EXCLUDED.last_probability,
                    was_alert = EXCLUDED.was_alert,
                    ignore_until = EXCLUDED.ignore_until,
                    ignore_reason = EXCLUDED.ignore_reason
            """,
                coin_id, active_model_id,
                now, prediction, probability, was_alert,
                ignore_until, ignore_reason,
            )
        except Exception as e:
            logger.warning(f"Error updating scan cache: {e}")

    async def _send_n8n(
        self, coin_id: str, timestamp: datetime,
        result: Dict, model_config: Dict, tag: str,
    ):
        """Send n8n webhook if enabled for this model/tag."""
        active_model_id = result.get('active_model_id')
        n8n_enabled = model_config.get('n8n_enabled', False)
        if not n8n_enabled:
            logger.info(
                f"n8n webhook skipped for {coin_id[:8]}... model {active_model_id} tag={tag}: "
                f"n8n_enabled=False"
            )
            return

        webhook_url = model_config.get('n8n_webhook_url') or settings.N8N_SERVER_WEBHOOK_URL
        if not webhook_url:
            logger.warning(
                f"n8n webhook skipped for {coin_id[:8]}... model {active_model_id} tag={tag}: "
                f"no webhook URL configured (model URL: {model_config.get('n8n_webhook_url')!r}, "
                f"global URL: {settings.N8N_SERVER_WEBHOOK_URL!r})"
            )
            return

        # Check send mode
        send_modes = model_config.get('n8n_send_mode', ['all'])
        if isinstance(send_modes, str):
            send_modes = [send_modes]

        should_send = False
        if 'all' in send_modes:
            should_send = True
        else:
            if 'alerts_only' in send_modes and tag == 'alert':
                should_send = True
            if 'positive_only' in send_modes and tag == 'positiv':
                should_send = True
            if 'negative_only' in send_modes and tag == 'negativ':
                should_send = True

        if not should_send:
            logger.info(
                f"n8n webhook skipped for {coin_id[:8]}... model {active_model_id} tag={tag}: "
                f"send_mode={send_modes} does not include tag={tag}"
            )
            return

        payload = {
            "coin_id": coin_id,
            "timestamp": timestamp.isoformat(),
            "prediction": result['prediction'],
            "probability": result['probability'],
            "tag": tag,
            "is_alert": tag == 'alert',
            "model": {
                "id": result.get('model_id'),
                "active_model_id": result.get('active_model_id'),
                "name": result.get('model_name', 'Unknown'),
                "model_type": model_config.get('model_type'),
                "alert_threshold": model_config.get('alert_threshold', 0.7),
                "future_minutes": model_config.get('future_minutes'),
                "target_direction": model_config.get('target_direction'),
            },
            "metadata": {
                "service": "pump-platform",
            },
        }

        logger.info(
            f"n8n webhook sending for {coin_id[:8]}... model {active_model_id} tag={tag} "
            f"prob={result['probability']:.3f} → {webhook_url[:50]}..."
        )
        success = await send_n8n_webhook(webhook_url, payload)
        if not success:
            logger.warning(
                f"n8n webhook FAILED for {coin_id[:8]}... model {active_model_id} tag={tag}"
            )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _get_metrics(self, pool, coin_id: str, timestamp: datetime) -> Optional[Dict]:
        """Get coin metrics at prediction time."""
        row = await pool.fetchrow("""
            SELECT price_close, price_open, price_high, price_low,
                   market_cap_close, volume_sol
            FROM coin_metrics
            WHERE mint = $1
              AND timestamp <= $2
            ORDER BY timestamp DESC
            LIMIT 1
        """, coin_id, timestamp)

        if not row:
            return None

        return {
            'price_close': float(row['price_close']) if row['price_close'] else None,
            'price_open': float(row['price_open']) if row['price_open'] else None,
            'price_high': float(row['price_high']) if row['price_high'] else None,
            'price_low': float(row['price_low']) if row['price_low'] else None,
            'market_cap_close': float(row['market_cap_close']) if row['market_cap_close'] else None,
            'volume_sol': float(row['volume_sol']) if row['volume_sol'] else None,
        }


# ============================================================
# Module-level management
# ============================================================

_scanner: Optional[PredictionScanner] = None


async def start_prediction_scanner(
    polling_interval: Optional[int] = None,
    batch_size: Optional[int] = None,
):
    """Start the prediction scanner as a background task."""
    global _scanner

    if _scanner is not None:
        logger.warning("Prediction scanner already running")
        return

    _scanner = PredictionScanner(
        polling_interval=polling_interval or settings.POLLING_INTERVAL_SECONDS,
        batch_size=batch_size or settings.EVENT_BATCH_SIZE,
    )
    asyncio.create_task(_scanner.start())
    logger.info("Prediction scanner background task started")


async def stop_prediction_scanner():
    """Stop the prediction scanner."""
    global _scanner

    if _scanner:
        await _scanner.stop()
        _scanner = None


def get_prediction_scanner() -> Optional[PredictionScanner]:
    """Get the current scanner instance."""
    return _scanner
