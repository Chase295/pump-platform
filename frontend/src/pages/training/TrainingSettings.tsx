import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  FormControlLabel,
  Slider,
  Select,
  MenuItem,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Checkbox,
  Collapse,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  AutoMode as AutoModeIcon,
  TrendingDown as DriftIcon,
  Tune as DefaultsIcon,
  Save as SaveIcon,
  Hub as GraphIcon,
  Fingerprint as EmbeddingIcon,
  Receipt as TransactionIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { trainingApi } from '../../services/api';
import {
  GRAPH_FEATURES,
  EMBEDDING_FEATURES,
  TRANSACTION_FEATURES,
} from './createModel/features';

interface Settings {
  auto_retrain_enabled: boolean;
  auto_retrain_schedule: string;
  auto_retrain_base_model_id: number | null;
  auto_retrain_auto_deploy: boolean;
  drift_detection_enabled: boolean;
  drift_accuracy_threshold: number;
  drift_check_interval_hours: number;
  default_model_type: string;
  default_early_stopping_rounds: number;
  default_enable_shap: boolean;
  default_graph_features: string[];
  default_embedding_features: string[];
  default_transaction_features: string[];
}

const DEFAULT_SETTINGS: Settings = {
  auto_retrain_enabled: false,
  auto_retrain_schedule: 'daily',
  auto_retrain_base_model_id: null,
  auto_retrain_auto_deploy: false,
  drift_detection_enabled: false,
  drift_accuracy_threshold: 0.5,
  drift_check_interval_hours: 6,
  default_model_type: 'xgboost',
  default_early_stopping_rounds: 10,
  default_enable_shap: false,
  default_graph_features: GRAPH_FEATURES.map((f) => f.id),
  default_embedding_features: EMBEDDING_FEATURES.map((f) => f.id),
  default_transaction_features: TRANSACTION_FEATURES.map((f) => f.id),
};

interface ModelOption {
  id: number;
  name: string;
  status: string;
}

