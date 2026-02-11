"""
Enrichment Sync Module (Phase 5) - SocialProfile, ImageHash, Tokenomics nodes.

Creates enrichment nodes from discovered_coins metadata and links them to Token nodes.

Node types:
  - SocialProfile (twitter, telegram, website) via HAS_TWITTER/HAS_TELEGRAM/HAS_WEBSITE
  - ImageHash via HAS_IMAGE (tracks reuse across tokens)
  - Tokenomics via HAS_TOKENOMICS (supply, holders, bonding curve)
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional

from backend.database import fetch
from backend.modules.graph.neo4j_client import run_write

logger = logging.getLogger(__name__)

BATCH_SIZE = 5000


class EnrichmentSyncModule:
    """Syncs enrichment data: SocialProfiles, ImageHashes, Tokenomics."""

    def __init__(self):
        self.last_sync_social: Optional[datetime] = None
        self.last_sync_images: Optional[datetime] = None
        self.last_sync_tokenomics: Optional[datetime] = None

    async def sync(self) -> Dict[str, int]:
        """Run all enrichment sync methods. Returns counts per entity type."""
        results: Dict[str, int] = {}

        results["social_profiles"] = await self._sync_social_profiles(self.last_sync_social)
        results["image_hashes"] = await self._sync_image_hashes(self.last_sync_images)
        results["tokenomics"] = await self._sync_tokenomics(self.last_sync_tokenomics)

        return results

    # ------------------------------------------------------------------
    # SocialProfile nodes (twitter, telegram, website)
    # ------------------------------------------------------------------
    async def _sync_social_profiles(self, since: Optional[datetime] = None) -> int:
        """Sync social profile URLs from discovered_coins -> SocialProfile nodes."""
        if since is None:
            since = datetime.now(timezone.utc) - timedelta(hours=24)

        rows = await fetch("""
            SELECT
                token_address, twitter_url, telegram_url, website_url, discord_url, discovered_at
            FROM discovered_coins
            WHERE (twitter_url IS NOT NULL OR telegram_url IS NOT NULL
                   OR website_url IS NOT NULL OR discord_url IS NOT NULL)
              AND discovered_at > $1
            ORDER BY discovered_at ASC
            LIMIT 5000
        """, since)

        if not rows:
            return 0

        count = 0

        for row in rows:
            mint = row["token_address"]

            # Twitter
            twitter_url = row["twitter_url"]
            if twitter_url and str(twitter_url).strip():
                twitter_url = str(twitter_url).strip()
                handle = twitter_url.rstrip("/").split("/")[-1].lower()
                try:
                    await run_write("""
                        MATCH (t:Token {address: $mint})
                        MERGE (sp:SocialProfile {url: $url})
                        SET sp.platform = 'twitter', sp.normalized_handle = $handle
                        MERGE (t)-[:HAS_TWITTER]->(sp)
                    """, {"mint": mint, "url": twitter_url, "handle": handle})
                    count += 1
                except Exception as e:
                    logger.warning("Social sync (twitter) failed for %s: %s", mint[:12], e)

            # Telegram
            telegram_url = row["telegram_url"]
            if telegram_url and str(telegram_url).strip():
                telegram_url = str(telegram_url).strip()
                handle = telegram_url.rstrip("/").split("/")[-1].lower()
                try:
                    await run_write("""
                        MATCH (t:Token {address: $mint})
                        MERGE (sp:SocialProfile {url: $url})
                        SET sp.platform = 'telegram', sp.normalized_handle = $handle
                        MERGE (t)-[:HAS_TELEGRAM]->(sp)
                    """, {"mint": mint, "url": telegram_url, "handle": handle})
                    count += 1
                except Exception as e:
                    logger.warning("Social sync (telegram) failed for %s: %s", mint[:12], e)

            # Website
            website_url = row["website_url"]
            if website_url and str(website_url).strip():
                website_url = str(website_url).strip()
                try:
                    await run_write("""
                        MATCH (t:Token {address: $mint})
                        MERGE (sp:SocialProfile {url: $url})
                        SET sp.platform = 'website'
                        MERGE (t)-[:HAS_WEBSITE]->(sp)
                    """, {"mint": mint, "url": website_url})
                    count += 1
                except Exception as e:
                    logger.warning("Social sync (website) failed for %s: %s", mint[:12], e)

            # Discord
            discord_url = row["discord_url"]
            if discord_url and str(discord_url).strip():
                discord_url = str(discord_url).strip()
                handle = discord_url.rstrip("/").split("/")[-1].lower()
                try:
                    await run_write("""
                        MATCH (t:Token {address: $mint})
                        MERGE (sp:SocialProfile {url: $url})
                        SET sp.platform = 'discord', sp.normalized_handle = $handle
                        MERGE (t)-[:HAS_DISCORD]->(sp)
                    """, {"mint": mint, "url": discord_url, "handle": handle})
                    count += 1
                except Exception as e:
                    logger.warning("Social sync (discord) failed for %s: %s", mint[:12], e)

        if rows:
            last_row = rows[-1]
            if last_row.get("discovered_at"):
                self.last_sync_social = last_row["discovered_at"]

        return count

    # ------------------------------------------------------------------
    # ImageHash nodes (detect reused images across tokens)
    # ------------------------------------------------------------------
    async def _sync_image_hashes(self, since: Optional[datetime] = None) -> int:
        """Sync image hashes from discovered_coins -> ImageHash nodes."""
        if since is None:
            since = datetime.now(timezone.utc) - timedelta(hours=24)

        rows = await fetch("""
            SELECT token_address, image_hash, discovered_at
            FROM discovered_coins
            WHERE image_hash IS NOT NULL AND image_hash <> ''
              AND discovered_at > $1
            ORDER BY discovered_at ASC
            LIMIT 5000
        """, since)

        if not rows:
            return 0

        count = 0

        for row in rows:
            mint = row["token_address"]
            image_hash = str(row["image_hash"]).strip()
            if not image_hash:
                continue

            try:
                await run_write("""
                    MATCH (t:Token {address: $mint})
                    MERGE (ih:ImageHash {hash: $image_hash})
                    ON CREATE SET ih.first_seen = datetime(), ih.usage_count = 1
                    ON MATCH SET ih.usage_count = ih.usage_count + 1
                    MERGE (t)-[:HAS_IMAGE]->(ih)
                """, {"mint": mint, "image_hash": image_hash})
                count += 1
            except Exception as e:
                logger.warning("ImageHash sync failed for %s: %s", mint[:12], e)

        if rows:
            last_row = rows[-1]
            if last_row.get("discovered_at"):
                self.last_sync_images = last_row["discovered_at"]

        return count

    # ------------------------------------------------------------------
    # Tokenomics nodes (supply, holders, bonding curve)
    # ------------------------------------------------------------------
    async def _sync_tokenomics(self, since: Optional[datetime] = None) -> int:
        """Sync tokenomics data from discovered_coins -> Tokenomics nodes."""
        if since is None:
            since = datetime.now(timezone.utc) - timedelta(hours=24)

        rows = await fetch("""
            SELECT
                token_address, token_supply, token_decimals,
                top_10_holders_pct, metadata_is_mutable, mint_authority_enabled,
                initial_buy_tokens, v_tokens_in_bonding_curve, v_sol_in_bonding_curve,
                discovered_at
            FROM discovered_coins
            WHERE token_supply IS NOT NULL
              AND discovered_at > $1
            ORDER BY discovered_at ASC
            LIMIT 5000
        """, since)

        if not rows:
            return 0

        count = 0

        for row in rows:
            mint = row["token_address"]
            total_supply = float(row["token_supply"]) if row["token_supply"] else 0.0
            token_decimals = int(row["token_decimals"]) if row["token_decimals"] is not None else 0
            top_10_holders_pct = float(row["top_10_holders_pct"]) if row["top_10_holders_pct"] else 0.0
            metadata_is_mutable = bool(row["metadata_is_mutable"]) if row["metadata_is_mutable"] is not None else False
            mint_authority_enabled = bool(row["mint_authority_enabled"]) if row["mint_authority_enabled"] is not None else False
            initial_buy_tokens = float(row["initial_buy_tokens"]) if row["initial_buy_tokens"] else 0.0
            v_tokens_in_bonding_curve = float(row["v_tokens_in_bonding_curve"]) if row["v_tokens_in_bonding_curve"] else 0.0
            v_sol_in_bonding_curve = float(row["v_sol_in_bonding_curve"]) if row["v_sol_in_bonding_curve"] else 0.0

            params = {
                "mint": mint,
                "total_supply": total_supply,
                "token_decimals": token_decimals,
                "top_10_holders_pct": top_10_holders_pct,
                "metadata_is_mutable": metadata_is_mutable,
                "mint_authority_enabled": mint_authority_enabled,
                "initial_buy_tokens": initial_buy_tokens,
                "v_tokens_in_bonding_curve": v_tokens_in_bonding_curve,
            }

            try:
                await run_write("""
                    MATCH (t:Token {address: $mint})
                    MERGE (tk:Tokenomics {mint: $mint})
                    SET tk.total_supply = $total_supply,
                        tk.token_decimals = $token_decimals,
                        tk.top_10_holders_pct = $top_10_holders_pct,
                        tk.metadata_is_mutable = $metadata_is_mutable,
                        tk.mint_authority_enabled = $mint_authority_enabled,
                        tk.initial_buy_tokens = $initial_buy_tokens,
                        tk.bonding_curve_pct = CASE WHEN $total_supply > 0 THEN ($v_tokens_in_bonding_curve / $total_supply) * 100 ELSE 0 END,
                        tk.updated_at = datetime()
                    MERGE (t)-[:HAS_TOKENOMICS]->(tk)
                """, params)
                count += 1
            except Exception as e:
                logger.warning("Tokenomics sync failed for %s: %s", mint[:12], e)

        if rows:
            last_row = rows[-1]
            if last_row.get("discovered_at"):
                self.last_sync_tokenomics = last_row["discovered_at"]

        return count
