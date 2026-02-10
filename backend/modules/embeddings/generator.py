"""
Embedding generation strategies.

Supports multiple strategies through a registry pattern:
  - handcrafted_v1: Direct 128-feature vector (deterministic, no training)
  - pca_v1: PCA reduction from high-dim space (future)
  - autoencoder_v1: Neural network compression (future)
"""

import hashlib
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Dict, List, Optional

import numpy as np

from backend.modules.embeddings.features import extract_window_features, extract_batch_features

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Normalizer strategies
# ---------------------------------------------------------------------------

class BaseNormalizer(ABC):
    """Base class for feature normalization."""

    def __init__(self):
        self.fitted = False
        self.params: dict = {}

    @abstractmethod
    def fit(self, data: np.ndarray) -> None:
        """Fit normalizer on a batch of feature vectors."""

    @abstractmethod
    def transform(self, vector: np.ndarray) -> np.ndarray:
        """Normalize a single feature vector."""

    def fit_transform(self, data: np.ndarray) -> np.ndarray:
        self.fit(data)
        return np.array([self.transform(row) for row in data])

    def to_dict(self) -> dict:
        return {"type": self.__class__.__name__, "fitted": self.fitted, "params": self.params}

    @classmethod
    def from_dict(cls, d: dict) -> "BaseNormalizer":
        """Restore normalizer from serialized params."""
        norm = cls()
        norm.fitted = d.get("fitted", False)
        norm.params = d.get("params", {})
        return norm


class MinMaxNormalizer(BaseNormalizer):
    """Scale features to [0, 1] range."""

    def fit(self, data: np.ndarray) -> None:
        self.params["min"] = data.min(axis=0).tolist()
        self.params["max"] = data.max(axis=0).tolist()
        self.fitted = True

    def transform(self, vector: np.ndarray) -> np.ndarray:
        if not self.fitted:
            return vector
        mins = np.array(self.params["min"])
        maxs = np.array(self.params["max"])
        denom = maxs - mins
        denom[denom < 1e-9] = 1.0
        return np.clip((vector - mins) / denom, 0.0, 1.0)


class ZScoreNormalizer(BaseNormalizer):
    """Standardize to mean=0, std=1."""

    def fit(self, data: np.ndarray) -> None:
        self.params["mean"] = data.mean(axis=0).tolist()
        self.params["std"] = data.std(axis=0).tolist()
        self.fitted = True

    def transform(self, vector: np.ndarray) -> np.ndarray:
        if not self.fitted:
            return vector
        mean = np.array(self.params["mean"])
        std = np.array(self.params["std"])
        std[std < 1e-9] = 1.0
        return (vector - mean) / std


class RobustNormalizer(BaseNormalizer):
    """Median-based normalization, outlier resistant."""

    def fit(self, data: np.ndarray) -> None:
        self.params["median"] = np.median(data, axis=0).tolist()
        q25 = np.percentile(data, 25, axis=0)
        q75 = np.percentile(data, 75, axis=0)
        self.params["iqr"] = (q75 - q25).tolist()
        self.fitted = True

    def transform(self, vector: np.ndarray) -> np.ndarray:
        if not self.fitted:
            return vector
        median = np.array(self.params["median"])
        iqr = np.array(self.params["iqr"])
        iqr[iqr < 1e-9] = 1.0
        return (vector - median) / iqr


class IdentityNormalizer(BaseNormalizer):
    """No normalization (pass-through)."""

    def fit(self, data: np.ndarray) -> None:
        self.fitted = True

    def transform(self, vector: np.ndarray) -> np.ndarray:
        return vector


NORMALIZER_REGISTRY = {
    "minmax": MinMaxNormalizer,
    "zscore": ZScoreNormalizer,
    "robust": RobustNormalizer,
    "none": IdentityNormalizer,
}


def create_normalizer(strategy: str) -> BaseNormalizer:
    """Create a normalizer by name."""
    cls = NORMALIZER_REGISTRY.get(strategy)
    if cls is None:
        raise ValueError(f"Unknown normalizer: {strategy}. Options: {list(NORMALIZER_REGISTRY.keys())}")
    return cls()


# ---------------------------------------------------------------------------
# Generator base class
# ---------------------------------------------------------------------------

