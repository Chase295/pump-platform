import React from 'react';
import { Typography, Box, Alert, Divider, Grid, Chip } from '@mui/material';
import {
  Chapter,
  CodeBlock,
  EndpointRow,
  McpToolRow,
  ConfigItem,
  InfoPageWrapper,
} from '../../components/shared/InfoChapter';

const chapterIds = [
  'disc-overview',
  'disc-discovery',
  'disc-phases',
  'disc-tracking',
  'disc-api',
  'disc-config',
  'disc-mcp',
];

const DiscoveryInfo: React.FC = () => (
  <InfoPageWrapper
    title="Discovery (pump-find)"
    subtitle="Coin-Erkennung, Live-Tracking & Metriken-Sammlung"
    chapterIds={chapterIds}
  >
    {({ expandedChapters, handleChapterChange }) => (
      <>
        {/* 1. Was ist Discovery? */}
        <Chapter
          id="disc-overview"
          title="Was ist Discovery?"
          icon="🔍"
          expanded={expandedChapters.includes('disc-overview')}
          onChange={handleChapterChange('disc-overview')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Discovery ist das Echtzeit-Erkennungssystem fuer neue Tokens auf der Solana-Blockchain via pump.fun.
            Es verbindet sich per WebSocket mit pumpportal.fun, filtert Spam-Tokens heraus und trackt
            vielversprechende Coins mit regelmaessigen Metrik-Updates.
          </Typography>
          <Typography variant="h6" sx={{ mt: 2, mb: 1, fontWeight: 600, fontSize: { xs: '1rem', sm: '1.1rem' } }}>
            Kernfunktionen:
          </Typography>
          <Box component="ul" sx={{ pl: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2">WebSocket-Verbindung zu pumpportal.fun fuer Echtzeit-Coin-Erkennung</Typography></li>
            <li><Typography variant="body2">Spam-Filter (Bad Names Regex, Burst Detection) gegen Scam-Tokens</Typography></li>
            <li><Typography variant="body2">360-Sekunden Cache vor Aktivierung des vollstaendigen Trackings</Typography></li>
            <li><Typography variant="body2">n8n als alleiniger Gatekeeper: RugCheck, Enrichment, dann DB-Insert</Typography></li>
            <li><Typography variant="body2">8-stufiges Phasen-System mit konfigurierbaren Intervallen (3s bis 600s)</Typography></li>
            <li><Typography variant="body2">30-Spalten OHLCV-Daten inkl. Whale-Tracking in coin_metrics (TimescaleDB)</Typography></li>
            <li><Typography variant="body2">Einzelne Trades in coin_transactions (Wallet, Betrag, Preis, Whale-Flag)</Typography></li>
            <li><Typography variant="body2">ATH-Tracking mit Dirty-Flag und Batch-Flush</Typography></li>
          </Box>
          <CodeBlock>
{`Datenfluss:
  pumpportal.fun (WebSocket)
    -> Spam-Filter (bad_names Regex, Burst Detection)
    -> 360s Cache (Trade-Sammlung)
    -> n8n Webhook (RugCheck, IPFS-Enrichment, Klassifikation)
    -> n8n schreibt in discovered_coins + coin_streams
    -> Cache-Aktivierung nach 360s wenn DB-Eintrag vorhanden
    -> Live-Tracking mit phasenbasiertem Intervall
    -> coin_metrics (30 Spalten OHLCV pro Intervall)
    -> coin_transactions (einzelne Trades, non-fatal)`}
          </CodeBlock>
        </Chapter>

        {/* 2. Phase 0: Coin Discovery */}
        <Chapter
          id="disc-discovery"
          title="Coin Discovery (Phase 0)"
          icon="🆕"
          expanded={expandedChapters.includes('disc-discovery')}
          onChange={handleChapterChange('disc-discovery')}
        >
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold', color: '#4caf50' }}>
            WebSocket-Datenformat
          </Typography>
          <CodeBlock>
{`Empfangene Daten pro Coin (newToken Event):
- mint: Token-Adresse (Solana)
- name, symbol: Token-Name und Symbol
- traderPublicKey: Creator-Wallet
- vSolInBondingCurve: Virtuelles SOL in Bonding Curve
- vTokensInBondingCurve: Virtuelle Tokens
- marketCapSol: Market Cap in SOL
- bondingCurveKey: Bonding Curve Adresse
- uri: Metadata-URI (IPFS/Arweave)
- twitter, telegram, website: Social Links`}
          </CodeBlock>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold', color: '#4caf50' }}>
            Spam-Filterung
          </Typography>
          <Box sx={{ mb: 2 }}>
            <ConfigItem
              name="Bad Names Regex"
              value="test|bot|rug|scam|cant|honey|faucet"
              desc="Filtert Coins mit verdaechtigen Namen (konfigurierbar, wird zur Laufzeit aktualisiert)"
            />
            <ConfigItem
              name="Spam-Burst Filter"
              value="30 Sekunden Window"
              desc="Blockiert Coins mit identischem Name oder Symbol innerhalb des Burst-Fensters"
            />
          </Box>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold', color: '#4caf50' }}>
            n8n Gatekeeper
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            n8n ist der alleinige Gatekeeper fuer Datenbank-Inserts. Der Streamer sendet entdeckte Coins
            per Webhook an n8n. Dort erfolgen RugCheck, IPFS-Enrichment und Klassifikation. Nur von n8n
            freigegebene Coins werden in discovered_coins und coin_streams geschrieben.
          </Typography>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold', color: '#4caf50' }}>
            Cache-Aktivierung
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Neue Coins werden fuer 360 Sekunden im Cache gehalten (max. 5.000 Eintraege).
            Waehrend dieser Zeit werden Trades gesammelt. Nach Ablauf wird geprueft ob n8n
            den Coin in coin_streams angelegt hat. Falls ja: Aktivierung mit allen gecachten
            Trades. Falls nein: Coin wird verworfen.
          </Typography>
        </Chapter>

        {/* 3. Phasen-Management */}
        <Chapter
          id="disc-phases"
          title="Phasen-Management"
          icon="📊"
          expanded={expandedChapters.includes('disc-phases')}
          onChange={handleChapterChange('disc-phases')}
        >
          <Alert severity="info" sx={{ mb: 2 }}>
            Phasen steuern wie oft Metriken gespeichert werden. Junge Coins werden haeufiger getrackt.
            Alle Phasen sind ueber die UI oder API konfigurierbar.
          </Alert>

          {[
            { name: 'Newborn (Phase 1)', interval: '3s', range: '0-2 Min', desc: 'Erste Sekunden nach Erstellung', color: '#2196f3' },
            { name: 'Baby (Phase 2)', interval: '5s', range: '2-8 Min', desc: 'Erste Minuten, haeufige Updates', color: '#ff9800' },
            { name: 'Toddler (Phase 3)', interval: '10s', range: '8-20 Min', desc: 'Coin zeigt erste Lebenszeichen', color: '#4caf50' },
            { name: 'Teen (Phase 4)', interval: '30s', range: '20-90 Min', desc: 'Ueberlebensphase, mittlere Frequenz', color: '#00bcd4' },
            { name: 'Young (Phase 5)', interval: '60s', range: '1.5-4 Stunden', desc: 'Etablierter Coin, minutenweise Updates', color: '#e91e63' },
            { name: 'Adult (Phase 6)', interval: '120s', range: '4-18 Stunden', desc: 'Reifer Coin, alle 2 Minuten', color: '#ffeb3b' },
            { name: 'Senior (Phase 7)', interval: '300s', range: '18h-6 Tage', desc: 'Langzeit-Tracking, alle 5 Minuten', color: '#8bc34a' },
            { name: 'Veteran (Phase 8)', interval: '600s', range: '6-23 Tage', desc: 'Letztes Tracking, alle 10 Minuten', color: '#03a9f4' },
          ].map((phase) => (
            <Box key={phase.name} sx={{ p: 1.5, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1, borderLeft: `3px solid ${phase.color}`, mb: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', color: phase.color }}>{phase.name}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                <Chip label={phase.interval} size="small" sx={{ fontSize: '0.7rem' }} />
                <Chip label={phase.range} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
              </Box>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.75rem' }}>{phase.desc}</Typography>
            </Box>
          ))}

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>System-Phasen (nicht editierbar)</Typography>
          {[
            { name: 'Finished (Phase 99)', desc: 'Tracking beendet (max. Alter ueberschritten, 23+ Tage)', color: '#f44336' },
            { name: 'Graduated (Phase 100)', desc: 'Token hat Bonding Curve verlassen (>99.5% -> Raydium)', color: '#9c27b0' },
          ].map((phase) => (
            <Box key={phase.name} sx={{ p: 1.5, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1, borderLeft: `3px solid ${phase.color}`, mb: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', color: phase.color }}>{phase.name}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.75rem' }}>{phase.desc}</Typography>
            </Box>
          ))}

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Phasen-API</Typography>
          <EndpointRow method="GET" path="/api/find/phases" desc="Alle Phasen abrufen" />
          <EndpointRow method="POST" path="/api/find/phases" desc="Neue Phase erstellen (ID 1-98)" />
          <EndpointRow method="PUT" path="/api/find/phases/{id}" desc="Phase aktualisieren" />
          <EndpointRow method="DELETE" path="/api/find/phases/{id}" desc="Phase loeschen (Streams migrieren)" />
        </Chapter>

        {/* 4. Live-Tracking & Metriken */}
        <Chapter
          id="disc-tracking"
          title="Live-Tracking & Metriken"
          icon="📈"
          expanded={expandedChapters.includes('disc-tracking')}
          onChange={handleChapterChange('disc-tracking')}
        >
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold', color: '#ff9800' }}>
            Trade-Verarbeitung
          </Typography>
          <CodeBlock>
{`Preis-Berechnung:
  price = vSolInBondingCurve / vTokensInBondingCurve

Volumen-Akkumulation:
  volume_sol += solAmount
  buy_volume_sol  (wenn txType == "buy")
  sell_volume_sol (wenn txType == "sell")

Whale-Erkennung:
  is_whale = solAmount >= WHALE_THRESHOLD_SOL (1.0 SOL)

Stale-Data-Erkennung:
  Signatur = price + volume + trade_count
  Wenn identisch mit letztem Save -> Zombie Alert
  Nach 2x stale + 5min ohne Trade -> Re-Subscribe`}
          </CodeBlock>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold', color: '#ff9800' }}>
            coin_metrics Schema (30 Spalten)
          </Typography>
          <CodeBlock>
{`INSERT INTO coin_metrics (
  -- Identifikation
  mint, timestamp, phase_id_at_time,
  -- OHLCV
  price_open, price_high, price_low, price_close,
  -- Marktdaten
  market_cap_close, bonding_curve_pct, virtual_sol_reserves, is_koth,
  -- Volumen
  volume_sol, buy_volume_sol, sell_volume_sol,
  -- Trade-Zaehler
  num_buys, num_sells, unique_wallets, num_micro_trades,
  -- Dev-Tracking
  dev_sold_amount,
  -- Extremwerte
  max_single_buy_sol, max_single_sell_sol,
  -- Abgeleitete Metriken
  net_volume_sol, volatility_pct, avg_trade_size_sol,
  -- Whale-Daten
  whale_buy_volume_sol, whale_sell_volume_sol,
  num_whale_buys, num_whale_sells,
  -- Ratios
  buy_pressure_ratio, unique_signer_ratio
)`}
          </CodeBlock>

          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Jeder Eintrag speichert OHLCV + 20 erweiterte Metriken fuer das jeweilige Phasen-Intervall.
            coin_metrics ist eine TimescaleDB Hypertable (1-Tag Chunks).
            Der Training-Service und Prediction-Server lesen diese Daten fuer ML-Vorhersagen.
          </Typography>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold', color: '#ff9800' }}>
            coin_transactions Schema
          </Typography>
          <CodeBlock>
{`INSERT INTO coin_transactions (
  mint, timestamp, trader_public_key, sol_amount,
  tx_type, price_sol, is_whale, phase_id_at_time
)

Parallel zu coin_metrics gespeichert (non-fatal).
Einzelne Trades mit Wallet-Adresse fuer:
  - Embedding-Pipeline (pgvector Similarity Search)
  - Graph-Features (Neo4j Wallet-Analyse)
  - Pattern-Erkennung`}
          </CodeBlock>

          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            coin_transactions ist eine TimescaleDB Hypertable mit 1-Tag Chunks.
            Fehler beim Speichern beeintraechtigen niemals die coin_metrics Pipeline.
          </Typography>
        </Chapter>

        {/* 5. API-Endpunkte */}
        <Chapter
          id="disc-api"
          title="API-Endpunkte"
          icon="🔌"
          expanded={expandedChapters.includes('disc-api')}
          onChange={handleChapterChange('disc-api')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>System</Typography>
          <EndpointRow method="GET" path="/api/find/health" desc="Service-Status, WebSocket, Cache, Tracking-Stats" />
          <EndpointRow method="GET" path="/api/find/config" desc="Aktuelle Konfiguration" />
          <EndpointRow method="PUT" path="/api/find/config" desc="Konfiguration aendern (Runtime)" />
          <EndpointRow method="POST" path="/api/find/reload-config" desc="Phasen-Config aus DB neu laden" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Streams & Metriken</Typography>
          <EndpointRow method="GET" path="/api/find/streams/stats" desc="Stream-Statistiken nach Phase" />
          <EndpointRow method="GET" path="/api/find/streams?limit=50" desc="Einzelne Streams auflisten (max 1.000)" />
          <EndpointRow method="GET" path="/api/find/metrics?limit=100&mint=..." desc="Letzte coin_metrics Eintraege (max 5.000)" />
          <EndpointRow method="GET" path="/api/find/coins/{mint}" desc="Vollstaendige Coin-Daten + Live-Tracking" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Analytics</Typography>
          <EndpointRow method="GET" path="/api/find/analytics/{mint}?windows=1m,5m,1h" desc="Performance ueber Zeitfenster (30s bis 1h)" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Phasen-Management</Typography>
          <EndpointRow method="GET" path="/api/find/phases" desc="Alle Phasen abrufen" />
          <EndpointRow method="POST" path="/api/find/phases" desc="Neue Phase erstellen" />
          <EndpointRow method="PUT" path="/api/find/phases/{id}" desc="Phase aktualisieren" />
          <EndpointRow method="DELETE" path="/api/find/phases/{id}" desc="Phase loeschen" />
        </Chapter>

        {/* 6. Konfiguration */}
        <Chapter
          id="disc-config"
          title="Konfiguration"
          icon="⚙️"
          expanded={expandedChapters.includes('disc-config')}
          onChange={handleChapterChange('disc-config')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>WebSocket</Typography>
          <ConfigItem name="WS_URI" value="wss://pumpportal.fun/api/data" desc="WebSocket-Endpunkt" />
          <ConfigItem name="WS_PING_INTERVAL" value="20" desc="Ping-Intervall in Sekunden" />
          <ConfigItem name="WS_PING_TIMEOUT" value="5" desc="Ping-Timeout in Sekunden" />
          <ConfigItem name="WS_CONNECTION_TIMEOUT" value="30" desc="Timeout fuer Nachrichten-Empfang (Sekunden)" />
          <ConfigItem name="WS_RETRY_DELAY" value="3" desc="Basis-Wartezeit vor Reconnect (Sekunden)" />
          <ConfigItem name="WS_MAX_RETRY_DELAY" value="60" desc="Maximale Reconnect-Wartezeit (Sekunden)" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Discovery & Filter</Typography>
          <ConfigItem name="COIN_CACHE_SECONDS" value="360" range="10-3600" desc="Cache-Dauer fuer neue Coins (Sekunden)" />
          <ConfigItem name="COIN_CACHE_MAX_SIZE" value="5000" desc="Maximale Anzahl Coins im Cache" />
          <ConfigItem name="BAD_NAMES_PATTERN" value="test|bot|rug|scam|cant|honey|faucet" desc="Regex fuer Coin-Filterung (Laufzeit-aenderbar)" />
          <ConfigItem name="SPAM_BURST_WINDOW" value="30" range="5-300" desc="Zeitfenster fuer Duplikat-Erkennung (Sekunden)" />
          <ConfigItem name="DB_REFRESH_INTERVAL" value="10" range="5-300" desc="Intervall fuer DB-Sync und Cache-Check (Sekunden)" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>n8n Integration</Typography>
          <ConfigItem name="N8N_FIND_WEBHOOK_URL" value="" desc="Webhook-URL fuer Coin-Benachrichtigungen (leer = deaktiviert)" />
          <ConfigItem name="N8N_FIND_WEBHOOK_METHOD" value="POST" desc="HTTP-Methode (GET oder POST)" />
          <ConfigItem name="BATCH_SIZE" value="10" range="1-100" desc="Coins pro Batch an n8n" />
          <ConfigItem name="BATCH_TIMEOUT" value="30" range="10-300" desc="Max. Wartezeit vor Batch-Versand (Sekunden)" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Tracking</Typography>
          <ConfigItem name="SOL_RESERVES_FULL" value="85.0" desc="SOL-Schwellwert fuer Graduation (Bonding Curve)" />
          <ConfigItem name="WHALE_THRESHOLD_SOL" value="1.0" desc="Schwellwert fuer Whale-Trades (SOL)" />
          <ConfigItem name="TRADE_BUFFER_SECONDS" value="180" desc="Puffer fuer Trade-Subscription nach Cache-Ablauf (Sekunden)" />
        </Chapter>

        {/* 7. MCP-Tools */}
        <Chapter
          id="disc-mcp"
          title="MCP-Tools (13)"
          icon="🤖"
          expanded={expandedChapters.includes('disc-mcp')}
          onChange={handleChapterChange('disc-mcp')}
        >
          <Alert severity="info" sx={{ mb: 2 }}>
            AI-Assistenten (Claude Code, Cursor) koennen per MCP direkt mit Discovery interagieren.
            Alle Endpoints werden automatisch als MCP-Tools bereitgestellt.
          </Alert>

          <Grid container spacing={1}>
            {[
              { name: 'find_health', desc: 'Service-Status & Live-Daten', cat: 'System' },
              { name: 'find_get_config', desc: 'Konfiguration lesen', cat: 'Config' },
              { name: 'find_update_config', desc: 'Konfiguration aendern', cat: 'Config' },
              { name: 'find_reload_config', desc: 'Phasen-Config neu laden', cat: 'Config' },
              { name: 'find_list_phases', desc: 'Alle Phasen auflisten', cat: 'Phasen' },
              { name: 'find_create_phase', desc: 'Neue Phase erstellen', cat: 'Phasen' },
              { name: 'find_update_phase', desc: 'Phase bearbeiten', cat: 'Phasen' },
              { name: 'find_delete_phase', desc: 'Phase loeschen', cat: 'Phasen' },
              { name: 'find_get_streams', desc: 'Aktive Coin-Streams', cat: 'Daten' },
              { name: 'find_get_stream_stats', desc: 'Stream-Statistiken nach Phase', cat: 'Daten' },
              { name: 'find_get_recent_metrics', desc: 'Letzte coin_metrics Eintraege', cat: 'Daten' },
              { name: 'find_get_coin_detail', desc: 'Vollstaendige Coin-Daten + Live', cat: 'Daten' },
              { name: 'find_get_coin_analytics', desc: 'Performance ueber Zeitfenster', cat: 'Daten' },
            ].map((tool) => (
              <Grid key={tool.name} size={{ xs: 12, sm: 6 }}>
                <McpToolRow name={tool.name} desc={tool.desc} cat={tool.cat} />
              </Grid>
            ))}
          </Grid>
        </Chapter>
      </>
    )}
  </InfoPageWrapper>
);

export default DiscoveryInfo;
