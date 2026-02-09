import React from 'react';
import { Typography, Box, Chip, Stack } from '@mui/material';
import {
  InfoPageWrapper,
  Chapter,
  CodeBlock,
  EndpointRow,
  ConfigItem,
} from '../../components/shared/InfoChapter';

const CHAPTERS = ['datamodel', 'browser', 'queries', 'api', 'troubleshooting'];

const GraphGuide: React.FC = () => (
  <InfoPageWrapper
    title="Graph Database Guide"
    subtitle="Neo4j Graph-Datenbank fuer Beziehungsanalyse zwischen Tokens, Creators, Wallets und Models"
    chapterIds={CHAPTERS}
  >
    {({ expandedChapters, handleChapterChange }) => (
      <>
        {/* 1 - Data Model */}
        <Chapter
          id="datamodel"
          title="Graph-Datenmodell"
          icon="&#x1F4CA;"
          expanded={expandedChapters.includes('datamodel')}
          onChange={handleChapterChange('datamodel')}
        >
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Das Graph-Modell bildet Entitaeten als Nodes und ihre Beziehungen als Relationships ab.
          </Typography>

          <Typography variant="subtitle2" sx={{ mb: 1, color: '#00d4ff' }}>
            Nodes (Knoten)
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <Chip label="Token (address)" size="small" sx={{ bgcolor: 'rgba(0,212,255,0.2)' }} />
            <Chip label="Creator (address)" size="small" sx={{ bgcolor: 'rgba(76,175,80,0.2)' }} />
            <Chip label="Wallet (alias)" size="small" sx={{ bgcolor: 'rgba(255,152,0,0.2)' }} />
            <Chip label="Model (id)" size="small" sx={{ bgcolor: 'rgba(156,39,176,0.2)' }} />
          </Stack>

          <Typography variant="subtitle2" sx={{ mb: 1, color: '#00d4ff' }}>
            Relationships (Beziehungen)
          </Typography>
          <CodeBlock>{`Creator -[:CREATED]-> Token      (initial_buy_sol, timestamp)
Wallet  -[:HOLDS]-> Token        (tokens_held, entry_price, status)
Wallet  -[:BOUGHT]-> Token       (amount_sol, timestamp)
Wallet  -[:SOLD]-> Token         (amount_sol, timestamp)
Model   -[:PREDICTED]-> Token    (probability, tag, timestamp)
Wallet  -[:TRANSFERRED_TO]-> *   (amount_sol, timestamp)`}</CodeBlock>
        </Chapter>

        {/* 2 - Cypher Explorer */}
        <Chapter
          id="browser"
          title="Cypher Explorer Bedienung"
          icon="&#x1F310;"
          expanded={expandedChapters.includes('browser')}
          onChange={handleChapterChange('browser')}
        >
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Der Cypher Explorer im "Cypher Explorer" Tab ermoeglicht Read-Only Queries
            auf die Neo4j Graph-Datenbank ueber die REST-API (/api/graph/query).
          </Typography>

          <Typography variant="subtitle2" sx={{ mb: 1, color: '#00d4ff' }}>
            Bedienung
          </Typography>
          <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
            1. Klicke auf einen der vordefinierten Query-Chips oder schreibe eigenes Cypher.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
            2. Druecke "Run" oder Ctrl+Enter zum Ausfuehren.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
            3. Ergebnisse werden als Tabelle angezeigt. "Copy as JSON" kopiert die Rohdaten.
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Nur Lese-Queries (MATCH/RETURN) sind erlaubt - keine Schreiboperationen.
          </Typography>
        </Chapter>

        {/* 3 - Cypher Queries */}
        <Chapter
          id="queries"
          title="Nuetzliche Cypher Queries"
          icon="&#x1F50D;"
          expanded={expandedChapters.includes('queries')}
          onChange={handleChapterChange('queries')}
        >
          <Typography variant="subtitle2" sx={{ mb: 1, color: '#4caf50' }}>
            Creator mit mehreren Tokens (Rug-Detection)
          </Typography>
          <CodeBlock>{`MATCH (c:Creator)-[:CREATED]->(t:Token)
WITH c, count(t) AS token_count, collect(t.symbol) AS symbols
WHERE token_count > 1
RETURN c.address, token_count, symbols
ORDER BY token_count DESC
LIMIT 25`}</CodeBlock>

          <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, color: '#ff9800' }}>
            Wallet-Trading-Netzwerk
          </Typography>
          <CodeBlock>{`MATCH (w:Wallet)-[r:BOUGHT|SOLD]->(t:Token)
RETURN w, r, t
LIMIT 100`}</CodeBlock>

          <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, color: '#2196f3' }}>
            Model-Alert zu Trade Flow
          </Typography>
          <CodeBlock>{`MATCH (m:Model)-[:PREDICTED]->(t:Token)<-[:BOUGHT]-(w:Wallet)
RETURN m.name, t.symbol, t.address, w.alias
LIMIT 50`}</CodeBlock>

          <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, color: '#9c27b0' }}>
            Token-Cluster nach Creator
          </Typography>
          <CodeBlock>{`MATCH (c:Creator)-[:CREATED]->(t:Token)
WHERE c.address <> ''
RETURN c, t
LIMIT 200`}</CodeBlock>

          <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, color: '#f44336' }}>
            Fund-Flow: Transfer-Netzwerk
          </Typography>
          <CodeBlock>{`MATCH (w:Wallet)-[r:TRANSFERRED_TO]->(target)
RETURN w, r, target
LIMIT 100`}</CodeBlock>

          <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, color: '#00d4ff' }}>
            Graph-Uebersicht (alle Node-Typen)
          </Typography>
          <CodeBlock>{`CALL db.schema.visualization()`}</CodeBlock>
        </Chapter>

        {/* 4 - API Endpoints */}
        <Chapter
          id="api"
          title="Sync-Status & API Endpoints"
          icon="&#x2699;&#xFE0F;"
          expanded={expandedChapters.includes('api')}
          onChange={handleChapterChange('api')}
        >
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Der Graph-Sync laeuft als Background-Task und synchronisiert PostgreSQL-Daten
            periodisch nach Neo4j. API-Endpoints zur Ueberwachung:
          </Typography>

          <EndpointRow method="GET" path="/api/graph/health" desc="Neo4j Verbindungsstatus" />
          <EndpointRow method="GET" path="/api/graph/stats" desc="Node- und Relationship-Counts" />
          <EndpointRow method="GET" path="/api/graph/sync/status" desc="Sync-Timestamps pro Entity" />
          <EndpointRow method="POST" path="/api/graph/sync/trigger" desc="Manuellen Sync ausloesen" />
          <EndpointRow method="GET" path="/api/graph/query?q=..." desc="Read-only Cypher Query" />

          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: '#00d4ff' }}>
              Konfiguration
            </Typography>
            <ConfigItem
              name="NEO4J_SYNC_INTERVAL_SECONDS"
              value="300"
              range="60-3600"
              desc="Intervall in Sekunden zwischen Sync-Laeufen"
            />
            <ConfigItem
              name="NEO4J_SYNC_ENABLED"
              value="true"
              desc="Sync-Service aktivieren/deaktivieren"
            />
          </Box>
        </Chapter>

        {/* 5 - Troubleshooting */}
        <Chapter
          id="troubleshooting"
          title="Troubleshooting"
          icon="&#x1F527;"
          expanded={expandedChapters.includes('troubleshooting')}
          onChange={handleChapterChange('troubleshooting')}
        >
          <Typography variant="subtitle2" sx={{ mb: 1, color: '#ff9800' }}>
            Neo4j Browser zeigt "Connection refused"
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Die Bolt-Verbindung laeuft ueber Port 7687 direkt (nicht via Nginx).
            Stelle sicher, dass der Port in docker-compose.yml exponiert ist
            und der Neo4j Container healthy ist:
          </Typography>
          <CodeBlock>{`docker compose logs neo4j
docker compose ps neo4j`}</CodeBlock>

          <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, color: '#ff9800' }}>
            Iframe bleibt leer
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Pruefe ob der Nginx-Proxy fuer /neo4j/ korrekt konfiguriert ist:
          </Typography>
          <CodeBlock>{`curl -I http://localhost:3000/neo4j/`}</CodeBlock>

          <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, color: '#ff9800' }}>
            Sync laeuft nicht
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Pruefe den Sync-Status ueber die API:
          </Typography>
          <CodeBlock>{`curl http://localhost:3000/api/graph/sync/status
curl http://localhost:3000/api/graph/health`}</CodeBlock>

          <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, color: '#ff9800' }}>
            Neo4j Container startet nicht (Memory)
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Neo4j benoetigt mindestens 512 MB RAM. Die Heap-Einstellungen sind auf
            256-512 MB begrenzt. Bei Problemen die Werte in docker-compose.yml erhoehen.
          </Typography>
        </Chapter>
      </>
    )}
  </InfoPageWrapper>
);

export default GraphGuide;
