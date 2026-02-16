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
  Chip,
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
  'train-presets',
  'train-identity',
  'train-base-features',
  'train-engineered',
  'train-extra-sources',
  'train-feature-config',
  'train-data',
  'train-strategy',
  'train-optimization',
  'train-metrics',
  'train-settings',
  'train-api',
];

const SmallTable: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TableContainer component={Paper} sx={{ mb: 2, overflowX: 'auto', '& .MuiTable-root': { minWidth: 400 } }}>
    {children}
  </TableContainer>
);

const PresetCard: React.FC<{
  name: string;
  subtitle: string;
  color: string;
  desc: string;
  features: string[];
}> = ({ name, subtitle, color, desc, features }) => (
  <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1, borderLeft: `3px solid ${color}`, mb: 1.5 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 700, color }}>{name}</Typography>
      <Chip label={subtitle} size="small" sx={{ fontSize: '0.65rem', height: 20, bgcolor: `${color}25`, color }} />
    </Box>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: '0.8rem' }}>{desc}</Typography>
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {features.map((f) => (
        <Chip key={f} label={f} size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
      ))}
    </Box>
  </Paper>
);

const TrainingInfo: React.FC = () => (
  <InfoPageWrapper
    title="Training System"
    subtitle="Vollstaendige Dokumentation der Modell-Erstellung, Features & Konfiguration"
    chapterIds={chapterIds}
  >
    {({ expandedChapters, handleChapterChange }) => (
      <>
        {/* ── 1. Uebersicht ─────────────────────────────────────── */}
        <Chapter
          id="train-overview"
          title="Uebersicht"
          icon="🧠"
          expanded={expandedChapters.includes('train-overview')}
          onChange={handleChapterChange('train-overview')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Das Training-System trainiert XGBoost/LightGBM Machine-Learning-Modelle auf historischen coin_metrics Daten.
            Es macht zeitbasierte Vorhersagen wie "Steigt der Preis um X% in Y Minuten?" und erlaubt volle Kontrolle
            ueber Features, Trainings-Strategie und Optimierung.
          </Typography>
          <Box component="ul" sx={{ pl: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2"><strong>197 Features total:</strong> 28 Basis + 66 Engineered + 66 Flag + 37 Extra Sources</Typography></li>
            <li><Typography variant="body2"><strong>6 Feature-Quellen:</strong> Base, Engineered, Graph (Neo4j), Embedding (pgvector), Transaction, Metadata</Typography></li>
            <li><Typography variant="body2"><strong>5 Presets:</strong> Fast Pump, Standard, Moonshot, Rug Shield, Custom</Typography></li>
            <li><Typography variant="body2"><strong>4 Job-Typen:</strong> Train, Test (Backtesting), Compare (2-4 Modelle), Tune (Hyperparameter)</Typography></li>
            <li><Typography variant="body2"><strong>6 Metriken:</strong> Accuracy, F1, Precision, Recall, ROC-AUC, MCC</Typography></li>
          </Box>
          <CodeBlock>
{`Workflow:
  1. Preset waehlen oder manuell konfigurieren
  2. Features auswaehlen (Base, Engineered, Extra Sources)
  3. Feature-Konfiguration anpassen (Flags, Windows, Exclude)
  4. Trainingszeitraum und Phasen waehlen
  5. Training-Strategie einstellen (Balancing, CV, Early Stopping)
  6. Optimierung aktivieren (Tuning, SHAP)
  7. TRAIN-Job starten → Modell wird asynchron trainiert
  8. TEST-Job auf neuem Zeitraum (Backtesting)
  9. COMPARE-Job: 2-4 Modelle nebeneinander vergleichen
 10. Bestes Modell im Prediction-Server importieren`}
          </CodeBlock>
        </Chapter>

        {/* ── 2. Presets ────────────────────────────────────────── */}
        <Chapter
          id="train-presets"
          title="Presets (Voreinstellungen)"
          icon="🎯"
          expanded={expandedChapters.includes('train-presets')}
          onChange={handleChapterChange('train-presets')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Presets sind vordefinierte Konfigurationen die alle Parameter (Features, Strategie, Optimierung) auf einmal setzen.
            Nach Auswahl eines Presets koennen alle Werte weiter angepasst werden — das Preset dient nur als Startpunkt.
          </Typography>

          <PresetCard
            name="Fast Pump"
            subtitle="5% / 5min"
            color="#00d4ff"
            desc="Geschwindigkeit vor Tiefe. Minimale Features fuer schnelles Training. Ideal fuer erste Experimente und schnelle Ergebnisse."
            features={['Essential Base (3)', 'Embedding (6)', 'Kein Eng', 'Keine Flags', 'CV=3', 'Window [5]', 'SPW 100x']}
          />
          <PresetCard
            name="Standard"
            subtitle="10% / 10min"
            color="#4caf50"
            desc="Ausgewogene Konfiguration mit guten Features und akzeptabler Trainingszeit. Empfohlen als Basis fuer die meisten Modelle."
            features={['Recommended Base (9)', 'High Imp Eng', 'Graph + Embedding', 'Flags ON', 'Market Context', 'CV=5', 'Windows [5,10,15]', 'SPW 100x']}
          />
          <PresetCard
            name="Moonshot"
            subtitle="25% / 15min"
            color="#9c27b0"
            desc="Maximales Signal — alle Features, alle Quellen, Tuning und SHAP. Laengste Trainingszeit, aber hoechste Feature-Abdeckung."
            features={['Alle Base (28)', 'Alle Eng (66)', 'Alle Sources (35)', 'Flags ON', 'Market Context', 'Tuning (50 iter)', 'SHAP', 'CV=5', 'Windows [5,10,15,30]', 'SPW 200x', 'Early Stop 15']}
          />
          <PresetCard
            name="Rug Shield"
            subtitle="-20% / 10min"
            color="#f44336"
            desc="Erkennung von Rug-Pulls. Direction=DOWN mit Fokus auf Safety-, Whale- und Risk-Features. Ideal fuer Schutz-Modelle."
            features={['Recommended Base + Activity', 'Dev/Safety/Whale/Risk Eng', 'Alle Sources (35)', 'Flags ON', 'SHAP', 'Market Context', 'Direction DOWN', 'SPW 50x']}
          />
          <PresetCard
            name="Custom"
            subtitle="Full Control"
            color="#ff9800"
            desc="Minimaler Startpunkt — nur Essential Base Features. Alles andere wird manuell konfiguriert."
            features={['Essential Base (3)', 'Kein Eng', 'Keine Sources', 'Keine Flags', 'Kein Early Stop', 'Clean Slate']}
          />

          <Alert severity="info" sx={{ mt: 2 }}>
            <strong>Tipp:</strong> Das Preset setzt <code>direction</code>, <code>futureMinutes</code>, <code>minPercentChange</code>, Features und Strategie —
            aber <strong>nicht den Model Type</strong>. Wenn du LightGBM ausgewaehlt hast und dann ein Preset anklickst, bleibt LightGBM aktiv.
            So kannst du jedes Preset mit beiden Algorithmen testen.
          </Alert>
        </Chapter>

        {/* ── 3. Model Identity & Prediction Target ─────────────── */}
        <Chapter
          id="train-identity"
          title="Model Identity & Prediction Target"
          icon="🏷️"
          expanded={expandedChapters.includes('train-identity')}
          onChange={handleChapterChange('train-identity')}
        >
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Section 1: Model Identity</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Feld</strong></TableCell>
                  <TableCell><strong>Optionen</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><code>Name</code></TableCell>
                  <TableCell>Freitext (min. 3 Zeichen)</TableCell>
                  <TableCell>Eindeutiger Modell-Name. Wird in Listen, Vergleichen und beim Import angezeigt.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Model Type</code></TableCell>
                  <TableCell><strong>XGBoost</strong> | <strong>LightGBM</strong></TableCell>
                  <TableCell>ML-Algorithmus. Beide sind Gradient Boosting Frameworks — siehe Vergleich unten.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Direction</code></TableCell>
                  <TableCell><strong>PUMP</strong> (up) | <strong>RUG</strong> (down)</TableCell>
                  <TableCell>Vorhersage-Richtung. PUMP = Preisanstieg erkennen. RUG = Preiseinbruch erkennen.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Description</code></TableCell>
                  <TableCell>Freitext (optional)</TableCell>
                  <TableCell>Beschreibung des Modell-Zwecks. Wird gespeichert und in der Modell-Liste angezeigt.</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>XGBoost vs LightGBM</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Beide Algorithmen sind Gradient-Boosted Decision Trees, unterscheiden sich aber in der Baumart und den Hyperparametern.
            Presets funktionieren mit beiden Model Types — der Model Type wird beim Preset-Wechsel beibehalten.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Eigenschaft</strong></TableCell>
                  <TableCell><strong>XGBoost</strong></TableCell>
                  <TableCell><strong>LightGBM</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Baumart</TableCell>
                  <TableCell>Level-wise (Ebene fuer Ebene)</TableCell>
                  <TableCell>Leaf-wise (bestes Blatt zuerst)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Geschwindigkeit</TableCell>
                  <TableCell>Gut, etwas langsamer bei grossen Datenmengen</TableCell>
                  <TableCell>Schneller, besonders bei vielen Features und Samples</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Wichtigster Param</TableCell>
                  <TableCell><code>max_depth</code> (Default: 6)</TableCell>
                  <TableCell><code>num_leaves</code> (Default: 31)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Overfitting-Risiko</TableCell>
                  <TableCell>Moderater durch depth-Begrenzung</TableCell>
                  <TableCell>Hoeher — <code>num_leaves</code> und <code>min_data_in_leaf</code> kontrollieren</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Regularisierung</TableCell>
                  <TableCell><code>reg_alpha</code>, <code>reg_lambda</code>, <code>gamma</code></TableCell>
                  <TableCell><code>lambda_l1</code>, <code>lambda_l2</code>, <code>min_gain_to_split</code></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Sampling</TableCell>
                  <TableCell><code>subsample</code>, <code>colsample_bytree</code></TableCell>
                  <TableCell><code>bagging_fraction</code>, <code>feature_fraction</code></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Empfehlung</TableCell>
                  <TableCell>Guter Allrounder, stabil bei kleinen Datensaetzen</TableCell>
                  <TableCell>Ideal bei vielen Features (100+) oder langen Trainingszeiten</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>
          <Alert severity="info">
            <strong>Tipp:</strong> Beide Algorithmen unterstuetzen alle Features, Presets, Balancing-Methoden und Optimierungen gleichermassen.
            Der Unterschied liegt nur in der internen Baum-Strategie und den Hyperparametern.
            Trainiere dasselbe Setup einmal mit XGBoost und einmal mit LightGBM und vergleiche via COMPARE-Job.
          </Alert>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Section 2: Prediction Target</Typography>

          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell><strong>Range</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><code>Min Price Change</code></TableCell>
                  <TableCell>1% — 50%</TableCell>
                  <TableCell>Wie stark muss sich der Preis mindestens aendern, damit das Label "1" (positiv) gesetzt wird.
                    Hoehere Werte = weniger positive Samples, staerkere Signale, schwierigeres Training.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Time Window</code></TableCell>
                  <TableCell>1 — 60 Minuten</TableCell>
                  <TableCell>In welchem Zeitfenster muss die Preisaenderung eintreten.
                    Kuerzere Fenster = praezisere Vorhersagen, weniger positive Samples.</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Alert severity="info">
            <strong>Label-Berechnung:</strong> Fuer jedes Sample im Trainingszeitraum wird geprueft, ob der Preis
            innerhalb von <code>future_minutes</code> Minuten um mindestens <code>min_percent_change</code>%
            in die gewaehlte Richtung gestiegen/gefallen ist. Wenn ja → Label = 1 (positiv), sonst Label = 0 (negativ).
          </Alert>

          <CodeBlock>
{`Beispiel: Direction=UP, 10%, 5min
  → "Steigt der Preis um ≥10% innerhalb der naechsten 5 Minuten?"
  → Sehr streng: typischerweise ~1-3% positive Labels

Beispiel: Direction=DOWN, 20%, 10min
  → "Faellt der Preis um ≥20% innerhalb der naechsten 10 Minuten?"
  → Rug-Detection: staerkere Preiseinbrueche, aber seltener`}
          </CodeBlock>
        </Chapter>

        {/* ── 4. Basis-Features (28) ────────────────────────────── */}
        <Chapter
          id="train-base-features"
          title="Basis-Features (28)"
          icon="📋"
          expanded={expandedChapters.includes('train-base-features')}
          onChange={handleChapterChange('train-base-features')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Rohdaten aus der <code>coin_metrics</code> Tabelle. Jedes Feature ist einzeln auswaehlbar
            und in 9 Kategorien gruppiert. Die Importance-Stufen bestimmen die Preset-Buttons:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <Chip label="Essential (3)" size="small" sx={{ bgcolor: 'rgba(76,175,80,0.2)', color: '#4caf50' }} />
            <Chip label="+ Recommended (9)" size="small" sx={{ bgcolor: 'rgba(0,212,255,0.2)', color: '#00d4ff' }} />
            <Chip label="All (28)" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />
          </Box>

          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Kategorie</strong></TableCell>
                  <TableCell><strong>Features</strong></TableCell>
                  <TableCell><strong>Anz.</strong></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Importance</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Price</TableCell>
                  <TableCell><code>price_close</code>, price_open, price_high, price_low</TableCell>
                  <TableCell>4</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>price_close = Essential</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Volume</TableCell>
                  <TableCell><code>volume_sol</code>, buy_volume_sol, sell_volume_sol, net_volume_sol</TableCell>
                  <TableCell>4</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>volume_sol = Essential</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Momentum</TableCell>
                  <TableCell><code>buy_pressure_ratio</code></TableCell>
                  <TableCell>1</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Essential</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Safety</TableCell>
                  <TableCell>dev_sold_amount</TableCell>
                  <TableCell>1</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Recommended</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Whale</TableCell>
                  <TableCell>whale_buy_volume_sol, whale_sell_volume_sol, num_whale_buys, num_whale_sells, max_single_buy_sol, max_single_sell_sol</TableCell>
                  <TableCell>6</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>2 Recommended, 4 Optional</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Community</TableCell>
                  <TableCell>unique_signer_ratio, unique_wallets</TableCell>
                  <TableCell>2</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>1 Recommended, 1 Optional</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Risk</TableCell>
                  <TableCell>volatility_pct</TableCell>
                  <TableCell>1</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Recommended</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Market</TableCell>
                  <TableCell>market_cap_close, bonding_curve_pct, virtual_sol_reserves, is_koth, phase_id_at_time</TableCell>
                  <TableCell>5</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>1 Recommended, 4 Optional</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Activity</TableCell>
                  <TableCell>num_buys, num_sells, num_micro_trades, avg_trade_size_sol</TableCell>
                  <TableCell>4</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Alle Optional</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Alert severity="success" sx={{ mt: 1 }}>
            <strong>Essential Features (3):</strong> <code>price_close</code>, <code>volume_sol</code>, <code>buy_pressure_ratio</code> —
            das absolute Minimum fuer ein funktionierendes Modell. Werden von allen Presets ausser "None" gesetzt.
          </Alert>
        </Chapter>

        {/* ── 5. Engineered Features (66) ───────────────────────── */}
        <Chapter
          id="train-engineered"
          title="Engineered Features (66)"
          icon="🔬"
          expanded={expandedChapters.includes('train-engineered')}
          onChange={handleChapterChange('train-engineered')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Berechnete Features auf Basis der Rohdaten. Verwenden Rolling Windows (konfigurierbar: 5, 10, 15, 20, 30, 60 Datenpunkte)
            um zeitliche Trends und Anomalien zu erkennen. In 10 Kategorien gruppiert mit zwei Importance-Stufen:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <Chip label="High Importance" size="small" sx={{ bgcolor: 'rgba(156,39,176,0.2)', color: '#9c27b0' }} />
            <Chip label="Medium Importance" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />
          </Box>

          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Kategorie</strong></TableCell>
                  <TableCell><strong>Features</strong></TableCell>
                  <TableCell><strong>Anz.</strong></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>High</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Dev Activity</TableCell>
                  <TableCell>dev_sold_flag, dev_sold_cumsum, dev_sold_spike_5/10/15</TableCell>
                  <TableCell>5</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>3</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Momentum</TableCell>
                  <TableCell>buy_pressure_ma_5/10/15, buy_pressure_trend_5/10/15</TableCell>
                  <TableCell>6</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>2</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Whale Tracking</TableCell>
                  <TableCell>whale_net_volume, whale_activity_5/10/15</TableCell>
                  <TableCell>4</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>2</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Risk Analysis</TableCell>
                  <TableCell>volatility_ma_5/10/15, volatility_spike_5/10/15</TableCell>
                  <TableCell>6</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>2</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Safety</TableCell>
                  <TableCell>wash_trading_flag_5/10/15</TableCell>
                  <TableCell>3</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>1</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Volume Patterns</TableCell>
                  <TableCell>net_volume_ma_5/10/15, volume_flip_5/10/15</TableCell>
                  <TableCell>6</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>2</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Price Momentum</TableCell>
                  <TableCell>price_change_5/10/15, price_roc_5/10/15</TableCell>
                  <TableCell>6</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>3</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Market Velocity</TableCell>
                  <TableCell>mcap_velocity_5/10/15</TableCell>
                  <TableCell>3</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>1</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>ATH Analysis</TableCell>
                  <TableCell>rolling_ath, price_vs_ath_pct, ath_breakout, minutes_since_ath, ath_distance_trend, ath_approach, ath_breakout_count, ath_breakout_volume_ma, ath_age_trend (jeweils _5/10/15)</TableCell>
                  <TableCell>19</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>19</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Power Features</TableCell>
                  <TableCell>buy_sell_ratio, whale_dominance, price_acceleration_5/10/15, volume_spike_5/10/15</TableCell>
                  <TableCell>8</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>4</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Alert severity="info">
            <strong>Window-Notation:</strong> Das Suffix <code>_5/10/15</code> bedeutet, dass das Feature mit verschiedenen
            Window-Groessen berechnet wird. Die Standard-Windows sind [5, 10, 15] — konfigurierbar unter Feature Configuration.
          </Alert>
        </Chapter>

        {/* ── 6. Extra Sources (35) ─────────────────────────────── */}
        <Chapter
          id="train-extra-sources"
          title="Extra Source Features (35)"
          icon="🔗"
          expanded={expandedChapters.includes('train-extra-sources')}
          onChange={handleChapterChange('train-extra-sources')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Vier zusaetzliche Datenquellen mit insgesamt 37 Features.
            Jedes Feature ist einzeln auswaehlbar. Die Buttons "Recommended" (Graph + Embedding) und "All" setzen Gruppen.
          </Typography>

          {/* Graph */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Graph Features (Neo4j) — 8 Features</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Creator-Analyse, Wallet-Cluster und Token-Aehnlichkeit aus dem Neo4j Knowledge Graph.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Feature</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell><code>creator_total_tokens</code></TableCell><TableCell>Anzahl Tokens dieses Creators</TableCell></TableRow>
                <TableRow><TableCell><code>creator_avg_risk_score</code></TableCell><TableCell>Durchschnittlicher Risk-Score der Creator-Tokens</TableCell></TableRow>
                <TableRow><TableCell><code>creator_any_graduated</code></TableCell><TableCell>Hat ein Token des Creators graduated?</TableCell></TableRow>
                <TableRow><TableCell><code>creator_is_serial</code></TableCell><TableCell>Creator hat 5+ Tokens erstellt</TableCell></TableRow>
                <TableRow><TableCell><code>wallet_cluster_count</code></TableCell><TableCell>Anzahl Trading-Wallet-Cluster</TableCell></TableRow>
                <TableRow><TableCell><code>avg_cluster_risk</code></TableCell><TableCell>Durchschnittlicher Cluster-Risiko-Score</TableCell></TableRow>
                <TableRow><TableCell><code>similar_token_count</code></TableCell><TableCell>Anzahl graph-aehnlicher Tokens</TableCell></TableRow>
                <TableRow><TableCell><code>similar_tokens_graduated_pct</code></TableCell><TableCell>% aehnlicher Tokens die graduated sind</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Divider sx={{ my: 2 }} />

          {/* Embedding */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Embedding Features (pgvector) — 6 Features</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Pattern-Aehnlichkeit zu bekannten Pump/Rug-Mustern via pgvector Similarity Search.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Feature</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell><code>similarity_to_pumps</code></TableCell><TableCell>Durchschnittliche Aehnlichkeit zu Pump-Patterns</TableCell></TableRow>
                <TableRow><TableCell><code>similarity_to_rugs</code></TableCell><TableCell>Durchschnittliche Aehnlichkeit zu Rug-Patterns</TableCell></TableRow>
                <TableRow><TableCell><code>max_pump_similarity</code></TableCell><TableCell>Max. Aehnlichkeit zu einem Pump-Pattern</TableCell></TableRow>
                <TableRow><TableCell><code>max_rug_similarity</code></TableCell><TableCell>Max. Aehnlichkeit zu einem Rug-Pattern</TableCell></TableRow>
                <TableRow><TableCell><code>nearest_pattern_label</code></TableCell><TableCell>Label des aehnlichsten Patterns</TableCell></TableRow>
                <TableRow><TableCell><code>nearest_pattern_similarity</code></TableCell><TableCell>Score des naechsten Patterns</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Divider sx={{ my: 2 }} />

          {/* Transaction */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Transaction Features — 8 Features</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Transaktionsbasierte Metriken: Wallet-Konzentration, Trade-Bursts und Whale-Aktivitaet.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Feature</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell><code>tx_wallet_concentration</code></TableCell><TableCell>Gini-Koeffizient der Trader-Volumina</TableCell></TableRow>
                <TableRow><TableCell><code>tx_top3_holder_pct</code></TableCell><TableCell>% Volumen der Top-3-Trader</TableCell></TableRow>
                <TableRow><TableCell><code>tx_unique_traders</code></TableCell><TableCell>Anzahl einzigartiger Trader</TableCell></TableRow>
                <TableRow><TableCell><code>tx_buy_sell_ratio</code></TableCell><TableCell>Kauf-/Verkaufsverhaeltnis</TableCell></TableRow>
                <TableRow><TableCell><code>tx_avg_time_between_trades</code></TableCell><TableCell>Durchschn. Sekunden zwischen Trades</TableCell></TableRow>
                <TableRow><TableCell><code>tx_burst_count</code></TableCell><TableCell>Trading-Bursts (&gt;10 Trades in 60s)</TableCell></TableRow>
                <TableRow><TableCell><code>tx_whale_pct</code></TableCell><TableCell>% Volumen aus Whale-Trades</TableCell></TableRow>
                <TableRow><TableCell><code>tx_quick_reversal_count</code></TableCell><TableCell>Buy→Sell in &lt;2min vom selben Trader</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Divider sx={{ my: 2 }} />

          {/* Metadata */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Metadata Features — 15 Features</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Token-Eigenschaften aus <code>discovered_coins</code> und <code>exchange_rates</code> zum Discovery-Zeitpunkt.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Feature</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell><code>meta_initial_buy_sol</code></TableCell><TableCell>Creator-Investment in SOL (cap 100)</TableCell></TableRow>
                <TableRow><TableCell><code>meta_initial_buy_ratio</code></TableCell><TableCell>Skin-in-the-Game: initial_buy / market_cap</TableCell></TableRow>
                <TableRow><TableCell><code>meta_token_supply_log</code></TableCell><TableCell>Log10 der Token-Supply</TableCell></TableRow>
                <TableRow><TableCell><code>meta_has_socials</code></TableCell><TableCell>Social-Media-Praesenz vorhanden (0/1)</TableCell></TableRow>
                <TableRow><TableCell><code>meta_social_count</code></TableCell><TableCell>Anzahl Social-Links (0-4)</TableCell></TableRow>
                <TableRow><TableCell><code>meta_metadata_mutable</code></TableCell><TableCell>Rug-Risiko: Metadata aenderbar (null→0.5, true→1, false→0)</TableCell></TableRow>
                <TableRow><TableCell><code>meta_metadata_mutable_known</code></TableCell><TableCell>Ob der Wert bekannt ist (0=unbekannt/null, 1=bekannt)</TableCell></TableRow>
                <TableRow><TableCell><code>meta_mint_authority</code></TableCell><TableCell>Rug-Risiko: Kann nachminten (null→0.5, true→1, false→0)</TableCell></TableRow>
                <TableRow><TableCell><code>meta_mint_authority_known</code></TableCell><TableCell>Ob der Wert bekannt ist (0=unbekannt/null, 1=bekannt)</TableCell></TableRow>
                <TableRow><TableCell><code>meta_risk_score</code></TableCell><TableCell>Vorberechneter Risiko-Score (0-1)</TableCell></TableRow>
                <TableRow><TableCell><code>meta_top10_holders_pct</code></TableCell><TableCell>Holder-Konzentration (0-1)</TableCell></TableRow>
                <TableRow><TableCell><code>meta_liquidity_sol</code></TableCell><TableCell>Initiale Liquiditaet log10(SOL+1)</TableCell></TableRow>
                <TableRow><TableCell><code>meta_is_mayhem</code></TableCell><TableCell>Markt-Chaos-Modus aktiv (0/1)</TableCell></TableRow>
                <TableRow><TableCell><code>meta_sol_price_usd</code></TableCell><TableCell>SOL-Preis als Markt-Kontext</TableCell></TableRow>
                <TableRow><TableCell><code>meta_sol_price_change_1h</code></TableCell><TableCell>SOL-Markt-Momentum (%)</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>Null-Handling</Typography>
          <Box component="ul" sx={{ pl: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2">Booleans (metadata_mutable, mint_authority): <code>null → 0.5</code> (unbekannt) + separates <code>_known</code> Flag (0/1)</Typography></li>
            <li><Typography variant="body2">Zahlen (risk_score, top10_holders_pct): <code>null → 0.0</code></Typography></li>
            <li><Typography variant="body2">SOL-Preis: Naechster Eintrag in exchange_rates zum Discovery-Zeitpunkt</Typography></li>
          </Box>
        </Chapter>

        {/* ── 7. Feature Configuration ──────────────────────────── */}
        <Chapter
          id="train-feature-config"
          title="Feature Configuration"
          icon="⚙️"
          expanded={expandedChapters.includes('train-feature-config')}
          onChange={handleChapterChange('train-feature-config')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Erweiterte Feature-Einstellungen: Flag-Features, Rolling Windows, Feature-Ausschluss und Markt-Kontext.
            Diese Optionen befinden sich innerhalb der Features-Section unter "Feature Configuration".
          </Typography>

          {/* Flag Features */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#ff9800' }}>Flag Features (66)</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Fuer jedes der 66 Engineered Features wird ein <code>{'<feature>_has_data'}</code> Companion-Feature erzeugt.
            Es zeigt an, ob genug Datenpunkte fuer das Rolling Window vorhanden waren (1 = ja, 0 = nein).
          </Typography>
          <Box component="ul" sx={{ pl: 2, mb: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2"><strong>Abhaengig von Eng Features:</strong> Ein Flag ist nur "aktiv" wenn das zugehoerige Engineered Feature auch ausgewaehlt ist</Typography></li>
            <li><Typography variant="body2"><strong>Kategorien:</strong> Gleiche 10 Kategorien wie Engineered Features (Dev, Momentum, Whale, etc.)</Typography></li>
            <li><Typography variant="body2"><strong>Individuelle Kontrolle:</strong> Einzelne Flags koennen ueber Exclude Features deaktiviert werden</Typography></li>
            <li><Typography variant="body2"><strong>Buttons:</strong> "High Importance" (nur Flags fuer High-Imp Eng), "All", "None"</Typography></li>
          </Box>
          <CodeBlock>
{`Beispiel: dev_sold_spike_5 (Engineered Feature)
  → dev_sold_spike_5_has_data (Flag Feature)
  → Wert: 1.0 wenn ≥5 Datenpunkte vorhanden, sonst 0.0
  → Aktiv wenn: useFlagFeatures=ON + dev_sold_spike_5 ausgewaehlt + nicht in excludeFeatures`}
          </CodeBlock>

          <Divider sx={{ my: 2 }} />

          {/* Feature Windows */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#00d4ff' }}>Feature Windows</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Bestimmt die Groesse der Rolling Windows fuer Engineered Features.
            Nur sichtbar wenn mindestens ein Engineered Feature ausgewaehlt ist.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Window</strong></TableCell>
                  <TableCell><strong>Bedeutung</strong></TableCell>
                  <TableCell><strong>Preset-Verwendung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><code>5</code></TableCell>
                  <TableCell>Kurzfristig — letzte 5 Datenpunkte</TableCell>
                  <TableCell>Alle Presets</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>10</code></TableCell>
                  <TableCell>Mittelfristig — letzte 10 Datenpunkte</TableCell>
                  <TableCell>Standard, Moonshot, Rug Shield</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>15</code></TableCell>
                  <TableCell>Laengerfristig — letzte 15 Datenpunkte</TableCell>
                  <TableCell>Standard, Moonshot, Rug Shield</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>20</code></TableCell>
                  <TableCell>Erweitert</TableCell>
                  <TableCell>—</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>30</code></TableCell>
                  <TableCell>Langfristig — letzte 30 Datenpunkte</TableCell>
                  <TableCell>Moonshot</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>60</code></TableCell>
                  <TableCell>Sehr langfristig</TableCell>
                  <TableCell>—</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Mehr Windows = mehr Features pro Engineered Feature = laengere Trainingszeit.
            Fuer schnelle Experimente reicht Window [5]. Fuer beste Ergebnisse [5, 10, 15].
          </Alert>

          <Divider sx={{ my: 2 }} />

          {/* Exclude Features */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#f44336' }}>Exclude Features</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Ermoeglicht das gezielte Ausschliessen einzelner Features aus dem Training.
            In 6 Quell-Kategorien gruppiert (Base, Engineered, Graph, Embedding, Transaction, Metadata).
          </Typography>
          <Box component="ul" sx={{ pl: 2, mb: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2"><strong>Anwendungsfall 1:</strong> Feature ist ausgewaehlt, soll aber nicht trainiert werden (z.B. zum Testen)</Typography></li>
            <li><Typography variant="body2"><strong>Anwendungsfall 2:</strong> Einzelne Flag-Features deaktivieren ohne alle Flags abzuschalten</Typography></li>
            <li><Typography variant="body2"><strong>Anwendungsfall 3:</strong> Nach SHAP-Analyse unwichtige Features entfernen</Typography></li>
            <li><Typography variant="body2"><strong>Buttons:</strong> "All" (alles ausschliessen) und "None" (nichts ausschliessen)</Typography></li>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Market Context */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#4caf50' }}>Market Context</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Fuegt SOL-Preis und Makro-Indikatoren als zusaetzlichen Kontext hinzu.
            Hilft dem Modell zu verstehen, ob der Gesamtmarkt bullisch/bearisch ist.
          </Typography>
          <Box component="ul" sx={{ pl: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2">SOL/USD Preis zum Zeitpunkt des Samples</Typography></li>
            <li><Typography variant="body2">SOL-Preis-Veraenderung (Momentum-Signal)</Typography></li>
            <li><Typography variant="body2">Empfohlen fuer alle Modelle die in verschiedenen Marktphasen performen sollen</Typography></li>
          </Box>
        </Chapter>

        {/* ── 8. Training Data ──────────────────────────────────── */}
        <Chapter
          id="train-data"
          title="Training Data & Phasen"
          icon="📅"
          expanded={expandedChapters.includes('train-data')}
          onChange={handleChapterChange('train-data')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Bestimmt welche historischen Daten fuer das Training verwendet werden.
          </Typography>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Zeitraum</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><code>Start</code></TableCell>
                  <TableCell>Beginn des Trainingszeitraums (datetime). Muss in der Vergangenheit liegen.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>End</code></TableCell>
                  <TableCell>Ende des Trainingszeitraums (datetime). Muss nach Start liegen.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Quick-Ranges</TableCell>
                  <TableCell>Buttons fuer 6h, 12h, 24h, 48h — setzt End auf jetzt und Start entsprechend zurueck.</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>Tipp:</strong> Die tatsaechlich verfuegbaren Daten haengen von der Laufzeit des CoinStreamers ab.
            Verwende den API-Endpunkt <code>/api/training/data-availability</code> um den verfuegbaren Zeitraum zu pruefen.
          </Alert>

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Phase Filter</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Coins durchlaufen verschiedene Phasen (z.B. Phase 1: erste 5 Minuten, Phase 2: 5-15 Minuten, etc.).
            Der Phase-Filter bestimmt, welche Phasen-Daten ins Training einfliessen.
          </Typography>
          <Box component="ul" sx={{ pl: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2"><strong>"All" Button:</strong> Alle verfuegbaren Phasen einschliessen (Standard)</Typography></li>
            <li><Typography variant="body2"><strong>Einzelne Phasen:</strong> Klick auf eine Phase um sie ein-/auszuschliessen</Typography></li>
            <li><Typography variant="body2"><strong>Warum filtern?</strong> Unterschiedliche Phasen haben unterschiedliche Charakteristiken. Ein Modell das nur auf fruehen Phasen trainiert, kann fruehere Signale erkennen.</Typography></li>
          </Box>

          <CodeBlock>
{`Phase-Beispiel (konfigurierbar ueber Discovery):
  Phase 1: "Fresh"    — 0-5 min,   30s Intervall
  Phase 2: "Young"    — 5-15 min,  30s Intervall
  Phase 3: "Active"   — 15-60 min, 60s Intervall
  Phase 4: "Mature"   — 60+ min,   120s Intervall

Tipp: Fuer schnelle Pumps nur Phase 1+2 trainieren.
      Fuer nachhaltige Trends alle Phasen nutzen.`}
          </CodeBlock>
        </Chapter>

        {/* ── 9. Training Strategy ──────────────────────────────── */}
        <Chapter
          id="train-strategy"
          title="Training Strategy"
          icon="🎛️"
          expanded={expandedChapters.includes('train-strategy')}
          onChange={handleChapterChange('train-strategy')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Konfiguration wie das Modell trainiert wird: Klassen-Balancierung, Cross-Validation und Overfitting-Schutz.
          </Typography>

          {/* Class Balancing */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Class Balancing</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Bei Pump-Detection sind typischerweise nur 1-5% der Samples positiv (stark unbalanciert).
            Ohne Balancing wuerde das Modell einfach alles als "kein Pump" vorhersagen.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Methode</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Empfehlung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><Chip label="SPW" size="small" sx={{ bgcolor: 'rgba(255,152,0,0.2)', color: '#ff9800', fontSize: '0.7rem' }} /></TableCell>
                  <TableCell>
                    <strong>Scale Pos Weight:</strong> Gewichtet positive Samples staerker (Faktor konfigurierbar: 10-300x).
                    Der Loss fuer falsch-negative Vorhersagen wird mit diesem Faktor multipliziert.
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Standard. Weight ~100x ist ein guter Start.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><Chip label="SMOTE" size="small" sx={{ bgcolor: 'rgba(0,188,212,0.2)', color: '#00bcd4', fontSize: '0.7rem' }} /></TableCell>
                  <TableCell>
                    <strong>Synthetic Minority Oversampling:</strong> Erzeugt kuenstliche positive Samples durch Interpolation
                    zwischen existierenden positiven Samples. Vergroessert den Datensatz.
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Gut bei sehr wenigen positiven Samples (&lt;100).</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><Chip label="None" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.1)', fontSize: '0.7rem' }} /></TableCell>
                  <TableCell>
                    <strong>Keine Balancierung.</strong> Modell sieht die natuerliche Verteilung. Kann zu einem Modell fuehren
                    das fast nie "positiv" vorhersagt.
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Nicht empfohlen fuer Pump/Rug Detection.</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Divider sx={{ my: 2 }} />

          {/* Validation */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Validation (Cross-Validation)</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell><strong>Range</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><code>CV Splits</code></TableCell>
                  <TableCell>2 — 10 (Default: 5)</TableCell>
                  <TableCell>
                    Anzahl der Folds fuer Cross-Validation. Mehr Splits = stabilere Metriken, aber laengeres Training.
                    5 ist ein guter Standard.
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>TimeSeriesSplit</code></TableCell>
                  <TableCell>ON / OFF (Default: ON)</TableCell>
                  <TableCell>
                    Behaelt die zeitliche Reihenfolge bei: Training immer auf aelteren Daten, Validation auf neueren.
                    Verhindert Look-Ahead Bias. <strong>Empfohlen: immer ON.</strong>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>
          <CodeBlock>
{`TimeSeriesSplit mit 5 Folds:
  Fold 1: Train [====]          | Val [==]
  Fold 2: Train [========]      | Val [==]
  Fold 3: Train [============]  | Val [==]
  Fold 4: Train [================] | Val [==]
  Fold 5: Train [====================] | Val [==]

Ohne TimeSeriesSplit (Standard K-Fold):
  Fold 1: Val [==] Train [==================]
  Fold 2: Train [====] Val [==] Train [============]
  → Kann zukuenftige Daten zum Trainieren nutzen (Look-Ahead Bias!)`}
          </CodeBlock>

          <Divider sx={{ my: 2 }} />

          {/* Early Stopping */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Overfitting Protection (Early Stopping)</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell><strong>Range</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><code>Early Stopping</code></TableCell>
                  <TableCell>ON / OFF</TableCell>
                  <TableCell>Stoppt das Training automatisch wenn der Validation-Score sich nicht mehr verbessert.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Patience</code></TableCell>
                  <TableCell>5 — 50 Runden (Default: 10)</TableCell>
                  <TableCell>
                    Wie viele Runden ohne Verbesserung abgewartet werden bevor gestoppt wird.
                    Niedrig (5-10) = schnell stoppen. Hoch (20-50) = mehr Runden versuchen.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>
          <Alert severity="info">
            <strong>Empfehlung:</strong> Early Stopping ON mit Patience 10 fuer die meisten Modelle.
            Bei Moonshot-Presets (viele Features) kann Patience 15-20 besser sein.
            Beim Custom-Preset ist Early Stopping bewusst OFF damit du manuell experimentieren kannst.
          </Alert>
        </Chapter>

        {/* ── 10. Optimization ──────────────────────────────────── */}
        <Chapter
          id="train-optimization"
          title="Optimierung"
          icon="🚀"
          expanded={expandedChapters.includes('train-optimization')}
          onChange={handleChapterChange('train-optimization')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Optionale Optimierungen die nach dem Training ausgefuehrt werden:
            Hyperparameter-Tuning, SHAP-Analyse und manuelle Parameter-Overrides.
          </Typography>

          {/* Tuning */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#00d4ff' }}>Hyperparameter Tuning</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Automatische Optimierung der Modell-Hyperparameter nach dem initialen Training.
            Verwendet Optuna (Bayesian Optimization) um die besten Parameter zu finden.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell><strong>Range</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><code>Enable Tuning</code></TableCell>
                  <TableCell>ON / OFF</TableCell>
                  <TableCell>Startet automatisches Tuning nach dem Training. Verdoppelt+ die Trainingszeit.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Iterations</code></TableCell>
                  <TableCell>10 — 100 (Default: 30)</TableCell>
                  <TableCell>
                    Anzahl der Tuning-Versuche. Jede Iteration trainiert ein neues Modell mit anderen Parametern.
                    Mehr = bessere Ergebnisse, aber laenger.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>
          <CodeBlock>
{`Tuning optimiert automatisch (passt sich an Model Type an):

XGBoost-Tuning:                    LightGBM-Tuning:
  max_depth (3-10)                   num_leaves (15-127)
  learning_rate (0.01-0.3)           learning_rate (0.01-0.3)
  n_estimators (100-1000)            n_estimators (100-1000)
  subsample (0.6-1.0)               bagging_fraction (0.6-1.0)
  colsample_bytree (0.6-1.0)        feature_fraction (0.6-1.0)
  min_child_weight (1-10)            min_data_in_leaf (5-100)
  reg_alpha (0-10)                   lambda_l1 (0-10)
  reg_lambda (0-10)                  lambda_l2 (0-10)

→ API-Parameter: params._tune_after_training = true
                 params._tune_iterations = 50`}
          </CodeBlock>

          <Divider sx={{ my: 2 }} />

          {/* SHAP */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#9c27b0' }}>SHAP Explainability</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Berechnet Feature-Importance-Scores die erklaeren, welche Features die Vorhersagen am staerksten beeinflussen.
            Basiert auf Shapley Values aus der Spieltheorie.
          </Typography>
          <Box component="ul" sx={{ pl: 2, mb: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2"><strong>Globale Importance:</strong> Welche Features sind insgesamt am wichtigsten?</Typography></li>
            <li><Typography variant="body2"><strong>Feature Ranking:</strong> Sortierte Liste der Features nach Einfluss</Typography></li>
            <li><Typography variant="body2"><strong>Trainingszeit:</strong> Erhoehte Trainingszeit (~2-5x je nach Feature-Anzahl)</Typography></li>
            <li><Typography variant="body2"><strong>Nutzen:</strong> Hilft unnoetige Features zu identifizieren und zu entfernen (Exclude Features)</Typography></li>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Custom Params */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Custom Hyperparameters</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Manuelle Uebersteuerung von Modell-Hyperparametern. Ueberschreibt die Standard-Werte
            und die vom Tuning gefundenen Werte (falls aktiv). Die Vorschlaege im Dropdown passen sich
            automatisch an den gewaehlten Model Type an.
          </Typography>

          <Typography variant="body2" sx={{ mb: 1, mt: 2, fontWeight: 'bold', color: '#00d4ff' }}>Gemeinsame Parameter</Typography>
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
                  <TableCell><code>max_depth</code></TableCell>
                  <TableCell>6</TableCell>
                  <TableCell>Max. Baumtiefe. Hoeher = komplexeres Modell, hoehere Overfitting-Gefahr.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>learning_rate</code></TableCell>
                  <TableCell>0.1</TableCell>
                  <TableCell>Lernrate. Kleiner = langsamer lernen, mehr Baeume noetig, aber stabiler.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>n_estimators</code></TableCell>
                  <TableCell>100</TableCell>
                  <TableCell>Anzahl der Baeume. Mehr = staerkeres Modell, laengeres Training.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>max_bin</code></TableCell>
                  <TableCell>256</TableCell>
                  <TableCell>Max. Anzahl Bins fuer Feature-Diskretisierung. Mehr = praeziser, langsamer.</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 1, mt: 2, fontWeight: 'bold', color: '#4caf50' }}>XGBoost-spezifisch</Typography>
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
                  <TableCell><code>min_child_weight</code></TableCell>
                  <TableCell>1</TableCell>
                  <TableCell>Min. Summe der Gewichte in einem Blattknoten. Hoeher = konservativer.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>gamma</code></TableCell>
                  <TableCell>0</TableCell>
                  <TableCell>Min. Loss-Reduktion fuer einen Split. Hoeher = weniger Splits, einfacherer Baum.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>subsample</code></TableCell>
                  <TableCell>1.0</TableCell>
                  <TableCell>Anteil der Daten pro Baum (0.0-1.0). &lt;1.0 = Regularisierung gegen Overfitting.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>colsample_bytree</code></TableCell>
                  <TableCell>1.0</TableCell>
                  <TableCell>Anteil der Features pro Baum. &lt;1.0 = Feature-Diversitaet zwischen Baeumen.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>reg_alpha</code></TableCell>
                  <TableCell>0</TableCell>
                  <TableCell>L1-Regularisierung (Lasso). Hoeher = mehr Features werden auf 0 gesetzt.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>reg_lambda</code></TableCell>
                  <TableCell>1</TableCell>
                  <TableCell>L2-Regularisierung (Ridge). Hoeher = kleinere Gewichte, glatteres Modell.</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 1, mt: 2, fontWeight: 'bold', color: '#9c27b0' }}>LightGBM-spezifisch</Typography>
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
                  <TableCell><code>num_leaves</code></TableCell>
                  <TableCell>31</TableCell>
                  <TableCell><strong>Wichtigster LightGBM-Parameter.</strong> Max. Blaetter pro Baum. Steuert Modell-Komplexitaet direkt.
                    Faustregel: <code>num_leaves &lt; 2^max_depth</code> um Overfitting zu vermeiden.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>min_data_in_leaf</code></TableCell>
                  <TableCell>20</TableCell>
                  <TableCell>Min. Samples pro Blatt. Hoeher = konservativer, weniger Overfitting. Bei kleinen Datensaetzen reduzieren.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>bagging_fraction</code></TableCell>
                  <TableCell>1.0</TableCell>
                  <TableCell>Anteil der Daten pro Baum. Entspricht <code>subsample</code> bei XGBoost. &lt;1.0 = Regularisierung.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>feature_fraction</code></TableCell>
                  <TableCell>1.0</TableCell>
                  <TableCell>Anteil der Features pro Baum. Entspricht <code>colsample_bytree</code> bei XGBoost.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>lambda_l1</code></TableCell>
                  <TableCell>0</TableCell>
                  <TableCell>L1-Regularisierung. Entspricht <code>reg_alpha</code> bei XGBoost.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>lambda_l2</code></TableCell>
                  <TableCell>0</TableCell>
                  <TableCell>L2-Regularisierung. Entspricht <code>reg_lambda</code> bei XGBoost.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>min_gain_to_split</code></TableCell>
                  <TableCell>0</TableCell>
                  <TableCell>Min. Gain fuer einen Split. Entspricht <code>gamma</code> bei XGBoost.</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <CodeBlock>
{`Parameter-Mapping XGBoost ↔ LightGBM:
  subsample         ↔  bagging_fraction
  colsample_bytree  ↔  feature_fraction
  reg_alpha         ↔  lambda_l1
  reg_lambda        ↔  lambda_l2
  gamma             ↔  min_gain_to_split
  min_child_weight  ↔  min_data_in_leaf (aehnlich, nicht identisch)
  max_depth         ↔  max_depth (bei beiden, aber LightGBM: num_leaves wichtiger)

Typische LightGBM-Startconfig:
  num_leaves: 31, min_data_in_leaf: 20, learning_rate: 0.1
  bagging_fraction: 0.8, feature_fraction: 0.8

Typische XGBoost-Startconfig:
  max_depth: 6, min_child_weight: 1, learning_rate: 0.1
  subsample: 0.8, colsample_bytree: 0.8`}
          </CodeBlock>

          <Alert severity="warning">
            Custom Hyperparameters sind fuer fortgeschrittene Nutzer. Bei falsch gesetzten Werten kann das Modell
            schlecht performen. Nutze stattdessen Tuning fuer automatische Optimierung — der Tuner passt die Parameter
            automatisch an den gewaehlten Model Type an.
          </Alert>
        </Chapter>

        {/* ── 11. Metriken & Auswertung ─────────────────────────── */}
        <Chapter
          id="train-metrics"
          title="Metriken & Auswertung"
          icon="📊"
          expanded={expandedChapters.includes('train-metrics')}
          onChange={handleChapterChange('train-metrics')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Nach dem Training werden diese Metriken auf dem Validation-Set berechnet.
            Bei Cross-Validation werden die Metriken ueber alle Folds gemittelt.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Metrik</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                  <TableCell><strong>Ideal</strong></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Wichtig fuer</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Accuracy</TableCell>
                  <TableCell>Anteil korrekt klassifizierter Samples</TableCell>
                  <TableCell>{'> 70%'}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Generelle Qualitaet</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><strong>Precision</strong></TableCell>
                  <TableCell>Von allen "positiv" vorhergesagten — wie viele waren korrekt?</TableCell>
                  <TableCell>{'> 50%'}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Trading (weniger False Alarms)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><strong>Recall</strong></TableCell>
                  <TableCell>Von allen tatsaechlich positiven — wie viele wurden erkannt?</TableCell>
                  <TableCell>{'> 30%'}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Rug Shield (nichts verpassen)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>F1-Score</TableCell>
                  <TableCell>Harmonisches Mittel aus Precision und Recall</TableCell>
                  <TableCell>{'> 40%'}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Balancierte Bewertung</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>ROC-AUC</TableCell>
                  <TableCell>Flaeche unter der ROC-Kurve (Ranking-Qualitaet)</TableCell>
                  <TableCell>{'> 0.6'}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Schwellwert-unabhaengig</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>MCC</TableCell>
                  <TableCell>Matthews Correlation Coefficient (-1 bis +1)</TableCell>
                  <TableCell>{'> 0.1'}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Unbalancierte Daten</TableCell>
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

TN = True Negative  → korrekt: kein Pump vorhergesagt, kein Pump passiert
FP = False Positive → falscher Alarm: Pump vorhergesagt, keiner passiert
FN = False Negative → verpasst: kein Pump vorhergesagt, aber Pump passiert
TP = True Positive  → korrekt: Pump vorhergesagt und Pump passiert`}
          </CodeBlock>

          <Alert severity="info">
            <strong>Fuer Trading:</strong> Precision ist wichtiger als Recall — lieber weniger, aber korrekte Signale.
            <br />
            <strong>Fuer Rug Shield:</strong> Recall ist wichtiger — lieber zu viele Warnungen als einen Rug verpassen.
          </Alert>
        </Chapter>

        {/* ── 12. Settings ──────────────────────────────────────── */}
        <Chapter
          id="train-settings"
          title="Training Settings"
          icon="⚙️"
          expanded={expandedChapters.includes('train-settings')}
          onChange={handleChapterChange('train-settings')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Zentrale Konfiguration fuer Auto-Retrain, Drift Detection und Training-Defaults.
            Erreichbar ueber Training → Settings.
          </Typography>

          {/* Auto-Retrain */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#4caf50' }}>Auto-Retrain</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Automatisches Nachtrainieren von Modellen nach einem konfigurierbaren Zeitplan.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell><strong>Optionen</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><code>Enabled</code></TableCell>
                  <TableCell>ON / OFF</TableCell>
                  <TableCell>Aktiviert/deaktiviert das gesamte Auto-Retrain-System.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Schedule</code></TableCell>
                  <TableCell>6h — 168h (7 Tage)</TableCell>
                  <TableCell>Wie oft das System pruefen soll ob ein Retrain noetig ist. Presets: 6h, 12h, Daily, 2 Days, Weekly.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Training Data Window</code></TableCell>
                  <TableCell>12h — 168h</TableCell>
                  <TableCell>Wie viel historische Daten fuer das Retraining verwendet werden.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Base Models</code></TableCell>
                  <TableCell>Multi-Select (Checkbox-Liste)</TableCell>
                  <TableCell>
                    <strong>Mehrere Modelle</strong> koennen als Basis ausgewaehlt werden. Fuer jedes selektierte Modell wird
                    ein separater TRAIN-Job erstellt mit den Features, Parametern und Phasen des Originals.
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Auto-Deploy</code></TableCell>
                  <TableCell>ON / OFF</TableCell>
                  <TableCell>Ersetzt automatisch das aktive Prediction-Modell wenn <strong>irgendein</strong> nachtrainiertes Modell hoehere Accuracy zeigt.</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>Multi-Model Workflow:</strong> Waehle mehrere Base Models (z.B. ein XGBoost und ein LightGBM) aus.
            Beim naechsten Retrain-Zyklus werden alle parallel neu trainiert. Mit Auto-Deploy gewinnt das beste Modell automatisch.
          </Alert>

          <Divider sx={{ my: 2 }} />

          {/* Drift Detection */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#ff9800' }}>Drift Detection</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Ueberwacht die Accuracy aktiver Modelle und reagiert wenn die Performance unter einen Schwellwert faellt.
          </Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Parameter</strong></TableCell>
                  <TableCell><strong>Optionen</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><code>Enabled</code></TableCell>
                  <TableCell>ON / OFF</TableCell>
                  <TableCell>Aktiviert die Drift-Ueberwachung.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Accuracy Threshold</code></TableCell>
                  <TableCell>30% — 80%</TableCell>
                  <TableCell>Unter diesem Wert wird Drift erkannt. Basiert auf Alert-Evaluations der letzten 24h.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Check Interval</code></TableCell>
                  <TableCell>1h — 24h</TableCell>
                  <TableCell>Wie oft der Drift-Check ausgefuehrt wird.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Action</code></TableCell>
                  <TableCell>Log Only | Auto-Retrain | Notify</TableCell>
                  <TableCell>
                    <strong>Log Only:</strong> Drift wird geloggt, keine Aktion.
                    <strong> Auto-Retrain:</strong> Startet automatisch einen Retrain-Job.
                    <strong> Notify:</strong> Sendet Benachrichtigung via n8n Webhook.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Divider sx={{ my: 2 }} />

          {/* Training Defaults */}
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#00d4ff' }}>Training Defaults</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Standard-Werte die beim Erstellen neuer Modelle vorbelegt werden. Individuell ueberschreibbar pro Modell.
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
                <TableRow>
                  <TableCell><code>Default Model Type</code></TableCell>
                  <TableCell>XGBoost</TableCell>
                  <TableCell>Standard ML-Algorithmus fuer neue Modelle.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Default Training Window</code></TableCell>
                  <TableCell>48h</TableCell>
                  <TableCell>Standard-Zeitraum fuer Trainingsdaten.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Early Stopping</code></TableCell>
                  <TableCell>10 Runden</TableCell>
                  <TableCell>Standard-Patience fuer Early Stopping. 0 = deaktiviert.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>SHAP</code></TableCell>
                  <TableCell>OFF</TableCell>
                  <TableCell>Standard-Einstellung fuer SHAP-Analyse bei neuen Modellen.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Feature Sources</code></TableCell>
                  <TableCell>Alle aktiv</TableCell>
                  <TableCell>Pro Quelle (Graph, Embedding, Transaction, Metadata) einzeln konfigurierbare Default-Features.</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>Metadata Master Toggle</code></TableCell>
                  <TableCell>ON</TableCell>
                  <TableCell>Globaler Schalter: aktiviert/deaktiviert Metadata-Features fuer alle neuen Modelle.</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>

        {/* ── 13. API & MCP ─────────────────────────────────────── */}
        <Chapter
          id="train-api"
          title="API-Endpunkte & MCP-Tools"
          icon="🔌"
          expanded={expandedChapters.includes('train-api')}
          onChange={handleChapterChange('train-api')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Modelle</Typography>
          <EndpointRow method="GET" path="/api/training/models" desc="Alle Modelle auflisten" />
          <EndpointRow method="GET" path="/api/training/models/{id}" desc="Modell-Details mit Metriken" />
          <EndpointRow method="POST" path="/api/training/models/create" desc="TRAIN-Job erstellen (JSON Body)" />
          <EndpointRow method="POST" path="/api/training/models/create/advanced" desc="TRAIN-Job erstellen (Query Params)" />
          <EndpointRow method="POST" path="/api/training/models/{id}/test" desc="TEST-Job erstellen (Backtesting)" />
          <EndpointRow method="POST" path="/api/training/models/compare" desc="COMPARE-Job erstellen (2-4 Modelle)" />
          <EndpointRow method="POST" path="/api/training/models/{id}/tune" desc="TUNE-Job erstellen (Hyperparameter)" />
          <EndpointRow method="PATCH" path="/api/training/models/{id}" desc="Name/Beschreibung aendern" />
          <EndpointRow method="DELETE" path="/api/training/models/{id}" desc="Modell loeschen (soft-delete)" />
          <EndpointRow method="GET" path="/api/training/models/{id}/download" desc="Modell-Datei herunterladen" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Job-Queue</Typography>
          <EndpointRow method="GET" path="/api/training/queue" desc="Alle Jobs auflisten" />
          <EndpointRow method="GET" path="/api/training/queue/{id}" desc="Job-Details mit Ergebnissen" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Ergebnisse</Typography>
          <EndpointRow method="GET" path="/api/training/test-results" desc="Alle Test-Ergebnisse" />
          <EndpointRow method="GET" path="/api/training/test-results/{id}" desc="Test-Ergebnis Details" />
          <EndpointRow method="DELETE" path="/api/training/test-results/{id}" desc="Test-Ergebnis loeschen" />
          <EndpointRow method="GET" path="/api/training/comparisons" desc="Alle Vergleiche" />
          <EndpointRow method="GET" path="/api/training/comparisons/{id}" desc="Vergleich-Details" />
          <EndpointRow method="DELETE" path="/api/training/comparisons/{id}" desc="Vergleich loeschen" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>System</Typography>
          <EndpointRow method="GET" path="/api/training/features" desc="Verfuegbare Features" />
          <EndpointRow method="GET" path="/api/training/data-availability" desc="Verfuegbarer Datenzeitraum" />
          <EndpointRow method="GET" path="/api/training/phases" desc="Coin-Phasen" />
          <EndpointRow method="GET" path="/api/training/health" desc="Service Health-Check" />
          <EndpointRow method="GET" path="/api/training/config" desc="Aktuelle Konfiguration" />
          <EndpointRow method="GET" path="/api/training/settings" desc="Training-Einstellungen" />
          <EndpointRow method="PATCH" path="/api/training/settings" desc="Training-Einstellungen aendern" />

          <Divider sx={{ my: 3 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>MCP-Tools (AI-Integration)</Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            Alle API-Endpunkte sind automatisch als MCP-Tools fuer Claude Code, Cursor und andere AI-Assistenten verfuegbar.
          </Alert>

          <Grid container spacing={1}>
            {[
              { name: 'create_model_job_body', desc: 'Neues Modell trainieren (TRAIN-Job)', cat: 'Training' },
              { name: 'create_model_job_advanced', desc: 'TRAIN-Job mit Query Params', cat: 'Training' },
              { name: 'test_model_job', desc: 'Modell auf neuen Daten testen', cat: 'Training' },
              { name: 'compare_models_job', desc: '2-4 Modelle vergleichen', cat: 'Training' },
              { name: 'tune_model', desc: 'Hyperparameter-Tuning starten', cat: 'Training' },
              { name: 'list_models_endpoint', desc: 'Alle Modelle auflisten', cat: 'Modelle' },
              { name: 'get_model_endpoint', desc: 'Modell-Details mit Metriken', cat: 'Modelle' },
              { name: 'update_model_endpoint', desc: 'Name/Beschreibung aendern', cat: 'Modelle' },
              { name: 'delete_model_endpoint', desc: 'Modell loeschen', cat: 'Modelle' },
              { name: 'download_model', desc: 'Modell-Datei herunterladen', cat: 'Modelle' },
              { name: 'list_jobs_endpoint', desc: 'Alle Jobs auflisten', cat: 'Jobs' },
              { name: 'get_job_endpoint', desc: 'Job-Details mit Ergebnissen', cat: 'Jobs' },
              { name: 'list_test_results_endpoint', desc: 'Test-Ergebnisse', cat: 'Ergebnisse' },
              { name: 'get_test_result_endpoint', desc: 'Test-Detail mit Confusion Matrix', cat: 'Ergebnisse' },
              { name: 'list_comparisons_endpoint', desc: 'Alle Vergleiche', cat: 'Ergebnisse' },
              { name: 'get_comparison_endpoint', desc: 'Vergleich-Details', cat: 'Ergebnisse' },
              { name: 'get_available_features', desc: 'Verfuegbare Features', cat: 'System' },
              { name: 'get_data_availability', desc: 'Datenzeitraum abfragen', cat: 'System' },
              { name: 'get_phases_endpoint', desc: 'Coin-Phasen', cat: 'System' },
              { name: 'health_check', desc: 'Service-Status', cat: 'System' },
              { name: 'get_config', desc: 'Aktuelle Konfiguration', cat: 'System' },
              { name: 'get_training_settings', desc: 'Training-Einstellungen', cat: 'System' },
              { name: 'update_training_settings', desc: 'Einstellungen aendern', cat: 'System' },
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
