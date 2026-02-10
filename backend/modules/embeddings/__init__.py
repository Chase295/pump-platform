"""
Embeddings module -- Vector embedding generation and similarity search.

Transforms coin trading patterns into 128-dim vectors stored in
coin_pattern_embeddings, enabling pgvector similarity search and
Neo4j SIMILAR_TO relationship creation.

Public API:
    - ``router``            -- FastAPI APIRouter (mount at /api/embeddings)
    - ``EmbeddingService``  -- Background embedding generator
    - ``start_embedding_service`` / ``stop_embedding_service``
"""

from backend.modules.embeddings.router import router
from backend.modules.embeddings.service import (
    EmbeddingService,
    start_embedding_service,
    stop_embedding_service,
    get_embedding_service,
)

__all__ = [
    "router",
    "EmbeddingService",
    "start_embedding_service",
    "stop_embedding_service",
    "get_embedding_service",
]
