"""
Feature Engineering for the Training module.

Migrated from pump-training/backend/app/training/feature_engineering.py.
Uses the shared database pool from backend.database.

Generates:
  - Time-based labels for classification
  - Rule-based labels
  - Engineering features for pump-detection (66+ features)
  - Flag features indicating data availability per rolling window
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from backend.database import get_pool

logger = logging.getLogger(__name__)

# Max rows for RAM management
MAX_TRAINING_ROWS = 100_000

# ============================================================================
# BASE FEATURES (columns in coin_metrics)
# ============================================================================

BASE_FEATURES = [
    'price_open', 'price_high', 'price_low', 'price_close',
    'market_cap_close', 'bonding_curve_pct', 'virtual_sol_reserves', 'is_koth',
    'volume_sol', 'buy_volume_sol', 'sell_volume_sol', 'net_volume_sol',
    'num_buys', 'num_sells', 'unique_wallets', 'num_micro_trades',
    'max_single_buy_sol', 'max_single_sell_sol',
    'whale_buy_volume_sol', 'whale_sell_volume_sol', 'num_whale_buys', 'num_whale_sells',
    'dev_sold_amount', 'volatility_pct', 'avg_trade_size_sol',
    'buy_pressure_ratio', 'unique_signer_ratio', 'phase_id_at_time',
]


def _ensure_utc(dt) -> datetime:
    """Convert to UTC-aware datetime."""
    if isinstance(dt, str):
        dt = dt.replace('Z', '+00:00')
        dt = datetime.fromisoformat(dt)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt


# ============================================================================
# DATA LOADING
# ============================================================================

async def load_training_data(
    train_start,
    train_end,
    features: List[str],
    phases: Optional[List[int]] = None,
    include_ath: bool = True,
    include_flags: bool = True,
    use_graph_features: bool = False,
    use_embedding_features: bool = False,
    use_transaction_features: bool = False,
    use_metadata_features: bool = False,
) -> pd.DataFrame:
    """Load training data from coin_metrics with the requested features."""
    pool = get_pool()

    if isinstance(train_start, str):
        train_start = datetime.fromisoformat(train_start.replace('Z', '+00:00'))
    if isinstance(train_end, str):
        train_end = datetime.fromisoformat(train_end.replace('Z', '+00:00'))

    logger.info("Loading data: %s to %s", train_start, train_end)

    required_columns = {'timestamp', 'mint'}
    requested_columns = set()
    for feature in features:
        if feature in BASE_FEATURES:
            requested_columns.add(feature)

    if include_ath:
        required_for_engineering = {
            'price_close', 'volume_sol', 'dev_sold_amount', 'unique_signer_ratio',
            'whale_buy_volume_sol', 'whale_sell_volume_sol', 'volatility_pct',
            'net_volume_sol', 'market_cap_close', 'buy_pressure_ratio',
            'num_buys', 'num_sells',
        }
        requested_columns.update(required_for_engineering)

    all_columns = required_columns | requested_columns
    all_columns.add('price_close')
    all_columns.add('volume_sol')

    columns_list = sorted(list(all_columns))
    columns_str = ', '.join(f'cm.{col}' for col in columns_list)

    if phases:
        query = f"""
        SELECT {columns_str}
        FROM coin_metrics cm
        WHERE cm.timestamp >= $1 AND cm.timestamp <= $2
          AND cm.phase_id_at_time = ANY($3)
        ORDER BY cm.timestamp
        LIMIT {MAX_TRAINING_ROWS}
        """
        params = [train_start, train_end, phases]
    else:
        query = f"""
        SELECT {columns_str}
        FROM coin_metrics cm
        WHERE cm.timestamp >= $1 AND cm.timestamp <= $2
        ORDER BY cm.timestamp
        LIMIT {MAX_TRAINING_ROWS}
        """
        params = [train_start, train_end]

    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        if not rows:
            logger.warning("No data found in the specified time range")
            return pd.DataFrame()

        data = pd.DataFrame([dict(row) for row in rows])
        logger.info("Loaded %d rows, %d columns", len(data), len(data.columns))

        # Convert Decimal to float
        from decimal import Decimal
        for col in data.columns:
            if data[col].dtype == object:
                first_val = data[col].dropna().iloc[0] if len(data[col].dropna()) > 0 else None
                if isinstance(first_val, Decimal):
                    data[col] = data[col].astype(float)

        if 'timestamp' in data.columns:
            data['timestamp'] = pd.to_datetime(data['timestamp'])

        if include_ath and len(data) > 0:
            logger.info("Generating engineering features...")
            data = add_pump_detection_features(data, include_flags=include_flags)
            logger.info("%d columns after engineering", len(data.columns))

        # Build per-mint cutoff timestamps (shared by graph, embedding, transaction, metadata)
        # Uses the latest timestamp per mint in the training window to prevent data leakage.
        _mint_cutoff_ts = None
        if 'mint' in data.columns and 'timestamp' in data.columns and len(data) > 0:
            _mint_cutoff_ts = data.groupby('mint')['timestamp'].max().to_dict()

        # --- Graph features (Neo4j) ---
        if use_graph_features and 'mint' in data.columns and len(data) > 0:
            try:
                from backend.modules.training.graph_features import compute_graph_features, GRAPH_FEATURE_NAMES
                unique_mints = data['mint'].unique().tolist()
                graph_feats = await compute_graph_features(unique_mints, timestamps=_mint_cutoff_ts)
                for feat_name in GRAPH_FEATURE_NAMES:
                    data[feat_name] = data['mint'].map(lambda m: graph_feats.get(m, {}).get(feat_name, 0.0))
                logger.info("Graph features added: %d features for %d mints", len(GRAPH_FEATURE_NAMES), len(unique_mints))
            except Exception as e:
                logger.warning("Graph features failed: %s", e)

        # --- Embedding features (pgvector similarity) ---
        if use_embedding_features and 'mint' in data.columns and len(data) > 0:
            try:
                from backend.modules.training.embedding_features import compute_embedding_features, EMBEDDING_FEATURE_NAMES
                unique_mints = data['mint'].unique().tolist()
                emb_feats = await compute_embedding_features(unique_mints, timestamps=_mint_cutoff_ts)
                for feat_name in EMBEDDING_FEATURE_NAMES:
                    data[feat_name] = data['mint'].map(lambda m: emb_feats.get(m, {}).get(feat_name, 0.0))
                logger.info("Embedding features added: %d features for %d mints", len(EMBEDDING_FEATURE_NAMES), len(unique_mints))
            except Exception as e:
                logger.warning("Embedding features failed: %s", e)

        # --- Transaction features ---
        if use_transaction_features and 'mint' in data.columns and len(data) > 0:
            try:
                from backend.modules.training.transaction_features import compute_transaction_features, TRANSACTION_FEATURE_NAMES
                unique_mints = data['mint'].unique().tolist()
                tx_feats = await compute_transaction_features(unique_mints, timestamps=_mint_cutoff_ts)
                for feat_name in TRANSACTION_FEATURE_NAMES:
                    data[feat_name] = data['mint'].map(lambda m: tx_feats.get(m, {}).get(feat_name, 0.0))
                logger.info("Transaction features added: %d features for %d mints", len(TRANSACTION_FEATURE_NAMES), len(unique_mints))
            except Exception as e:
                logger.warning("Transaction features failed: %s", e)

        # --- Metadata features (discovered_coins + exchange_rates) ---
        if use_metadata_features and 'mint' in data.columns and len(data) > 0:
            try:
                from backend.modules.training.metadata_features import compute_metadata_features, METADATA_FEATURE_NAMES
                unique_mints = data['mint'].unique().tolist()
                meta_feats = await compute_metadata_features(unique_mints, timestamps=_mint_cutoff_ts)
                for feat_name in METADATA_FEATURE_NAMES:
                    data[feat_name] = data['mint'].map(lambda m: meta_feats.get(m, {}).get(feat_name, 0.0))
                logger.info("Metadata features added: %d features for %d mints", len(METADATA_FEATURE_NAMES), len(unique_mints))
            except Exception as e:
                logger.warning("Metadata features failed: %s", e)

        return data

    except Exception as e:
        logger.error("Error in load_training_data: %s", e)
        import traceback
        traceback.print_exc()
        return pd.DataFrame()


# ============================================================================
# LABEL CREATION
# ============================================================================

def create_time_based_labels(
    data: pd.DataFrame,
    target_var: str,
    future_minutes: int,
    min_percent_change: float,
    direction: str,
    phase_intervals: Optional[List[Dict]] = None,
) -> pd.Series:
    """Create time-based labels for classification.

    Uses actual timestamps to look up the price ``future_minutes`` minutes ahead,
    rather than shifting by N rows (which would be wrong when intervals differ
    between phases).
    """
    if target_var not in data.columns:
        logger.warning("target_var '%s' not in data, using price_close", target_var)
        target_var = 'price_close'
    if target_var not in data.columns:
        logger.error("Neither '%s' nor 'price_close' found in data", target_var)
        return pd.Series([0] * len(data), index=data.index)

    if 'mint' in data.columns and 'timestamp' in data.columns:
        data_sorted = data.sort_values(['mint', 'timestamp']).copy()
        original_index = data.index
        future_delta = pd.Timedelta(minutes=future_minutes)

        # Time-based lookup per coin using merge_asof
        def _get_future_price(group):
            ts = group['timestamp']
            target_times = ts + future_delta
            # Create a lookup frame with the target timestamps
            lookup = pd.DataFrame({'target_time': target_times}, index=group.index)
            ref = group[['timestamp', target_var]].rename(columns={'timestamp': 'target_time'}).sort_values('target_time')
            # merge_asof: find nearest future data point >= target_time
            merged = pd.merge_asof(
                lookup.sort_values('target_time'),
                ref,
                on='target_time',
                direction='forward',
            )
            return merged[target_var].values

        future_price = data_sorted.groupby('mint', group_keys=False).apply(
            lambda g: pd.Series(_get_future_price(g), index=g.index)
        )
        current_price = data_sorted[target_var]
    else:
        data_sorted = data.copy()
        original_index = data.index
        future_price = data_sorted[target_var].shift(-future_minutes)
        current_price = data_sorted[target_var]

    percent_change = ((future_price - current_price) / current_price) * 100

    if direction == 'up':
        labels = (percent_change >= min_percent_change).astype(int)
    else:
        labels = (percent_change <= -min_percent_change).astype(int)

    # Do NOT fill NaN with 0 — rows at the end of the time window lack future
    # data and cannot be labeled.  Return them as NaN so the caller can drop them.
    if 'mint' in data.columns:
        labels = labels.reindex(original_index)

    nan_count = int(labels.isna().sum())
    valid = labels.dropna()
    pos = int(valid.sum()) if len(valid) > 0 else 0
    neg = len(valid) - pos
    if nan_count > 0:
        logger.info("Labels: %d positive, %d negative, %d dropped (insufficient future data)", pos, neg, nan_count)
    else:
        logger.info("Labels: %d positive, %d negative", pos, neg)
    return labels


def create_rule_based_labels(
    data: pd.DataFrame,
    target_var: str,
    operator: str,
    target_value: float,
) -> pd.Series:
    """Create rule-based labels."""
    if target_var not in data.columns:
        return pd.Series([0] * len(data), index=data.index)
    col = data[target_var]
    ops = {
        '>': col.__gt__,
        '<': col.__lt__,
        '>=': col.__ge__,
        '<=': col.__le__,
        '=': col.__eq__,
    }
    fn = ops.get(operator)
    if fn is None:
        return pd.Series([0] * len(data), index=data.index)
    return fn(target_value).astype(int)


# Alias
create_labels = create_time_based_labels


# ============================================================================
# OVERLAP CHECK
# ============================================================================

def check_overlap(train_start, train_end, test_start, test_end) -> Dict[str, Any]:
    """Check if training and test time ranges overlap."""
    def _to_dt(v):
        if isinstance(v, str):
            return datetime.fromisoformat(v.replace('Z', '+00:00'))
        return v

    ts = _to_dt(train_start)
    te = _to_dt(train_end)
    xs = _to_dt(test_start)
    xe = _to_dt(test_end)

    has_overlap = ts <= xe and xs <= te
    if has_overlap:
        note = f"Training ({ts} - {te}) overlaps with test ({xs} - {xe})"
    else:
        note = None

    return {"has_overlap": has_overlap, "overlap_note": note}


# ============================================================================
# ENGINEERING FEATURES
# ============================================================================

def get_engineered_feature_names(window_sizes: List[int] = None) -> List[str]:
    """Return all possible engineered feature names for the given window sizes."""
    if window_sizes is None:
        window_sizes = [5, 10, 15]

    features: List[str] = []
    features.extend(['dev_sold_flag', 'dev_sold_cumsum'])
    for w in window_sizes:
        features.append(f'dev_sold_spike_{w}')
    for w in window_sizes:
        features.extend([f'buy_pressure_ma_{w}', f'buy_pressure_trend_{w}'])
    features.append('whale_net_volume')
    for w in window_sizes:
        features.append(f'whale_activity_{w}')
    for w in window_sizes:
        features.extend([f'volatility_ma_{w}', f'volatility_spike_{w}'])
    for w in window_sizes:
        features.append(f'wash_trading_flag_{w}')
    for w in window_sizes:
        features.extend([f'net_volume_ma_{w}', f'volume_flip_{w}'])
    for w in window_sizes:
        features.extend([f'price_change_{w}', f'price_roc_{w}'])
    for w in window_sizes:
        features.append(f'mcap_velocity_{w}')
    # ATH features
    for w in window_sizes:
        features.extend([
            f'ath_distance_trend_{w}', f'ath_approach_{w}', f'ath_breakout_count_{w}',
            f'ath_breakout_volume_ma_{w}', f'ath_age_trend_{w}',
        ])
    # ATH non-windowed features
    features.extend(['rolling_ath', 'price_vs_ath_pct', 'ath_breakout', 'minutes_since_ath'])
    # Power features
    features.extend(['buy_sell_ratio', 'whale_dominance'])
    for w in window_sizes:
        features.extend([f'price_acceleration_{w}', f'volume_spike_{w}'])
    return features


def get_flag_feature_names(engineered_features: List[str] = None) -> List[str]:
    """Return flag feature names (``<feature>_has_data``) for all engineered features."""
    if engineered_features is None:
        engineered_features = get_engineered_feature_names()
    return [f'{f}_has_data' for f in engineered_features]


def add_pump_detection_features(
    data: pd.DataFrame,
    window_sizes: List[int] = None,
    include_flags: bool = True,
) -> pd.DataFrame:
    """Add all pump-detection engineering features to the DataFrame."""
    if window_sizes is None:
        window_sizes = [5, 10, 15]

    if len(data) == 0:
        return data

    df = data.copy()

    # Coin-age calculation for flags
    if 'mint' in df.columns and 'timestamp' in df.columns:
        df = df.sort_values(['mint', 'timestamp']).reset_index(drop=True)
        df['coin_age_minutes'] = df.groupby('mint')['timestamp'].transform(
            lambda x: (x - x.min()).dt.total_seconds() / 60
        )
    elif 'timestamp' in df.columns:
        df = df.sort_values('timestamp').reset_index(drop=True)
        df['coin_age_minutes'] = df.groupby(df.index).cumcount()
    else:
        df['coin_age_minutes'] = df.groupby(df.index).cumcount()

    # Helper: whether to use per-coin groupby (prevents cross-coin feature leakage)
    has_mint = 'mint' in df.columns

    # --- 1. DEV-SOLD ---
    if 'dev_sold_amount' in df.columns:
        df['dev_sold_flag'] = (df['dev_sold_amount'] > 0).astype(int)
        if has_mint:
            df['dev_sold_cumsum'] = df.groupby('mint')['dev_sold_amount'].cumsum()
        else:
            df['dev_sold_cumsum'] = df['dev_sold_amount'].cumsum()
        for w in window_sizes:
            if has_mint:
                rolling_mean = df.groupby('mint')['dev_sold_amount'].transform(lambda x: x.rolling(w).mean())
            else:
                rolling_mean = df['dev_sold_amount'].rolling(w).mean()
            df[f'dev_sold_spike_{w}'] = (df['dev_sold_amount'] > rolling_mean * 2).astype(int).fillna(0)
            if include_flags:
                df[f'dev_sold_spike_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)

    # --- 2. BUY PRESSURE ---
    if 'buy_pressure_ratio' in df.columns:
        for w in window_sizes:
            if has_mint:
                df[f'buy_pressure_ma_{w}'] = df.groupby('mint')['buy_pressure_ratio'].transform(lambda x: x.rolling(w).mean()).fillna(0)
            else:
                df[f'buy_pressure_ma_{w}'] = df['buy_pressure_ratio'].rolling(w).mean().fillna(0)
            df[f'buy_pressure_trend_{w}'] = (df['buy_pressure_ratio'] - df[f'buy_pressure_ma_{w}']).fillna(0)
            if include_flags:
                df[f'buy_pressure_ma_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)
                df[f'buy_pressure_trend_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)

    # --- 3. WHALE ACTIVITY ---
    if 'whale_buy_volume_sol' in df.columns and 'whale_sell_volume_sol' in df.columns:
        df['whale_net_volume'] = df['whale_buy_volume_sol'] - df['whale_sell_volume_sol']
        for w in window_sizes:
            if has_mint:
                whale_buy_sum = df.groupby('mint')['whale_buy_volume_sol'].transform(lambda x: x.rolling(w).sum())
                whale_sell_sum = df.groupby('mint')['whale_sell_volume_sol'].transform(lambda x: x.rolling(w).sum())
            else:
                whale_buy_sum = df['whale_buy_volume_sol'].rolling(w).sum()
                whale_sell_sum = df['whale_sell_volume_sol'].rolling(w).sum()
            df[f'whale_activity_{w}'] = (whale_buy_sum + whale_sell_sum).fillna(0)
            if include_flags:
                df[f'whale_activity_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)

    # --- 4. VOLATILITY ---
    if 'volatility_pct' in df.columns:
        for w in window_sizes:
            if has_mint:
                df[f'volatility_ma_{w}'] = df.groupby('mint')['volatility_pct'].transform(lambda x: x.rolling(w).mean()).fillna(0)
            else:
                df[f'volatility_ma_{w}'] = df['volatility_pct'].rolling(w).mean().fillna(0)
            df[f'volatility_spike_{w}'] = (
                df['volatility_pct'] > df[f'volatility_ma_{w}'] * 1.5
            ).astype(int).fillna(0)
            if include_flags:
                df[f'volatility_ma_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)
                df[f'volatility_spike_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)

    # --- 5. WASH TRADING ---
    if 'unique_signer_ratio' in df.columns:
        for w in window_sizes:
            if has_mint:
                rolling_mean = df.groupby('mint')['unique_signer_ratio'].transform(lambda x: x.rolling(w).mean())
            else:
                rolling_mean = df['unique_signer_ratio'].rolling(w).mean()
            df[f'wash_trading_flag_{w}'] = (rolling_mean < 0.3).astype(int).fillna(0)
            if include_flags:
                df[f'wash_trading_flag_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)

    # --- 6. VOLUME PATTERNS ---
    if 'net_volume_sol' in df.columns:
        for w in window_sizes:
            if has_mint:
                df[f'net_volume_ma_{w}'] = df.groupby('mint')['net_volume_sol'].transform(lambda x: x.rolling(w).mean()).fillna(0)
                shifted = df.groupby('mint')['net_volume_sol'].transform(lambda x: x.shift(w))
            else:
                df[f'net_volume_ma_{w}'] = df['net_volume_sol'].rolling(w).mean().fillna(0)
                shifted = df['net_volume_sol'].shift(w)
            df[f'volume_flip_{w}'] = (
                np.sign(df['net_volume_sol']) != np.sign(shifted)
            ).astype(int).fillna(0)
            if include_flags:
                df[f'net_volume_ma_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)
                df[f'volume_flip_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)

    # --- 7. PRICE MOMENTUM ---
    if 'price_close' in df.columns:
        for w in window_sizes:
            if has_mint:
                df[f'price_change_{w}'] = df.groupby('mint')['price_close'].transform(lambda x: x.diff(w)).fillna(0)
                shifted = df.groupby('mint')['price_close'].transform(lambda x: x.shift(w))
            else:
                df[f'price_change_{w}'] = df['price_close'].diff(w).fillna(0)
                shifted = df['price_close'].shift(w)
            df[f'price_roc_{w}'] = np.where(shifted != 0, (df['price_close'] - shifted) / shifted * 100, 0.0)
            if include_flags:
                df[f'price_change_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)
                df[f'price_roc_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)

    # --- 8. MARKET CAP VELOCITY ---
    if 'market_cap_close' in df.columns:
        for w in window_sizes:
            if has_mint:
                df[f'mcap_velocity_{w}'] = df.groupby('mint')['market_cap_close'].transform(lambda x: x.diff(w)).fillna(0)
            else:
                df[f'mcap_velocity_{w}'] = df['market_cap_close'].diff(w).fillna(0)
            if include_flags:
                df[f'mcap_velocity_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)

    # --- 9. ATH FEATURES ---
    if 'price_close' in df.columns:
        if 'mint' in df.columns:
            df = df.sort_values(['mint', 'timestamp']).reset_index(drop=True)
            df['rolling_ath'] = df.groupby('mint')['price_close'].transform(lambda x: x.expanding().max())
        else:
            df['rolling_ath'] = df['price_close'].expanding().max()

        df['price_vs_ath_pct'] = ((df['price_close'] - df['rolling_ath']) / df['rolling_ath'] * 100).fillna(0)
        df['ath_breakout'] = (df['price_close'] >= df['rolling_ath'] * 0.999).astype(int)

        df['minutes_since_ath'] = 0.0
        if 'mint' in df.columns and 'timestamp' in df.columns:
            for mint_val in df['mint'].unique():
                mask = df['mint'] == mint_val
                prices = df.loc[mask, 'price_close'].values
                ath_vals = df.loc[mask, 'rolling_ath'].values
                timestamps = df.loc[mask, 'timestamp'].values
                minutes_since = []
                last_ath_time = timestamps[0]
                for i in range(len(prices)):
                    if prices[i] >= ath_vals[i] * 0.999:
                        last_ath_time = timestamps[i]
                    delta = (timestamps[i] - last_ath_time) / np.timedelta64(1, 'm')
                    minutes_since.append(float(delta))
                df.loc[mask, 'minutes_since_ath'] = minutes_since

        for w in window_sizes:
            if has_mint:
                df[f'ath_distance_trend_{w}'] = df.groupby('mint')['price_vs_ath_pct'].transform(lambda x: x.diff(w)).fillna(0)
            else:
                df[f'ath_distance_trend_{w}'] = df['price_vs_ath_pct'].diff(w).fillna(0)
            df[f'ath_approach_{w}'] = (df[f'ath_distance_trend_{w}'] > 0).astype(int)
            if has_mint:
                df[f'ath_breakout_count_{w}'] = df.groupby('mint')['ath_breakout'].transform(lambda x: x.rolling(w).sum()).fillna(0)
            else:
                df[f'ath_breakout_count_{w}'] = df['ath_breakout'].rolling(w).sum().fillna(0)
            if 'volume_sol' in df.columns:
                bv = df['volume_sol'] * df['ath_breakout']
                if has_mint:
                    df[f'ath_breakout_volume_ma_{w}'] = bv.groupby(df['mint']).transform(lambda x: x.rolling(w).mean()).fillna(0)
                else:
                    df[f'ath_breakout_volume_ma_{w}'] = bv.rolling(w).mean().fillna(0)
            if has_mint:
                df[f'ath_age_trend_{w}'] = df.groupby('mint')['minutes_since_ath'].transform(lambda x: x.diff(w)).fillna(0)
            else:
                df[f'ath_age_trend_{w}'] = df['minutes_since_ath'].diff(w).fillna(0)
            if include_flags:
                df[f'ath_distance_trend_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)
                df[f'ath_approach_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)
                df[f'ath_breakout_count_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)
                if 'volume_sol' in df.columns:
                    df[f'ath_breakout_volume_ma_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)
                df[f'ath_age_trend_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)

        df = df.drop(columns=['ath_timestamp'], errors='ignore')

    # --- 10. POWER FEATURES ---
    if 'num_buys' in df.columns and 'num_sells' in df.columns:
        df['buy_sell_ratio'] = (df['num_buys'] / (df['num_sells'] + 1)).fillna(1)
    if 'whale_buy_volume_sol' in df.columns and 'volume_sol' in df.columns:
        df['whale_dominance'] = (
            (df['whale_buy_volume_sol'] + df.get('whale_sell_volume_sol', 0)) / (df['volume_sol'] + 0.001)
        ).fillna(0)
    if 'price_close' in df.columns:
        for w in window_sizes:
            if has_mint:
                pc = df.groupby('mint')['price_close'].transform(lambda x: x.diff(w))
                df[f'price_acceleration_{w}'] = pc.groupby(df['mint']).transform(lambda x: x.diff(w)).fillna(0)
            else:
                pc = df['price_close'].diff(w)
                df[f'price_acceleration_{w}'] = pc.diff(w).fillna(0)
            if include_flags:
                df[f'price_acceleration_{w}_has_data'] = (df['coin_age_minutes'] >= w).astype(int)
    if 'volume_sol' in df.columns:
        for w in window_sizes:
            if has_mint:
                vol_ma = df.groupby('mint')['volume_sol'].transform(lambda x: x.rolling(w * 2).mean())
            else:
                vol_ma = df['volume_sol'].rolling(w * 2).mean()
            df[f'volume_spike_{w}'] = (df['volume_sol'] > vol_ma * 2).astype(int).fillna(0)
            if include_flags:
                df[f'volume_spike_{w}_has_data'] = (df['coin_age_minutes'] >= w * 2).astype(int)

    df = df.drop(columns=['coin_age_minutes'], errors='ignore')

    logger.info("Engineering features generated: %d columns total", len(df.columns))
    if include_flags:
        flag_count = sum(1 for col in df.columns if col.endswith('_has_data'))
        logger.info("Flag features: %d", flag_count)

    return df


# Alias
create_pump_detection_features = add_pump_detection_features


# ============================================================================
# VALIDATION
# ============================================================================

def validate_critical_features(features: list) -> dict:
    """Check if critical features are present."""
    critical = [
        'dev_sold_amount', 'buy_pressure_ratio', 'unique_signer_ratio',
        'whale_buy_volume_sol', 'whale_sell_volume_sol', 'volatility_pct', 'avg_trade_size_sol',
    ]
    return {f: f in features for f in critical}


async def validate_ath_data_availability(train_start, train_end) -> Dict[str, Any]:
    """Check if ATH data is available for the time range."""
    pool = get_pool()
    train_start = _ensure_utc(train_start)
    train_end = _ensure_utc(train_end)
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(DISTINCT mint) as total_coins,
                    COUNT(DISTINCT CASE WHEN price_close IS NOT NULL THEN mint END) as coins_with_data
                FROM coin_metrics
                WHERE timestamp >= $1 AND timestamp <= $2
                """,
                train_start, train_end,
            )
        if not row:
            return {"available": False, "coins_with_ath": 0, "coins_without_ath": 0}
        return {
            "available": row['coins_with_data'] > 0,
            "coins_with_ath": row['coins_with_data'] or 0,
            "coins_without_ath": (row['total_coins'] or 0) - (row['coins_with_data'] or 0),
        }
    except Exception as e:
        logger.error("Error checking ATH availability: %s", e)
        return {"available": False, "coins_with_ath": 0, "coins_without_ath": 0}
