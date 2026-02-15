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
  'train-extra-sources',
  'train-metadata',
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
            <li><Typography variant="body2">Asynchrone Job-Queue fuer Training, Test, Vergleich und Tuning</Typography></li>
            <li><Typography variant="body2">28 Basis-Features + 66 Engineered Features + 66 Flag-Features + 35 Extra Source Features (Graph/Embedding/Transaction/Metadata)</Typography></li>
            <li><Typography variant="body2">Konfigurierbarer Vorhersage-Horizont (future_minutes) und Schwelle (min_percent_change)</Typography></li>
            <li><Typography variant="body2">Automatische Metrik-Berechnung: Accuracy, F1, Precision, Recall, ROC-AUC, MCC</Typography></li>
            <li><Typography variant="body2">Early Stopping, SHAP Feature Importance und Cross-Validation</Typography></li>
            <li><Typography variant="body2">Modell-Vergleiche auf identischen Testzeitraeumen</Typography></li>
          </Box>
          <CodeBlock>
{`Workflow:
  1. Features + Zeitraum waehlen
  2. TRAIN-Job erstellen (asynchron)
  3. Modell wird trainiert und gespeichert
  4. TEST-Job auf neuem Zeitraum (Backtesting)
  5. COMPARE-Job: 2-4 Modelle vergleichen
  6. TUNE-Job: Hyperparameter optimieren
  7. Bestes Modell im Prediction-Server importieren`}
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
                  <TableCell>Volume</TableCell>
                  <TableCell>volume_sol, buy_volume_sol, sell_volume_sol, net_volume_sol</TableCell>
                  <TableCell>4</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Market</TableCell>
                  <TableCell>market_cap_close, bonding_curve_pct, virtual_sol_reserves, is_koth</TableCell>
                  <TableCell>4</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Activity</TableCell>
                  <TableCell>num_buys, num_sells, unique_wallets, num_micro_trades</TableCell>
                  <TableCell>4</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Trade Size</TableCell>
                  <TableCell>max_single_buy_sol, max_single_sell_sol, avg_trade_size_sol</TableCell>
                  <TableCell>3</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Whale</TableCell>
                  <TableCell>whale_buy_volume_sol, whale_sell_volume_sol, num_whale_buys, num_whale_sells</TableCell>
                  <TableCell>4</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Safety</TableCell>
                  <TableCell>dev_sold_amount</TableCell>
                  <TableCell>1</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Risk / Other</TableCell>
                  <TableCell>volatility_pct, buy_pressure_ratio, unique_signer_ratio, phase_id_at_time</TableCell>
                  <TableCell>4</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>

        {/* 3. Feature Engineering (66) */}
        <Chapter
          id="train-engineered"
          title="Feature Engineering (66)"
          icon="🔬"
          expanded={expandedChapters.includes('train-engineered')}
          onChange={handleChapterChange('train-engineered')}
        >
          <Alert severity="info" sx={{ mb: 2 }}>
            Aktivierbar mit <code>use_engineered_features: true</code> beim Training.
            Features werden mit Rolling Windows (5, 10, 15 Datenpunkte) berechnet.
          </Alert>

          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Gruppe</strong></TableCell>
                  <TableCell><strong>Features</strong></TableCell>
                  <TableCell><strong>Anzahl</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Dev Sold</TableCell>
                  <TableCell>dev_sold_flag, dev_sold_cumsum, dev_sold_spike_5/10/15</TableCell>
                  <TableCell>5</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Buy Pressure</TableCell>
                  <TableCell>buy_pressure_ma_5/10/15, buy_pressure_trend_5/10/15</TableCell>
                  <TableCell>6</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Whale Tracking</TableCell>
                  <TableCell>whale_net_volume, whale_activity_5/10/15</TableCell>
                  <TableCell>4</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Volatility</TableCell>
                  <TableCell>volatility_ma_5/10/15, volatility_spike_5/10/15</TableCell>
                  <TableCell>6</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Wash Trading</TableCell>
                  <TableCell>wash_trading_flag_5/10/15</TableCell>
                  <TableCell>3</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Net Volume</TableCell>
                  <TableCell>net_volume_ma_5/10/15, volume_flip_5/10/15</TableCell>
                  <TableCell>6</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Price Momentum</TableCell>
                  <TableCell>price_change_5/10/15, price_roc_5/10/15</TableCell>
                  <TableCell>6</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Market Cap</TableCell>
                  <TableCell>mcap_velocity_5/10/15</TableCell>
                  <TableCell>3</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>ATH Analysis</TableCell>
                  <TableCell>rolling_ath, price_vs_ath_pct, ath_breakout, minutes_since_ath, ath_distance_trend, ath_approach, ath_breakout_count, ath_breakout_volume_ma, ath_age_trend (jeweils _5/10/15)</TableCell>
                  <TableCell>19</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Power Features</TableCell>
                  <TableCell>buy_sell_ratio, whale_dominance, price_acceleration_5/10/15, volume_spike_5/10/15</TableCell>
                  <TableCell>8</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Flag-Features (66)</Typography>
          <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
            Aktivierbar mit <code>use_flag_features: true</code> (Standard: aktiv).
            Fuer jedes Engineered Feature wird ein <code>{'<feature>_has_data'}</code> Flag erzeugt,
            das anzeigt ob genug Datenpunkte fuer das Rolling Window vorhanden sind.
          </Typography>
        </Chapter>

        {/* 4. Extra Source Features */}
        <Chapter
          id="train-extra-sources"
          title="Extra Source Features (35)"
          icon="🔗"
          expanded={expandedChapters.includes('train-extra-sources')}
          onChange={handleChapterChange('train-extra-sources')}
        >
          <Alert severity="info" sx={{ mb: 2 }}>
            Vier zusaetzliche Datenquellen mit insgesamt 35 Features.
            Jedes Feature ist einzeln auswaehlbar — nicht mehr nur an/aus pro Quelle.
          </Alert>

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
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>API-Parameter</Typography>
          <CodeBlock>
{`// Modulare Auswahl beim Training:
{
  "use_graph_features": true,
  "graph_feature_names": ["creator_total_tokens", "creator_is_serial"],

  "use_embedding_features": true,
  "embedding_feature_names": null,  // null = alle 6

  "use_transaction_features": false,  // komplett deaktiviert

  "use_metadata_features": true,
  "metadata_feature_names": null  // null = alle 13
}`}
          </CodeBlock>
        </Chapter>

        {/* 4b. Metadata Features (13) */}
        <Chapter
          id="train-metadata"
          title="Metadata Features (13)"
          icon="🏷️"
          expanded={expandedChapters.includes('train-metadata')}
          onChange={handleChapterChange('train-metadata')}
        >
          <Alert severity="info" sx={{ mb: 2 }}>
            Features aus <code>discovered_coins</code> und <code>exchange_rates</code>.
            Erfassen Token-Eigenschaften zum Discovery-Zeitpunkt: Creator-Investment, Social-Praesenz,
            Rug-Risiko-Indikatoren und SOL-Markt-Kontext.
          </Alert>

          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Feature</strong></TableCell>
                  <TableCell><strong>Quelle</strong></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>ML-Nutzen</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><code>meta_initial_buy_sol</code></TableCell>
                  <TableCell>initial_buy_sol (cap 100)</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Creator-Investment in SOL</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>meta_initial_buy_ratio</code></TableCell>
                  <TableCell>initial_buy / market_cap</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Skin-in-the-Game relativ</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>meta_token_supply_log</code></TableCell>
                  <TableCell>log10(token_supply)</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Skalierte Token-Supply</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>meta_has_socials</code></TableCell>
                  <TableCell>has_socials (0/1)</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Social-Praesenz vorhanden</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>meta_social_count</code></TableCell>
                  <TableCell>social_count (0-4)</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Quantifizierte Social-Praesenz</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>meta_metadata_mutable</code></TableCell>
                  <TableCell>metadata_is_mutable</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Rug-Risiko: Metadata aenderbar</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>meta_mint_authority</code></TableCell>
                  <TableCell>mint_authority_enabled</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Rug-Risiko: Kann nachminten</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>meta_risk_score</code></TableCell>
                  <TableCell>risk_score (0-1)</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Vorberechneter Risiko-Score</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>meta_top10_holders_pct</code></TableCell>
                  <TableCell>top_10_holders_pct (0-1)</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Holder-Konzentration</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>meta_liquidity_sol</code></TableCell>
                  <TableCell>log10(liquidity_sol + 1)</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Initiale Liquiditaet</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>meta_is_mayhem</code></TableCell>
                  <TableCell>is_mayhem_mode (0/1)</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Marktbedingung (Chaos-Modus)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>meta_sol_price_usd</code></TableCell>
                  <TableCell>exchange_rates</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>SOL-Preis als Markt-Kontext</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>meta_sol_price_change_1h</code></TableCell>
                  <TableCell>Berechnet aus exchange_rates</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>SOL-Markt-Momentum (%)</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>Null-Handling</Typography>
          <Box component="ul" sx={{ pl: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2">Booleans (metadata_mutable, mint_authority): <code>null → 1.0</code> (riskant annehmen)</Typography></li>
            <li><Typography variant="body2">Zahlen (risk_score, top10_holders_pct): <code>null → 0.0</code></Typography></li>
            <li><Typography variant="body2">SOL-Preis: Naechster Eintrag in exchange_rates zum Discovery-Zeitpunkt</Typography></li>
          </Box>
        </Chapter>

        {/* 5. Training-Parameter */}
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
                  <TableCell>Modell-Typ (xgboost oder lightgbm)</TableCell>
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
                  <TableCell>true</TableCell>
                  <TableCell>SMOTE Oversampling fuer unbalancierte Daten</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>early_stopping_rounds</code></TableCell>
                  <TableCell>10</TableCell>
                  <TableCell>Early Stopping Runden (0 = deaktiviert)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>compute_shap</code></TableCell>
                  <TableCell>false</TableCell>
                  <TableCell>SHAP Feature Importance berechnen</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>use_timeseries_split</code></TableCell>
                  <TableCell>true</TableCell>
                  <TableCell>TimeSeriesSplit fuer Cross-Validation</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>cv_splits</code></TableCell>
                  <TableCell>5</TableCell>
                  <TableCell>Anzahl CV-Splits (2-10)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>use_engineered_features</code></TableCell>
                  <TableCell>false</TableCell>
                  <TableCell>66 Feature Engineering aktivieren</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>use_flag_features</code></TableCell>
                  <TableCell>true</TableCell>
                  <TableCell>66 Flag-Features aktivieren</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>use_graph_features</code></TableCell>
                  <TableCell>false</TableCell>
                  <TableCell>Neo4j Graph-Features laden</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>graph_feature_names</code></TableCell>
                  <TableCell>null</TableCell>
                  <TableCell>Einzelne Graph-Features (null = alle 8)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>use_embedding_features</code></TableCell>
                  <TableCell>false</TableCell>
                  <TableCell>pgvector Embedding-Features laden</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>embedding_feature_names</code></TableCell>
                  <TableCell>null</TableCell>
                  <TableCell>Einzelne Embedding-Features (null = alle 6)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>use_transaction_features</code></TableCell>
                  <TableCell>false</TableCell>
                  <TableCell>Transaction-Features laden</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>transaction_feature_names</code></TableCell>
                  <TableCell>null</TableCell>
                  <TableCell>Einzelne Transaction-Features (null = alle 8)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>use_metadata_features</code></TableCell>
                  <TableCell>false</TableCell>
                  <TableCell>Metadata-Features laden (discovered_coins + exchange_rates)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>metadata_feature_names</code></TableCell>
                  <TableCell>null</TableCell>
                  <TableCell>Einzelne Metadata-Features (null = alle 13)</TableCell>
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

        {/* 6. Metriken & Auswertung */}
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

        {/* 7. API-Endpunkte */}
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
        </Chapter>

        {/* 8. MCP-Tools */}
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
              { name: 'get_model_download_info', desc: 'Modell-Datei Infos (Groesse, Pfad)', cat: 'Modelle' },
              { name: 'list_jobs', desc: 'Alle Jobs auflisten', cat: 'Jobs' },
              { name: 'get_job', desc: 'Job-Details mit Ergebnissen', cat: 'Jobs' },
              { name: 'list_test_results', desc: 'Test-Ergebnisse', cat: 'Ergebnisse' },
              { name: 'get_test_result', desc: 'Test-Detail mit Confusion Matrix', cat: 'Ergebnisse' },
              { name: 'list_comparisons', desc: 'Alle Vergleiche', cat: 'Ergebnisse' },
              { name: 'get_comparison', desc: 'Vergleich-Details', cat: 'Ergebnisse' },
              { name: 'get_features', desc: 'Verfuegbare Features', cat: 'System' },
              { name: 'get_data_availability', desc: 'Datenzeitraum abfragen', cat: 'System' },
              { name: 'get_phases', desc: 'Coin-Phasen', cat: 'System' },
              { name: 'health_check', desc: 'Service-Status', cat: 'System' },
              { name: 'get_config', desc: 'Aktuelle Konfiguration', cat: 'System' },
              { name: 'update_config', desc: 'Konfiguration aendern', cat: 'System' },
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
