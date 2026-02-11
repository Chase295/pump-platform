"""
Neo4j Constraints - Central definition for all uniqueness constraints.

4 existing (Token, Creator, Wallet, Model) + 10 new from graph extension phases.
"""

import logging

from backend.modules.graph.neo4j_client import run_write

logger = logging.getLogger(__name__)

# All constraints: (name, cypher)
ALL_CONSTRAINTS = [
    # Existing (4)
    ("token_address",
     "CREATE CONSTRAINT token_address IF NOT EXISTS FOR (t:Token) REQUIRE t.address IS UNIQUE"),
    ("creator_address",
     "CREATE CONSTRAINT creator_address IF NOT EXISTS FOR (c:Creator) REQUIRE c.address IS UNIQUE"),
    ("wallet_alias",
     "CREATE CONSTRAINT wallet_alias IF NOT EXISTS FOR (w:Wallet) REQUIRE w.alias IS UNIQUE"),
    ("model_id",
     "CREATE CONSTRAINT model_id IF NOT EXISTS FOR (m:Model) REQUIRE m.id IS UNIQUE"),
    # Phase 1: Event-System (2)
    ("event_id",
     "CREATE CONSTRAINT event_id IF NOT EXISTS FOR (e:Event) REQUIRE e.id IS UNIQUE"),
    ("outcome_event_id",
     "CREATE CONSTRAINT outcome_event_id IF NOT EXISTS FOR (o:Outcome) REQUIRE o.event_id IS UNIQUE"),
    # Phase 2: Phasen-Analyse (2)
    ("phase_snapshot_key",
     "CREATE CONSTRAINT phase_snapshot_key IF NOT EXISTS FOR (ps:PhaseSnapshot) REQUIRE ps.id IS UNIQUE"),
    ("price_checkpoint_key",
     "CREATE CONSTRAINT price_checkpoint_key IF NOT EXISTS FOR (pc:PriceCheckpoint) REQUIRE pc.id IS UNIQUE"),
    # Phase 3: Wallet-Intelligence (2)
    ("market_trader_address",
     "CREATE CONSTRAINT market_trader_address IF NOT EXISTS FOR (mt:MarketTrader) REQUIRE mt.address IS UNIQUE"),
    ("wallet_cluster_id",
     "CREATE CONSTRAINT wallet_cluster_id IF NOT EXISTS FOR (wc:WalletCluster) REQUIRE wc.cluster_id IS UNIQUE"),
    # Phase 4: Marktkontext (1)
    ("sol_price_timestamp",
     "CREATE CONSTRAINT sol_price_timestamp IF NOT EXISTS FOR (sp:SolPrice) REQUIRE sp.timestamp IS UNIQUE"),
    # Phase 5: Enrichment (3)
    ("social_profile_url",
     "CREATE CONSTRAINT social_profile_url IF NOT EXISTS FOR (sp:SocialProfile) REQUIRE sp.url IS UNIQUE"),
    ("image_hash_unique",
     "CREATE CONSTRAINT image_hash_unique IF NOT EXISTS FOR (ih:ImageHash) REQUIRE ih.hash IS UNIQUE"),
    ("tokenomics_mint",
     "CREATE CONSTRAINT tokenomics_mint IF NOT EXISTS FOR (tk:Tokenomics) REQUIRE tk.mint IS UNIQUE"),
    # Phase Reference Nodes
    ("phase_phase_id",
     "CREATE CONSTRAINT phase_phase_id IF NOT EXISTS FOR (p:Phase) REQUIRE p.phase_id IS UNIQUE"),
]


async def ensure_all_constraints() -> int:
    """Create all uniqueness constraints. Returns count of successfully applied."""
    applied = 0
    for name, cypher in ALL_CONSTRAINTS:
        try:
            await run_write(cypher)
            applied += 1
        except Exception as e:
            if "already exists" in str(e).lower() or "equivalent" in str(e).lower():
                applied += 1
                logger.debug("Constraint %s already exists", name)
            else:
                logger.warning("Constraint %s creation failed: %s", name, e)
    logger.info("Neo4j constraints ensured (%d/%d)", applied, len(ALL_CONSTRAINTS))
    return applied
