"""
Feature extraction for the Embeddings module.

Extracts 128 features from coin_metrics + coin_transactions for a given
time window, producing the raw feature vector that becomes an embedding.

Feature groups:
  A) Price dynamics      (20 features, from coin_metrics)
  B) Volume dynamics     (16 features, from coin_metrics)
  C) Market structure    (12 features, from coin_metrics)
  D) Participation       (12 features, from coin_metrics)
  E) Temporal trades     (14 features, from coin_transactions)
  F) Wallet behavior     (14 features, from coin_transactions)
  G) Price impact        (12 features, from coin_transactions)
  H) Context + interactions (28 features: 8 context + 20 interactions)

Total: 20+16+12+12+14+14+12+28 = 128
"""

import logging
import math
from collections import Counter
from datetime import datetime
from typing import Dict, List, Optional

import numpy as np

from backend.database import get_pool

logger = logging.getLogger(__name__)

EPS = 1e-9  # Avoid division by zero

# Feature names in order (for interpretability and debugging)
FEATURE_NAMES: List[str] = [
    # A: Price dynamics (20)
    "price_return_pct", "price_range_pct", "price_position",
    "upper_shadow_pct", "lower_shadow_pct", "price_vs_start",
    "price_momentum_3", "price_momentum_5", "price_acceleration",
    "price_volatility_std", "price_max_drawdown", "price_max_runup",
    "price_trend_slope", "price_trend_r2", "close_vs_ath_pct",
    "ath_retracement_depth", "price_mean_reversion", "price_skewness",
    "price_kurtosis", "price_hurst_estimate",
    # B: Volume dynamics (16)
    "volume_total_sol", "volume_mean_sol", "volume_std_sol",
    "volume_trend_slope", "buy_sell_volume_ratio", "net_volume_cumulative",
    "volume_concentration", "volume_acceleration",
    "whale_volume_pct", "whale_net_direction", "micro_trade_pct",
    "volume_buy_momentum_3", "volume_sell_momentum_3",
    "volume_spike_count", "volume_dry_count", "volume_profile_skewness",
    # C: Market structure (12)
    "market_cap_change_pct", "market_cap_volatility", "bonding_curve_progression",
    "bonding_curve_velocity", "dev_sold_total", "dev_sold_events",
    "dev_sell_timing", "buy_pressure_mean", "buy_pressure_std",
    "buy_pressure_trend", "is_koth_any", "is_koth_pct",
    # D: Participation (12)
    "unique_wallets_total", "unique_wallets_growth", "unique_wallets_concentration",
    "signer_ratio_mean", "signer_ratio_trend", "trades_total",
    "trade_frequency_std", "buy_sell_count_ratio", "trades_acceleration",
    "new_wallet_rate", "avg_trade_size_mean", "avg_trade_size_trend",
    # E: Temporal trade patterns (14)
    "trade_inter_arrival_mean", "trade_inter_arrival_std",
    "trade_burst_count", "trade_burst_max_size",
    "buy_streak_max", "sell_streak_max",
    "trade_density_first_half", "trade_density_last_quarter",
    "time_to_first_sell", "time_to_first_whale",
    "trade_rhythm_entropy", "buy_sell_alternation",
    "trade_cluster_count", "last_trade_is_sell",
    # F: Wallet behavior (14)
    "unique_traders", "whale_trader_count", "repeat_trader_count",
    "repeat_trader_pct", "top_trader_volume_pct", "top3_traders_volume_pct",
    "gini_trader_volume", "trader_buy_only_pct", "trader_sell_only_pct",
    "trader_bidirectional_pct", "avg_trader_trade_count",
    "whale_buy_first_pct", "new_trader_volume_pct", "trader_entry_spread",
    # G: Price impact (12)
    "max_single_buy_sol", "max_single_sell_sol",
    "trade_size_skewness", "trade_size_kurtosis",
    "large_trade_pct", "small_trade_pct", "buy_avg_size_vs_sell",
    "price_impact_max", "price_impact_mean", "vwap_vs_close",
    "sell_pressure_acceleration", "buy_exhaustion_signal",
    # H: Context (8) + Interactions (20)
    "phase_id", "coin_age_seconds", "coin_age_normalized",
    "snapshots_in_window", "data_completeness",
    "sol_price_usd", "sol_price_change_pct", "time_of_day_sin",
    "volume_price_correlation", "whale_price_correlation",
    "buy_pressure_volume_product", "volatility_volume_ratio",
    "participation_momentum", "smart_money_signal",
    "retail_fomo_signal", "dump_signal", "organic_signal",
    "wash_trade_signal", "momentum_quality", "volume_sustainability",
    "market_cap_efficiency", "liquidity_depth",
    "whale_timing_signal", "trade_quality_score",
    "price_volume_divergence", "acceleration_alignment",
    "exhaustion_index", "health_composite",
]

