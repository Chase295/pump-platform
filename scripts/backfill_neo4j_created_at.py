"""
One-time script: Backfill created_at on existing SIMILAR_TO relationships.

Run inside the Docker container or with NEO4J_URI/NEO4J_USER/NEO4J_PASSWORD set:

    docker compose exec backend python -m scripts.backfill_neo4j_created_at

Or from host with env vars:

    NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=... python scripts/backfill_neo4j_created_at.py
"""

import asyncio
import os
import sys


async def main():
    # Try using the app's Neo4j client first
    try:
        from backend.modules.graph.neo4j_client import run_write, run_query, check_health

        healthy = await check_health()
        if not healthy:
            print("ERROR: Neo4j is not healthy")
            sys.exit(1)

        print("Connected to Neo4j via app client")
    except Exception:
        print("ERROR: Could not connect to Neo4j. Make sure the backend is configured.")
        sys.exit(1)

    # Step 1: Check current state
    result = await run_query(
        """
        MATCH ()-[r:SIMILAR_TO]->()
        RETURN count(r) AS total,
               count(r.created_at) AS with_created_at,
               count(r) - count(r.created_at) AS without_created_at
        """,
        {},
    )
    if result:
        row = result[0]
        print(f"Before backfill: {row['total']} total, {row['with_created_at']} with created_at, {row['without_created_at']} without")

        if row["without_created_at"] == 0:
            print("All relationships already have created_at. Nothing to do.")
            return

    # Step 2: Backfill from updated_at
    result = await run_write(
        """
        MATCH ()-[r:SIMILAR_TO]->()
        WHERE r.created_at IS NULL AND r.updated_at IS NOT NULL
        SET r.created_at = r.updated_at
        RETURN count(r) AS backfilled
        """,
        {},
    )
    backfilled_updated = result[0]["backfilled"] if result else 0
    print(f"Backfilled {backfilled_updated} relationships from updated_at")

    # Step 3: Backfill remaining from window_b
    result = await run_write(
        """
        MATCH ()-[r:SIMILAR_TO]->()
        WHERE r.created_at IS NULL AND r.window_b IS NOT NULL AND r.window_b <> ''
        SET r.created_at = datetime(r.window_b)
        RETURN count(r) AS backfilled
        """,
        {},
    )
    backfilled_window = result[0]["backfilled"] if result else 0
    print(f"Backfilled {backfilled_window} relationships from window_b")

    # Step 4: Verify
    result = await run_query(
        """
        MATCH ()-[r:SIMILAR_TO]->()
        RETURN count(r) AS total,
               count(r.created_at) AS with_created_at,
               count(r) - count(r.created_at) AS without_created_at
        """,
        {},
    )
    if result:
        row = result[0]
        print(f"After backfill: {row['total']} total, {row['with_created_at']} with created_at, {row['without_created_at']} without")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
