import React from 'react';
import {
  Typography,
  Box,
  Divider,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  Chapter,
  CodeBlock,
  EndpointRow,
  ConfigItem,
  InfoPageWrapper,
} from '../../components/shared/InfoChapter';

const chapterIds = [
  'emb-overview',
  'emb-pipeline',
  'emb-configs',
  'emb-similarity',
  'emb-labels',
  'emb-analysis',
  'emb-api',
  'emb-settings',
];

const SmallTable: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TableContainer component={Paper} sx={{ mb: 2, overflowX: 'auto', '& .MuiTable-root': { minWidth: 400 } }}>
    {children}
  </TableContainer>
);

const EmbeddingsInfo: React.FC = () => (
  <InfoPageWrapper
    title="Embeddings (pgvector)"
    subtitle="128-dim Pattern-Embeddings, Similarity Search & Auto-Labeling"
    chapterIds={chapterIds}
  >
    {({ expandedChapters, handleChapterChange }) => (
      <>
        {/* 1. Was ist dieses System? */}
        <Chapter
          id="emb-overview"
          title="Was ist dieses System?"
          icon="📖"
          expanded={expandedChapters.includes('emb-overview')}
          onChange={handleChapterChange('emb-overview')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Das Embedding-Modul erzeugt 128-dimensionale Vektoren aus OHLCV-Daten (coin_metrics + coin_transactions)
            und speichert sie in PostgreSQL mit der pgvector-Extension. Diese Vektoren repraesentieren Kurs-Muster
            und ermoeglichen blitzschnelle Aehnlichkeitssuche via HNSW-Index.
          </Typography>
          <Box component="ul" sx={{ pl: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2">Background-Service generiert Embeddings alle 60 Sekunden</Typography></li>
            <li><Typography variant="body2">Konfigurierbare Strategien (Fenstergroesse, Normalisierung, Phasen-Filter)</Typography></li>
            <li><Typography variant="body2">Similarity Search per Mint-Adresse oder direktem Embedding-Vektor</Typography></li>
            <li><Typography variant="body2">Label-System (pump, rug, flat, ...) mit manuellen und automatischen Labels</Typography></li>
            <li><Typography variant="body2">Label-Propagation: Labels automatisch auf aehnliche Patterns uebertragen</Typography></li>
            <li><Typography variant="body2">Cluster- und Outlier-Analyse via K-Means / pgvector-Distanzen</Typography></li>
            <li><Typography variant="body2">Similarity-Cache mit Neo4j SIMILAR_TO Sync</Typography></li>
          </Box>
          <Typography variant="body2" sx={{ mt: 2, fontStyle: 'italic', color: 'text.secondary' }}>
            Workflow: Config erstellen &rarr; Embeddings generieren &rarr; Patterns labeln &rarr;
            Similarity Search nutzen &rarr; Labels propagieren &rarr; Neo4j Sync
          </Typography>
        </Chapter>

        {/* 2. Embedding-Pipeline */}
        <Chapter
          id="emb-pipeline"
          title="Embedding-Pipeline"
          icon="⚡"
          expanded={expandedChapters.includes('emb-pipeline')}
          onChange={handleChapterChange('emb-pipeline')}
        >
          <CodeBlock>
{`Generierungs-Flow (alle 60s):
  1. Aktive Configs laden (Strategie, Fenster, Phasen)
  2. Letzte verarbeitete Window-End-Zeit ermitteln
  3. Non-overlapping Windows von last_end bis jetzt erzeugen
  4. Pro Fenster: Alle aktiven Mints finden
  5. Batch-Generierung (max 500 Mints pro Batch)
  6. 128-dim Vektor pro Mint berechnen (OHLCV-Features)
  7. Batch-Insert in coin_pattern_embeddings
  8. Similarity-Pairs berechnen (Cosine Distance)
  9. SIMILAR_TO Beziehungen nach Neo4j syncen`}
          </CodeBlock>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Embedding-Dimensionen</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Eigenschaft</strong></TableCell>
                  <TableCell><strong>Wert</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>Vektor-Dimensionen</TableCell><TableCell>128</TableCell></TableRow>
                <TableRow><TableCell>Index-Typ</TableCell><TableCell>HNSW (pgvector)</TableCell></TableRow>
                <TableRow><TableCell>Distanz-Metrik</TableCell><TableCell>Cosine Distance (&lt;=&gt;)</TableCell></TableRow>
                <TableRow><TableCell>Default ef_search</TableCell><TableCell>100</TableCell></TableRow>
                <TableRow><TableCell>Tabelle</TableCell><TableCell>coin_pattern_embeddings</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Verfuegbare Strategien</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Strategie</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell><code>handcrafted_v1</code></TableCell><TableCell>Standard-Strategie: OHLCV-Features aus coin_metrics + coin_transactions</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>

        {/* 3. Embedding-Configs */}
        <Chapter
          id="emb-configs"
          title="Embedding-Configs"
          icon="⚙️"
          expanded={expandedChapters.includes('emb-configs')}
          onChange={handleChapterChange('emb-configs')}
        >
          <Typography variant="body2" sx={{ mb: 2 }}>
            Jede Config definiert, wie Embeddings generiert werden. Mehrere Configs koennen gleichzeitig aktiv sein
            (z.B. verschiedene Fenstergroessen fuer verschiedene Zeitskalen).
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell><strong>Default</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>name</TableCell><TableCell>-</TableCell><TableCell>Eindeutiger Name der Config</TableCell></TableRow>
                <TableRow><TableCell>strategy</TableCell><TableCell>handcrafted_v1</TableCell><TableCell>Embedding-Strategie</TableCell></TableRow>
                <TableRow><TableCell>window_seconds</TableCell><TableCell>300</TableCell><TableCell>Fenstergroesse in Sekunden (5s - 86400s)</TableCell></TableRow>
                <TableRow><TableCell>window_overlap_seconds</TableCell><TableCell>0</TableCell><TableCell>Ueberlappung zwischen Fenstern</TableCell></TableRow>
                <TableRow><TableCell>min_snapshots</TableCell><TableCell>3</TableCell><TableCell>Min. Datenpunkte pro Fenster (1-100)</TableCell></TableRow>
                <TableRow><TableCell>phases</TableCell><TableCell>null (alle)</TableCell><TableCell>Phasen-Filter (z.B. [1, 2, 3])</TableCell></TableRow>
                <TableRow><TableCell>normalization</TableCell><TableCell>minmax</TableCell><TableCell>Normalisierungs-Strategie</TableCell></TableRow>
                <TableRow><TableCell>is_active</TableCell><TableCell>true</TableCell><TableCell>Ob die Config aktiv generiert</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>

        {/* 4. Similarity Search */}
        <Chapter
          id="emb-similarity"
          title="Similarity Search"
          icon="🔍"
          expanded={expandedChapters.includes('emb-similarity')}
          onChange={handleChapterChange('emb-similarity')}
        >
          <Typography variant="body2" sx={{ mb: 2 }}>
            Die Aehnlichkeitssuche nutzt den pgvector HNSW-Index fuer schnelle Nearest-Neighbor-Abfragen
            auf den 128-dim Vektoren. Zwei Suchmodi:
          </Typography>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Such-Modi</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Modus</strong></TableCell>
                  <TableCell><strong>Input</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>By Mint</TableCell><TableCell>Mint-Adresse</TableCell><TableCell>Findet Patterns aehnlich zu einem bestimmten Coin</TableCell></TableRow>
                <TableRow><TableCell>By Vector</TableCell><TableCell>128 Floats</TableCell><TableCell>Suche mit benutzerdefiniertem Embedding-Vektor</TableCell></TableRow>
                <TableRow><TableCell>By Label</TableCell><TableCell>Label-Name</TableCell><TableCell>Alle Patterns mit einem bestimmten Label</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Such-Parameter</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell><strong>Default</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>k</TableCell><TableCell>20</TableCell><TableCell>Anzahl Ergebnisse (1-200)</TableCell></TableRow>
                <TableRow><TableCell>min_similarity</TableCell><TableCell>0.0</TableCell><TableCell>Minimale Cosine-Aehnlichkeit (0.0-1.0)</TableCell></TableRow>
                <TableRow><TableCell>ef_search</TableCell><TableCell>100</TableCell><TableCell>HNSW Suchgenauigkeit (10-1000)</TableCell></TableRow>
                <TableRow><TableCell>phase_id</TableCell><TableCell>null</TableCell><TableCell>Filter nach Coin-Phase</TableCell></TableRow>
                <TableRow><TableCell>label</TableCell><TableCell>null</TableCell><TableCell>Filter nach Label</TableCell></TableRow>
                <TableRow><TableCell>strategy</TableCell><TableCell>null</TableCell><TableCell>Filter nach Strategie</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
            Hoehere ef_search-Werte erhoehen die Genauigkeit auf Kosten der Geschwindigkeit.
            Fuer die meisten Anwendungsfaelle ist 100 ein guter Kompromiss.
          </Typography>
        </Chapter>

        {/* 5. Labels & Propagation */}
        <Chapter
          id="emb-labels"
          title="Labels & Propagation"
          icon="🏷️"
          expanded={expandedChapters.includes('emb-labels')}
          onChange={handleChapterChange('emb-labels')}
        >
          <Typography variant="body2" sx={{ mb: 2 }}>
            Labels kategorisieren Patterns und ermoeglichen gezielte Suche. Sie koennen manuell
            oder automatisch (via Propagation) vergeben werden.
          </Typography>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Label-Quellen</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Chip label="manual" size="small" sx={{ bgcolor: 'rgba(0, 212, 255, 0.2)' }} />
            <Chip label="ml" size="small" sx={{ bgcolor: 'rgba(76, 175, 80, 0.2)' }} />
            <Chip label="rule" size="small" sx={{ bgcolor: 'rgba(255, 152, 0, 0.2)' }} />
            <Chip label="propagated" size="small" sx={{ bgcolor: 'rgba(156, 39, 176, 0.2)' }} />
          </Box>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Typische Labels</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Chip label="pump" size="small" color="success" />
            <Chip label="rug" size="small" color="error" />
            <Chip label="flat" size="small" />
            <Chip label="organic" size="small" color="info" />
          </Box>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Label-Propagation</Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Verbreitet ein bestehendes Label auf aehnliche, noch unlabeled Patterns.
            Kontrolliert ueber <code>min_similarity</code> (Schwellenwert, Default 0.85)
            und <code>max_propagations</code> (Limit, Default 100).
          </Typography>

          <CodeBlock>
{`Propagation-Flow:
  1. Alle Embeddings mit source_label finden
  2. Pro Embedding: 10 aehnlichste Neighbors suchen
  3. Nur unlabeled Neighbors mit similarity >= min_similarity
  4. Label zuweisen mit source="propagated"
  5. Confidence = Similarity-Score`}
          </CodeBlock>
        </Chapter>

        {/* 6. Analyse-Features */}
        <Chapter
          id="emb-analysis"
          title="Analyse-Features"
          icon="📊"
          expanded={expandedChapters.includes('emb-analysis')}
          onChange={handleChapterChange('emb-analysis')}
        >
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Cluster-Analyse (K-Means)</Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Gruppiert Embeddings in k Cluster und zeigt Label-Verteilung pro Cluster.
            Nuetzlich um Pattern-Typen zu entdecken.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell><strong>Default</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>k</TableCell><TableCell>5</TableCell><TableCell>Anzahl Cluster (2-20)</TableCell></TableRow>
                <TableRow><TableCell>strategy</TableCell><TableCell>null</TableCell><TableCell>Filter nach Strategie</TableCell></TableRow>
                <TableRow><TableCell>limit</TableCell><TableCell>5000</TableCell><TableCell>Max. Embeddings (100-50000)</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Outlier-Detection</Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Findet Patterns mit hoher durchschnittlicher Distanz zu 10 zufaelligen Nachbarn.
            Hoher Isolation-Score = ungewoehnliches Pattern.
          </Typography>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Label-Distribution</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Statistische Aufschluesselung nach Label, Strategie und Phase.
            Zeigt labeled vs. unlabeled Verhaeltnis.
          </Typography>
        </Chapter>

        {/* 7. API-Endpunkte */}
        <Chapter
          id="emb-api"
          title="API-Endpunkte"
          icon="🔌"
          expanded={expandedChapters.includes('emb-api')}
          onChange={handleChapterChange('emb-api')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Health & Status</Typography>
          <EndpointRow method="GET" path="/api/embeddings/health" desc="Service-Status, aktive Configs, Stats" />
          <EndpointRow method="GET" path="/api/embeddings/stats" desc="Umfassende Embedding-Statistiken" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Configs</Typography>
          <EndpointRow method="GET" path="/api/embeddings/configs" desc="Alle Configs auflisten" />
          <EndpointRow method="POST" path="/api/embeddings/configs" desc="Neue Config erstellen" />
          <EndpointRow method="GET" path="/api/embeddings/configs/{id}" desc="Config-Details" />
          <EndpointRow method="PATCH" path="/api/embeddings/configs/{id}" desc="Config aktualisieren" />
          <EndpointRow method="DELETE" path="/api/embeddings/configs/{id}" desc="Config + Embeddings loeschen" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Generation & Jobs</Typography>
          <EndpointRow method="POST" path="/api/embeddings/generate" desc="Manuelle Generierung starten" />
          <EndpointRow method="GET" path="/api/embeddings/jobs" desc="Jobs auflisten" />
          <EndpointRow method="GET" path="/api/embeddings/jobs/{id}" desc="Job-Details" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Browsing</Typography>
          <EndpointRow method="GET" path="/api/embeddings/browse" desc="Embeddings mit Filtern durchsuchen" />
          <EndpointRow method="GET" path="/api/embeddings/browse/{id}" desc="Einzelnes Embedding" />
          <EndpointRow method="GET" path="/api/embeddings/browse/by-mint/{mint}" desc="Alle Embeddings eines Coins" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Similarity Search</Typography>
          <EndpointRow method="POST" path="/api/embeddings/search/similar" desc="Aehnliche Patterns suchen (Vektor oder Mint)" />
          <EndpointRow method="GET" path="/api/embeddings/search/by-mint/{mint}" desc="Aehnliche Patterns zu einem Coin" />
          <EndpointRow method="GET" path="/api/embeddings/search/by-label/{label}" desc="Patterns nach Label" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Labels</Typography>
          <EndpointRow method="POST" path="/api/embeddings/labels" desc="Label hinzufuegen" />
          <EndpointRow method="GET" path="/api/embeddings/labels" desc="Label-Statistiken" />
          <EndpointRow method="DELETE" path="/api/embeddings/labels/{id}" desc="Label loeschen" />
          <EndpointRow method="POST" path="/api/embeddings/labels/propagate" desc="Labels propagieren" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Analyse</Typography>
          <EndpointRow method="GET" path="/api/embeddings/analysis/distribution" desc="Label-Verteilung" />
          <EndpointRow method="GET" path="/api/embeddings/analysis/clusters" desc="K-Means Cluster-Analyse" />
          <EndpointRow method="GET" path="/api/embeddings/analysis/outliers" desc="Outlier-Detection" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Neo4j Sync</Typography>
          <EndpointRow method="POST" path="/api/embeddings/neo4j/sync" desc="SIMILAR_TO Sync starten" />
          <EndpointRow method="GET" path="/api/embeddings/neo4j/status" desc="Sync-Status (total/synced/pending)" />
        </Chapter>

        {/* 8. Einstellungen */}
        <Chapter
          id="emb-settings"
          title="Einstellungen"
          icon="⚙️"
          expanded={expandedChapters.includes('emb-settings')}
          onChange={handleChapterChange('emb-settings')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Umgebungsvariablen</Typography>
          <ConfigItem name="EMBEDDING_NEO4J_SYNC_ENABLED" value="true" desc="Similarity-Pairs automatisch nach Neo4j syncen" />
          <ConfigItem name="DB_DSN" value="postgresql://..." desc="PostgreSQL-Verbindung (mit pgvector Extension)" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Service-Parameter</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell><strong>Default</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>interval_seconds</TableCell><TableCell>60</TableCell><TableCell>Generierungs-Intervall des Background-Service</TableCell></TableRow>
                <TableRow><TableCell>batch_size</TableCell><TableCell>500</TableCell><TableCell>Max. Mints pro Batch</TableCell></TableRow>
                <TableRow><TableCell>Config-Reload</TableCell><TableCell>alle 10 Runs</TableCell><TableCell>Aktive Configs werden periodisch neu geladen</TableCell></TableRow>
                <TableRow><TableCell>Startup-Delay</TableCell><TableCell>20s</TableCell><TableCell>Wartezeit auf DB-Bereitschaft beim Start</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Datenbank-Tabellen</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Tabelle</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell><code>coin_pattern_embeddings</code></TableCell><TableCell>128-dim Vektoren mit HNSW-Index</TableCell></TableRow>
                <TableRow><TableCell><code>embedding_configs</code></TableCell><TableCell>Strategie-Konfigurationen</TableCell></TableRow>
                <TableRow><TableCell><code>embedding_jobs</code></TableCell><TableCell>Generierungs-Jobs mit Fortschritt</TableCell></TableRow>
                <TableRow><TableCell><code>pattern_labels</code></TableCell><TableCell>Labels mit Confidence und Quelle</TableCell></TableRow>
                <TableRow><TableCell><code>similarity_cache</code></TableCell><TableCell>Vorberechnete Aehnlichkeits-Paare fuer Neo4j</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>
      </>
    )}
  </InfoPageWrapper>
);

export default EmbeddingsInfo;