assert len(FEATURE_NAMES) == 128, f"Expected 128 features, got {len(FEATURE_NAMES)}"


# ---------------------------------------------------------------------------
# Helper math functions
# ---------------------------------------------------------------------------

def _safe_div(a: float, b: float) -> float:
    if abs(b) < EPS:
        return 0.0
    return a / b


def _linear_slope(values: np.ndarray) -> float:
    """Simple linear regression slope."""
    n = len(values)
    if n < 2:
        return 0.0
    x = np.arange(n, dtype=np.float64)
    mx, my = x.mean(), values.mean()
    denom = np.sum((x - mx) ** 2)
    if denom < EPS:
        return 0.0
    return float(np.sum((x - mx) * (values - my)) / denom)


def _linear_r2(values: np.ndarray) -> float:
    """R-squared of a linear fit."""
    n = len(values)
    if n < 3:
        return 0.0
    slope = _linear_slope(values)
    x = np.arange(n, dtype=np.float64)
    predicted = values.mean() + slope * (x - x.mean())
    ss_res = np.sum((values - predicted) ** 2)
    ss_tot = np.sum((values - values.mean()) ** 2)
    if ss_tot < EPS:
        return 0.0
    return max(0.0, 1.0 - ss_res / ss_tot)


def _sma(values: np.ndarray, window: int) -> float:
    """Simple moving average of the last `window` elements."""
    if len(values) < window:
        return float(np.mean(values)) if len(values) > 0 else 0.0
    return float(np.mean(values[-window:]))


def _max_drawdown(prices: np.ndarray) -> float:
    """Max peak-to-trough percentage decline."""
    if len(prices) < 2:
        return 0.0
    peak = prices[0]
    max_dd = 0.0
    for p in prices[1:]:
        if p > peak:
            peak = p
        dd = (peak - p) / (peak + EPS)
        if dd > max_dd:
            max_dd = dd
    return max_dd


def _max_runup(prices: np.ndarray) -> float:
    """Max trough-to-peak percentage increase."""
    if len(prices) < 2:
        return 0.0
    trough = prices[0]
    max_ru = 0.0
    for p in prices[1:]:
        if p < trough:
            trough = p
        ru = (p - trough) / (trough + EPS)
        if ru > max_ru:
            max_ru = ru
    return max_ru


def _skewness(values: np.ndarray) -> float:
    """Sample skewness."""
    n = len(values)
    if n < 3:
        return 0.0
    m = values.mean()
    s = values.std()
    if s < EPS:
        return 0.0
    return float(np.mean(((values - m) / s) ** 3))


def _kurtosis(values: np.ndarray) -> float:
    """Excess kurtosis."""
    n = len(values)
    if n < 4:
        return 0.0
    m = values.mean()
    s = values.std()
    if s < EPS:
        return 0.0
    return float(np.mean(((values - m) / s) ** 4) - 3.0)


def _hurst_estimate(values: np.ndarray) -> float:
    """Simplified Hurst exponent estimate using R/S analysis."""
    n = len(values)
    if n < 20:
        return 0.5  # Random walk default
    diffs = np.diff(values)
    mean_d = diffs.mean()
    cumdev = np.cumsum(diffs - mean_d)
    r = cumdev.max() - cumdev.min()
    s = diffs.std()
    if s < EPS or r < EPS:
        return 0.5
    rs = r / s
    return float(np.log(rs) / np.log(n))


def _shannon_entropy(counts: list) -> float:
    """Shannon entropy of a distribution."""
    total = sum(counts)
    if total == 0:
        return 0.0
    probs = [c / total for c in counts if c > 0]
    return -sum(p * math.log2(p) for p in probs)


def _gini_coefficient(values: np.ndarray) -> float:
    """Gini coefficient (0=equal, 1=maximally unequal)."""
    if len(values) == 0:
        return 0.0
    sorted_v = np.sort(values)
    n = len(sorted_v)
    index = np.arange(1, n + 1)
    return float((2.0 * np.sum(index * sorted_v) / (n * np.sum(sorted_v) + EPS)) - (n + 1.0) / n)


def _correlation(a: np.ndarray, b: np.ndarray) -> float:
    """Pearson correlation, safe for constant arrays."""
    if len(a) < 3 or a.std() < EPS or b.std() < EPS:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


# ---------------------------------------------------------------------------
# Metrics-based feature extraction (Groups A-D, 60 features)
# ---------------------------------------------------------------------------

