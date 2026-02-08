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
            <li><Typography variant="body2">Spam-Filter (Bad Names, Burst Detection) gegen Scam-Tokens</Typography></li>
            <li><Typography variant="body2">120-Sekunden Cache vor Aktivierung des vollstaendigen Trackings</Typography></li>
            <li><Typography variant="body2">Phasen-basiertes Metrik-Tracking mit konfigurierbaren Intervallen</Typography></li>
            <li><Typography variant="body2">OHLCV-Daten, Volume, Wallet-Tracking in coin_metrics Tabelle</Typography></li>
            <li><Typography variant="body2">n8n Webhook-Integration fuer Benachrichtigungen</Typography></li>
          </Box>
          <CodeBlock>
{`Datenfluss:
  pumpportal.fun (WebSocket)
    -> Spam-Filter (bad_names, burst)
    -> 120s Cache (Trade-Sammlung)
    -> Coin-Stream erstellen (Phase 1)
    -> Metriken alle X Sekunden speichern
    -> coin_metrics Tabelle (PostgreSQL)`}
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
{`Empfangene Daten pro Coin:
- mint: Token-Adresse (Solana)
- name, symbol: Token-Name und Symbol
- traderPublicKey: Creator-Wallet
- vSolInBondingCurve: Virtuelles SOL
- marketCapSol: Market Cap in SOL
- uri: Metadata-URI (IPFS/Arweave)`}
          </CodeBlock>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold', color: '#4caf50' }}>
            Spam-Filterung
          </Typography>
          <Box sx={{ mb: 2 }}>
            <ConfigItem
              name="Bad Names Regex"
              value="test|bot|rug|scam|cant|honey|faucet"
              desc="Filtert Coins mit verdaechtigen Namen"
            />
            <ConfigItem
              name="Spam-Burst Filter"
              value="Max 3 Coins/Minute pro Wallet"
              desc="Blockiert Massen-Erstellungen von gleicher Wallet"
            />
          </Box>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold', color: '#4caf50' }}>
            Cache-Aktivierung
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Neue Coins werden fuer 120 Sekunden im Cache gehalten. Waehrend dieser Zeit werden Trades
            gesammelt, aber noch keine Metriken in die Datenbank geschrieben. Nach 120s wird ein
            vollstaendiger Coin-Stream mit Phase 1 aktiviert.
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
          </Alert>

          {[
            { name: 'Baby Zone (Phase 1)', interval: '5 Sekunden', range: '0-10 Min', desc: 'Sehr junge Coins, haeufige Updates', color: '#4caf50' },
            { name: 'Survival Zone (Phase 2)', interval: '15-30 Sekunden', range: '10-120 Min', desc: 'Coins die erste Minuten ueberlebt haben', color: '#ff9800' },
            { name: 'Mature Zone (Phase 3)', interval: '60 Sekunden', range: '2-24 Stunden', desc: 'Etablierte Coins, seltenere Updates', color: '#2196f3' },
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
            { name: 'Finished (Phase 99)', desc: 'Tracking beendet (zu alt, 24h+)', color: '#f44336' },
            { name: 'Graduated (Phase 100)', desc: 'Token hat Bonding Curve verlassen (Raydium)', color: '#9c27b0' },
          ].map((phase) => (
            <Box key={phase.name} sx={{ p: 1.5, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1, borderLeft: `3px solid ${phase.color}`, mb: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', color: phase.color }}>{phase.name}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.75rem' }}>{phase.desc}</Typography>
            </Box>
          ))}

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Phasen-API</Typography>
          <EndpointRow method="GET" path="/api/find/database/phases" desc="Alle Phasen abrufen" />
          <EndpointRow method="POST" path="/api/find/database/phases" desc="Neue Phase erstellen (ID 1-98)" />
          <EndpointRow method="PUT" path="/api/find/database/phases/{id}" desc="Phase aktualisieren" />
          <EndpointRow method="DELETE" path="/api/find/database/phases/{id}" desc="Phase loeschen (Streams migrieren)" />
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