// ── Feature Source Section with expandable feature list ─────
interface FeatureSourceSectionProps {
  label: string;
  subtitle: string;
  icon: React.ReactElement;
  color: string;
  allFeatures: { id: string; name: string; desc: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}

const FeatureSourceSection: React.FC<FeatureSourceSectionProps> = ({
  label, subtitle, icon, color, allFeatures, selected, onToggle, onToggleAll,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const count = selected.length;
  const total = allFeatures.length;
  const allSelected = count === total;

  return (
    <Paper sx={{ p: 2, mb: 1.5, bgcolor: `${color}08`, border: `1px solid ${color}25` }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ color }}>{icon}</Box>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{label}</Typography>
            <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={`${count}/${total}`}
            size="small"
            variant={count > 0 ? 'filled' : 'outlined'}
            onClick={() => setExpanded(!expanded)}
            sx={{
              bgcolor: allSelected ? `${color}33` : count > 0 ? 'rgba(255,255,255,0.08)' : 'transparent',
              borderColor: count > 0 ? `${color}80` : undefined,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          />
          <Tooltip title={allSelected ? 'Deselect all' : 'Select all'}>
            <Chip
              label={allSelected ? 'None' : 'All'}
              size="small"
              variant="outlined"
              onClick={onToggleAll}
              onDelete={onToggleAll}
              deleteIcon={allSelected ? <CheckIcon sx={{ fontSize: 16 }} /> : undefined}
              sx={{ borderColor: `${color}60`, '& .MuiChip-deleteIcon': { color } }}
            />
          </Tooltip>
        </Box>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ mt: 1.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {allFeatures.map((f) => (
            <Tooltip key={f.id} title={f.desc}>
              <Chip
                label={f.name}
                size="small"
                icon={<Checkbox checked={selected.includes(f.id)} sx={{ p: 0, '& .MuiSvgIcon-root': { fontSize: 16 } }} />}
                onClick={() => onToggle(f.id)}
                variant={selected.includes(f.id) ? 'filled' : 'outlined'}
                sx={{ bgcolor: selected.includes(f.id) ? `${color}25` : 'transparent' }}
              />
            </Tooltip>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
};

const TrainingSettings: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [settingsResp, modelsResp] = await Promise.all([
        trainingApi.getSettings(),
        trainingApi.listModels({ status: 'READY', limit: 100 }),
      ]);
      const s = settingsResp.data || {};
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setModels(
        (modelsResp.data?.models || modelsResp.data || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          status: m.status,
        }))
      );
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const updateField = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await trainingApi.updateSettings(settings as unknown as Record<string, unknown>);
      setSuccess('Settings saved successfully!');
      setDirty(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ color: '#00d4ff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon sx={{ fontSize: 36 }} /> Training Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure auto-retrain, drift detection, and feature defaults
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadData} size="small">
            Reload
          </Button>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving || !dirty}
            sx={{ bgcolor: '#00d4ff' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Section 1: Auto-Retrain */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AutoModeIcon sx={{ color: '#4caf50' }} />
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Auto-Retrain</Typography>
          <Chip label={settings.auto_retrain_enabled ? 'Active' : 'Inactive'} size="small" color={settings.auto_retrain_enabled ? 'success' : 'default'} />
        </Box>

        <FormControlLabel
          control={<Switch checked={settings.auto_retrain_enabled} onChange={(e) => updateField('auto_retrain_enabled', e.target.checked)} />}
          label="Enable Auto-Retrain"
        />

        {settings.auto_retrain_enabled && (
          <Box sx={{ mt: 2, pl: 2 }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Schedule</Typography>
              <Select
                value={settings.auto_retrain_schedule}
                onChange={(e) => updateField('auto_retrain_schedule', e.target.value)}
                size="small"
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="daily">Daily</MenuItem>
                <MenuItem value="every_2_days">Every 2 Days</MenuItem>
                <MenuItem value="weekly">Weekly</MenuItem>
              </Select>
            </Box>

            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Base Model</Typography>
              <Select
                value={settings.auto_retrain_base_model_id || ''}
                onChange={(e) => updateField('auto_retrain_base_model_id', e.target.value ? Number(e.target.value) : null)}
                size="small"
                sx={{ minWidth: 300 }}
                displayEmpty
              >
                <MenuItem value=""><em>Select a model...</em></MenuItem>
                {models.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    #{m.id} - {m.name}
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                The new model will be trained with the same configuration but on recent data.
              </Typography>
            </Box>

            <FormControlLabel
              control={<Switch checked={settings.auto_retrain_auto_deploy} onChange={(e) => updateField('auto_retrain_auto_deploy', e.target.checked)} />}
              label="Auto-deploy if new model is better"
            />
          </Box>
        )}
      </Paper>

      {/* Section 2: Drift Detection */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <DriftIcon sx={{ color: '#ff9800' }} />
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Drift Detection</Typography>
          <Chip label={settings.drift_detection_enabled ? 'Active' : 'Inactive'} size="small" color={settings.drift_detection_enabled ? 'warning' : 'default'} />
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Periodically checks if active models still perform well by monitoring their alert accuracy.
        </Typography>

        <FormControlLabel
          control={<Switch checked={settings.drift_detection_enabled} onChange={(e) => updateField('drift_detection_enabled', e.target.checked)} />}
          label="Enable Drift Detection"
        />

        {settings.drift_detection_enabled && (
          <Box sx={{ mt: 2, pl: 2 }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Accuracy Threshold: {(settings.drift_accuracy_threshold * 100).toFixed(0)}%
              </Typography>
              <Slider
                value={settings.drift_accuracy_threshold}
                onChange={(_, v) => updateField('drift_accuracy_threshold', v as number)}
                min={0.3}
                max={0.8}
                step={0.05}
                marks={[
                  { value: 0.3, label: '30%' },
                  { value: 0.5, label: '50%' },
                  { value: 0.8, label: '80%' },
                ]}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${(v * 100).toFixed(0)}%`}
                sx={{ maxWidth: 400 }}
              />
              <Typography variant="caption" color="text.secondary" display="block">
                If model accuracy drops below this threshold, a drift warning is logged.
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Check Interval: {settings.drift_check_interval_hours}h
              </Typography>
              <Slider
                value={settings.drift_check_interval_hours}
                onChange={(_, v) => updateField('drift_check_interval_hours', v as number)}
                min={1}
                max={24}
                step={1}
                marks={[
                  { value: 1, label: '1h' },
                  { value: 6, label: '6h' },
                  { value: 12, label: '12h' },
                  { value: 24, label: '24h' },
                ]}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}h`}
                sx={{ maxWidth: 400 }}
              />
            </Box>
          </Box>
        )}
      </Paper>

      {/* Section 3: Feature & Training Defaults */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <DefaultsIcon sx={{ color: '#00d4ff' }} />
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Training Defaults</Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Default values for new model creation. Can be overridden in the Create Wizard.
        </Typography>

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Default Model Type</Typography>
          <Select
            value={settings.default_model_type}
            onChange={(e) => updateField('default_model_type', e.target.value)}
            size="small"
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="xgboost">XGBoost</MenuItem>
            <MenuItem value="lightgbm">LightGBM</MenuItem>
          </Select>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Default Early Stopping: {settings.default_early_stopping_rounds} rounds
          </Typography>
          <Slider
            value={settings.default_early_stopping_rounds}
            onChange={(_, v) => updateField('default_early_stopping_rounds', v as number)}
            min={0}
            max={50}
            step={5}
            marks={[
              { value: 0, label: 'Off' },
              { value: 10, label: '10' },
              { value: 25, label: '25' },
              { value: 50, label: '50' },
            ]}
            valueLabelDisplay="auto"
            sx={{ maxWidth: 400 }}
          />
        </Box>

        <FormControlLabel
          control={<Switch checked={settings.default_enable_shap} onChange={(e) => updateField('default_enable_shap', e.target.checked)} />}
          label="Enable SHAP by default"
        />

        <Divider sx={{ my: 3 }} />

        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>Default Feature Sources</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Vorauswahl der Extra Source Features fuer neue Modelle. Einzeln auswaehlbar.
        </Typography>

        <FeatureSourceSection
          label="Graph Features (Neo4j)"
          subtitle="Creator history, wallet clusters, similar tokens"
          icon={<GraphIcon />}
          color="#00d4ff"
          allFeatures={GRAPH_FEATURES}
          selected={settings.default_graph_features}
          onToggle={(id) => {
            const current = settings.default_graph_features;
            updateField('default_graph_features', current.includes(id) ? current.filter((f) => f !== id) : [...current, id]);
          }}
          onToggleAll={() => {
            const allIds = GRAPH_FEATURES.map((f) => f.id);
            updateField('default_graph_features', settings.default_graph_features.length === allIds.length ? [] : allIds);
          }}
        />
        <FeatureSourceSection
          label="Embedding Features (pgvector)"
          subtitle="Pattern similarity to pumps/rugs"
          icon={<EmbeddingIcon />}
          color="#9c27b0"
          allFeatures={EMBEDDING_FEATURES}
          selected={settings.default_embedding_features}
          onToggle={(id) => {
            const current = settings.default_embedding_features;
            updateField('default_embedding_features', current.includes(id) ? current.filter((f) => f !== id) : [...current, id]);
          }}
          onToggleAll={() => {
            const allIds = EMBEDDING_FEATURES.map((f) => f.id);
            updateField('default_embedding_features', settings.default_embedding_features.length === allIds.length ? [] : allIds);
          }}
        />
        <FeatureSourceSection
          label="Transaction Features"
          subtitle="Wallet concentration, trade bursts, whale activity"
          icon={<TransactionIcon />}
          color="#00bcd4"
          allFeatures={TRANSACTION_FEATURES}
          selected={settings.default_transaction_features}
          onToggle={(id) => {
            const current = settings.default_transaction_features;
            updateField('default_transaction_features', current.includes(id) ? current.filter((f) => f !== id) : [...current, id]);
          }}
          onToggleAll={() => {
            const allIds = TRANSACTION_FEATURES.map((f) => f.id);
            updateField('default_transaction_features', settings.default_transaction_features.length === allIds.length ? [] : allIds);
          }}
        />
      </Paper>
    </Box>
  );
};

export default TrainingSettings;