def _extract_metrics_features(data: dict) -> np.ndarray:
    """
    Extract 60 features from aggregated coin_metrics arrays.

    Expected keys in data: price_open[], price_high[], price_low[], price_close[],
    volume_sol[], buy_volume_sol[], sell_volume_sol[], net_volume_sol[],
    market_cap_close[], bonding_curve_pct[], dev_sold_amount[],
    num_buys[], num_sells[], unique_wallets[], num_micro_trades[],
    max_single_buy_sol[], max_single_sell_sol[],
    whale_buy_volume_sol[], whale_sell_volume_sol[],
    volatility_pct[], avg_trade_size_sol[], buy_pressure_ratio[],
    unique_signer_ratio[], is_koth[]
    """
    opens = np.array(data.get("price_open", []), dtype=np.float64)
    highs = np.array(data.get("price_high", []), dtype=np.float64)
    lows = np.array(data.get("price_low", []), dtype=np.float64)
    closes = np.array(data.get("price_close", []), dtype=np.float64)
    volume = np.array(data.get("volume_sol", []), dtype=np.float64)
    buy_vol = np.array(data.get("buy_volume_sol", []), dtype=np.float64)
    sell_vol = np.array(data.get("sell_volume_sol", []), dtype=np.float64)
    net_vol = np.array(data.get("net_volume_sol", []), dtype=np.float64)
    mcap = np.array(data.get("market_cap_close", []), dtype=np.float64)
    bonding = np.array(data.get("bonding_curve_pct", []), dtype=np.float64)
    dev_sold = np.array(data.get("dev_sold_amount", []), dtype=np.float64)
    n_buys = np.array(data.get("num_buys", []), dtype=np.float64)
    n_sells = np.array(data.get("num_sells", []), dtype=np.float64)
    u_wallets = np.array(data.get("unique_wallets", []), dtype=np.float64)
    n_micro = np.array(data.get("num_micro_trades", []), dtype=np.float64)
    max_buy = np.array(data.get("max_single_buy_sol", []), dtype=np.float64)
    max_sell = np.array(data.get("max_single_sell_sol", []), dtype=np.float64)
    whale_buy = np.array(data.get("whale_buy_volume_sol", []), dtype=np.float64)
    whale_sell = np.array(data.get("whale_sell_volume_sol", []), dtype=np.float64)
    volatility = np.array(data.get("volatility_pct", []), dtype=np.float64)
    avg_trade = np.array(data.get("avg_trade_size_sol", []), dtype=np.float64)
    buy_pressure = np.array(data.get("buy_pressure_ratio", []), dtype=np.float64)
    signer_ratio = np.array(data.get("unique_signer_ratio", []), dtype=np.float64)
    is_koth = np.array(data.get("is_koth", []), dtype=np.float64)

    n = len(closes)
    features = np.zeros(60, dtype=np.float64)
    if n == 0:
        return features

    # Returns
    returns = np.diff(closes) / (closes[:-1] + EPS) if n > 1 else np.array([0.0])

    # --- Group A: Price dynamics (20) ---
    features[0] = _safe_div(closes[-1] - opens[0], opens[0]) * 100  # return %
    price_range = highs.max() - lows.min()
    features[1] = _safe_div(price_range, opens[0]) * 100  # range %
    features[2] = _safe_div(closes[-1] - lows.min(), price_range) if price_range > EPS else 0.5  # position
    features[3] = _safe_div(highs.max() - closes[-1], price_range) if price_range > EPS else 0.0  # upper shadow
    features[4] = _safe_div(min(opens[0], closes[-1]) - lows.min(), price_range) if price_range > EPS else 0.0  # lower shadow
    features[5] = _safe_div(closes[-1], opens[0]) - 1  # vs start
    features[6] = _sma(returns, 3)  # momentum 3
    features[7] = _sma(returns, 5)  # momentum 5
    features[8] = returns[-1] - returns[-2] if len(returns) >= 2 else 0.0  # acceleration
    features[9] = float(returns.std()) if len(returns) > 1 else 0.0  # volatility std
    features[10] = _max_drawdown(closes)
    features[11] = _max_runup(closes)
    features[12] = _linear_slope(closes)
    features[13] = _linear_r2(closes)
    ath = closes.max()
    features[14] = _safe_div(closes[-1], ath)  # close vs ATH
    features[15] = 1.0 - _safe_div(closes.min(), ath)  # ATH retracement depth
    sma_full = closes.mean()
    features[16] = _safe_div(closes[-1] - sma_full, sma_full)  # mean reversion
    features[17] = _skewness(closes)
    features[18] = _kurtosis(closes)
    features[19] = _hurst_estimate(closes)

    # --- Group B: Volume dynamics (16) ---
    vol_total = volume.sum()
    features[20] = vol_total
    features[21] = volume.mean() if n > 0 else 0.0
    features[22] = volume.std() if n > 1 else 0.0
    features[23] = _linear_slope(volume)
    features[24] = _safe_div(buy_vol.sum(), sell_vol.sum())
    features[25] = net_vol.cumsum()[-1] if n > 0 else 0.0
    features[26] = _safe_div(volume.max(), vol_total)  # concentration
    vol_diffs = np.diff(volume) if n > 1 else np.array([0.0])
    features[27] = vol_diffs[-1] - vol_diffs[-2] if len(vol_diffs) >= 2 else 0.0  # acceleration
    whale_total = whale_buy.sum() + whale_sell.sum()
    features[28] = _safe_div(whale_total, vol_total)
    features[29] = _safe_div(whale_buy.sum() - whale_sell.sum(), whale_total) if whale_total > EPS else 0.0
    total_trades = n_buys.sum() + n_sells.sum()
    features[30] = _safe_div(n_micro.sum(), total_trades)
    features[31] = _sma(buy_vol, 3)
    features[32] = _sma(sell_vol, 3)
    vol_mean = volume.mean() if n > 0 else 1.0
    features[33] = float(np.sum(volume > 2 * vol_mean))  # spike count
    features[34] = float(np.sum(volume < 0.5 * vol_mean))  # dry count
    features[35] = _skewness(volume)

    # --- Group C: Market structure (12) ---
    features[36] = _safe_div(mcap[-1] - mcap[0], mcap[0]) * 100 if n > 0 else 0.0
    features[37] = float(np.diff(mcap).std()) if n > 1 else 0.0
    features[38] = bonding.mean() if n > 0 else 0.0
    features[39] = _linear_slope(bonding)
    features[40] = dev_sold.sum()
    features[41] = float(np.sum(dev_sold > 0))
    # Dev sell timing: position of first dev sell (0=start, 1=end)
    dev_sell_idx = np.where(dev_sold > 0)[0]
    features[42] = dev_sell_idx[0] / (n - 1 + EPS) if len(dev_sell_idx) > 0 else 1.0
    features[43] = buy_pressure.mean() if n > 0 else 0.5
    features[44] = buy_pressure.std() if n > 1 else 0.0
    features[45] = _linear_slope(buy_pressure)
    features[46] = 1.0 if np.any(is_koth > 0.5) else 0.0
    features[47] = _safe_div(np.sum(is_koth > 0.5), n)

    # --- Group D: Participation (12) ---
    features[48] = u_wallets.sum()
    features[49] = _linear_slope(u_wallets)
    features[50] = _safe_div(u_wallets.max(), u_wallets.sum()) if u_wallets.sum() > 0 else 0.0
    features[51] = signer_ratio.mean() if n > 0 else 0.0
    features[52] = _linear_slope(signer_ratio)
    features[53] = total_trades
    trade_counts = n_buys + n_sells
    features[54] = trade_counts.std() if n > 1 else 0.0
    features[55] = _safe_div(n_buys.sum(), n_sells.sum())
    tc_diffs = np.diff(trade_counts) if n > 1 else np.array([0.0])
    features[56] = tc_diffs[-1] - tc_diffs[-2] if len(tc_diffs) >= 2 else 0.0
    features[57] = _safe_div(float(np.diff(u_wallets).mean()), u_wallets.mean()) if n > 1 and u_wallets.mean() > EPS else 0.0  # new wallet rate (relative growth)
    features[58] = avg_trade.mean() if n > 0 else 0.0
    features[59] = _linear_slope(avg_trade)

    return features