Trade-Zaehlung:
  num_buys, num_sells, unique_wallets`}
          </CodeBlock>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold', color: '#ff9800' }}>
            coin_metrics Schema
          </Typography>
          <CodeBlock>
{`INSERT INTO coin_metrics (
  mint, timestamp, phase_id_at_time,
  price_open, price_high, price_low, price_close,
  market_cap_close, bonding_curve_pct,
  volume_sol, buy_volume_sol, sell_volume_sol,
  num_buys, num_sells, unique_wallets,
  dev_sold_amount, whale_buy_volume_sol
)`}
          </CodeBlock>

          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Jeder Eintrag speichert OHLCV-Daten fuer das jeweilige Phasen-Intervall.
            Der Training-Service und Prediction-Server lesen diese Daten fuer ML-Vorhersagen.
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
          <EndpointRow method="GET" path="/api/find/health" desc="Service-Status & Live-Daten" />
          <EndpointRow method="GET" path="/api/find/config" desc="Aktuelle Konfiguration" />
          <EndpointRow method="PUT" path="/api/find/config" desc="Konfiguration aendern (Runtime)" />
          <EndpointRow method="GET" path="/api/find/metrics" desc="Prometheus-Metriken" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Datenbank & Streams</Typography>
          <EndpointRow method="GET" path="/api/find/database/streams/stats" desc="Stream-Statistiken nach Phase" />
          <EndpointRow method="GET" path="/api/find/database/streams?limit=50" desc="Einzelne Streams auflisten" />
          <EndpointRow method="GET" path="/api/find/database/metrics?limit=100&mint=..." desc="Historische Metriken (OHLCV)" />
          <EndpointRow method="GET" path="/api/find/coin/{mint}" desc="Vollstaendige Coin-Daten" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Analytics</Typography>
          <EndpointRow method="GET" path="/api/find/analytics/{mint}?windows=1m,5m,1h" desc="Coin Vitalwerte & Performance-Trends" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Phasen-Management</Typography>
          <EndpointRow method="GET" path="/api/find/database/phases" desc="Alle Phasen abrufen" />
          <EndpointRow method="POST" path="/api/find/database/phases" desc="Neue Phase erstellen" />
          <EndpointRow method="PUT" path="/api/find/database/phases/{id}" desc="Phase aktualisieren" />
          <EndpointRow method="DELETE" path="/api/find/database/phases/{id}" desc="Phase loeschen" />
        </Chapter>

        {/* 6. Konfiguration */}
        <Chapter
          id="disc-config"
          title="Konfiguration"
          icon="⚙️"
          expanded={expandedChapters.includes('disc-config')}
          onChange={handleChapterChange('disc-config')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Datenbank</Typography>
          <ConfigItem name="DB_DSN" value="postgresql://..." desc="PostgreSQL-Verbindungsstring" />
          <ConfigItem name="DB_REFRESH_INTERVAL" value="10" range="5-300" desc="Intervall fuer DB-Abfragen (Sekunden)" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Discovery & Filter</Typography>
          <ConfigItem name="COIN_CACHE_SECONDS" value="120" range="10-3600" desc="Cache-Dauer fuer neue Coins" />
          <ConfigItem name="BAD_NAMES_PATTERN" value="test|bot|rug|scam" desc="Regex fuer Coin-Filterung" />
          <ConfigItem name="SPAM_BURST_WINDOW" value="30" range="1-300" desc="Zeitfenster fuer Spam-Erkennung (Sekunden)" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>n8n Integration</Typography>
          <ConfigItem name="N8N_WEBHOOK_URL" value="https://..." desc="Webhook-URL fuer Coin-Benachrichtigungen" />
          <ConfigItem name="BATCH_SIZE" value="10" range="1-100" desc="Coins pro Batch" />
          <ConfigItem name="BATCH_TIMEOUT" value="30" range="5-300" desc="Max. Wartezeit fuer Batch (Sekunden)" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Tracking</Typography>
          <ConfigItem name="SOL_RESERVES_FULL" value="85.0" desc="Schwellwert fuer Bonding Curve Full (%)" />
          <ConfigItem name="WHALE_THRESHOLD_SOL" value="1.0" desc="Schwellwert fuer Whale-Trades (SOL)" />
          <ConfigItem name="TRADE_BUFFER_SECONDS" value="180" desc="Puffer fuer Trade-Aggregation (Sekunden)" />
        </Chapter>

        {/* 7. MCP-Tools */}
        <Chapter
          id="disc-mcp"
          title="MCP-Tools (14)"
          icon="🤖"
          expanded={expandedChapters.includes('disc-mcp')}
          onChange={handleChapterChange('disc-mcp')}
        >
          <Alert severity="info" sx={{ mb: 2 }}>
            AI-Assistenten (Claude Code, Cursor) koennen per MCP direkt mit Discovery interagieren.
          </Alert>

          <Grid container spacing={1}>
            {[
              { name: 'get_health', desc: 'Service-Status & Live-Daten', cat: 'System' },
              { name: 'get_metrics', desc: 'Prometheus-Metriken', cat: 'System' },
              { name: 'get_config', desc: 'Konfiguration lesen', cat: 'Config' },
              { name: 'update_config', desc: 'Konfiguration aendern', cat: 'Config' },
              { name: 'reload_config', desc: 'Config + Phasen neu laden', cat: 'Config' },
              { name: 'list_phases', desc: 'Alle Phasen auflisten', cat: 'Phasen' },
              { name: 'create_phase', desc: 'Neue Phase erstellen', cat: 'Phasen' },
              { name: 'update_phase', desc: 'Phase bearbeiten', cat: 'Phasen' },
              { name: 'delete_phase', desc: 'Phase loeschen', cat: 'Phasen' },
              { name: 'get_streams', desc: 'Aktive Coin-Streams', cat: 'Daten' },
              { name: 'get_stream_stats', desc: 'Stream-Statistiken', cat: 'Daten' },
              { name: 'get_recent_metrics', desc: 'Letzte Metriken aus DB', cat: 'Daten' },
              { name: 'get_coin_detail', desc: 'Vollstaendige Coin-Daten', cat: 'Daten' },
              { name: 'get_coin_analytics', desc: 'Coin-Performance', cat: 'Daten' },
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
