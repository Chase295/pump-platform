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
            <li><Typography variant="body2">Prediction Defaults: Standardwerte fuer neu importierte Modelle</Typography></li>
            <li><Typography variant="body2">Log Retention: Begrenzung der gespeicherten Vorhersagen pro Coin</Typography></li>
          </Box>
          <Typography variant="body2" sx={{ mt: 2, fontStyle: 'italic', color: 'text.secondary' }}>
            Workflow: Defaults konfigurieren &rarr; Modell importieren &rarr; Alert-Config anpassen
            &rarr; Aktivieren &rarr; Automatische Vorhersagen &rarr; Alerts an n8n &rarr; Auswertung & Statistiken
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
                  <TableCell>Laedt Modell vom Training Service und speichert es lokal. Wendet dabei die konfigurierten Prediction Defaults an.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Prediction Defaults</TableCell>
                  <TableCell>Globale Standardwerte (Alert-Threshold, n8n, Ignore, Log Retention), die beim Import automatisch auf jedes neue Modell angewendet werden.</TableCell>
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
                  <TableCell>Log Retention</TableCell>
                  <TableCell>Begrenzt die Anzahl gespeicherter Vorhersagen pro Coin (getrennt nach negativ/positiv/alert). 0 = unbegrenzt.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Ignorierte an n8n</TableCell>
                  <TableCell>Optional: Auch ignorierte Vorhersagen (durch Cooldown uebersprungen) an n8n senden (send_ignored_to_n8n)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Statistiken</TableCell>
                  <TableCell>Detaillierte Performance-Metriken (Success-Rate, Profit/Loss), filterbar in der Log-Ansicht</TableCell>
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
            Standard: 70% (0.7). Konfigurierbar pro Modell ueber Alert-Config oder global ueber Prediction Defaults.
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

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Coin-Ignore-System (Cooldowns)</Typography>
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
                <TableRow><TableCell><code>send_ignored_to_n8n</code></TableCell><TableCell>Wenn true, werden auch ignorierte Vorhersagen an n8n gesendet</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>
          <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary', mb: 2 }}>
            Wenn ein Coin ignoriert wird, wird er komplett uebersprungen - keine Vorhersage, kein Log.
            Ausnahme: Wenn send_ignored_to_n8n aktiviert ist, wird trotzdem an n8n gesendet.
          </Typography>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Log Retention (Max Log Entries)</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Einstellung</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell><code>max_log_entries_per_coin_negative</code></TableCell><TableCell>Max. gespeicherte negative Vorhersagen pro Coin (0 = unbegrenzt)</TableCell></TableRow>
                <TableRow><TableCell><code>max_log_entries_per_coin_positive</code></TableCell><TableCell>Max. gespeicherte positive Vorhersagen pro Coin (0 = unbegrenzt)</TableCell></TableRow>
                <TableRow><TableCell><code>max_log_entries_per_coin_alert</code></TableCell><TableCell>Max. gespeicherte Alert-Vorhersagen pro Coin (0 = unbegrenzt)</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>
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
            <ListItem><ListItemText primary="PostgreSQL LISTEN/NOTIFY fuer Echtzeit-Erkennung (< 100ms Latency)" /></ListItem>
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
  5. Prueft Coin-Ignore-Status (Cooldowns)
  6. Prueft Log Retention (max_log_entries)
  7. Laedt Coin-Historie fuer Feature-Engineering
  8. Macht Vorhersage mit allen aktiven Modellen
  9. Speichert in model_predictions
  10. Aktualisiert Coin-Ignore-Cache
  11. Sendet an n8n (wenn konfiguriert + send_mode passt)
  12. Background-Job evaluiert automatisch`}
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
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Prediction Defaults (global)</Typography>
          <Typography variant="body2" sx={{ mb: 1.5, color: 'text.secondary' }}>
            Unter dem Tab "Defaults" koennen globale Standardwerte gesetzt werden.
            Diese werden automatisch auf jedes neu importierte Modell angewendet.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Key</strong></TableCell>
                  <TableCell><strong>Default</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>alert_threshold</TableCell><TableCell>0.7</TableCell><TableCell>Min. Wahrscheinlichkeit fuer Alert</TableCell></TableRow>
                <TableRow><TableCell>n8n_enabled</TableCell><TableCell>true</TableCell><TableCell>n8n-Integration aktiviert</TableCell></TableRow>
                <TableRow><TableCell>n8n_webhook_url</TableCell><TableCell>""</TableCell><TableCell>Webhook-URL fuer n8n</TableCell></TableRow>
                <TableRow><TableCell>n8n_send_mode</TableCell><TableCell>["all"]</TableCell><TableCell>Welche Vorhersagen gesendet werden</TableCell></TableRow>
                <TableRow><TableCell>ignore_bad_seconds</TableCell><TableCell>0</TableCell><TableCell>Cooldown nach negativ (Sekunden)</TableCell></TableRow>
                <TableRow><TableCell>ignore_positive_seconds</TableCell><TableCell>0</TableCell><TableCell>Cooldown nach positiv (Sekunden)</TableCell></TableRow>
                <TableRow><TableCell>ignore_alert_seconds</TableCell><TableCell>0</TableCell><TableCell>Cooldown nach Alert (Sekunden)</TableCell></TableRow>
                <TableRow><TableCell>max_log_entries_per_coin_negative</TableCell><TableCell>0</TableCell><TableCell>Max. Logs pro Coin (negativ, 0 = unbegrenzt)</TableCell></TableRow>
                <TableRow><TableCell>max_log_entries_per_coin_positive</TableCell><TableCell>0</TableCell><TableCell>Max. Logs pro Coin (positiv, 0 = unbegrenzt)</TableCell></TableRow>
                <TableRow><TableCell>max_log_entries_per_coin_alert</TableCell><TableCell>0</TableCell><TableCell>Max. Logs pro Coin (alert, 0 = unbegrenzt)</TableCell></TableRow>
                <TableRow><TableCell>send_ignored_to_n8n</TableCell><TableCell>false</TableCell><TableCell>Ignorierte trotzdem an n8n senden</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Modell-spezifische Einstellungen</Typography>
          <Typography variant="body2" sx={{ mb: 1.5, color: 'text.secondary' }}>
            Jedes importierte Modell hat eigene Einstellungen, die ueber die Alert-Config-Seite oder API angepasst werden koennen.
            Beim Import werden die Prediction Defaults als Startwerte verwendet.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Einstellung</strong></TableCell>
                  <TableCell><strong>Bereich</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>alert_threshold</TableCell><TableCell>0.01 - 0.99</TableCell><TableCell>Min. Wahrscheinlichkeit fuer Alert</TableCell></TableRow>
                <TableRow><TableCell>n8n_webhook_url</TableCell><TableCell>URL</TableCell><TableCell>Modell-spezifische Webhook-URL</TableCell></TableRow>
                <TableRow><TableCell>n8n_enabled</TableCell><TableCell>true/false</TableCell><TableCell>n8n-Integration aktiviert</TableCell></TableRow>
                <TableRow><TableCell>n8n_send_mode</TableCell><TableCell>Array</TableCell><TableCell>Welche Vorhersagen gesendet werden</TableCell></TableRow>
                <TableRow><TableCell>coin_filter_mode</TableCell><TableCell>"all" / "whitelist"</TableCell><TableCell>Coin-Filter-Modus</TableCell></TableRow>
                <TableRow><TableCell>coin_whitelist</TableCell><TableCell>Array</TableCell><TableCell>Erlaubte Coin-Mints (bei Whitelist-Modus)</TableCell></TableRow>
                <TableRow><TableCell>ignore_bad_seconds</TableCell><TableCell>0 - 86400</TableCell><TableCell>Cooldown nach negativ</TableCell></TableRow>
                <TableRow><TableCell>ignore_positive_seconds</TableCell><TableCell>0 - 86400</TableCell><TableCell>Cooldown nach positiv</TableCell></TableRow>
                <TableRow><TableCell>ignore_alert_seconds</TableCell><TableCell>0 - 86400</TableCell><TableCell>Cooldown nach Alert</TableCell></TableRow>
                <TableRow><TableCell>max_log_entries_per_coin_negative</TableCell><TableCell>0 - 1000</TableCell><TableCell>Max. Logs pro Coin (negativ)</TableCell></TableRow>
                <TableRow><TableCell>max_log_entries_per_coin_positive</TableCell><TableCell>0 - 1000</TableCell><TableCell>Max. Logs pro Coin (positiv)</TableCell></TableRow>
                <TableRow><TableCell>max_log_entries_per_coin_alert</TableCell><TableCell>0 - 1000</TableCell><TableCell>Max. Logs pro Coin (alert)</TableCell></TableRow>
                <TableRow><TableCell>send_ignored_to_n8n</TableCell><TableCell>true/false</TableCell><TableCell>Ignorierte an n8n senden</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>

        {/* 7. API-Endpunkte */}
        <Chapter
          id="pred-api"
          title="API-Endpunkte (27)"
          icon="🔌"
          expanded={expandedChapters.includes('pred-api')}
          onChange={handleChapterChange('pred-api')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Modell-Verwaltung (10)</Typography>
          <EndpointRow method="GET" path="/api/server/models/available" desc="Verfuegbare Modelle vom Training Service" />
          <EndpointRow method="GET" path="/api/server/models/available/{model_id}" desc="Details eines verfuegbaren Modells" />
          <EndpointRow method="POST" path="/api/server/models/import" desc="Modell importieren (wendet Defaults an)" />
          <EndpointRow method="GET" path="/api/server/models" desc="Alle Modelle (Alias fuer /models/active)" />
          <EndpointRow method="GET" path="/api/server/models/active" desc="Aktive Modelle auflisten" />
          <EndpointRow method="GET" path="/api/server/models/{id}" desc="Modell-Details" />
          <EndpointRow method="POST" path="/api/server/models/{id}/activate" desc="Modell aktivieren" />
          <EndpointRow method="POST" path="/api/server/models/{id}/deactivate" desc="Modell deaktivieren" />
          <EndpointRow method="PATCH" path="/api/server/models/{id}/rename" desc="Modell umbenennen (custom_name)" />
          <EndpointRow method="DELETE" path="/api/server/models/{id}" desc="Modell und alle Predictions loeschen" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Modell-Konfiguration (6)</Typography>
          <EndpointRow method="PATCH" path="/api/server/models/{id}/alert-config" desc="Alert-Config aendern (Threshold, n8n, Filter)" />
          <EndpointRow method="GET" path="/api/server/models/{id}/ignore-settings" desc="Ignore-Cooldowns abfragen" />
          <EndpointRow method="PATCH" path="/api/server/models/{id}/ignore-settings" desc="Ignore-Cooldowns aendern" />
          <EndpointRow method="GET" path="/api/server/models/{id}/max-log-entries" desc="Log Retention abfragen" />
          <EndpointRow method="PATCH" path="/api/server/models/{id}/max-log-entries" desc="Log Retention aendern" />
          <EndpointRow method="GET" path="/api/server/models/{id}/n8n-status" desc="n8n Webhook-Status pruefen" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Vorhersagen (5)</Typography>
          <EndpointRow method="POST" path="/api/server/predict" desc="Manuelle Vorhersage fuer Coin" />
          <EndpointRow method="GET" path="/api/server/predictions" desc="Predictions mit Filtern abfragen" />
          <EndpointRow method="GET" path="/api/server/predictions/latest/{coin_id}" desc="Neueste Vorhersage fuer Coin" />
          <EndpointRow method="DELETE" path="/api/server/models/{id}/predictions" desc="Alle Predictions eines Modells loeschen" />
          <EndpointRow method="GET" path="/api/server/models/{id}/coin/{coin_id}" desc="Coin-Details mit Preishistorie & Evaluations" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Alert-Statistiken (1)</Typography>
          <EndpointRow method="GET" path="/api/server/alerts/statistics" desc="Alert-Statistiken (Success-Rate, Profit/Loss)" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Prediction Defaults (2)</Typography>
          <EndpointRow method="GET" path="/api/server/defaults" desc="Aktuelle Defaults abfragen" />
          <EndpointRow method="PATCH" path="/api/server/defaults" desc="Defaults aktualisieren (UPSERT)" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>System (3)</Typography>
          <EndpointRow method="GET" path="/api/server/health" desc="Health Check (DB + Alert-Evaluator)" />
          <EndpointRow method="GET" path="/api/server/stats" desc="Service-Statistiken (Modelle, Predictions 24h)" />
          <EndpointRow method="POST" path="/api/server/system/preload-models" desc="Alle aktiven Modelle in den Speicher laden" />
        </Chapter>

        {/* 8. Filter & Suche */}
        <Chapter
          id="pred-filters"
          title="Filter & Suche"
          icon="🔍"
          expanded={expandedChapters.includes('pred-filters')}
          onChange={handleChapterChange('pred-filters')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>GET /predictions Filter</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell><strong>Typ</strong></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell><code>active_model_id</code></TableCell><TableCell>int</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Modell-ID</TableCell></TableRow>
                <TableRow><TableCell><code>coin_id</code></TableCell><TableCell>string</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Mint-Adresse</TableCell></TableRow>
                <TableRow><TableCell><code>prediction</code></TableCell><TableCell>int</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Vorhersage-Wert (0 oder 1)</TableCell></TableRow>
                <TableRow><TableCell><code>min_probability</code></TableCell><TableCell>float</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Min. Wahrscheinlichkeit (0.0 - 1.0)</TableCell></TableRow>
                <TableRow><TableCell><code>tag</code></TableCell><TableCell>string</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>negativ, positiv, alert</TableCell></TableRow>
                <TableRow><TableCell><code>status</code></TableCell><TableCell>string</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>aktiv, inaktiv</TableCell></TableRow>
                <TableRow><TableCell><code>evaluation_result</code></TableCell><TableCell>string</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>success, failed, not_applicable</TableCell></TableRow>
                <TableRow><TableCell><code>limit</code></TableCell><TableCell>int</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>1 - 10.000 (Default: 50)</TableCell></TableRow>
                <TableRow><TableCell><code>offset</code></TableCell><TableCell>int</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Offset fuer Pagination</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>GET /alerts/statistics Filter</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell><strong>Typ</strong></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell><code>model_id</code></TableCell><TableCell>int</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Nur Statistiken fuer dieses Modell</TableCell></TableRow>
                <TableRow><TableCell><code>date_from</code></TableCell><TableCell>string</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Startdatum (ISO-Format)</TableCell></TableRow>
                <TableRow><TableCell><code>date_to</code></TableCell><TableCell>string</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Enddatum (ISO-Format)</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Frontend Log-Filter (Client-seitig)</Typography>
          <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
            Die Model-Logs-Seite bietet zusaetzliche Client-seitige Filter mit Operator-Vergleichen:
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Filter</strong></TableCell>
                  <TableCell><strong>Operatoren</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>Coin-ID Suche</TableCell><TableCell>Textsuche (contains)</TableCell></TableRow>
                <TableRow><TableCell>Tag</TableCell><TableCell>Multi-Select (alert, positiv, negativ)</TableCell></TableRow>
                <TableRow><TableCell>Evaluation</TableCell><TableCell>Multi-Select (success, failed, pending, expired)</TableCell></TableRow>
                <TableRow><TableCell>Probability</TableCell><TableCell>&gt; &lt; &ge; &le; = (in %)</TableCell></TableRow>
                <TableRow><TableCell>Actual Change</TableCell><TableCell>&gt; &lt; &ge; &le; = (in %)</TableCell></TableRow>
                <TableRow><TableCell>ATH High / ATH Low</TableCell><TableCell>&gt; &lt; &ge; &le; = (in %)</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>
          <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
            Statistiken (Overview, Alert Evaluation, Performance) werden live aus den gefilterten Daten berechnet.
          </Typography>
        </Chapter>

        {/* 9. MCP-Tools */}
        <Chapter
          id="pred-mcp"
          title="MCP-Tools (27)"
          icon="🤖"
          expanded={expandedChapters.includes('pred-mcp')}
          onChange={handleChapterChange('pred-mcp')}
        >
          <Alert severity="info" sx={{ mb: 2 }}>
            Alle REST-Endpoints werden automatisch als MCP-Tools exponiert (fastapi-mcp).
            Tool-Namen entsprechen den FastAPI-Funktionsnamen.
          </Alert>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Model-Tools (10)</Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            {[
              { name: 'get_available_models_endpoint', desc: 'Verfuegbare Modelle vom Training Service' },
              { name: 'get_available_model_details_endpoint', desc: 'Details eines verfuegbaren Modells' },
              { name: 'import_model_endpoint', desc: 'Modell importieren (wendet Defaults an)' },
              { name: 'get_models_endpoint', desc: 'Alle Modelle auflisten (Alias)' },
              { name: 'get_active_models_endpoint', desc: 'Aktive Modelle auflisten' },
              { name: 'get_active_model_endpoint', desc: 'Modell-Details abfragen' },
              { name: 'activate_model_endpoint', desc: 'Modell aktivieren' },
              { name: 'deactivate_model_endpoint', desc: 'Modell deaktivieren' },
              { name: 'rename_model_endpoint', desc: 'Modell umbenennen' },
              { name: 'delete_model_endpoint', desc: 'Modell loeschen' },
            ].map((t) => <Grid key={t.name} size={{ xs: 12, sm: 6 }}><McpToolRow name={t.name} desc={t.desc} cat="Models" /></Grid>)}
          </Grid>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Config-Tools (6)</Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            {[
              { name: 'update_alert_config_endpoint', desc: 'Alert-Config aendern (Threshold, n8n, Filter)' },
              { name: 'get_ignore_settings_endpoint', desc: 'Ignore-Cooldowns abfragen' },
              { name: 'update_ignore_settings_endpoint', desc: 'Ignore-Cooldowns aendern' },
              { name: 'get_max_log_entries_endpoint', desc: 'Log Retention abfragen' },
              { name: 'update_max_log_entries_endpoint', desc: 'Log Retention aendern' },
              { name: 'get_n8n_status_endpoint', desc: 'n8n Webhook-Status pruefen' },
            ].map((t) => <Grid key={t.name} size={{ xs: 12, sm: 6 }}><McpToolRow name={t.name} desc={t.desc} cat="Config" /></Grid>)}
          </Grid>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Prediction-Tools (5)</Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            {[
              { name: 'predict_endpoint', desc: 'ML-Vorhersage fuer Coin ausfuehren' },
              { name: 'get_predictions_endpoint', desc: 'Predictions mit Filtern abfragen' },
              { name: 'get_latest_prediction_endpoint', desc: 'Neueste Vorhersage fuer Coin' },
              { name: 'delete_model_predictions_endpoint', desc: 'Alle Predictions eines Modells loeschen' },
              { name: 'get_coin_details_endpoint', desc: 'Coin-Details mit Preishistorie & Evaluations' },
            ].map((t) => <Grid key={t.name} size={{ xs: 12, sm: 6 }}><McpToolRow name={t.name} desc={t.desc} cat="Predictions" /></Grid>)}
          </Grid>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Alert-Tools (1)</Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            {[
              { name: 'get_alert_statistics_endpoint', desc: 'Alert-Statistiken (Success-Rate, Profit/Loss)' },
            ].map((t) => <Grid key={t.name} size={{ xs: 12, sm: 6 }}><McpToolRow name={t.name} desc={t.desc} cat="Alerts" /></Grid>)}
          </Grid>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Defaults-Tools (2)</Typography>
          <Grid container spacing={1} sx={{ mb: 2 }}>
            {[
              { name: 'get_defaults_endpoint', desc: 'Aktuelle Prediction Defaults abfragen' },
              { name: 'update_defaults_endpoint', desc: 'Prediction Defaults aktualisieren' },
            ].map((t) => <Grid key={t.name} size={{ xs: 12, sm: 6 }}><McpToolRow name={t.name} desc={t.desc} cat="Defaults" /></Grid>)}
          </Grid>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>System-Tools (3)</Typography>
          <Grid container spacing={1}>
            {[
              { name: 'health_check', desc: 'Service-Status (DB + Alert-Evaluator)' },
              { name: 'get_stats', desc: 'Service-Statistiken (Modelle, Predictions 24h)' },
              { name: 'preload_models_endpoint', desc: 'Alle aktiven Modelle in Speicher laden' },
            ].map((t) => <Grid key={t.name} size={{ xs: 12, sm: 6 }}><McpToolRow name={t.name} desc={t.desc} cat="System" /></Grid>)}
          </Grid>
        </Chapter>
      </>
    )}
  </InfoPageWrapper>
);

export default PredictionsInfo;
