import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { trainingApi } from '../../../services/api';
import type { CreateModelFormState, ValidationResult, CoinPhase, SubmitResult } from './types';
import { PRESETS } from './presets';

interface DataAvailability {
  min_timestamp: string | null;
  max_timestamp: string | null;
}

const DEFAULT_PHASES: CoinPhase[] = [
  { id: 1, name: 'Newborn', interval_seconds: 3, max_age_minutes: 2 },
  { id: 2, name: 'Baby', interval_seconds: 5, max_age_minutes: 8 },
  { id: 3, name: 'Toddler', interval_seconds: 10, max_age_minutes: 20 },
  { id: 4, name: 'Teen', interval_seconds: 30, max_age_minutes: 90 },
  { id: 5, name: 'Young', interval_seconds: 60, max_age_minutes: 240 },
  { id: 6, name: 'Adult', interval_seconds: 120, max_age_minutes: 1080 },
  { id: 7, name: 'Senior', interval_seconds: 300, max_age_minutes: 8640 },
  { id: 8, name: 'Veteran', interval_seconds: 600, max_age_minutes: 33120 },
];

function getDefaultTimeRange() {
  const now = new Date();
  const end = new Date(now.getTime() - 60 * 60 * 1000);
  const start = new Date(now.getTime() - 13 * 60 * 60 * 1000);
  return {
    trainStart: start.toISOString().slice(0, 16),
    trainEnd: end.toISOString().slice(0, 16),
  };
}

