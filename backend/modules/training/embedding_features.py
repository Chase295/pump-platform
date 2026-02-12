"""
Embedding Features for ML Training.

Computes similarity-based features using pgvector embeddings for use
in the training pipeline.
"""

import logging
from typing import List, Dict

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


async def compute_embedding_features(mints: List[str]) -> Dict[str, Dict[str, float]]:
    """Compute embedding similarity features for a list of mints.

    Uses pgvector to find similarity to labeled pump/rug patterns.
    Returns {mint: {feature_name: value}}.
    Falls back to zeros if embeddings are unavailable.
    """
    result: Dict[str, Dict[str, float]] = {}
    default_features = {name: 0.0 for name in EMBEDDING_FEATURE_NAMES}

    try:
        from backend.modules.embeddings.similarity import search_similar_to_mint, search_by_label

        # Get reference pump and rug patterns
        pump_patterns = await search_by_label("pump", k=10)
        rug_patterns = await search_by_label("rug", k=10)

        if not pump_patterns and not rug_patterns:
            logger.warning("No labeled patterns found -- embedding features will be zero")
            return {mint: dict(default_features) for mint in mints}

        for mint in mints:
            feats = dict(default_features)
            try:
                similar = await search_similar_to_mint(mint, k=20)
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

        logger.info("Embedding features computed for %d mints", len(result))
        return result

    except ImportError:
        logger.warning("Embedding module not available -- embedding features will be zero")
        return {mint: dict(default_features) for mint in mints}
    except Exception as e:
        logger.warning("Embedding features computation failed: %s", e)
        return {mint: dict(default_features) for mint in mints}
