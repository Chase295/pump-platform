export interface CreateModelFormState {
  name: string;
  modelType: 'xgboost' | 'lightgbm';
  direction: 'up' | 'down';
  futureMinutes: number;
  minPercentChange: number;
  selectedBaseFeatures: string[];
  selectedEngFeatures: string[];
  selectedGraphFeatures: string[];
  selectedEmbeddingFeatures: string[];
  selectedTransactionFeatures: string[];
  selectedMetadataFeatures: string[];
  trainStart: string;
  trainEnd: string;
  selectedPhases: number[];
  balanceMethod: 'scale_pos_weight' | 'smote' | 'none';
  scaleWeight: number;
  useFlagFeatures: boolean;
  earlyStoppingRounds: number;
  enableShap: boolean;
  enableTuning: boolean;
  tuningIterations: number;
  description: string;
  cvSplits: number;
  useTimeseriesSplit: boolean;
  activePreset: string | null;
}

export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

export interface CoinPhase {
  id: number;
  name: string;
  interval_seconds: number;
  max_age_minutes: number;
}

export interface SubmitResult {
  success: boolean;
  message: string;
  jobId?: number;
}