class BaseGenerator(ABC):
    """Base class for embedding generators."""

    STRATEGY: str = ""
    DIMENSIONS: int = 128

    def __init__(self, config: dict):
        self.config = config
        norm_name = config.get("normalization", "minmax")
        self.normalizer = create_normalizer(norm_name)

        # Restore normalizer params if stored in config metadata
        metadata = config.get("metadata") or {}
        if isinstance(metadata, str):
            import json
            metadata = json.loads(metadata)
        normalizer_params = metadata.get("normalizer_params")
        if normalizer_params:
            self.normalizer = self.normalizer.__class__.from_dict(normalizer_params)

    @abstractmethod
    async def generate(
        self,
        mint: str,
        window_start: datetime,
        window_end: datetime,
    ) -> Optional[np.ndarray]:
        """Generate a single embedding. Returns None if insufficient data."""

    async def generate_batch(
        self,
        mints: List[str],
        window_start: datetime,
        window_end: datetime,
    ) -> Dict[str, np.ndarray]:
        """Generate embeddings for multiple mints."""
        results = {}
        for mint in mints:
            try:
                vec = await self.generate(mint, window_start, window_end)
                if vec is not None:
                    results[mint] = vec
            except Exception as e:
                logger.warning("Generation failed for %s: %s", mint, e)
        return results

    def feature_hash(self, vector: np.ndarray) -> str:
        """SHA-256 hash of the feature vector for dedup/reproducibility."""
        return hashlib.sha256(vector.tobytes()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Handcrafted v1 Generator
# ---------------------------------------------------------------------------

class HandcraftedV1Generator(BaseGenerator):
    """
    Direct 128-feature vector.
    Each dimension is a known, interpretable feature.
    No training required. Deterministic output.
    """

    STRATEGY = "handcrafted_v1"
    DIMENSIONS = 128

    # Track data for normalizer fitting
    _fit_buffer: List[np.ndarray] = []
    _fit_target: int = 1000  # Fit normalizer after this many samples

    async def generate(
        self,
        mint: str,
        window_start: datetime,
        window_end: datetime,
    ) -> Optional[np.ndarray]:
        min_snapshots = self.config.get("min_snapshots", 3)
        raw = await extract_window_features(mint, window_start, window_end, min_snapshots)
        if raw is None:
            return None

        # Collect samples for normalizer fitting
        if not self.normalizer.fitted:
            self._fit_buffer.append(raw)
            if len(self._fit_buffer) >= self._fit_target:
                batch = np.array(self._fit_buffer)
                self.normalizer.fit(batch)
                logger.info(
                    "Normalizer fitted on %d samples for config %s",
                    len(self._fit_buffer), self.config.get("name", "?"),
                )
                self._fit_buffer.clear()
            # Return raw (unnormalized) until fitted
            return raw

        return self.normalizer.transform(raw)

    async def generate_batch(
        self,
        mints: List[str],
        window_start: datetime,
        window_end: datetime,
    ) -> Dict[str, np.ndarray]:
        min_snapshots = self.config.get("min_snapshots", 3)
        raw_features = await extract_batch_features(mints, window_start, window_end, min_snapshots)

        if not raw_features:
            return {}

        # Collect for normalizer fitting
        if not self.normalizer.fitted:
            for vec in raw_features.values():
                self._fit_buffer.append(vec)
            if len(self._fit_buffer) >= self._fit_target:
                batch = np.array(self._fit_buffer)
                self.normalizer.fit(batch)
                logger.info(
                    "Normalizer fitted on %d samples for config %s",
                    len(self._fit_buffer), self.config.get("name", "?"),
                )
                self._fit_buffer.clear()
            return raw_features

        return {
            mint: self.normalizer.transform(vec)
            for mint, vec in raw_features.items()
        }


# ---------------------------------------------------------------------------
# Generator Registry
# ---------------------------------------------------------------------------

GENERATOR_REGISTRY: Dict[str, type] = {
    "handcrafted_v1": HandcraftedV1Generator,
    # Future:
    # "pca_v1": PCAGenerator,
    # "autoencoder_v1": AutoencoderGenerator,
}


def create_generator(strategy: str, config: dict) -> BaseGenerator:
    """Create a generator by strategy name."""
    cls = GENERATOR_REGISTRY.get(strategy)
    if cls is None:
        raise ValueError(f"Unknown strategy: {strategy}. Options: {list(GENERATOR_REGISTRY.keys())}")
    return cls(config)
