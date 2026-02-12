"""
Transaction Features for ML Training.

Computes transaction-level features (wallet concentration, trade bursts,
whale activity) from coin_transactions for use in the training pipeline.
"""

import logging
from typing import List, Dict, Optional
from datetime import datetime

import numpy as np

from backend.database import get_pool

logger = logging.getLogger(__name__)

# Feature names exported by this module
TRANSACTION_FEATURE_NAMES = [
    "tx_wallet_concentration",
    "tx_top3_holder_pct",
    "tx_unique_traders",
    "tx_buy_sell_ratio",
    "tx_avg_time_between_trades",
    "tx_burst_count",
    "tx_whale_pct",
    "tx_quick_reversal_count",
]


def _gini_coefficient(values: list) -> float:
    """Compute Gini coefficient of a list of values."""
    if not values or len(values) < 2:
        return 0.0
    arr = np.sort(np.array(values, dtype=float))
    n = len(arr)
    index = np.arange(1, n + 1)
    return float((2 * np.sum(index * arr) - (n + 1) * np.sum(arr)) / (n * np.sum(arr))) if np.sum(arr) > 0 else 0.0


async def compute_transaction_features(
    mints: List[str],
    timestamps: Optional[Dict[str, datetime]] = None,
) -> Dict[str, Dict[str, float]]:
    """Compute transaction-level features for a list of mints.

    Args:
        mints: List of mint addresses.
        timestamps: Optional {mint: cutoff_timestamp} for each mint.
                    If None, uses all available transactions.

    Returns {mint: {feature_name: value}}.
    Falls back to zeros if coin_transactions is empty.
    """
    result: Dict[str, Dict[str, float]] = {}
    default_features = {name: 0.0 for name in TRANSACTION_FEATURE_NAMES}

    try:
        pool = get_pool()

        for mint in mints:
            feats = dict(default_features)
            try:
                cutoff = timestamps.get(mint) if timestamps else None

                if cutoff:
                    rows = await pool.fetch(
                        """
                        SELECT trader_public_key, sol_amount, tx_type, timestamp, is_whale
                        FROM coin_transactions
                        WHERE mint = $1 AND timestamp <= $2
                        ORDER BY timestamp ASC
                        LIMIT 5000
                        """,
                        mint, cutoff,
                    )
                else:
                    rows = await pool.fetch(
                        """
                        SELECT trader_public_key, sol_amount, tx_type, timestamp, is_whale
                        FROM coin_transactions
                        WHERE mint = $1
                        ORDER BY timestamp ASC
                        LIMIT 5000
                        """,
                        mint,
                    )

                if not rows:
                    result[mint] = feats
                    continue

                # Extract data
                traders = {}
                buy_count = 0
                sell_count = 0
                total_volume = 0.0
                whale_volume = 0.0
                trade_times = []
                trader_actions = {}  # {trader: [(timestamp, action)]}

                for row in rows:
                    trader = row["trader_public_key"]
                    amount = float(row["sol_amount"] or 0)
                    tx_type = row["tx_type"]
                    ts = row["timestamp"]
                    is_whale = row.get("is_whale", False)

                    traders[trader] = traders.get(trader, 0) + amount
                    total_volume += amount
                    trade_times.append(ts)

                    if tx_type == "buy":
                        buy_count += 1
                    else:
                        sell_count += 1

                    if is_whale:
                        whale_volume += amount

                    if trader not in trader_actions:
                        trader_actions[trader] = []
                    trader_actions[trader].append((ts, tx_type))

                # Wallet concentration (Gini)
                volumes = list(traders.values())
                feats["tx_wallet_concentration"] = _gini_coefficient(volumes)

                # Top 3 holder %
                sorted_volumes = sorted(volumes, reverse=True)
                top3 = sum(sorted_volumes[:3])
                feats["tx_top3_holder_pct"] = top3 / total_volume if total_volume > 0 else 0.0

                # Unique traders
                feats["tx_unique_traders"] = float(len(traders))

                # Buy/sell ratio
                feats["tx_buy_sell_ratio"] = buy_count / (sell_count + 1)

                # Avg time between trades
                if len(trade_times) > 1:
                    diffs = [(trade_times[i] - trade_times[i - 1]).total_seconds()
                             for i in range(1, len(trade_times))]
                    feats["tx_avg_time_between_trades"] = sum(diffs) / len(diffs)

                # Trade bursts (>10 trades in 60 seconds)
                burst_count = 0
                for i in range(len(trade_times)):
                    window_end = trade_times[i]
                    count_in_window = sum(
                        1 for t in trade_times[i:]
                        if (t - window_end).total_seconds() <= 60
                    )
                    if count_in_window > 10:
                        burst_count += 1
                feats["tx_burst_count"] = float(min(burst_count, 100))

                # Whale %
                feats["tx_whale_pct"] = whale_volume / total_volume if total_volume > 0 else 0.0

                # Quick reversals (buy->sell within 2 minutes by same trader)
                quick_reversals = 0
                for trader, actions in trader_actions.items():
                    for i in range(len(actions) - 1):
                        ts1, act1 = actions[i]
                        ts2, act2 = actions[i + 1]
                        if act1 == "buy" and act2 == "sell":
                            if (ts2 - ts1).total_seconds() < 120:
                                quick_reversals += 1
                feats["tx_quick_reversal_count"] = float(quick_reversals)

            except Exception as e:
                logger.debug("Transaction features failed for mint %s: %s", mint[:8], e)

            result[mint] = feats

        logger.info("Transaction features computed for %d mints", len(result))
        return result

    except Exception as e:
        logger.warning("Transaction features computation failed: %s", e)
        return {mint: dict(default_features) for mint in mints}