# ---------------------------------------------------------------------------
# Transaction-based feature extraction (Groups E-G, 40 features)
# ---------------------------------------------------------------------------

def _extract_transaction_features(data: dict) -> np.ndarray:
    """
    Extract 40 features from individual coin_transactions.

    Expected keys: timestamps_epoch[], amounts[], types[], whale_flags[],
                   prices[], traders[]
    """
    timestamps = np.array(data.get("timestamps_epoch", []), dtype=np.float64)
    amounts = np.array(data.get("amounts", []), dtype=np.float64)
    types = data.get("types", [])  # list of 'buy'/'sell' strings
    whales = np.array(data.get("whale_flags", []), dtype=bool)
    prices = np.array(data.get("prices", []), dtype=np.float64)
    traders = data.get("traders", [])  # list of wallet addresses

    n = len(timestamps)
    features = np.zeros(40, dtype=np.float64)
    if n == 0:
        return features

    is_buy = np.array([t == "buy" for t in types])
    is_sell = np.array([t == "sell" for t in types])

    # --- Group E: Temporal trade patterns (14) ---
    if n > 1:
        inter_arrival = np.diff(timestamps)
        features[0] = inter_arrival.mean()
        features[1] = inter_arrival.std()
    else:
        features[0] = 0.0
        features[1] = 0.0

    # Bursts: >3 trades within 5 seconds (sliding window, O(n))
    burst_count = 0
    burst_max = 0
    if n > 3:
        j = 0
        for i in range(n):
            while j < n and timestamps[j] <= timestamps[i] + 5.0:
                j += 1
            trades_in_window = j - i
            if trades_in_window > 3:
                burst_count += 1
                burst_max = max(burst_max, trades_in_window)
    features[2] = burst_count
    features[3] = burst_max

    # Streaks
    buy_streak = sell_streak = 0
    max_buy_streak = max_sell_streak = 0
    for t in types:
        if t == "buy":
            buy_streak += 1
            sell_streak = 0
            max_buy_streak = max(max_buy_streak, buy_streak)
        else:
            sell_streak += 1
            buy_streak = 0
            max_sell_streak = max(max_sell_streak, sell_streak)
    features[4] = max_buy_streak
    features[5] = max_sell_streak

    # Trade density by time window
    t_mid = (timestamps[0] + timestamps[-1]) / 2.0 if n > 1 else timestamps[0]
    features[6] = _safe_div(float(np.sum(timestamps <= t_mid)), n)  # first half density
    t_q3 = timestamps[0] + 0.75 * (timestamps[-1] - timestamps[0]) if n > 1 else timestamps[0]
    features[7] = _safe_div(float(np.sum(timestamps >= t_q3)), n)  # last quarter density

    # Time to first sell / whale
    sell_indices = np.where(is_sell)[0]
    features[8] = timestamps[sell_indices[0]] - timestamps[0] if len(sell_indices) > 0 else -1.0
    whale_indices = np.where(whales)[0]
    features[9] = timestamps[whale_indices[0]] - timestamps[0] if len(whale_indices) > 0 else -1.0

    # Entropy: bin trades into 10 equal time buckets
    if n > 1:
        t_min, t_max = timestamps.min(), timestamps.max()
        if t_max - t_min > EPS:
            bins = np.linspace(t_min, t_max, 11)
            counts, _ = np.histogram(timestamps, bins=bins)
            features[10] = _shannon_entropy(counts.tolist())
        else:
            features[10] = 0.0
    else:
        features[10] = 0.0

    # Buy/sell alternation
    alternations = sum(1 for i in range(1, len(types)) if types[i] != types[i-1])
    features[11] = alternations

    # Simple temporal clustering (gaps > 2*mean inter-arrival)
    if n > 2:
        ia = np.diff(timestamps)
        mean_ia = ia.mean()
        if mean_ia > EPS:
            features[12] = float(np.sum(ia > 2 * mean_ia)) + 1  # clusters
        else:
            features[12] = 1.0
    else:
        features[12] = 1.0

    features[13] = 1.0 if types[-1] == "sell" else 0.0

    # --- Group F: Wallet behavior (14) ---
    trader_set = set(traders)
    features[14] = len(trader_set)

    whale_traders = set(t for t, w in zip(traders, whales) if w)
    features[15] = len(whale_traders)

    trader_counts = Counter(traders)
    repeat_traders = {t for t, c in trader_counts.items() if c > 1}
    features[16] = len(repeat_traders)
    features[17] = _safe_div(len(repeat_traders), len(trader_set))

    # Volume per trader
    trader_volumes: Dict[str, float] = {}
    for t, a in zip(traders, amounts):
        trader_volumes[t] = trader_volumes.get(t, 0.0) + float(a)

    vol_values = sorted(trader_volumes.values(), reverse=True)
    total_vol = sum(vol_values) + EPS
    features[18] = vol_values[0] / total_vol if vol_values else 0.0  # top trader %
    features[19] = sum(vol_values[:3]) / total_vol if len(vol_values) >= 3 else (sum(vol_values) / total_vol if vol_values else 0.0)
    features[20] = _gini_coefficient(np.array(vol_values)) if vol_values else 0.0

    # Buy-only / sell-only / bidirectional traders
    trader_actions: Dict[str, set] = {}
    for t, typ in zip(traders, types):
        if t not in trader_actions:
            trader_actions[t] = set()
        trader_actions[t].add(typ)

    n_traders = len(trader_set)
    buy_only = sum(1 for acts in trader_actions.values() if acts == {"buy"})
    sell_only = sum(1 for acts in trader_actions.values() if acts == {"sell"})
    bidir = sum(1 for acts in trader_actions.values() if len(acts) > 1)
    features[21] = _safe_div(buy_only, n_traders)
    features[22] = _safe_div(sell_only, n_traders)
    features[23] = _safe_div(bidir, n_traders)
    features[24] = _safe_div(n, n_traders)  # avg trades per trader

    # Whale buy-first %
    whale_first_buy = 0
    whale_total_count = 0
    seen_whales: Dict[str, str] = {}
    for t, typ, w in zip(traders, types, whales):
        if w and t not in seen_whales:
            seen_whales[t] = typ
            whale_total_count += 1
            if typ == "buy":
                whale_first_buy += 1
    features[25] = _safe_div(whale_first_buy, whale_total_count)

    # New trader volume: volume from traders seen for the first time
    first_seen: Dict[str, int] = {}
    for i, t in enumerate(traders):
        if t not in first_seen:
            first_seen[t] = i
    new_vol = sum(float(amounts[i]) for t, i in first_seen.items())
    features[26] = _safe_div(new_vol, total_vol)

    # Trader entry spread (std of first-trade timestamps)
    first_timestamps = [timestamps[i] for i in first_seen.values()]
    features[27] = float(np.std(first_timestamps)) if len(first_timestamps) > 1 else 0.0

    # --- Group G: Price impact patterns (12) ---
    buy_amounts = amounts[is_buy]
    sell_amounts = amounts[is_sell]

    features[28] = float(buy_amounts.max()) if len(buy_amounts) > 0 else 0.0
    features[29] = float(sell_amounts.max()) if len(sell_amounts) > 0 else 0.0
    features[30] = _skewness(amounts)
    features[31] = _kurtosis(amounts)
    features[32] = _safe_div(np.sum(amounts > 1.0), n)  # large trade %
    features[33] = _safe_div(np.sum(amounts < 0.01), n)  # small trade %
    buy_avg = buy_amounts.mean() if len(buy_amounts) > 0 else EPS
    sell_avg = sell_amounts.mean() if len(sell_amounts) > 0 else EPS
    features[34] = _safe_div(buy_avg, sell_avg)

    # Price impact: max/mean absolute price change between consecutive trades
    if n > 1:
        price_changes = np.abs(np.diff(prices) / (prices[:-1] + EPS))
        features[35] = float(price_changes.max())
        features[36] = float(price_changes.mean())
    else:
        features[35] = 0.0
        features[36] = 0.0

    # VWAP vs close
    vwap = np.sum(prices * amounts) / (amounts.sum() + EPS)
    features[37] = _safe_div(vwap - prices[-1], prices[-1])

    # Sell pressure acceleration
    if len(sell_amounts) > 2:
        sell_diffs = np.diff(sell_amounts)
        features[38] = sell_diffs[-1] - sell_diffs[-2] if len(sell_diffs) >= 2 else 0.0
    else:
        features[38] = 0.0

    # Buy exhaustion: declining buy sizes + increasing sell sizes
    if len(buy_amounts) > 2 and len(sell_amounts) > 2:
        buy_declining = _linear_slope(buy_amounts) < 0
        sell_increasing = _linear_slope(sell_amounts) > 0
        features[39] = 1.0 if (buy_declining and sell_increasing) else 0.0
    else:
        features[39] = 0.0

    return features


