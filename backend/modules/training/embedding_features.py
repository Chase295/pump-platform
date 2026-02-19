"""
Embedding Features for ML Training.

Computes similarity-based features using pgvector embeddings for use
in the training pipeline.

Supports temporal filtering: when cutoff timestamps are provided,
only embeddings created at or before the cutoff are considered to
prevent data leakage during backtests.
"""

import logging
from typing import List, Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Feature names exported by this module
EMBEDDING_FEATURE_NAMES = [
    "similarity_to_pumps",
    "similarity_to_rugs",
    "max_pump_similarity",
    "max_rug_similarity",
    "nearest_pattern_label",
    "nearest_pattern_similarity",
]


async def compute_embedding_features(
    mints: List[str],
    timestamps: Optional[Dict[str, datetime]] = None,
) -> Dict[str, Dict[str, float]]:
    """Compute embedding similarity features for a list of mints.

    Uses pgvector to find similarity to labeled pump/rug patterns.

    Args:
        mints: List of mint addresses.
        timestamps: Optional {mint: cutoff_timestamp} for time filtering.
                    When provided, only embeddings created at or before the
                    cutoff are used for similarity search and label lookup.

    Returns {mint: {feature_name: value}}.
    Falls back to zeros if embeddings are unavailable.
    """
    result: Dict[str, Dict[str, float]] = {}
    default_features = {name: 0.0 for name in EMBEDDING_FEATURE_NAMES}

    # Determine global cutoff: use the earliest cutoff across all mints
    # so that reference pattern lookup (pump/rug labels) is also filtered.
    global_cutoff: Optional[datetime] = None
    if timestamps:
        cutoff_values = [v for v in timestamps.values() if v is not None]
        if cutoff_values:
            global_cutoff = max(cutoff_values)
            logger.debug("Embedding features: using temporal cutoff %s", global_cutoff)

    try:
        from backend.modules.embeddings.similarity import search_similar_to_mint, search_by_label, search_similar
        from backend.modules.embeddings import db_queries as emb_db

        # Get reference pump and rug patterns (filtered by cutoff if available)
        pump_patterns = await _search_by_label_filtered("pump", global_cutoff, k=10)
        rug_patterns = await _search_by_label_filtered("rug", global_cutoff, k=10)

        if not pump_patterns and not rug_patterns:
            logger.warning("No labeled patterns found -- embedding features will be zero")
            return {mint: dict(default_features) for mint in mints}

        for mint in mints:
            feats = dict(default_features)
            try:
                # Determine per-mint cutoff
                mint_cutoff = timestamps.get(mint) if timestamps else None

                # Get embedding for this mint, then search similar with cutoff
                similar = await search_similar_to_mint(
                    mint, k=20, created_before=mint_cutoff,
                )
                if not similar:
                    result[mint] = feats
                    continue

                # Calculate similarities to pump/rug patterns
                pump_sims = []
                rug_sims = []
                best_sim = 0.0
                best_label = 0  # 0=flat, 1=pump, -1=rug

                for s in similar:
                    sim_score = s.get("similarity", 0)
                    label = s.get("label", "")

                    if label == "pump":
                        pump_sims.append(sim_score)
                        if sim_score > best_sim:
                            best_sim = sim_score
                            best_label = 1
                    elif label == "rug":
                        rug_sims.append(sim_score)
                        if sim_score > best_sim:
                            best_sim = sim_score
                            best_label = -1
                    elif sim_score > best_sim:
                        best_sim = sim_score
                        best_label = 0

                feats["similarity_to_pumps"] = sum(pump_sims) / len(pump_sims) if pump_sims else 0.0
                feats["similarity_to_rugs"] = sum(rug_sims) / len(rug_sims) if rug_sims else 0.0
                feats["max_pump_similarity"] = max(pump_sims) if pump_sims else 0.0
                feats["max_rug_similarity"] = max(rug_sims) if rug_sims else 0.0
                feats["nearest_pattern_label"] = float(best_label)
                feats["nearest_pattern_similarity"] = best_sim

            except Exception as e:
                logger.debug("Embedding features failed for mint %s: %s", mint[:8], e)

            result[mint] = feats

        logger.info("Embedding features computed for %d mints (temporal_filter=%s)", len(result), global_cutoff is not None)
        return result

    except ImportError:
        logger.warning("Embedding module not available -- embedding features will be zero")
        return {mint: dict(default_features) for mint in mints}
    except Exception as e:
        logger.warning("Embedding features computation failed: %s", e)
        return {mint: dict(default_features) for mint in mints}


async def _search_by_label_filtered(
    label: str,
    cutoff: Optional[datetime],
    k: int = 10,
) -> List[Dict]:
    """Search for labeled embeddings, optionally filtered by created_at cutoff."""
    from backend.database import fetch

    conditions = ["label = $1"]
    params: list = [label]
    idx = 1

    if cutoff is not None:
        idx += 1
        conditions.append(f"created_at <= ${idx}")
        params.append(cutoff)

    idx += 1
    params.append(k)

    rows = await fetch(
        f"""
        SELECT id, mint, window_start, window_end, phase_id_at_time, label,
               strategy, created_at
        FROM coin_pattern_embeddings
        WHERE {" AND ".join(conditions)}
        ORDER BY created_at DESC
        LIMIT ${idx}
        """,
        *params,
    )
    return [dict(r) for r in rows]
