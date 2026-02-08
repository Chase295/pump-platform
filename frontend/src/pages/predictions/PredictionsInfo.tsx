import React from 'react';
import {
  Typography,
  Box,
  Alert,
  Divider,
  Grid,
  Chip,
  List,
  ListItem,
  ListItemText,
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
  McpToolRow,
  ConfigItem,
  InfoPageWrapper,
} from '../../components/shared/InfoChapter';

const chapterIds = [
  'pred-overview',
  'pred-features',
  'pred-alerts',
  'pred-evaluation',
  'pred-eventhandler',
  'pred-settings',
  'pred-api',
  'pred-filters',
  'pred-mcp',
];

const SmallTable: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TableContainer component={Paper} sx={{ mb: 2, overflowX: 'auto', '& .MuiTable-root': { minWidth: 400 } }}>
    {children}
  </TableContainer>
);

const PredictionsInfo: React.FC = () => (
  <InfoPageWrapper
    title="Predictions (pump-server)"
    subtitle="Echtzeit ML-Vorhersagen, Alert-System & Modell-Verwaltung"
    chapterIds={chapterIds}
  >
    {({ expandedChapters, handleChapterChange }) => (
      <>
        {/* 1. Was ist dieses System? */}
        <Chapter
          id="pred-overview"
          title="Was ist dieses System?"
          icon="📖"
          expanded={expandedChapters.includes('pred-overview')}
          onChange={handleChapterChange('pred-overview')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Der Prediction Server ist ein Echtzeit-Vorhersage-System fuer Pump-Detection auf der Solana-Blockchain.
            Er importiert trainierte ML-Modelle, macht automatisch Vorhersagen bei neuen Coin-Daten und
            loest Alerts ueber n8n aus.
          </Typography>
          <Box component="ul" sx={{ pl: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2">Modelle vom Training Service importieren und verwalten</Typography></li>
            <li><Typography variant="body2">Automatische Vorhersagen via LISTEN/NOTIFY oder Polling</Typography></li>
            <li><Typography variant="body2">Zeitbasierte Vorhersagen: "Steigt der Preis um X% in Y Minuten?"</Typography></li>
            <li><Typography variant="body2">Alert-System mit konfigurierbaren Thresholds und n8n-Integration</Typography></li>
            <li><Typography variant="body2">ATH-Tracking waehrend der Auswertungsperiode</Typography></li>
            <li><Typography variant="body2">Coin-Ignore-System gegen zu haeufige Scans</Typography></li>
          </Box>
          <Typography variant="body2" sx={{ mt: 2, fontStyle: 'italic', color: 'text.secondary' }}>
            Workflow: Modell importieren &rarr; Alert-Config einstellen &rarr; Aktivieren &rarr; Automatische Vorhersagen
            &rarr; Alerts an n8n &rarr; Auswertung & Statistiken
          </Typography>
        </Chapter>

        {/* 2. Features im Detail */}
        <Chapter
          id="pred-features"
          title="Features im Detail"
          icon="⚡"
          expanded={expandedChapters.includes('pred-features')}
          onChange={handleChapterChange('pred-features')}
        >
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Feature</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Modell-Import</TableCell>
                  <TableCell>Laedt Modell vom Training Service herunter und speichert es lokal</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Aktivieren/Deaktivieren</TableCell>
                  <TableCell>Steuert ob ein Modell fuer Vorhersagen verwendet wird</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Automatische Vorhersagen</TableCell>
                  <TableCell>Event-Handler ueberwacht coin_metrics und macht Vorhersagen bei neuen Eintraegen</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Phasen-Filterung</TableCell>
                  <TableCell>Modelle koennen fuer spezifische Coin-Phasen (1, 2, 3...) konfiguriert werden</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Statistiken</TableCell>
                  <TableCell>Detaillierte Performance-Metriken (Success-Rate, Profit/Loss)</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>

        {/* 3. Alert-System */}
        <Chapter
          id="pred-alerts"
          title="Alert-System"
          icon="🔔"
          expanded={expandedChapters.includes('pred-alerts')}
          onChange={handleChapterChange('pred-alerts')}
        >
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Alert-Threshold</Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Der Alert-Threshold bestimmt, ab welcher Wahrscheinlichkeit eine Vorhersage als "Alert" gilt.
            Standard: 70% (0.7). Konfigurierbar pro Modell.
          </Typography>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Send-Modi (n8n)</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Modus</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell><code>all</code></TableCell><TableCell>Alle Vorhersagen senden</TableCell></TableRow>
                <TableRow><TableCell><code>alerts_only</code></TableCell><TableCell>Nur Vorhersagen ueber Alert-Threshold</TableCell></TableRow>
                <TableRow><TableCell><code>positive_only</code></TableCell><TableCell>Nur Vorhersagen &ge; 50%</TableCell></TableRow>
                <TableRow><TableCell><code>negative_only</code></TableCell><TableCell>Nur Vorhersagen &lt; 50%</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Coin-Ignore-System</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Einstellung</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell><code>ignore_bad_seconds</code></TableCell><TableCell>Ignoriert Coin nach negativer Vorhersage (&lt; 50%)</TableCell></TableRow>
                <TableRow><TableCell><code>ignore_positive_seconds</code></TableCell><TableCell>Ignoriert Coin nach positiver Vorhersage (&ge; 50% aber &lt; Threshold)</TableCell></TableRow>
                <TableRow><TableCell><code>ignore_alert_seconds</code></TableCell><TableCell>Ignoriert Coin nach Alert (&ge; Threshold)</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>
          <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
            Wenn ein Coin ignoriert wird, wird er komplett uebersprungen - keine Vorhersage, kein Log.
          </Typography>
        </Chapter>

        {/* 4. Evaluation & Statistiken */}
        <Chapter
          id="pred-evaluation"
          title="Evaluation & Statistiken"
          icon="📊"
          expanded={expandedChapters.includes('pred-evaluation')}
          onChange={handleChapterChange('pred-evaluation')}
        >
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Vorhersage-Tags</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Chip label="Negativ" size="small" color="error" />
            <Typography variant="body2" sx={{ alignSelf: 'center' }}>&lt; 50%</Typography>
            <Chip label="Positiv" size="small" color="success" />
            <Typography variant="body2" sx={{ alignSelf: 'center' }}>&ge; 50%</Typography>
            <Chip label="Alert" size="small" sx={{ bgcolor: '#ff9800', color: '#fff' }} />
            <Typography variant="body2" sx={{ alignSelf: 'center' }}>&ge; Threshold</Typography>
          </Box>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Status-System</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Feld</strong></TableCell>
                  <TableCell><strong>Werte</strong></TableCell>
                  <TableCell><strong>Bedeutung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>Tag</TableCell><TableCell>negativ, positiv, alert</TableCell><TableCell>Basierend auf Wahrscheinlichkeit</TableCell></TableRow>
                <TableRow><TableCell>Status</TableCell><TableCell>aktiv, inaktiv</TableCell><TableCell>aktiv = Auswertung ausstehend</TableCell></TableRow>
                <TableRow><TableCell>Result</TableCell><TableCell>success, failed, not_applicable</TableCell><TableCell>Ergebnis der Auswertung</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>ATH-Tracking</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Waehrend der Auswertungsperiode wird der hoechste und niedrigste Preis kontinuierlich verfolgt.
            Die finale Auswertung basiert auf dem Preis zum evaluation_timestamp, aber das ATH zeigt
            den maximalen Gewinn, der moeglich gewesen waere.
          </Typography>
        </Chapter>

        {/* 5. Event-Handler System */}
        <Chapter
          id="pred-eventhandler"
          title="Event-Handler System"
          icon="⚡"
          expanded={expandedChapters.includes('pred-eventhandler')}
          onChange={handleChapterChange('pred-eventhandler')}
        >
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>LISTEN/NOTIFY (Echtzeit)</Typography>
          <List dense>
            <ListItem><ListItemText primary="PostgreSQL LISTEN/NOTIFY fuer Echtzeit-Erkennung (&lt; 100ms Latency)" /></ListItem>
            <ListItem><ListItemText primary="Automatischer Trigger in coin_metrics sendet NOTIFY bei jedem INSERT" /></ListItem>
            <ListItem><ListItemText primary="Fallback: Polling alle 30 Sekunden" /></ListItem>
          </List>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Batch-Verarbeitung</Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Sammelt max. 50 Coins oder wartet 5 Sekunden, dann parallele Verarbeitung mit allen aktiven Modellen.
          </Typography>

          <CodeBlock>
{`Verarbeitungs-Flow:
  1. Neuer Eintrag in coin_metrics
  2. Event-Handler erkennt neuen Eintrag
  3. Prueft Coin-Filter (all/whitelist)
  4. Prueft Phasen-Filter
  5. Prueft Coin-Ignore-Status
  6. Laedt Coin-Historie fuer Feature-Engineering
  7. Macht Vorhersage mit allen aktiven Modellen
  8. Speichert in model_predictions
  9. Aktualisiert Coin-Ignore-Cache
  10. Sendet an n8n (wenn konfiguriert)
  11. Background-Job evaluiert automatisch`}
          </CodeBlock>
        </Chapter>

        {/* 6. Einstellungen */}
        <Chapter
          id="pred-settings"
          title="Einstellungen"
          icon="⚙️"
          expanded={expandedChapters.includes('pred-settings')}
          onChange={handleChapterChange('pred-settings')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>System-Einstellungen</Typography>
          <ConfigItem name="DB_DSN" value="postgresql://..." desc="PostgreSQL Verbindungs-String" />
          <ConfigItem name="TRAINING_SERVICE_API_URL" value="http://training:8000" desc="URL zum Training Service (fuer Modell-Import)" />
          <ConfigItem name="N8N_WEBHOOK_URL" value="http://n8n:5678/webhook/..." desc="Globale n8n Webhook-URL" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Modell-spezifische Einstellungen</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Einstellung</strong></TableCell>
                  <TableCell><strong>Default</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>alert_threshold</TableCell><TableCell>0.7</TableCell><TableCell>Min. Wahrscheinlichkeit fuer Alert</TableCell></TableRow>
                <TableRow><TableCell>n8n_webhook_url</TableCell><TableCell>-</TableCell><TableCell>Modell-spezifische Webhook-URL</TableCell></TableRow>
                <TableRow><TableCell>n8n_enabled</TableCell><TableCell>true</TableCell><TableCell>n8n-Integration aktiviert</TableCell></TableRow>
                <TableRow><TableCell>n8n_send_mode</TableCell><TableCell>["all"]</TableCell><TableCell>Welche Vorhersagen gesendet werden</TableCell></TableRow>
                <TableRow><TableCell>coin_filter_mode</TableCell><TableCell>"all"</TableCell><TableCell>all, whitelist</TableCell></TableRow>
                <TableRow><TableCell>phases</TableCell><TableCell>null</TableCell><TableCell>Erlaubte Coin-Phasen (Array)</TableCell></TableRow>
                <TableRow><TableCell>ignore_bad_seconds</TableCell><TableCell>0</TableCell><TableCell>Ignore nach negativ</TableCell></TableRow>
                <TableRow><TableCell>ignore_positive_seconds</TableCell><TableCell>0</TableCell><TableCell>Ignore nach positiv</TableCell></TableRow>
                <TableRow><TableCell>ignore_alert_seconds</TableCell><TableCell>0</TableCell><TableCell>Ignore nach Alert</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>

        {/* 7. API-Endpunkte */}
        <Chapter
          id="pred-api"
          title="API-Endpunkte"
          icon="🔌"
          expanded={expandedChapters.includes('pred-api')}
          onChange={handleChapterChange('pred-api')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Modell-Verwaltung</Typography>
          <EndpointRow method="GET" path="/api/server/models/available" desc="Verfuegbare Modelle vom Training Service" />
          <EndpointRow method="POST" path="/api/server/models/import" desc="Modell importieren" />
          <EndpointRow method="GET" path="/api/server/models" desc="Alle aktiven Modelle" />
          <EndpointRow method="GET" path="/api/server/models/{id}" desc="Modell-Details" />
          <EndpointRow method="POST" path="/api/server/models/{id}/activate" desc="Modell aktivieren" />
          <EndpointRow method="POST" path="/api/server/models/{id}/deactivate" desc="Modell deaktivieren" />
          <EndpointRow method="PATCH" path="/api/server/models/{id}/rename" desc="Modell umbenennen" />
          <EndpointRow method="DELETE" path="/api/server/models/{id}" desc="Modell loeschen" />
          <EndpointRow method="GET" path="/api/server/models/{id}/statistics" desc="Modell-Statistiken" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Alert-Konfiguration</Typography>
          <EndpointRow method="PATCH" path="/api/server/models/{id}/alert-config" desc="Alert-Config aendern" />
          <EndpointRow method="PATCH" path="/api/server/models/{id}/ignore-settings" desc="Ignore-Settings aendern" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Vorhersagen</Typography>
          <EndpointRow method="POST" path="/api/server/predict" desc="Manuelle Vorhersage fuer Coin" />
          <EndpointRow method="GET" path="/api/server/predictions" desc="Alle Vorhersagen (mit Filtern)" />
          <EndpointRow method="GET" path="/api/server/model-predictions" desc="Model-Predictions (neue Architektur)" />
          <EndpointRow method="GET" path="/api/server/predictions/latest/{coin_id}" desc="Neueste Vorhersage fuer Coin" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Alerts</Typography>
          <EndpointRow method="GET" path="/api/server/alerts" desc="Alert-Log mit Filtern" />
          <EndpointRow method="GET" path="/api/server/alerts/{id}" desc="Alert-Details" />
          <EndpointRow method="GET" path="/api/server/alerts/statistics" desc="Alert-Statistiken" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>System</Typography>
          <EndpointRow method="GET" path="/api/server/health" desc="Health Check" />
          <EndpointRow method="GET" path="/api/server/stats" desc="Service-Statistiken" />
          <EndpointRow method="GET" path="/api/server/config" desc="Konfiguration laden" />
          <EndpointRow method="POST" path="/api/server/config" desc="Konfiguration speichern" />
          <EndpointRow method="POST" path="/api/server/system/restart" desc="Service neustarten" />
          <EndpointRow method="GET" path="/api/server/logs" desc="Log-Zeilen abrufen" />
        </Chapter>

        {/* 8. Filter & Suche */}
        <Chapter
          id="pred-filters"
          title="Filter & Suche"
          icon="🔍"
          expanded={expandedChapters.includes('pred-filters')}
          onChange={handleChapterChange('pred-filters')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Alert-Log Filter</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Filter</strong></TableCell>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Werte</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>Status</TableCell><TableCell><code>status</code></TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>pending, success, failed, expired</TableCell></TableRow>
                <TableRow><TableCell>Vorhersage-Typ</TableCell><TableCell><code>prediction_type</code></TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>time_based, classic</TableCell></TableRow>
                <TableRow><TableCell>Coin-ID</TableCell><TableCell><code>coin_id</code></TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Mint-Adresse</TableCell></TableRow>
                <TableRow><TableCell>Von/Bis Datum</TableCell><TableCell><code>date_from, date_to</code></TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>ISO-Format</TableCell></TableRow>
                <TableRow><TableCell>Unique Coins</TableCell><TableCell><code>unique_coins</code></TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>true/false</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Vorhersagen Filter</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Filter</strong></TableCell>
                  <TableCell><strong>Parameter</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>Modell</TableCell><TableCell><code>active_model_id</code></TableCell></TableRow>
                <TableRow><TableCell>Coin-ID</TableCell><TableCell><code>coin_id</code></TableCell></TableRow>
                <TableRow><TableCell>Tag</TableCell><TableCell><code>tag</code> (negativ, positiv, alert)</TableCell></TableRow>
                <TableRow><TableCell>Status</TableCell><TableCell><code>status</code> (aktiv, inaktiv)</TableCell></TableRow>
                <TableRow><TableCell>Min. Probability</TableCell><TableCell><code>min_probability</code> (0.0 - 1.0)</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>

        {/* 9. MCP-Tools */}
        <Chapter
          id="pred-mcp"
          title="MCP-Tools (38+)"
          icon="🤖"
          expanded={expandedChapters.includes('pred-mcp')}
          onChange={handleChapterChange('pred-mcp')}
        >
          <Alert severity="info" sx={{ mb: 2 }}>
            Alle REST-Endpoints werden automatisch als MCP-Tools exponiert.
          </Alert>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Model-Tools (9)</Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            {[
              { name: 'list_active_models', desc: 'Alle aktiven Modelle' },
              { name: 'list_available_models', desc: 'Verfuegbare Modelle vom Training Service' },
              { name: 'import_model', desc: 'Modell importieren' },
              { name: 'get_model_details', desc: 'Modell-Details' },
              { name: 'activate_model', desc: 'Modell aktivieren' },
              { name: 'deactivate_model', desc: 'Modell deaktivieren' },
              { name: 'rename_model', desc: 'Modell umbenennen' },
              { name: 'delete_model', desc: 'Modell loeschen' },
              { name: 'update_model_metrics', desc: 'Performance-Metriken aktualisieren' },
            ].map((t) => <Grid key={t.name} size={{ xs: 12, sm: 6 }}><McpToolRow name={t.name} desc={t.desc} cat="Models" /></Grid>)}
          </Grid>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Prediction-Tools (7)</Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            {[
              { name: 'predict_coin', desc: 'ML-Vorhersage fuer Coin' },
              { name: 'get_predictions', desc: 'Historische Vorhersagen' },
              { name: 'get_latest_prediction', desc: 'Neueste fuer Coin' },
              { name: 'get_model_predictions', desc: 'Model-Predictions' },
              { name: 'delete_model_predictions', desc: 'Predictions loeschen' },
              { name: 'reset_model_statistics', desc: 'Statistiken zuruecksetzen' },
              { name: 'get_coin_details', desc: 'Coin-Details mit Preishistorie' },
            ].map((t) => <Grid key={t.name} size={{ xs: 12, sm: 6 }}><McpToolRow name={t.name} desc={t.desc} cat="Predictions" /></Grid>)}
          </Grid>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Config-Tools (7)</Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            {[
              { name: 'update_alert_config', desc: 'Alert-Config aendern' },
              { name: 'get_model_statistics', desc: 'Performance-Statistiken' },
              { name: 'get_n8n_status', desc: 'n8n Webhook-Status' },
              { name: 'get_ignore_settings', desc: 'Ignore-Einstellungen' },
              { name: 'update_ignore_settings', desc: 'Ignore-Einstellungen aendern' },
              { name: 'get_max_log_entries', desc: 'Max Log-Eintraege' },
              { name: 'update_max_log_entries', desc: 'Max Log-Eintraege aendern' },
            ].map((t) => <Grid key={t.name} size={{ xs: 12, sm: 6 }}><McpToolRow name={t.name} desc={t.desc} cat="Config" /></Grid>)}
          </Grid>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Alert-Tools (5)</Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            {[
              { name: 'get_alerts', desc: 'Alerts mit Filtern' },
              { name: 'get_alert_details', desc: 'Alert-Details' },
              { name: 'get_alert_statistics', desc: 'Alert-Statistiken' },
              { name: 'get_all_models_alert_statistics', desc: 'Batch Alert-Stats' },
              { name: 'delete_model_alerts', desc: 'Alerts loeschen' },
            ].map((t) => <Grid key={t.name} size={{ xs: 12, sm: 6 }}><McpToolRow name={t.name} desc={t.desc} cat="Alerts" /></Grid>)}
          </Grid>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>System-Tools (10)</Typography>
          <Grid container spacing={1}>
            {[
              { name: 'health_check', desc: 'Service-Status' },
              { name: 'get_stats', desc: 'Service-Statistiken' },
              { name: 'get_system_config', desc: 'Konfiguration laden' },
              { name: 'update_configuration', desc: 'Konfiguration speichern' },
              { name: 'get_logs', desc: 'Log-Zeilen' },
              { name: 'restart_system', desc: 'Service neustarten' },
              { name: 'delete_old_logs', desc: 'Alte Logs loeschen' },
              { name: 'migrate_performance_metrics', desc: 'DB-Migration' },
              { name: 'debug_active_models', desc: 'Debug: Modelle' },
              { name: 'debug_coin_metrics', desc: 'Debug: Metriken' },
            ].map((t) => <Grid key={t.name} size={{ xs: 12, sm: 6 }}><McpToolRow name={t.name} desc={t.desc} cat="System" /></Grid>)}
          </Grid>
        </Chapter>
      </>
    )}
  </InfoPageWrapper>
);

export default PredictionsInfo;
