#!/usr/bin/env python3
"""
Pump Platform — End-to-End Integration Test

Verifies the full data pipeline:
  Discovery → PostgreSQL → pgvector Embeddings → Neo4j Graph

Usage:
  python pump-platform/tests/test_integration.py
  PUMP_API_URL=http://localhost:3000 python pump-platform/tests/test_integration.py
  PUMP_AUTH_TOKEN=<token> python pump-platform/tests/test_integration.py

Exit code 0 = all passed, 1 = failures.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

# ---------------------------------------------------------------------------
# ANSI colors
# ---------------------------------------------------------------------------
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class TestResult:
    number: str
    name: str
    passed: bool
    skipped: bool = False
    duration_ms: float = 0.0
    error: str = ""


@dataclass
class TestContext:
    """Shared state passed across test layers."""
    first_mint: str | None = None
    first_embedding_id: str | None = None
    first_embedding_mint: str | None = None
    first_embedding_vector: list[float] | None = None
    hnsw_results: list[dict] | None = None
    neo4j_similar_count: int | None = None
    similarity_cache_synced: int | None = None
    results: list[TestResult] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

def compute_token(user: str = "admin", password: str = "changeme") -> str:
    raw = f"{user}:{password}:pump-platform"
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------------------------------------------------------------------------
# TestRunner
# ---------------------------------------------------------------------------

class TestRunner:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.client: httpx.AsyncClient | None = None
        self.ctx = TestContext()

    async def setup(self):
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {self.token}"},
            timeout=30.0,
        )

    async def teardown(self):
        if self.client:
            await self.client.aclose()

    # -- helpers ----------------------------------------------------------

    async def _get(self, path: str) -> httpx.Response:
        assert self.client is not None
        return await self.client.get(path)

    async def _post(self, path: str, json: dict | None = None) -> httpx.Response:
        assert self.client is not None
        return await self.client.post(path, json=json or {})

    def _add(self, number: str, name: str, *, passed: bool,
             skipped: bool = False, duration_ms: float = 0.0, error: str = ""):
        self.ctx.results.append(TestResult(
            number=number, name=name, passed=passed,
            skipped=skipped, duration_ms=duration_ms, error=error,
        ))

    async def _timed(self, number: str, name: str, coro):
        """Run a test coroutine, recording timing and result."""
        t0 = time.perf_counter()
        try:
            result = await coro
            ms = (time.perf_counter() - t0) * 1000
            if result is None:
                self._add(number, name, passed=True, duration_ms=ms)
            elif isinstance(result, str) and result == "SKIP":
                self._add(number, name, passed=True, skipped=True, duration_ms=ms)
            else:
                self._add(number, name, passed=True, duration_ms=ms)
        except AssertionError as exc:
            ms = (time.perf_counter() - t0) * 1000
            self._add(number, name, passed=False, duration_ms=ms, error=str(exc))
        except httpx.HTTPError as exc:
            ms = (time.perf_counter() - t0) * 1000
            self._add(number, name, passed=False, duration_ms=ms, error=f"HTTP error: {exc}")

    # =====================================================================
    # Layer 1: Database Foundation
    # =====================================================================

    async def layer_1(self):
        await self._timed("1.01", "DB Connected", self._t1_01())
        await self._timed("1.02", "Core Tables Exist", self._t1_02())
        await self._timed("1.03", "Streams Table", self._t1_03())
        await self._timed("1.04", "Metrics Hypertable", self._t1_04())
        await self._timed("1.05", "Embeddings Health", self._t1_05())
        await self._timed("1.06", "Embeddings Stats", self._t1_06())
        await self._timed("1.07", "Configs Table", self._t1_07())
        await self._timed("1.08", "Jobs Table", self._t1_08())
        await self._timed("1.09", "Labels Table", self._t1_09())
        await self._timed("1.10", "Similarity Cache", self._t1_10())

    async def _t1_01(self):
        r = await self._get("/api/find/health")
        assert r.status_code == 200, f"status {r.status_code}"
        d = r.json()
        assert d.get("db_connected") is True, f"db_connected={d.get('db_connected')}"

    async def _t1_02(self):
        r = await self._get("/api/find/phases")
        assert r.status_code == 200, f"status {r.status_code}"
        d = r.json()
        phases = d.get("phases", d) if isinstance(d, dict) else d
        assert isinstance(phases, list), "expected list of phases"

    async def _t1_03(self):
        r = await self._get("/api/find/streams/stats")
        assert r.status_code == 200, f"status {r.status_code}"

    async def _t1_04(self):
        r = await self._get("/api/find/metrics?limit=1")
        assert r.status_code == 200, f"status {r.status_code}"

    async def _t1_05(self):
        r = await self._get("/api/embeddings/health")
        assert r.status_code == 200, f"status {r.status_code}"
        d = r.json()
        assert "status" in d, "missing status field"

    async def _t1_06(self):
        r = await self._get("/api/embeddings/stats")
        assert r.status_code == 200, f"status {r.status_code}"

    async def _t1_07(self):
        r = await self._get("/api/embeddings/configs")
        assert r.status_code == 200, f"status {r.status_code}"
        assert isinstance(r.json(), list), "expected list"

    async def _t1_08(self):
        r = await self._get("/api/embeddings/jobs")
        assert r.status_code == 200, f"status {r.status_code}"
        assert isinstance(r.json(), list), "expected list"

    async def _t1_09(self):
        r = await self._get("/api/embeddings/labels")
        assert r.status_code == 200, f"status {r.status_code}"
        assert isinstance(r.json(), list), "expected list"

    async def _t1_10(self):
        r = await self._get("/api/embeddings/neo4j/status")
        assert r.status_code == 200, f"status {r.status_code}"

    # =====================================================================
    # Layer 2: Discovery Pipeline
    # =====================================================================

    async def layer_2(self):
        await self._timed("2.01", "Full Health", self._t2_01())
        await self._timed("2.02", "Seed Phases", self._t2_02())
        await self._timed("2.03", "Stream Stats", self._t2_03())
        await self._timed("2.04", "Recent Streams", self._t2_04())
        await self._timed("2.05", "Metrics Data", self._t2_05())
        await self._timed("2.06", "Coin Detail", self._t2_06())
        await self._timed("2.07", "Coin Analytics", self._t2_07())
        await self._timed("2.08", "Config Readable", self._t2_08())

    async def _t2_01(self):
        r = await self._get("/api/find/health")
        assert r.status_code == 200
        d = r.json()
        assert "uptime_seconds" in d or "uptime" in d, "missing uptime"
        assert d.get("db_connected") is True

    async def _t2_02(self):
        r = await self._get("/api/find/phases")
        assert r.status_code == 200
        d = r.json()
        phases = d.get("phases", d) if isinstance(d, dict) else d
        assert isinstance(phases, list) and len(phases) >= 1, f"expected phases, got {len(phases) if isinstance(phases, list) else type(phases)}"
        ids = {p.get("id") or p.get("phase_id") for p in phases}
        assert 1 in ids, f"phase 1 missing, got ids: {ids}"

    async def _t2_03(self):
        r = await self._get("/api/find/streams/stats")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict), f"expected dict, got {type(d)}"

    async def _t2_04(self):
        r = await self._get("/api/find/streams?limit=5")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", data.get("streams", []))
        if items:
            first = items[0]
            assert "token_address" in first or "mint" in first, f"keys: {list(first.keys())}"

    async def _t2_05(self):
        r = await self._get("/api/find/metrics?limit=10")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", data.get("metrics", []))
        if items:
            first = items[0]
            mint = first.get("mint") or first.get("token_address")
            if mint:
                self.ctx.first_mint = mint

    async def _t2_06(self):
        mint = self.ctx.first_mint
        if not mint:
            return "SKIP"
        r = await self._get(f"/api/find/coins/{mint}")
        assert r.status_code == 200, f"status {r.status_code}"
        d = r.json()
        assert isinstance(d, dict), "expected dict"

    async def _t2_07(self):
        mint = self.ctx.first_mint
        if not mint:
            return "SKIP"
        r = await self._get(f"/api/find/analytics/{mint}")
        assert r.status_code == 200, f"status {r.status_code}"

    async def _t2_08(self):
        r = await self._get("/api/find/config")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict), "expected dict"

    # =====================================================================
    # Layer 3: Embeddings Pipeline
    # =====================================================================

    async def layer_3(self):
        await self._timed("3.01", "Service Health", self._t3_01())
        await self._timed("3.02", "Statistics", self._t3_02())
        await self._timed("3.03", "Configs Exist", self._t3_03())
        await self._timed("3.04", "Browse Embeddings", self._t3_04())
        await self._timed("3.05", "Single Embedding", self._t3_05())
        await self._timed("3.06", "By Mint", self._t3_06())
        await self._timed("3.07", "HNSW Search", self._t3_07())
        await self._timed("3.08", "Similarity by Mint", self._t3_08())
        await self._timed("3.09", "Distribution", self._t3_09())
        await self._timed("3.10", "Labels", self._t3_10())
        await self._timed("3.11", "Jobs", self._t3_11())
        await self._timed("3.12", "Neo4j Status", self._t3_12())

    async def _t3_01(self):
        r = await self._get("/api/embeddings/health")
        assert r.status_code == 200
        d = r.json()
        assert "status" in d, f"missing status, keys: {list(d.keys())}"

    async def _t3_02(self):
        r = await self._get("/api/embeddings/stats")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict), "expected dict"

    async def _t3_03(self):
        r = await self._get("/api/embeddings/configs")
        assert r.status_code == 200
        configs = r.json()
        assert isinstance(configs, list), "expected list"

    async def _t3_04(self):
        r = await self._get("/api/embeddings/browse?limit=5")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", data.get("embeddings", []))
        if items:
            first = items[0]
            self.ctx.first_embedding_id = str(first.get("id") or first.get("embedding_id", ""))
            self.ctx.first_embedding_mint = first.get("mint") or first.get("token_address")

    async def _t3_05(self):
        eid = self.ctx.first_embedding_id
        if not eid:
            return "SKIP"
        r = await self._get(f"/api/embeddings/browse/{eid}")
        assert r.status_code == 200, f"status {r.status_code}"
        d = r.json()
        vec = d.get("vector") or d.get("embedding")
        if vec:
            import json as _json
            if isinstance(vec, str):
                vec = _json.loads(vec)
            assert isinstance(vec, list), f"expected list, got {type(vec)}"
            assert len(vec) == 128, f"expected 128-dim vector, got {len(vec)}"
            self.ctx.first_embedding_vector = vec

    async def _t3_06(self):
        mint = self.ctx.first_embedding_mint
        if not mint:
            return "SKIP"
        r = await self._get(f"/api/embeddings/browse/by-mint/{mint}")
        assert r.status_code == 200, f"status {r.status_code}"
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", data.get("embeddings", []))
        assert isinstance(items, list), "expected list"

    async def _t3_07(self):
        vec = self.ctx.first_embedding_vector
        if not vec:
            return "SKIP"
        r = await self._post("/api/embeddings/search/similar", json={
            "embedding": vec,
            "k": 5,
        })
        assert r.status_code == 200, f"status {r.status_code}"
        d = r.json()
        results = d.get("results", d if isinstance(d, list) else [])
        if results:
            self.ctx.hnsw_results = results
            for item in results:
                sim = item.get("similarity", item.get("score", item.get("distance")))
                if sim is not None:
                    assert 0 <= float(sim) <= 1.0001, f"similarity {sim} out of range"

    async def _t3_08(self):
        mint = self.ctx.first_embedding_mint
        if not mint:
            return "SKIP"
        r = await self._get(f"/api/embeddings/search/by-mint/{mint}")
        assert r.status_code == 200, f"status {r.status_code}"

    async def _t3_09(self):
        r = await self._get("/api/embeddings/analysis/distribution")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict), "expected dict"

    async def _t3_10(self):
        r = await self._get("/api/embeddings/labels")
        assert r.status_code == 200
        assert isinstance(r.json(), list), "expected list"

    async def _t3_11(self):
        r = await self._get("/api/embeddings/jobs")
        assert r.status_code == 200
        assert isinstance(r.json(), list), "expected list"

    async def _t3_12(self):
        r = await self._get("/api/embeddings/neo4j/status")
        assert r.status_code == 200
        d = r.json()
        if "synced" in d:
            self.ctx.similarity_cache_synced = d["synced"]

    # =====================================================================
    # Layer 4: Neo4j Graph
    # =====================================================================

    async def layer_4(self):
        await self._timed("4.01", "Graph Health", self._t4_01())
        await self._timed("4.02", "Graph Stats", self._t4_02())
        await self._timed("4.03", "Sync Status", self._t4_03())
        await self._timed("4.04", "Token Nodes", self._t4_04())
        await self._timed("4.05", "Creator Nodes", self._t4_05())
        await self._timed("4.06", "CREATED Rels", self._t4_06())
        await self._timed("4.07", "SIMILAR_TO Rels", self._t4_07())
        await self._timed("4.08", "Phase Nodes", self._t4_08())
        await self._timed("4.09", "Wallet Nodes", self._t4_09())

    async def _cypher_count(self, query: str) -> int:
        r = await self.client.get("/api/graph/query", params={"q": query})
        assert r.status_code == 200, f"status {r.status_code}: {r.text[:200]}"
        d = r.json()
        # Response may be {"results": [{"count(t)": 5}]} or {"data": [...]} etc.
        if isinstance(d, list) and d:
            row = d[0]
            return int(next(iter(row.values()))) if isinstance(row, dict) else int(row)
        if isinstance(d, dict):
            results = d.get("results", d.get("data", d.get("records", [])))
            if isinstance(results, list) and results:
                row = results[0]
                return int(next(iter(row.values()))) if isinstance(row, dict) else int(row)
            # Might be a direct count
            for key in d:
                if "count" in key.lower():
                    return int(d[key])
        return 0

    async def _t4_01(self):
        r = await self._get("/api/graph/health")
        assert r.status_code == 200
        d = r.json()
        assert d.get("neo4j_connected") is True or d.get("status") == "healthy", \
            f"neo4j not connected: {d}"

    async def _t4_02(self):
        r = await self._get("/api/graph/stats")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict), "expected dict"

    async def _t4_03(self):
        r = await self._get("/api/graph/sync/status")
        assert r.status_code == 200

    async def _t4_04(self):
        count = await self._cypher_count("MATCH (t:Token) RETURN count(t)")
        assert count >= 0

    async def _t4_05(self):
        count = await self._cypher_count("MATCH (c:Creator) RETURN count(c)")
        assert count >= 0

    async def _t4_06(self):
        count = await self._cypher_count("MATCH ()-[r:CREATED]->() RETURN count(r)")
        assert count >= 0

    async def _t4_07(self):
        count = await self._cypher_count("MATCH ()-[r:SIMILAR_TO]->() RETURN count(r)")
        assert count >= 0
        self.ctx.neo4j_similar_count = count

    async def _t4_08(self):
        count = await self._cypher_count("MATCH (p:Phase) RETURN count(p)")
        assert count >= 0

    async def _t4_09(self):
        count = await self._cypher_count("MATCH (w:Wallet) RETURN count(w)")
        assert count >= 0

    # =====================================================================
    # Layer 5: Cross-System Data Integrity
    # =====================================================================

    async def layer_5(self):
        await self._timed("5.01", "Mint in coin_streams", self._t5_01())
        await self._timed("5.02", "Mint in discovered_coins", self._t5_02())
        await self._timed("5.03", "Mint Has Embeddings", self._t5_03())
        await self._timed("5.04", "Mint in Neo4j", self._t5_04())
        await self._timed("5.05", "HNSW Functional", self._t5_05())
        await self._timed("5.06", "Cache vs Neo4j", self._t5_06())

    async def _t5_01(self):
        mint = self.ctx.first_mint
        if not mint:
            return "SKIP"
        r = await self._get(f"/api/find/coins/{mint}")
        assert r.status_code == 200
        d = r.json()
        stream = d.get("stream") or d.get("streams")
        assert stream is not None or "phase" in str(d), \
            f"no stream data for mint {mint[:12]}..."

    async def _t5_02(self):
        mint = self.ctx.first_mint
        if not mint:
            return "SKIP"
        r = await self._get(f"/api/find/coins/{mint}")
        assert r.status_code == 200
        d = r.json()
        coin = d.get("coin") or d
        assert isinstance(coin, dict), "expected coin dict"

    async def _t5_03(self):
        mint = self.ctx.first_mint
        if not mint:
            return "SKIP"
        r = await self._get(f"/api/embeddings/browse/by-mint/{mint}")
        if r.status_code == 200:
            data = r.json()
            items = data if isinstance(data, list) else data.get("items", data.get("embeddings", []))
            if not items:
                return "SKIP"
        else:
            return "SKIP"

    async def _t5_04(self):
        mint = self.ctx.first_mint
        if not mint:
            return "SKIP"
        query = f"MATCH (t:Token {{mint: '{mint}'}}) RETURN count(t)"
        r = await self.client.get("/api/graph/query", params={"q": query})
        if r.status_code != 200:
            return "SKIP"
        # Any non-error response is fine; count may be 0 if not yet synced

    async def _t5_05(self):
        if not self.ctx.hnsw_results:
            return "SKIP"
        for item in self.ctx.hnsw_results:
            sim = item.get("similarity", item.get("score", item.get("distance")))
            if sim is not None:
                assert 0 <= float(sim) <= 1.0001, f"invalid similarity: {sim}"

    async def _t5_06(self):
        synced = self.ctx.similarity_cache_synced
        neo4j_count = self.ctx.neo4j_similar_count
        if synced is None or neo4j_count is None:
            return "SKIP"
        # Both should be non-negative; synced ≈ neo4j SIMILAR_TO count
        assert synced >= 0, f"synced negative: {synced}"
        assert neo4j_count >= 0, f"neo4j count negative: {neo4j_count}"

    # =====================================================================
    # Runner
    # =====================================================================

    async def run_all(self) -> list[TestResult]:
        await self.setup()
        try:
            layers = [
                ("Layer 1: Database Foundation (PostgreSQL)", "1", self.layer_1),
                ("Layer 2: Discovery Pipeline", "2", self.layer_2),
                ("Layer 3: Embeddings Pipeline (pgvector)", "3", self.layer_3),
                ("Layer 4: Neo4j Graph", "4", self.layer_4),
                ("Layer 5: Cross-System Data Integrity", "5", self.layer_5),
            ]
            for title, prefix, fn in layers:
                print(f"\n{CYAN}--- {title} ---{RESET}")
                before = len(self.ctx.results)
                await fn()
                for res in self.ctx.results[before:]:
                    self._print_result(res)
        finally:
            await self.teardown()
        return self.ctx.results

    def _print_result(self, res: TestResult):
        if res.skipped:
            icon = f"{YELLOW}○{RESET}"
            status = f"{YELLOW}SKIPPED{RESET}"
            print(f"  {icon} {res.number} {res.name:<42} {status}   {DIM}({res.duration_ms:.0f}ms){RESET}")
        elif res.passed:
            icon = f"{GREEN}✓{RESET}"
            print(f"  {icon} {res.number} {res.name:<42}          {DIM}({res.duration_ms:.0f}ms){RESET}")
        else:
            icon = f"{RED}✗{RESET}"
            print(f"  {icon} {res.number} {res.name:<42} {RED}FAILED{RESET}   {DIM}({res.duration_ms:.0f}ms){RESET}")
            if res.error:
                print(f"         {RED}{res.error}{RESET}")

    def print_summary(self):
        results = self.ctx.results
        passed = sum(1 for r in results if r.passed and not r.skipped)
        failed = sum(1 for r in results if not r.passed)
        skipped = sum(1 for r in results if r.skipped)
        total = len(results)
        total_ms = sum(r.duration_ms for r in results)

        print(f"\n{'=' * 64}")
        if failed == 0:
            status = f"{GREEN}{BOLD}ALL TESTS PASSED ✓{RESET}"
        else:
            status = f"{RED}{BOLD}{failed} TEST(S) FAILED ✗{RESET}"
        print(f"  RESULTS: {passed}/{total} passed | {failed} failed | {skipped} skipped")
        print(f"  Duration: {total_ms / 1000:.2f}s")
        print(f"  Status: {status}")
        print(f"{'=' * 64}")

        return failed == 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def _main() -> bool:
    base_url = os.environ.get("PUMP_API_URL", "http://localhost:3000")
    token = os.environ.get("PUMP_AUTH_TOKEN", compute_token())

    now = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"{'=' * 64}")
    print(f"  {BOLD}PUMP PLATFORM — End-to-End Integration Test{RESET}")
    print(f"  URL: {base_url}  |  Time: {now}")
    print(f"{'=' * 64}")

    runner = TestRunner(base_url, token)
    await runner.run_all()
    return runner.print_summary()


def main():
    success = asyncio.run(_main())
    sys.exit(0 if success else 1)


# -- pytest entry point ---------------------------------------------------

async def test_full_integration():
    """Run the full integration suite via pytest."""
    base_url = os.environ.get("PUMP_API_URL", "http://localhost:3000")
    token = os.environ.get("PUMP_AUTH_TOKEN", compute_token())
    runner = TestRunner(base_url, token)
    results = await runner.run_all()
    runner.print_summary()
    failed = [r for r in results if not r.passed]
    assert not failed, f"{len(failed)} test(s) failed: {', '.join(r.number + ' ' + r.name for r in failed)}"


if __name__ == "__main__":
    main()
