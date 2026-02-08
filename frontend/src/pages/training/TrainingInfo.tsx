import React from 'react';
import {
  Typography,
  Box,
  Alert,
  Divider,
  Grid,
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
  'train-overview',
  'train-base-features',
  'train-engineered',
  'train-params',
  'train-metrics',
  'train-api',
  'train-mcp',
];

const SmallTable: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TableContainer component={Paper} sx={{ mb: 2, overflowX: 'auto', '& .MuiTable-root': { minWidth: 400 } }}>
    {children}
  </TableContainer>
);

const TrainingInfo: React.FC = () => (
  <InfoPageWrapper
    title="Training System"
    subtitle="XGBoost ML-Training, Job-Queue & Modell-Verwaltung"
    chapterIds={chapterIds}
  >
    {({ expandedChapters, handleChapterChange }) => (
      <>
        {/* 1. Was ist das Training-System? */}
        <Chapter
          id="train-overview"
          title="Was ist das Training-System?"
          icon="🧠"
          expanded={expandedChapters.includes('train-overview')}
          onChange={handleChapterChange('train-overview')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Das Training-System trainiert XGBoost Machine-Learning-Modelle auf historischen coin_metrics Daten.
            Es macht zeitbasierte Vorhersagen wie "Steigt der Preis um X% in Y Minuten?"
          </Typography>
          <Box component="ul" sx={{ pl: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2">Asynchrone Job-Queue fuer Training, Test und Vergleich</Typography></li>
            <li><Typography variant="body2">28 Basis-Features + 66+ Engineered Features + 51 Flag-Features</Typography></li>
            <li><Typography variant="body2">Konfigurierbarer Vorhersage-Horizont (future_minutes) und Schwelle (min_percent_change)</Typography></li>
            <li><Typography variant="body2">Automatische Metrik-Berechnung: Accuracy, F1, Precision, Recall, ROC-AUC, MCC</Typography></li>
            <li><Typography variant="body2">Modell-Vergleiche auf identischen Testzeitraeumen</Typography></li>
          </Box>
          <CodeBlock>
{`Workflow:
  1. Features + Zeitraum waehlen
  2. TRAIN-Job erstellen (asynchron)
  3. Modell wird trainiert und gespeichert
  4. TEST-Job auf neuem Zeitraum (Backtesting)
  5. COMPARE-Job: 2-4 Modelle vergleichen
  6. Bestes Modell im Prediction-Server importieren`}
          </CodeBlock>
        </Chapter>

        {/* 2. Basis-Features (28) */}
        <Chapter
          id="train-base-features"
          title="Basis-Features (28)"
          icon="📋"
          expanded={expandedChapters.includes('train-base-features')}
          onChange={handleChapterChange('train-base-features')}
        >
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Kategorie</strong></TableCell>
                  <TableCell><strong>Features</strong></TableCell>
                  <TableCell><strong>Anzahl</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Price</TableCell>
                  <TableCell>price_open, price_high, price_low, price_close</TableCell>
                  <TableCell>4</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Market</TableCell>
                  <TableCell>market_cap_close, bonding_curve_pct, coin_age_seconds</TableCell>
                  <TableCell>3</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Volume</TableCell>
                  <TableCell>volume_sol, buy_volume_sol, sell_volume_sol</TableCell>
                  <TableCell>3</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Trade Activity</TableCell>
                  <TableCell>num_buys, num_sells, unique_wallets, num_trades, buy_sell_ratio, avg_trade_size</TableCell>
                  <TableCell>6</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Dev/Whale</TableCell>
                  <TableCell>dev_sold_amount, dev_last_sell_age, whale_buy_volume_sol, whale_sell_volume_sol</TableCell>
                  <TableCell>4</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Analytics</TableCell>
                  <TableCell>ath_price, ath_age_seconds, price_to_ath_ratio, holders_count, top10_holder_pct, smart_money_flow, rugcheck_score, social_score</TableCell>
                  <TableCell>8</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>

        {/* 3. Feature Engineering (66+) */}
        <Chapter
          id="train-engineered"
          title="Feature Engineering (66+)"
          icon="🔬"
          expanded={expandedChapters.includes('train-engineered')}
          onChange={handleChapterChange('train-engineered')}
        >
          <Alert severity="info" sx={{ mb: 2 }}>
            Aktivierbar mit <code>use_engineered_features: true</code> beim Training.
            Berechnet aus den letzten 10 Datenpunkten (Look-back Window).
          </Alert>

          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Gruppe</strong></TableCell>
                  <TableCell><strong>Features</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>ATH-Features</TableCell>
                  <TableCell>ATH-Ratio, ATH-Age, Distance-to-ATH</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Trend-Features</TableCell>
                  <TableCell>price_trend, volume_trend, momentum (Steigung ueber 5 Punkte)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Momentum</TableCell>
                  <TableCell>price_momentum, volume_momentum, acceleration</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Rolling Windows</TableCell>
                  <TableCell>mean_3, mean_5, mean_10, std_5, std_10 fuer Preis und Volume</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Volatilitaet</TableCell>
                  <TableCell>price_volatility, volume_volatility, high_low_range</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Ratio-Features</TableCell>
                  <TableCell>buy_sell_vol_ratio, price_to_volume, market_cap_to_volume</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Flag-Features (51)</Typography>
          <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
            Aktivierbar mit <code>use_flag_features: true</code> (Standard: aktiv).
            Boolesche/kategorische Features wie has_socials, has_telegram, metadata_is_mutable,
            dev_created_many_coins etc.
          </Typography>
        </Chapter>

        {/* 4. Training-Parameter */}
        <Chapter
          id="train-params"
          title="Training-Parameter"
          icon="🎛️"
          expanded={expandedChapters.includes('train-params')}
          onChange={handleChapterChange('train-params')}
        >
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
                <TableRow>
                  <TableCell><code>model_type</code></TableCell>
                  <TableCell>xgboost</TableCell>
                  <TableCell>Modell-Typ (aktuell nur XGBoost)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>features</code></TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>Liste der Basis-Features (Pflichtfeld)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>future_minutes</code></TableCell>
                  <TableCell>5</TableCell>
                  <TableCell>Vorhersage-Horizont in Minuten</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>min_percent_change</code></TableCell>
                  <TableCell>2.0</TableCell>
                  <TableCell>Mindest-Preisaenderung fuer Label "1" (%)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>direction</code></TableCell>
                  <TableCell>up</TableCell>
                  <TableCell>Vorhersage-Richtung: "up" oder "down"</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>target_var</code></TableCell>
                  <TableCell>price_close</TableCell>
                  <TableCell>Ziel-Variable fuer die Vorhersage</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>scale_pos_weight</code></TableCell>
                  <TableCell>auto</TableCell>
                  <TableCell>Gewicht fuer positive Klasse (z.B. 100 bei 1% Labels)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>use_smote</code></TableCell>
                  <TableCell>false</TableCell>
                  <TableCell>SMOTE Oversampling fuer unbalancierte Daten</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>use_engineered_features</code></TableCell>
                  <TableCell>false</TableCell>
                  <TableCell>66+ Feature Engineering aktivieren</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>use_flag_features</code></TableCell>
                  <TableCell>true</TableCell>
                  <TableCell>51 Flag-Features aktivieren</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>phases</code></TableCell>
                  <TableCell>alle</TableCell>
                  <TableCell>Coin-Phasen Filter (z.B. [1, 2, 3])</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>train_start / train_end</code></TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>Trainingszeitraum (ISO-Format, Pflichtfeld)</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>

        {/* 5. Metriken & Auswertung */}
        <Chapter
          id="train-metrics"
          title="Metriken & Auswertung"
          icon="📊"
          expanded={expandedChapters.includes('train-metrics')}
          onChange={handleChapterChange('train-metrics')}
        >
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Metrik</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Ideal</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Accuracy</TableCell>
                  <TableCell>Anteil korrekt klassifizierter Samples</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{'> 70%'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Precision</TableCell>
                  <TableCell>Von allen "positiv" vorhergesagten, wie viele waren korrekt?</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{'> 50%'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Recall</TableCell>
                  <TableCell>Von allen tatsaechlich positiven, wie viele wurden erkannt?</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{'> 30%'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>F1-Score</TableCell>
                  <TableCell>Harmonisches Mittel aus Precision und Recall</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{'> 40%'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>ROC-AUC</TableCell>
                  <TableCell>Flaeche unter der ROC-Kurve (Ranking-Qualitaet)</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{'> 0.6'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>MCC</TableCell>
                  <TableCell>Matthews Correlation Coefficient (-1 bis +1)</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{'> 0.1'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Confusion Matrix</Typography>
          <CodeBlock>
{`                 Vorhergesagt
                 Negativ  Positiv
Tatsaechlich  Negativ  [ TN ]  [ FP ]
              Positiv  [ FN ]  [ TP ]

TN = True Negative (korrekt negativ)
FP = False Positive (falscher Alarm)
FN = False Negative (verpasst)
TP = True Positive (korrekt erkannt)`}
          </CodeBlock>
        </Chapter>

        {/* 6. API-Endpunkte */}
        <Chapter
          id="train-api"
          title="API-Endpunkte"
          icon="🔌"
          expanded={expandedChapters.includes('train-api')}
          onChange={handleChapterChange('train-api')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Modelle</Typography>
          <EndpointRow method="GET" path="/api/training/models" desc="Alle Modelle auflisten" />
          <EndpointRow method="GET" path="/api/training/models/{id}" desc="Modell-Details mit Metriken" />
          <EndpointRow method="PATCH" path="/api/training/models/{id}" desc="Name/Beschreibung aendern" />
          <EndpointRow method="DELETE" path="/api/training/models/{id}" desc="Modell loeschen (soft-delete)" />
          <EndpointRow method="GET" path="/api/training/models/{id}/download" desc="Modell-Datei herunterladen" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Jobs</Typography>
          <EndpointRow method="POST" path="/api/training/train" desc="TRAIN-Job erstellen" />
          <EndpointRow method="POST" path="/api/training/test" desc="TEST-Job erstellen (Backtesting)" />
          <EndpointRow method="POST" path="/api/training/compare" desc="COMPARE-Job erstellen (2-4 Modelle)" />
          <EndpointRow method="GET" path="/api/training/jobs" desc="Alle Jobs auflisten" />
          <EndpointRow method="GET" path="/api/training/jobs/{id}" desc="Job-Details" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Ergebnisse</Typography>
          <EndpointRow method="GET" path="/api/training/test-results" desc="Alle Test-Ergebnisse" />
          <EndpointRow method="GET" path="/api/training/test-results/{id}" desc="Test-Ergebnis Details" />
          <EndpointRow method="GET" path="/api/training/comparisons" desc="Alle Vergleiche" />
          <EndpointRow method="GET" path="/api/training/comparisons/{id}" desc="Vergleich-Details" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>System</Typography>
          <EndpointRow method="GET" path="/api/training/features" desc="Verfuegbare Features" />
          <EndpointRow method="GET" path="/api/training/data-availability" desc="Verfuegbarer Datenzeitraum" />
          <EndpointRow method="GET" path="/api/training/phases" desc="Coin-Phasen" />
          <EndpointRow method="GET" path="/api/training/health" desc="Service Health-Check" />
          <EndpointRow method="GET" path="/api/training/config" desc="Aktuelle Konfiguration" />
        </Chapter>

        {/* 7. MCP-Tools */}
        <Chapter
          id="train-mcp"
          title="MCP-Tools"
          icon="🤖"
          expanded={expandedChapters.includes('train-mcp')}
          onChange={handleChapterChange('train-mcp')}
        >
          <Alert severity="info" sx={{ mb: 2 }}>
            Training MCP-Tools fuer AI-gesteuerte Modell-Erstellung und Auswertung.
          </Alert>

          <Grid container spacing={1}>
            {[
              { name: 'train_model', desc: 'Neues Modell trainieren (TRAIN-Job)', cat: 'Training' },
              { name: 'test_model', desc: 'Modell auf neuen Daten testen (TEST-Job)', cat: 'Training' },
              { name: 'compare_models', desc: '2-4 Modelle vergleichen (COMPARE-Job)', cat: 'Training' },
              { name: 'list_models', desc: 'Alle trainierten Modelle auflisten', cat: 'Modelle' },
              { name: 'get_model', desc: 'Modell-Details mit Metriken', cat: 'Modelle' },
              { name: 'update_model', desc: 'Name/Beschreibung aendern', cat: 'Modelle' },
              { name: 'delete_model', desc: 'Modell loeschen', cat: 'Modelle' },
              { name: 'list_jobs', desc: 'Alle Jobs auflisten', cat: 'Jobs' },
              { name: 'get_job', desc: 'Job-Details', cat: 'Jobs' },
              { name: 'list_test_results', desc: 'Test-Ergebnisse', cat: 'Ergebnisse' },
              { name: 'get_test_result', desc: 'Test-Detail mit Confusion Matrix', cat: 'Ergebnisse' },
              { name: 'list_comparisons', desc: 'Alle Vergleiche', cat: 'Ergebnisse' },
              { name: 'get_comparison', desc: 'Vergleich-Details', cat: 'Ergebnisse' },
              { name: 'get_features', desc: 'Verfuegbare Features', cat: 'System' },
              { name: 'get_data_availability', desc: 'Datenzeitraum abfragen', cat: 'System' },
              { name: 'get_phases', desc: 'Coin-Phasen', cat: 'System' },
              { name: 'health_check', desc: 'Service-Status', cat: 'System' },
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

export default TrainingInfo;