# ---------------------------------------------------------------------------
# Context + interaction features (Group H, 28 features)
# ---------------------------------------------------------------------------

def _extract_context_and_interaction_features(
    metrics_features: np.ndarray,
    tx_features: np.ndarray,
    context: dict,
) -> np.ndarray:
    """
    Extract 28 features: 8 context + 20 cross-group interactions.

    Context dict keys: phase_id, coin_age_seconds, max_phase_age,
                       snapshots, total_fields, non_null_fields,
                       sol_price_usd, sol_price_change_pct, hour_of_day
    """
    features = np.zeros(28, dtype=np.float64)

    # Context (8)
    features[0] = context.get("phase_id", 0)
    coin_age = context.get("coin_age_seconds", 0)
    features[1] = coin_age
    max_age = context.get("max_phase_age", 86400)
    features[2] = _safe_div(coin_age, max_age)
    features[3] = context.get("snapshots", 0)
    total_f = context.get("total_fields", 1)
    non_null = context.get("non_null_fields", 0)
    features[4] = _safe_div(non_null, total_f)
    features[5] = context.get("sol_price_usd", 0.0)
    features[6] = context.get("sol_price_change_pct", 0.0)
    hour = context.get("hour_of_day", 12)
    features[7] = math.sin(2 * math.pi * hour / 24.0)

    # Interactions (20) -- cross-references between metrics and tx features
    # Use named indices from groups A-G for clarity
    price_trend = metrics_features[12]  # price_trend_slope
    price_r2 = metrics_features[13]  # price_trend_r2
    vol_total = metrics_features[20]  # volume_total_sol
    vol_std = metrics_features[22]  # volume_std_sol
    vol_trend = metrics_features[23]  # volume_trend_slope
    buy_sell_ratio = metrics_features[24]  # buy_sell_volume_ratio
    whale_vol_pct = metrics_features[28]  # whale_volume_pct
    whale_net_dir = metrics_features[29]  # whale_net_direction
    micro_pct = metrics_features[30]  # micro_trade_pct
    dev_sold = metrics_features[40]  # dev_sold_total
    buy_press = metrics_features[43]  # buy_pressure_mean
    volatility_std = metrics_features[9]  # price_volatility_std
    wallets_growth = metrics_features[49]  # unique_wallets_growth
    signer_mean = metrics_features[51]  # signer_ratio_mean
    bonding_pct = metrics_features[38]  # bonding_curve_progression
    mcap_change = metrics_features[36]  # market_cap_change_pct
    price_accel = metrics_features[8]  # price_acceleration
    max_drawdown = metrics_features[10]  # price_max_drawdown

    sell_streak = tx_features[5]  # sell_streak_max
    bidir_pct = tx_features[23]  # trader_bidirectional_pct
    repeat_pct = tx_features[17]  # repeat_trader_pct
    time_to_whale = tx_features[9]  # time_to_first_whale
    avg_trade_size = metrics_features[58]  # avg_trade_size_mean
    buy_exhaust = tx_features[39]  # buy_exhaustion_signal
    vol_accel = metrics_features[27]  # volume_acceleration

    # Compute 20 interactions
    closes_arr = np.array([vol_total, vol_trend])  # just need correlation proxies
    features[8] = _safe_div(price_trend * vol_trend, abs(price_trend) + abs(vol_trend) + EPS)  # volume_price_correlation proxy
    features[9] = _safe_div(whale_net_dir * price_trend, abs(whale_net_dir) + abs(price_trend) + EPS)  # whale_price_correlation
    features[10] = buy_press * vol_total  # buy_pressure_volume_product
    features[11] = _safe_div(volatility_std, vol_std)  # volatility_volume_ratio
    features[12] = wallets_growth * vol_trend  # participation_momentum
    features[13] = whale_net_dir * price_trend  # smart_money_signal
    features[14] = wallets_growth * (1.0 - whale_vol_pct)  # retail_fomo_signal
    features[15] = dev_sold * sell_streak  # dump_signal
    features[16] = signer_mean * bidir_pct  # organic_signal
    features[17] = (1.0 - signer_mean) * repeat_pct  # wash_trade_signal
    features[18] = price_r2 * price_trend  # momentum_quality
    features[19] = vol_trend * buy_sell_ratio  # volume_sustainability
    features[20] = _safe_div(mcap_change, vol_total)  # market_cap_efficiency
    features[21] = bonding_pct * vol_total  # liquidity_depth
    window_dur = context.get("window_seconds", 300)
    features[22] = _safe_div(time_to_whale, window_dur) if time_to_whale >= 0 else 1.0  # whale_timing_signal
    features[23] = signer_mean * avg_trade_size * (1.0 - micro_pct)  # trade_quality_score
    features[24] = 1.0 if (np.sign(price_trend) != np.sign(vol_trend)) else 0.0  # price_volume_divergence
    features[25] = 1.0 if (np.sign(price_accel) == np.sign(vol_accel)) else 0.0  # acceleration_alignment
    features[26] = buy_exhaust * max_drawdown  # exhaustion_index
    # Health composite: weighted positive signals
    features[27] = 0.3 * features[16] + 0.2 * features[23] + 0.2 * features[19] + 0.3 * (1.0 - features[15])

    return features


