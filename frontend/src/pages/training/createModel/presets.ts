import type { CreateModelFormState } from './types';
import { ENGINEERING_FEATURES, BASE_FEATURES, GRAPH_FEATURES, EMBEDDING_FEATURES, TRANSACTION_FEATURES, METADATA_FEATURES } from './features';

export interface PresetDef {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  icon: string; // MUI icon name — resolved in the component
  values: Omit<CreateModelFormState, 'name' | 'trainStart' | 'trainEnd' | 'selectedPhases' | 'activePreset' | 'description' | 'modelType'>;
}

const essentialBase = BASE_FEATURES.filter((f) => f.importance === 'essential').map((f) => f.id);
const recommendedBase = BASE_FEATURES.filter((f) => f.importance !== 'optional').map((f) => f.id);
const allBase = BASE_FEATURES.map((f) => f.id);
const highImpEng = ENGINEERING_FEATURES.filter((f) => f.importance === 'high').map((f) => f.id);
const allEng = ENGINEERING_FEATURES.map((f) => f.id);
const rugEng = ENGINEERING_FEATURES.filter((f) => ['dev', 'safety', 'whale', 'risk'].includes(f.category)).map((f) => f.id);
const allGraph = GRAPH_FEATURES.map((f) => f.id);
const allEmbedding = EMBEDDING_FEATURES.map((f) => f.id);
const allTransaction = TRANSACTION_FEATURES.map((f) => f.id);
const allMetadata = METADATA_FEATURES.map((f) => f.id);

export const PRESETS: PresetDef[] = [
  // ── Fast Pump: Speed over depth. Minimal features, quick training ──
  {
    id: 'fast',
    name: 'Fast Pump',
    subtitle: '5% / 5min',
    color: '#00d4ff',
    icon: 'speed',
    values: {
      direction: 'up',
      futureMinutes: 5,
      minPercentChange: 5,
      selectedBaseFeatures: essentialBase,
      selectedEngFeatures: [],
      selectedGraphFeatures: [],
      selectedEmbeddingFeatures: allEmbedding,
      selectedTransactionFeatures: [],
      selectedMetadataFeatures: [],
      balanceMethod: 'scale_pos_weight',
      scaleWeight: 100,
      useFlagFeatures: false,
      earlyStoppingRounds: 10,
      enableShap: false,
      enableTuning: false,
      tuningIterations: 20,
      cvSplits: 3,
      useTimeseriesSplit: true,
      customParams: {},
      excludeFeatures: [],
      useMarketContext: false,
      featureWindows: [5],
    },
  },
  // ── Standard: Balanced — good features, reasonable training time ──
  {
    id: 'standard',
    name: 'Standard',
    subtitle: '10% / 10min',
    color: '#4caf50',
    icon: 'trending_up',
    values: {
      direction: 'up',
      futureMinutes: 10,
      minPercentChange: 10,
      selectedBaseFeatures: recommendedBase,
      selectedEngFeatures: highImpEng,
      selectedGraphFeatures: allGraph,
      selectedEmbeddingFeatures: allEmbedding,
      selectedTransactionFeatures: [],
      selectedMetadataFeatures: [],
      balanceMethod: 'scale_pos_weight',
      scaleWeight: 100,
      useFlagFeatures: true,
      earlyStoppingRounds: 10,
      enableShap: false,
      enableTuning: false,
      tuningIterations: 30,
      cvSplits: 5,
      useTimeseriesSplit: true,
      customParams: {},
      excludeFeatures: [],
      useMarketContext: true,
      featureWindows: [5, 10, 15],
    },
  },
  // ── Moonshot: Maximum signal — all features, tuning, SHAP ──
  {
    id: 'moonshot',
    name: 'Moonshot',
    subtitle: '25% / 15min',
    color: '#9c27b0',
    icon: 'rocket',
    values: {
      direction: 'up',
      futureMinutes: 15,
      minPercentChange: 25,
      selectedBaseFeatures: allBase,
      selectedEngFeatures: allEng,
      selectedGraphFeatures: allGraph,
      selectedEmbeddingFeatures: allEmbedding,
      selectedTransactionFeatures: allTransaction,
      selectedMetadataFeatures: allMetadata,
      balanceMethod: 'scale_pos_weight',
      scaleWeight: 200,
      useFlagFeatures: true,
      earlyStoppingRounds: 15,
      enableShap: true,
      enableTuning: true,
      tuningIterations: 50,
      cvSplits: 5,
      useTimeseriesSplit: true,
      customParams: {},
      excludeFeatures: [],
      useMarketContext: true,
      featureWindows: [5, 10, 15, 30],
    },
  },
  // ── Rug Shield: Detect rugs — safety-focused features ──
  {
    id: 'rug',
    name: 'Rug Shield',
    subtitle: '-20% / 10min',
    color: '#f44336',
    icon: 'shield',
    values: {
      direction: 'down',
      futureMinutes: 10,
      minPercentChange: 20,
      selectedBaseFeatures: [...recommendedBase, 'bonding_curve_pct', 'num_buys', 'num_sells'],
      selectedEngFeatures: rugEng,
      selectedGraphFeatures: allGraph,
      selectedEmbeddingFeatures: allEmbedding,
      selectedTransactionFeatures: allTransaction,
      selectedMetadataFeatures: allMetadata,
      balanceMethod: 'scale_pos_weight',
      scaleWeight: 50,
      useFlagFeatures: true,
      earlyStoppingRounds: 10,
      enableShap: true,
      enableTuning: false,
      tuningIterations: 30,
      cvSplits: 5,
      useTimeseriesSplit: true,
      customParams: {},
      excludeFeatures: [],
      useMarketContext: true,
      featureWindows: [5, 10, 15],
    },
  },
  // ── Custom: Minimal starting point — user builds from scratch ──
  {
    id: 'custom',
    name: 'Custom',
    subtitle: 'Full control',
    color: '#ff9800',
    icon: 'tune',
    values: {
      direction: 'up',
      futureMinutes: 10,
      minPercentChange: 10,
      selectedBaseFeatures: essentialBase,
      selectedEngFeatures: [],
      selectedGraphFeatures: [],
      selectedEmbeddingFeatures: [],
      selectedTransactionFeatures: [],
      selectedMetadataFeatures: [],
      balanceMethod: 'scale_pos_weight',
      scaleWeight: 100,
      useFlagFeatures: false,
      earlyStoppingRounds: 0,
      enableShap: false,
      enableTuning: false,
      tuningIterations: 20,
      cvSplits: 5,
      useTimeseriesSplit: true,
      customParams: {},
      excludeFeatures: [],
      useMarketContext: false,
      featureWindows: [5, 10, 15],
    },
  },
];