export function useCreateModelForm() {
  const timeRange = useRef(getDefaultTimeRange());

  // ── Form state ──────────────────────────────────────────────
  const [form, setForm] = useState<CreateModelFormState>({
    name: '',
    modelType: 'xgboost',
    direction: 'up',
    futureMinutes: 10,
    minPercentChange: 10,
    selectedBaseFeatures: ['price_close', 'volume_sol', 'buy_pressure_ratio'],
    selectedEngFeatures: [],
    selectedGraphFeatures: [],
    selectedEmbeddingFeatures: [],
    selectedTransactionFeatures: [],
    selectedMetadataFeatures: [],
    trainStart: timeRange.current.trainStart,
    trainEnd: timeRange.current.trainEnd,
    selectedPhases: [],
    balanceMethod: 'scale_pos_weight',
    scaleWeight: 100,
    useFlagFeatures: true,
    earlyStoppingRounds: 10,
    enableShap: false,
    enableTuning: false,
    tuningIterations: 20,
    description: '',
    cvSplits: 5,
    useTimeseriesSplit: true,
    customParams: {},
    excludeFeatures: [],
    useMarketContext: false,
    featureWindows: [5, 10, 15],
    activePreset: null,
  });

  const [availablePhases, setAvailablePhases] = useState<CoinPhase[]>([]);
  const [phasesLoading, setPhasesLoading] = useState(true);
  const [dataAvailability, setDataAvailability] = useState<DataAvailability | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  // ── Load phases + data availability ─────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setPhasesLoading(true);
        const [phasesResp, dataResp] = await Promise.allSettled([
          trainingApi.getPhases(),
          trainingApi.getDataAvailability(),
        ]);

        if (phasesResp.status === 'fulfilled') {
          const phases: CoinPhase[] = phasesResp.value.data?.phases || phasesResp.value.data || [];
          const relevant = phases.filter((p) => p.id < 10);
          setAvailablePhases(relevant);
          setForm((prev) => ({ ...prev, selectedPhases: relevant.map((p) => p.id) }));
        } else {
          setAvailablePhases(DEFAULT_PHASES);
          setForm((prev) => ({ ...prev, selectedPhases: DEFAULT_PHASES.map((p) => p.id) }));
        }

        if (dataResp.status === 'fulfilled' && dataResp.value.data) {
          setDataAvailability(dataResp.value.data);
        }
      } catch {
        setAvailablePhases(DEFAULT_PHASES);
        setForm((prev) => ({ ...prev, selectedPhases: DEFAULT_PHASES.map((p) => p.id) }));
      } finally {
        setPhasesLoading(false);
      }
    })();
  }, []);

  // ── Field updater ───────────────────────────────────────────
  const updateField = useCallback(<K extends keyof CreateModelFormState>(key: K, value: CreateModelFormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-switch to Custom if a field was changed manually while a preset is active
      if (prev.activePreset && prev.activePreset !== 'custom' && key !== 'activePreset' && key !== 'name') {
        next.activePreset = 'custom';
      }
      return next;
    });
  }, []);

  // ── Apply preset ────────────────────────────────────────────
  const applyPreset = useCallback((presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      ...preset.values,
      modelType: prev.modelType,
      name: presetId !== 'custom' ? `${presetId}_${new Date().toISOString().slice(0, 10)}` : prev.name,
      trainStart: prev.trainStart,
      trainEnd: prev.trainEnd,
      selectedPhases: prev.selectedPhases,
      activePreset: presetId,
    }));
    setResult(null);
  }, []);

  // ── Toggle helpers ──────────────────────────────────────────
  const toggleBaseFeature = useCallback((id: string) => {
    setForm((prev) => {
      const features = prev.selectedBaseFeatures.includes(id)
        ? prev.selectedBaseFeatures.filter((f) => f !== id)
        : [...prev.selectedBaseFeatures, id];
      return { ...prev, selectedBaseFeatures: features, activePreset: prev.activePreset !== 'custom' ? 'custom' : prev.activePreset };
    });
  }, []);

  const toggleEngFeature = useCallback((id: string) => {
    setForm((prev) => {
      const features = prev.selectedEngFeatures.includes(id)
        ? prev.selectedEngFeatures.filter((f) => f !== id)
        : [...prev.selectedEngFeatures, id];
      return { ...prev, selectedEngFeatures: features, activePreset: prev.activePreset !== 'custom' ? 'custom' : prev.activePreset };
    });
  }, []);

  const toggleEngCategory = useCallback((categoryFeatureIds: string[]) => {
    setForm((prev) => {
      const allSelected = categoryFeatureIds.every((id) => prev.selectedEngFeatures.includes(id));
      const features = allSelected
        ? prev.selectedEngFeatures.filter((f) => !categoryFeatureIds.includes(f))
        : [...new Set([...prev.selectedEngFeatures, ...categoryFeatureIds])];
      return { ...prev, selectedEngFeatures: features, activePreset: prev.activePreset !== 'custom' ? 'custom' : prev.activePreset };
    });
  }, []);

  const toggleBaseCategoryFeatures = useCallback((categoryFeatureIds: string[]) => {
    setForm((prev) => {
      const allSelected = categoryFeatureIds.every((id) => prev.selectedBaseFeatures.includes(id));
      const features = allSelected
        ? prev.selectedBaseFeatures.filter((f) => !categoryFeatureIds.includes(f))
        : [...new Set([...prev.selectedBaseFeatures, ...categoryFeatureIds])];
      return { ...prev, selectedBaseFeatures: features, activePreset: prev.activePreset !== 'custom' ? 'custom' : prev.activePreset };
    });
  }, []);

  const toggleExtraFeature = useCallback((source: 'selectedGraphFeatures' | 'selectedEmbeddingFeatures' | 'selectedTransactionFeatures' | 'selectedMetadataFeatures', id: string) => {
    setForm((prev) => {
      const features = prev[source].includes(id)
        ? prev[source].filter((f) => f !== id)
        : [...prev[source], id];
      return { ...prev, [source]: features, activePreset: prev.activePreset !== 'custom' ? 'custom' : prev.activePreset };
    });
  }, []);

  const toggleAllExtraFeatures = useCallback((source: 'selectedGraphFeatures' | 'selectedEmbeddingFeatures' | 'selectedTransactionFeatures' | 'selectedMetadataFeatures', allIds: string[]) => {
    setForm((prev) => {
      const allSelected = allIds.every((id) => prev[source].includes(id));
      const features = allSelected ? [] : [...allIds];
      return { ...prev, [source]: features, activePreset: prev.activePreset !== 'custom' ? 'custom' : prev.activePreset };
    });
  }, []);

  const togglePhase = useCallback((phaseId: number) => {
    setForm((prev) => ({
      ...prev,
      selectedPhases: prev.selectedPhases.includes(phaseId)
        ? prev.selectedPhases.filter((p) => p !== phaseId)
        : [...prev.selectedPhases, phaseId],
    }));
  }, []);

  const setTimeQuickRange = useCallback((hours: number) => {
    const now = new Date();
    const end = new Date(now.getTime() - 60 * 60 * 1000);
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    setForm((prev) => ({
      ...prev,
      trainStart: start.toISOString().slice(0, 16),
      trainEnd: end.toISOString().slice(0, 16),
    }));
  }, []);

  // ── Validation ──────────────────────────────────────────────
  const validation = useMemo<ValidationResult>(() => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (form.name.length < 3) errors.push('Name must be at least 3 characters');
    if (form.selectedBaseFeatures.length < 2) errors.push('Select at least 2 base features');

    const startMs = new Date(form.trainStart).getTime();
    const endMs = new Date(form.trainEnd).getTime();
    if (isNaN(startMs) || isNaN(endMs)) {
      errors.push('Invalid date range');
    } else if (endMs <= startMs) {
      errors.push('End must be after start');
    } else {
      const minutes = (endMs - startMs) / (1000 * 60);
      const hours = minutes / 60;
      if (minutes < 5) errors.push('Training period must be at least 5 minutes');
      else if (hours > 720) errors.push('Training period cannot exceed 30 days (720h)');
      else if (hours < 1) warnings.push('Very short training period (<1h)');
      else if (hours > 72) warnings.push('Very long training period (>72h)');

      // Data availability check
      if (dataAvailability) {
        const dataMin = dataAvailability.min_timestamp ? new Date(dataAvailability.min_timestamp).getTime() : null;
        const dataMax = dataAvailability.max_timestamp ? new Date(dataAvailability.max_timestamp).getTime() : null;
        if (dataMin && startMs < dataMin) {
          warnings.push(`Start is before available data (${new Date(dataMin).toLocaleDateString()})`);
        }
        if (dataMax && endMs > dataMax) {
          warnings.push(`End is after latest data (${new Date(dataMax).toLocaleDateString()})`);
        }
        if (dataMin && dataMax && (endMs < dataMin || startMs > dataMax)) {
          errors.push('Selected time range has no data — adjust dates');
        }
      }
    }

    if (form.selectedEngFeatures.length > 0 && !form.useFlagFeatures) {
      warnings.push('Flag features recommended with engineering features');
    }
    if (form.enableShap) warnings.push('SHAP makes training slower');
    if (form.balanceMethod === 'none') warnings.push('No balancing — expect low F1');

    return { isValid: errors.length === 0, warnings, errors };
  }, [form, dataAvailability]);

  // ── Computed ────────────────────────────────────────────────
  // Count flag features: each windowed eng feature (ending with _5, _10, _15 etc.) gets a _has_data companion
  const flagFeatureCount = useMemo(() => {
    if (!form.useFlagFeatures || form.selectedEngFeatures.length === 0) return 0;
    return form.selectedEngFeatures.filter((f) => /_\d+$/.test(f)).length;
  }, [form.useFlagFeatures, form.selectedEngFeatures]);

  const totalFeatures = useMemo(() => {
    return form.selectedBaseFeatures.length
      + form.selectedEngFeatures.length
      + flagFeatureCount
      + form.selectedGraphFeatures.length
      + form.selectedEmbeddingFeatures.length
      + form.selectedTransactionFeatures.length
      + form.selectedMetadataFeatures.length;
  }, [form.selectedBaseFeatures, form.selectedEngFeatures, flagFeatureCount, form.selectedGraphFeatures, form.selectedEmbeddingFeatures, form.selectedTransactionFeatures, form.selectedMetadataFeatures]);

  const trainingDurationHours = useMemo(() => {
    const ms = new Date(form.trainEnd).getTime() - new Date(form.trainStart).getTime();
    return Math.round(ms / (1000 * 60 * 60));
  }, [form.trainStart, form.trainEnd]);

  // ── Submit ──────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!validation.isValid) return;
    setIsSubmitting(true);
    setResult(null);
    try {
      const allFeatures = [...form.selectedBaseFeatures, ...form.selectedEngFeatures];
      const data: Record<string, unknown> = {
        name: form.name,
        model_type: form.modelType,
        features: allFeatures,
        train_start: new Date(form.trainStart).toISOString(),
        train_end: new Date(form.trainEnd).toISOString(),
        use_time_based_prediction: true,
        future_minutes: form.futureMinutes,
        min_percent_change: form.minPercentChange,
        direction: form.direction,
        use_engineered_features: form.selectedEngFeatures.length > 0,
        use_flag_features: form.useFlagFeatures,
        early_stopping_rounds: form.earlyStoppingRounds,
        compute_shap: form.enableShap,
        description: form.description || undefined,
        cv_splits: form.cvSplits,
        use_timeseries_split: form.useTimeseriesSplit,
        use_graph_features: form.selectedGraphFeatures.length > 0,
        use_embedding_features: form.selectedEmbeddingFeatures.length > 0,
        use_transaction_features: form.selectedTransactionFeatures.length > 0,
        use_metadata_features: form.selectedMetadataFeatures.length > 0,
        graph_feature_names: form.selectedGraphFeatures.length > 0 ? form.selectedGraphFeatures : undefined,
        embedding_feature_names: form.selectedEmbeddingFeatures.length > 0 ? form.selectedEmbeddingFeatures : undefined,
        transaction_feature_names: form.selectedTransactionFeatures.length > 0 ? form.selectedTransactionFeatures : undefined,
        metadata_feature_names: form.selectedMetadataFeatures.length > 0 ? form.selectedMetadataFeatures : undefined,
        use_market_context: form.useMarketContext,
        exclude_features: form.excludeFeatures.length > 0 ? form.excludeFeatures : undefined,
        feature_engineering_windows: form.selectedEngFeatures.length > 0 ? form.featureWindows : undefined,
      };
      // Parse custom params and merge into params dict
      const parsedParams: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(form.customParams)) {
        if (!key.trim() || !val.trim()) continue;
        const trimmed = val.trim();
        if (trimmed === 'true') parsedParams[key.trim()] = true;
        else if (trimmed === 'false') parsedParams[key.trim()] = false;
        else if (!isNaN(Number(trimmed))) parsedParams[key.trim()] = Number(trimmed);
        else parsedParams[key.trim()] = trimmed;
      }
      // Add tuning params if enabled
      if (form.enableTuning) {
        parsedParams._tune_after_training = true;
        parsedParams._tune_iterations = form.tuningIterations;
      }
      if (Object.keys(parsedParams).length > 0) {
        data.params = parsedParams;
      }
      if (form.balanceMethod === 'scale_pos_weight') {
        data.scale_pos_weight = form.scaleWeight;
        data.use_smote = false;
      } else if (form.balanceMethod === 'smote') {
        data.use_smote = true;
      } else {
        // balanceMethod === 'none'
        data.use_smote = false;
      }
      if (form.selectedPhases.length > 0 && form.selectedPhases.length < availablePhases.length) {
        data.phases = form.selectedPhases;
      }

      const resp = await trainingApi.createModel(data);
      const jobId = resp.data?.job_id;

      setResult({
        success: true,
        message: form.enableTuning
          ? `Model "${form.name}" training started! Tuning will run after training.`
          : `Model "${form.name}" training started!`,
        jobId,
      });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      setResult({
        success: false,
        message: `Error: ${error.response?.data?.detail || error.message || 'Unknown error'}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [form, validation.isValid, availablePhases.length]);

  return {
    form,
    updateField,
    applyPreset,
    toggleBaseFeature,
    toggleEngFeature,
    toggleEngCategory,
    toggleBaseCategoryFeatures,
    toggleExtraFeature,
    toggleAllExtraFeatures,
    togglePhase,
    setTimeQuickRange,
    validation,
    totalFeatures,
    flagFeatureCount,
    trainingDurationHours,
    availablePhases,
    phasesLoading,
    dataAvailability,
    isSubmitting,
    result,
    handleSubmit,
    setResult,
  };
}