# ---------------------------------------------------------------------------
# Public API: Full feature extraction
# ---------------------------------------------------------------------------

async def extract_window_features(
    mint: str,
    window_start: datetime,
    window_end: datetime,
    min_snapshots: int = 3,
) -> Optional[np.ndarray]:
    """
    Extract 128-dim feature vector for one coin in one time window.

    Returns None if insufficient data (fewer than min_snapshots in coin_metrics).
    """
    pool = get_pool()

    # 1. Load coin_metrics for this window
    metrics_rows = await pool.fetch(
        """
        SELECT price_open, price_high, price_low, price_close,
               volume_sol, buy_volume_sol, sell_volume_sol, net_volume_sol,
               market_cap_close, bonding_curve_pct, dev_sold_amount,
               num_buys, num_sells, unique_wallets, num_micro_trades,
               max_single_buy_sol, max_single_sell_sol,
               whale_buy_volume_sol, whale_sell_volume_sol,
               volatility_pct, avg_trade_size_sol, buy_pressure_ratio,
               unique_signer_ratio, is_koth, phase_id_at_time, timestamp
        FROM coin_metrics
        WHERE mint = $1 AND timestamp >= $2 AND timestamp < $3
        ORDER BY timestamp ASC
        """,
        mint, window_start, window_end,
    )

    if len(metrics_rows) < min_snapshots:
        return None

    # Build metrics dict with arrays
    metrics_data: Dict[str, list] = {}
    for col in [
        "price_open", "price_high", "price_low", "price_close",
        "volume_sol", "buy_volume_sol", "sell_volume_sol", "net_volume_sol",
        "market_cap_close", "bonding_curve_pct", "dev_sold_amount",
        "num_buys", "num_sells", "unique_wallets", "num_micro_trades",
        "max_single_buy_sol", "max_single_sell_sol",
        "whale_buy_volume_sol", "whale_sell_volume_sol",
        "volatility_pct", "avg_trade_size_sol", "buy_pressure_ratio",
        "unique_signer_ratio",
    ]:
        metrics_data[col] = [float(r[col] or 0) for r in metrics_rows]
    metrics_data["is_koth"] = [1.0 if r["is_koth"] else 0.0 for r in metrics_rows]

    # 2. Load coin_transactions for this window
    tx_rows = await pool.fetch(
        """
        SELECT EXTRACT(EPOCH FROM timestamp) as ts_epoch,
               sol_amount, tx_type, is_whale, price_sol, trader_public_key
        FROM coin_transactions
        WHERE mint = $1 AND timestamp >= $2 AND timestamp < $3
        ORDER BY timestamp ASC
        """,
        mint, window_start, window_end,
    )

    tx_data = {
        "timestamps_epoch": [float(r["ts_epoch"]) for r in tx_rows],
        "amounts": [float(r["sol_amount"]) for r in tx_rows],
        "types": [r["tx_type"] for r in tx_rows],
        "whale_flags": [r["is_whale"] for r in tx_rows],
        "prices": [float(r["price_sol"]) for r in tx_rows],
        "traders": [r["trader_public_key"] for r in tx_rows],
    }

    # 3. Context
    phase_id = metrics_rows[-1]["phase_id_at_time"] or 0
    first_ts = metrics_rows[0]["timestamp"]
    last_ts = metrics_rows[-1]["timestamp"]

    # SOL price context (best effort)
    sol_row = await pool.fetchrow(
        """
        SELECT sol_price_usd FROM exchange_rates
        WHERE created_at <= $1
        ORDER BY created_at DESC LIMIT 1
        """,
        window_end,
    )
    sol_price = float(sol_row["sol_price_usd"]) if sol_row else 0.0

    sol_row_start = await pool.fetchrow(
        """
        SELECT sol_price_usd FROM exchange_rates
        WHERE created_at <= $1
        ORDER BY created_at DESC LIMIT 1
        """,
        window_start,
    )
    sol_start = float(sol_row_start["sol_price_usd"]) if sol_row_start else sol_price
    sol_change = _safe_div(sol_price - sol_start, sol_start) * 100 if sol_start > EPS else 0.0

    mid_time = window_start + (window_end - window_start) / 2
    hour_of_day = mid_time.hour + mid_time.minute / 60.0

    # Count non-null fields for data completeness
    total_fields = len(metrics_rows) * 24  # 24 metrics columns
    non_null = sum(
        1 for r in metrics_rows
        for col in [
            "price_open", "price_high", "price_low", "price_close",
            "volume_sol", "buy_volume_sol", "sell_volume_sol", "net_volume_sol",
            "market_cap_close", "bonding_curve_pct", "dev_sold_amount",
            "num_buys", "num_sells", "unique_wallets", "num_micro_trades",
            "max_single_buy_sol", "max_single_sell_sol",
            "whale_buy_volume_sol", "whale_sell_volume_sol",
            "volatility_pct", "avg_trade_size_sol", "buy_pressure_ratio",
            "unique_signer_ratio", "is_koth",
        ]
        if r[col] is not None
    )

    context = {
        "phase_id": phase_id,
        "coin_age_seconds": (last_ts - first_ts).total_seconds(),
        "max_phase_age": 86400,
        "snapshots": len(metrics_rows),
        "total_fields": total_fields,
        "non_null_fields": non_null,
        "sol_price_usd": sol_price,
        "sol_price_change_pct": sol_change,
        "hour_of_day": hour_of_day,
        "window_seconds": (window_end - window_start).total_seconds(),
    }

    # 4. Extract features (NaN cleanup between steps to prevent propagation)
    metrics_feats = _extract_metrics_features(metrics_data)  # 60
    metrics_feats = np.nan_to_num(metrics_feats, nan=0.0, posinf=0.0, neginf=0.0)
    tx_feats = _extract_transaction_features(tx_data)  # 40
    tx_feats = np.nan_to_num(tx_feats, nan=0.0, posinf=0.0, neginf=0.0)
    ctx_feats = _extract_context_and_interaction_features(metrics_feats, tx_feats, context)  # 28

    # 5. Concatenate
    full_vector = np.concatenate([metrics_feats, tx_feats, ctx_feats])
    assert len(full_vector) == 128, f"Expected 128, got {len(full_vector)}"

    # Replace NaN/Inf with 0
    full_vector = np.nan_to_num(full_vector, nan=0.0, posinf=0.0, neginf=0.0)

    return full_vector


async def extract_batch_features(
    mints: List[str],
    window_start: datetime,
    window_end: datetime,
    min_snapshots: int = 3,
) -> Dict[str, np.ndarray]:
    """
    Extract features for multiple mints in one window.
    Returns {mint: 128-dim vector} for mints with sufficient data.
    """
    results = {}
    for mint in mints:
        try:
            vec = await extract_window_features(mint, window_start, window_end, min_snapshots)
            if vec is not None:
                results[mint] = vec
        except Exception as e:
            logger.warning("Feature extraction failed for %s: %s", mint, e)
    return results
