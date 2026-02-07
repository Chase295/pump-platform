"""
Find module -- Token discovery and metrics tracking.

This module connects to pumpportal.fun via WebSocket, discovers new tokens,
tracks their trades, and flushes OHLCV metrics to the database.

Public API:
    - ``router``       -- FastAPI APIRouter (mount at /api/find)
    - ``CoinStreamer``  -- Background WebSocket streaming client
    - ``set_streamer``  -- Register the streamer instance with the router
"""

from backend.modules.find.router import router, set_streamer
from backend.modules.find.streamer import CoinStreamer

__all__ = [
    "router",
    "set_streamer",
    "CoinStreamer",
]
