import React from 'react';
import {
  Typography,
  Box,
  Alert,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
} from '@mui/material';
import {
  Chapter,
  CodeBlock,
  InfoPageWrapper,
} from '../../components/shared/InfoChapter';

const chapterIds = [
  'wf-docker',
  'wf-db',
  'wf-webhook',
  'wf-communication',
  'wf-examples',
  'wf-troubleshooting',
];

const SmallTable: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TableContainer component={Paper} sx={{ mb: 2, overflowX: 'auto', '& .MuiTable-root': { minWidth: 400 } }}>
    {children}
  </TableContainer>
);

const WorkflowsGuide: React.FC = () => (
  <InfoPageWrapper
    title="Workflows Setup Guide"
    subtitle="n8n-Verbindungen, Datenbank-Setup & Docker-Netzwerk"
    chapterIds={chapterIds}
  >
    {({ expandedChapters, handleChapterChange }) => (
      <>
        {/* 1. Docker-Netzwerk Architektur */}
        <Chapter
          id="wf-docker"
          title="Docker-Netzwerk Architektur"
          icon="🐳"
          expanded={expandedChapters.includes('wf-docker')}
          onChange={handleChapterChange('wf-docker')}
        >
          <Alert severity="info" sx={{ mb: 2 }}>
            Alle Services laufen im selben Docker Bridge-Netzwerk und koennen sich gegenseitig ueber
            Service-Namen erreichen.
          </Alert>

          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Service</strong></TableCell>
                  <TableCell><strong>Hostname (intern)</strong></TableCell>
                  <TableCell><strong>Port (intern)</strong></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Port (extern)</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Backend</TableCell>
                  <TableCell><code>backend</code></TableCell>
                  <TableCell>8000</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>-</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Frontend (Nginx)</TableCell>
                  <TableCell><code>frontend</code></TableCell>
                  <TableCell>80</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>3000</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>PostgreSQL</TableCell>
                  <TableCell><code>db</code></TableCell>
                  <TableCell>5432</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>5432</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>n8n</TableCell>
                  <TableCell><code>n8n</code></TableCell>
                  <TableCell>5678</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>-</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <CodeBlock>
{`Docker Bridge Netzwerk: pump-platform_default
+-----------------------------------------------------------+
|                                                           |
|   +-----------+    +----------+    +-----------+          |
|   | frontend  |    | backend  |    |    n8n    |          |
|   | (nginx)   |--->| (FastAPI)|--->| (workflow)|          |
|   | :80       |    | :8000    |    | :5678     |          |
|   +-----------+    +----------+    +-----------+          |
|        |                |               |                 |
|        |           +----+----+          |                 |
|        |           |   db    |----------+                 |
|        |           | (pg)    |                            |
|        |           | :5432   |                            |
|        |           +---------+                            |
|        |                                                  |
+--------+--------------------------------------------------+
         |
    Port 3000 (extern)

Nginx Proxy-Regeln:
  /api/find/*     -> backend:8000
  /api/training/* -> backend:8000
  /api/server/*   -> backend:8000
  /api/buy/*      -> backend:8000
  /n8n/*          -> n8n:5678
  /*              -> Static React App`}
          </CodeBlock>
        </Chapter>

        {/* 2. n8n Datenbank-Verbindung */}
        <Chapter
          id="wf-db"
          title="n8n Datenbank-Verbindung"
          icon="🗄️"
          expanded={expandedChapters.includes('wf-db')}
          onChange={handleChapterChange('wf-db')}
        >
          <Typography variant="body1" sx={{ mb: 2, fontWeight: 'bold' }}>
            PostgreSQL Credential in n8n einrichten
          </Typography>

          <Alert severity="warning" sx={{ mb: 2 }}>
            Verwende immer den Docker-internen Hostnamen <code>db</code> (nicht <code>localhost</code>)!
          </Alert>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Step 1: Credential erstellen</Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            n8n &rarr; Settings &rarr; Credentials &rarr; Add Credential &rarr; "Postgres"
          </Typography>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Step 2: Verbindungsdaten eingeben</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Feld</strong></TableCell>
                  <TableCell><strong>Wert</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>Host</TableCell><TableCell><code>db</code></TableCell></TableRow>
                <TableRow><TableCell>Port</TableCell><TableCell><code>5432</code></TableCell></TableRow>
                <TableRow><TableCell>Database</TableCell><TableCell><code>pump_platform</code></TableCell></TableRow>
                <TableRow><TableCell>User</TableCell><TableCell><code>pump</code></TableCell></TableRow>
                <TableRow><TableCell>Password</TableCell><TableCell>Aus <code>.env</code> Datei (DB_PASSWORD)</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Step 3: Testen</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            "Test Connection" klicken. Bei Erfolg erscheint ein gruenes Haekchen.
          </Typography>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Nuetzliche Tabellen fuer n8n-Queries</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Tabelle</strong></TableCell>
                  <TableCell><strong>Modul</strong></TableCell>
                  <TableCell><strong>Inhalt</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell><code>coin_metrics</code></TableCell><TableCell>Discovery</TableCell><TableCell>OHLCV-Daten aller getrackten Coins</TableCell></TableRow>
                <TableRow><TableCell><code>coin_streams</code></TableCell><TableCell>Discovery</TableCell><TableCell>Aktive Coin-Streams</TableCell></TableRow>
                <TableRow><TableCell><code>model_predictions</code></TableCell><TableCell>Predictions</TableCell><TableCell>ML-Vorhersagen mit Tags</TableCell></TableRow>
                <TableRow><TableCell><code>prediction_active_models</code></TableCell><TableCell>Predictions</TableCell><TableCell>Importierte ML-Modelle</TableCell></TableRow>
                <TableRow><TableCell><code>wallets</code></TableCell><TableCell>Trading</TableCell><TableCell>Wallet-Konfiguration</TableCell></TableRow>
                <TableRow><TableCell><code>trade_logs</code></TableCell><TableCell>Trading</TableCell><TableCell>Buy/Sell-Transaktionen</TableCell></TableRow>
                <TableRow><TableCell><code>ml_models</code></TableCell><TableCell>Training</TableCell><TableCell>Trainierte ML-Modelle</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>

        {/* 3. Webhook fuer Model-Alerts */}
        <Chapter
          id="wf-webhook"
          title="Webhook fuer Model-Alerts"
          icon="🔔"
          expanded={expandedChapters.includes('wf-webhook')}
          onChange={handleChapterChange('wf-webhook')}
        >
          <Typography variant="body2" sx={{ mb: 2 }}>
            Der Prediction-Server sendet Alerts an n8n-Webhooks, wenn ein ML-Modell einen Pump erkennt.
          </Typography>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Step 1: Webhook-Node in n8n erstellen</Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            n8n &rarr; New Workflow &rarr; Add Node &rarr; "Webhook" &rarr; Method: POST
          </Typography>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Step 2: Webhook-URL kopieren</Typography>
          <CodeBlock>
{`Format: http://n8n:5678/webhook/<webhook-id>

Beispiel: http://n8n:5678/webhook/abc-123-def-456

WICHTIG: Verwende den INTERNEN Hostnamen "n8n", nicht "localhost"!`}
          </CodeBlock>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Step 3: In Predictions konfigurieren</Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Predictions &rarr; Models &rarr; Modell waehlen &rarr; Alert Config &rarr; Webhook-URL einfuegen
          </Typography>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Alert-Payload Struktur</Typography>
          <CodeBlock>
{`{
  "model_name": "XGBoost_v42",
  "model_id": 18,
  "coin_id": "ABC123...",
  "prediction": 1,
  "probability": 0.85,
  "tag": "alert",
  "threshold": 0.7,
  "future_minutes": 5,
  "min_percent_change": 2.0,
  "current_price": 0.00001234,
  "market_cap": 12500,
  "timestamp": "2026-02-08T12:34:56Z"
}`}
          </CodeBlock>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Send-Modi</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Chip label="all" size="small" /><Chip label="alerts_only" size="small" color="warning" />
            <Chip label="positive_only" size="small" color="success" /><Chip label="negative_only" size="small" color="error" />
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Mehrfachauswahl moeglich. Z.B. alerts_only + positive_only sendet alle Vorhersagen &ge; 50%.
          </Typography>
        </Chapter>

        {/* 4. Interne Service-Kommunikation */}
        <Chapter
          id="wf-communication"
          title="Interne Service-Kommunikation"
          icon="🔗"
          expanded={expandedChapters.includes('wf-communication')}
          onChange={handleChapterChange('wf-communication')}
        >
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Von</strong></TableCell>
                  <TableCell><strong>Nach</strong></TableCell>
                  <TableCell><strong>URL</strong></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Zweck</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Backend</TableCell>
                  <TableCell>DB</TableCell>
                  <TableCell><code>postgresql://pump:***@db:5432/pump_platform</code></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Datenbank-Zugriff</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Backend</TableCell>
                  <TableCell>n8n</TableCell>
                  <TableCell><code>http://n8n:5678/webhook/...</code></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Alerts senden</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>n8n</TableCell>
                  <TableCell>DB</TableCell>
                  <TableCell><code>db:5432</code></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>SQL-Queries</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>n8n</TableCell>
                  <TableCell>Backend</TableCell>
                  <TableCell><code>http://backend:8000/api/...</code></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>API-Aufrufe</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Frontend</TableCell>
                  <TableCell>Backend</TableCell>
                  <TableCell><code>/api/* (Nginx Proxy)</code></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>UI-Requests</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Nginx Proxy-Regeln</Typography>
          <CodeBlock>
{`# Frontend nginx.conf
location /api/find/     { proxy_pass http://backend:8000/api/find/;     }
location /api/training/ { proxy_pass http://backend:8000/api/training/; }
location /api/server/   { proxy_pass http://backend:8000/api/server/;   }
location /api/buy/      { proxy_pass http://backend:8000/api/buy/;      }
location /n8n/          { proxy_pass http://n8n:5678/;                  }

# n8n -> Backend (aus Workflows heraus)
HTTP Request Node: http://backend:8000/api/buy/buy`}
          </CodeBlock>
        </Chapter>

        {/* 5. Beispiel-Workflows */}
        <Chapter
          id="wf-examples"
          title="Beispiel-Workflows"
          icon="🚀"
          expanded={expandedChapters.includes('wf-examples')}
          onChange={handleChapterChange('wf-examples')}
        >
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>1. Alert &rarr; Webhook &rarr; Buy</Typography>
          <CodeBlock>
{`Trigger: Webhook Node (POST)
  -> Receive Alert Payload from Prediction Server
  -> IF probability >= 0.80
    -> HTTP Request: POST http://backend:8000/api/buy/buy
       Body: {
         "wallet_alias": "worker_bot_01",
         "mint": "{{ $json.coin_id }}",
         "amount_sol": 0.1
       }
    -> Telegram/Discord Notification
  -> ELSE
    -> Log to Google Sheet / DB`}
          </CodeBlock>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>2. Scheduled DB Query</Typography>
          <CodeBlock>
{`Trigger: Schedule (every 5 minutes)
  -> Postgres Node:
     SELECT mint, price_close, volume_sol
     FROM coin_metrics
     WHERE timestamp > NOW() - INTERVAL '5 minutes'
     ORDER BY volume_sol DESC LIMIT 10
  -> Filter: volume_sol > 10
  -> Telegram: "Top Volume Coins: ..."
  -> Optional: POST /api/server/predict for each coin`}
          </CodeBlock>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>3. Portfolio-Monitor</Typography>
          <CodeBlock>
{`Trigger: Schedule (every 1 minute)
  -> HTTP Request: GET http://backend:8000/api/buy/positions?status=OPEN
  -> Code Node: Calculate PnL for each position
  -> IF any position PnL < -10%
    -> HTTP Request: POST http://backend:8000/api/buy/sell
       Body: { "wallet_alias": "...", "mint": "...", "amount_pct": 100 }
    -> Alert: "Stop-Loss triggered for ..."
  -> IF any position PnL > 30%
    -> Sell 50% and notify`}
          </CodeBlock>
        </Chapter>

        {/* 6. Troubleshooting */}
        <Chapter
          id="wf-troubleshooting"
          title="Troubleshooting"
          icon="🔧"
          expanded={expandedChapters.includes('wf-troubleshooting')}
          onChange={handleChapterChange('wf-troubleshooting')}
        >
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Problem</strong></TableCell>
                  <TableCell><strong>Ursache</strong></TableCell>
                  <TableCell><strong>Loesung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>"Connection refused"</TableCell>
                  <TableCell>Falscher Hostname (z.B. localhost statt db)</TableCell>
                  <TableCell>Docker-internen Hostnamen verwenden: <code>db</code>, <code>backend</code>, <code>n8n</code></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>"ECONNREFUSED :5432"</TableCell>
                  <TableCell>DB-Container noch nicht bereit</TableCell>
                  <TableCell>Warten oder <code>docker compose restart db</code></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Webhook kommt nicht an</TableCell>
                  <TableCell>Falscher Port oder Workflow nicht aktiv</TableCell>
                  <TableCell>Workflow aktivieren, URL pruefen (<code>http://n8n:5678/...</code>)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>n8n kann Backend nicht erreichen</TableCell>
                  <TableCell>Falscher URL-Pfad</TableCell>
                  <TableCell><code>http://backend:8000/api/...</code> verwenden</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>CORS Fehler</TableCell>
                  <TableCell>Direkter Browser-Zugriff auf internen Port</TableCell>
                  <TableCell>Immer ueber Nginx (Port 3000) zugreifen</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Logs pruefen</Typography>
          <CodeBlock>
{`# Alle Service-Logs
docker compose logs -f

# Nur n8n Logs
docker compose logs -f n8n

# Nur Backend Logs
docker compose logs -f backend

# DB-Verbindung testen
docker compose exec db psql -U pump -d pump_platform -c "SELECT 1"

# n8n Container Shell
docker compose exec n8n sh`}
          </CodeBlock>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Port-Mapping Uebersicht</Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>Intern</strong> (Docker-zu-Docker): Service-Name + interner Port<br />
            <strong>Extern</strong> (Browser/Host): localhost + externer Port
          </Alert>
          <CodeBlock>
{`Intern (von n8n/backend):    Extern (vom Host/Browser):
  db:5432                      localhost:5432
  backend:8000                 localhost:3000/api/*
  n8n:5678                     localhost:3000/n8n/
  frontend:80                  localhost:3000`}
          </CodeBlock>
        </Chapter>
      </>
    )}
  </InfoPageWrapper>
);

export default WorkflowsGuide;
