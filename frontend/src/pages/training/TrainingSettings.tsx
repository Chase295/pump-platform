import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
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
  Tooltip,
  Snackbar,
  Grid,
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
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  RestartAlt as ResetIcon,
  Category as MetadataIcon,
} from '@mui/icons-material';
import { trainingApi } from '../../services/api';
import {
  GRAPH_FEATURES,
  EMBEDDING_FEATURES,
  TRANSACTION_FEATURES,
  METADATA_FEATURES,
} from './createModel/features';

// ── Settings Interface ───────────────────────────────────────
interface Settings {
  auto_retrain_enabled: boolean;
  auto_retrain_schedule: number; // hours (6-168)
  auto_retrain_training_window_hours: number; // 12-168
  auto_retrain_base_model_ids: number[];
  auto_retrain_auto_deploy: boolean;
  drift_detection_enabled: boolean;
  drift_accuracy_threshold: number;
  drift_check_interval_hours: number;
  drift_action: 'log_only' | 'auto_retrain' | 'notify';
  default_model_type: string;
  default_training_window_hours: number;
  default_early_stopping_rounds: number;
  default_enable_shap: boolean;
  default_graph_features: string[];
  default_embedding_features: string[];
  default_transaction_features: string[];
  default_metadata_features: string[];
  metadata_features_enabled: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  auto_retrain_enabled: false,
  auto_retrain_schedule: 24,
  auto_retrain_training_window_hours: 48,
  auto_retrain_base_model_ids: [],
  auto_retrain_auto_deploy: false,
  drift_detection_enabled: false,
  drift_accuracy_threshold: 0.5,
  drift_check_interval_hours: 6,
  drift_action: 'log_only',
  default_model_type: 'xgboost',
  default_training_window_hours: 48,
  default_early_stopping_rounds: 10,
  default_enable_shap: false,
  default_graph_features: GRAPH_FEATURES.map((f) => f.id),
  default_embedding_features: EMBEDDING_FEATURES.map((f) => f.id),
  default_transaction_features: TRANSACTION_FEATURES.map((f) => f.id),
  default_metadata_features: METADATA_FEATURES.map((f) => f.id),
  metadata_features_enabled: true,
};

interface ModelOption {
  id: number;
  name: string;
  status: string;
  model_type?: string;
  features_count?: number;
  accuracy?: number;
}

// ── Migrate legacy schedule strings to hours ─────────────────
function migrateSchedule(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    if (val === 'daily') return 24;
    if (val === 'every_2_days') return 48;
    if (val === 'weekly') return 168;
    const n = Number(val);
    if (!isNaN(n)) return n;
  }
  return 24;
}

// ── Section styling ──────────────────────────────────────────
const sectionSx = {
  p: 3,
  mb: 3,
  bgcolor: 'rgba(0, 212, 255, 0.03)',
  border: '1px solid rgba(0, 212, 255, 0.15)',
  borderRadius: 2,
};

// ── Value Badge (monospace value box) ────────────────────────
const ValueBadge: React.FC<{ value: string; color?: string }> = ({ value, color = '#ff9800' }) => (
  <Box
    sx={{
      px: 1.5,
      py: 0.5,
      bgcolor: `${color}18`,
      border: `1px solid ${color}50`,
      borderRadius: 1,
      minWidth: 50,
      textAlign: 'center',
    }}
  >
    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color }}>
      {value}
    </Typography>
  </Box>
);

// ── Collapsible Section ──────────────────────────────────────
interface CollapsibleSectionProps {
  icon: React.ReactElement;
  iconColor: string;
  title: string;
  subtitle: string;
  active?: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
  enableSwitch?: boolean;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  icon, iconColor, title, subtitle, active, activeLabel = 'Active', inactiveLabel = 'Inactive',
  enableSwitch, enabled, onToggle, children, defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Box sx={sectionSx}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: `${iconColor}18`,
              border: `1px solid ${iconColor}40`,
              color: iconColor,
            }}
          >
            {icon}
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{title}</Typography>
            <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {active !== undefined && (
            <Chip
              label={active ? activeLabel : inactiveLabel}
              size="small"
              sx={{
                bgcolor: active ? `${iconColor}22` : 'rgba(255,255,255,0.05)',
                color: active ? iconColor : 'text.secondary',
                fontWeight: 600,
              }}
            />
          )}
          {enableSwitch && (
            <Switch
              checked={enabled}
              onChange={(e) => onToggle?.(e.target.checked)}
              size="small"
              sx={{ '& .Mui-checked': { color: iconColor }, '& .Mui-checked+.MuiSwitch-track': { bgcolor: `${iconColor}80` } }}
            />
          )}
          <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
            <Box
              onClick={() => setExpanded(!expanded)}
              sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'text.secondary', '&:hover': { color: 'white' } }}
            >
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </Box>
          </Tooltip>
        </Box>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ mt: 2.5 }}>{children}</Box>
      </Collapse>
    </Box>
  );
};

// ── Feature Source Section ────────────────────────────────────
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
  const [expanded, setExpanded] = useState(false);
  const count = selected.length;
  const total = allFeatures.length;
  const allSelected = count === total;

  return (
    <Box sx={{ p: 2, mb: 1.5, bgcolor: `${color}08`, border: `1px solid ${color}25`, borderRadius: 1.5 }}>
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
    </Box>
  );
};

// ── Schedule Presets ──────────────────────────────────────────
const SCHEDULE_PRESETS = [
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: 'Daily', hours: 24 },
  { label: '2 Days', hours: 48 },
  { label: 'Weekly', hours: 168 },
];

function formatHours(h: number): string {
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  const rem = h % 24;
  if (rem === 0) return `${days}d`;
  return `${days}d ${rem}h`;
}

// ── Drift Action descriptions ────────────────────────────────
const DRIFT_ACTION_DESCS: Record<string, string> = {
  log_only: 'Drift events are logged but no automatic action is taken. Review logs manually.',
  auto_retrain: 'Automatically triggers a retrain job when drift is detected above threshold.',
  notify: 'Sends a notification via n8n webhook when drift is detected.',
};

// ═════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════
const TrainingSettings: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [dirty, setDirty] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false, message: '', severity: 'success',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [settingsResp, modelsResp] = await Promise.all([
        trainingApi.getSettings(),
        trainingApi.listModels({ status: 'READY', limit: 100 }),
      ]);
      const s = settingsResp.data || {};
      // Migrate legacy single base_model_id to array
      let baseModelIds: number[] = s.auto_retrain_base_model_ids ?? [];
      if ((!baseModelIds || !Array.isArray(baseModelIds) || baseModelIds.length === 0) && s.auto_retrain_base_model_id != null) {
        baseModelIds = [s.auto_retrain_base_model_id];
      }
      if (!Array.isArray(baseModelIds)) baseModelIds = [];
      setSettings({
        ...DEFAULT_SETTINGS,
        ...s,
        // Migrate legacy schedule strings
        auto_retrain_schedule: migrateSchedule(s.auto_retrain_schedule ?? DEFAULT_SETTINGS.auto_retrain_schedule),
        auto_retrain_base_model_ids: baseModelIds,
      });
      setModels(
        (modelsResp.data?.models || modelsResp.data || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          status: m.status,
          model_type: m.model_type,
          features_count: m.features_count ?? m.feature_count ?? (Array.isArray(m.features) ? m.features.length : undefined),
          accuracy: m.accuracy ?? m.training_accuracy,
        }))
      );
      setDirty(false);
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.detail || err.message || 'Failed to load settings', severity: 'error' });
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
      await trainingApi.updateSettings(settings as unknown as Record<string, unknown>);
      setSnackbar({ open: true, message: 'Settings saved successfully!', severity: 'success' });
      setDirty(false);
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.detail || err.message || 'Failed to save settings', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setDirty(true);
    setSnackbar({ open: true, message: 'Reset to defaults — save to apply', severity: 'info' });
  };

  const toggleFeature = (key: keyof Settings, id: string) => {
    const current = settings[key] as string[];
    updateField(key, current.includes(id) ? current.filter((f) => f !== id) : [...current, id]);
  };

  const toggleAllFeatures = (key: keyof Settings, allIds: string[]) => {
    const current = settings[key] as string[];
    updateField(key, current.length === allIds.length ? [] : allIds);
  };

  const selectedModels = models.filter((m) => settings.auto_retrain_base_model_ids.includes(m.id));

  const toggleModel = (id: number) => {
    const current = settings.auto_retrain_base_model_ids;
    updateField('auto_retrain_base_model_ids', current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress sx={{ color: '#00d4ff' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(0, 212, 255, 0.12)',
              border: '1px solid rgba(0, 212, 255, 0.3)',
              color: '#00d4ff',
            }}
          >
            <SettingsIcon />
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h5" sx={{ color: '#00d4ff', fontWeight: 'bold' }}>
                Training Settings
              </Typography>
              {dirty && (
                <Chip
                  label="Unsaved changes"
                  size="small"
                  sx={{ bgcolor: 'rgba(255, 152, 0, 0.15)', color: '#ff9800', fontWeight: 600, fontSize: '0.7rem' }}
                />
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              Configure auto-retrain, drift detection, and training defaults
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<ResetIcon />}
            onClick={handleReset}
            size="small"
            color="warning"
          >
            Reset
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadData}
            size="small"
          >
            Reload
          </Button>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} sx={{ color: '#0f0f23' }} /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving || !dirty}
            size="small"
            sx={{
              bgcolor: '#00d4ff',
              color: '#0f0f23',
              fontWeight: 700,
              '&:hover': { bgcolor: '#00b8d9' },
              '&.Mui-disabled': { bgcolor: 'rgba(0, 212, 255, 0.2)', color: 'rgba(255,255,255,0.3)' },
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Box>
      </Box>

      {/* ── Section 1: Auto-Retrain ─────────────────────────── */}
      <CollapsibleSection
        icon={<AutoModeIcon />}
        iconColor="#4caf50"
        title="Auto-Retrain"
        subtitle="Automatically retrain models on a schedule"
        active={settings.auto_retrain_enabled}
        enableSwitch
        enabled={settings.auto_retrain_enabled}
        onToggle={(v) => updateField('auto_retrain_enabled', v)}
      >
        {settings.auto_retrain_enabled && (
          <Box>
            {/* Schedule Presets */}
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>Schedule</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
              {SCHEDULE_PRESETS.map((p) => (
                <Box
                  key={p.hours}
                  onClick={() => updateField('auto_retrain_schedule', p.hours)}
                  sx={{
                    px: 2,
                    py: 0.75,
                    borderRadius: 1,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    border: settings.auto_retrain_schedule === p.hours
                      ? '1px solid #00d4ff'
                      : '1px solid rgba(255,255,255,0.12)',
                    bgcolor: settings.auto_retrain_schedule === p.hours
                      ? 'rgba(0, 212, 255, 0.15)'
                      : 'rgba(255,255,255,0.03)',
                    color: settings.auto_retrain_schedule === p.hours ? '#00d4ff' : 'text.secondary',
                    transition: 'all 0.15s',
                    '&:hover': { borderColor: '#00d4ff40', bgcolor: 'rgba(0, 212, 255, 0.06)' },
                  }}
                >
                  {p.label}
                </Box>
              ))}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Slider
                value={settings.auto_retrain_schedule}
                onChange={(_, v) => updateField('auto_retrain_schedule', v as number)}
                min={6}
                max={168}
                step={6}
                valueLabelDisplay="auto"
                valueLabelFormat={formatHours}
                sx={{ flex: 1, maxWidth: 400, color: '#4caf50' }}
              />
              <ValueBadge value={formatHours(settings.auto_retrain_schedule)} color="#4caf50" />
            </Box>

            {/* Training Window */}
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Training Data Window</Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              How much historical data to use when retraining
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Slider
                value={settings.auto_retrain_training_window_hours}
                onChange={(_, v) => updateField('auto_retrain_training_window_hours', v as number)}
                min={12}
                max={168}
                step={6}
                marks={[
                  { value: 12, label: '12h' },
                  { value: 48, label: '2d' },
                  { value: 96, label: '4d' },
                  { value: 168, label: '7d' },
                ]}
                valueLabelDisplay="auto"
                valueLabelFormat={formatHours}
                sx={{ flex: 1, maxWidth: 400, color: '#4caf50' }}
              />
              <ValueBadge value={formatHours(settings.auto_retrain_training_window_hours)} color="#4caf50" />
            </Box>

            {/* Base Models */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Select Base Models — {settings.auto_retrain_base_model_ids.length} selected
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Chip
                  label="Select All"
                  size="small"
                  variant="outlined"
                  onClick={() => updateField('auto_retrain_base_model_ids', models.map((m) => m.id))}
                  sx={{ borderColor: 'rgba(76, 175, 80, 0.5)', fontSize: '0.75rem' }}
                />
                <Chip
                  label="None"
                  size="small"
                  variant="outlined"
                  onClick={() => updateField('auto_retrain_base_model_ids', [])}
                  sx={{ borderColor: 'rgba(255,255,255,0.2)', fontSize: '0.75rem' }}
                />
              </Box>
            </Box>
            <Box
              sx={{
                maxHeight: 200,
                overflow: 'auto',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 1.5,
                mb: 1.5,
              }}
            >
              {models.map((m) => {
                const isSelected = settings.auto_retrain_base_model_ids.includes(m.id);
                return (
                  <Box
                    key={m.id}
                    onClick={() => toggleModel(m.id)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 0.75,
                      cursor: 'pointer',
                      bgcolor: isSelected ? 'rgba(0, 212, 255, 0.08)' : 'transparent',
                      '&:hover': { bgcolor: isSelected ? 'rgba(0, 212, 255, 0.12)' : 'rgba(0, 212, 255, 0.05)' },
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      size="small"
                      sx={{ p: 0.5, '& .MuiSvgIcon-root': { fontSize: 18 } }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: isSelected ? 600 : 400, flex: 1 }}>
                      #{m.id} — {m.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      {m.model_type || ''}
                    </Typography>
                  </Box>
                );
              })}
              {models.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                  No models available
                </Typography>
              )}
            </Box>

            {/* Selected Model Chips */}
            {selectedModels.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
                {selectedModels.map((m) => (
                  <Chip
                    key={m.id}
                    label={`#${m.id} ${m.name}`}
                    size="small"
                    onDelete={() => toggleModel(m.id)}
                    sx={{
                      bgcolor: 'rgba(76, 175, 80, 0.15)',
                      color: '#4caf50',
                      '& .MuiChip-deleteIcon': { color: '#4caf50', '&:hover': { color: '#66bb6a' } },
                    }}
                  />
                ))}
              </Box>
            )}

            {/* Info Preview for all selected models */}
            {selectedModels.length > 0 && (
              <Box
                sx={{
                  mb: 3,
                  bgcolor: 'rgba(76, 175, 80, 0.06)',
                  border: '1px solid rgba(76, 175, 80, 0.25)',
                  borderRadius: 1.5,
                  overflow: 'hidden',
                }}
              >
                {selectedModels.map((m, idx) => (
                  <Grid
                    container
                    spacing={1.5}
                    key={m.id}
                    sx={{
                      p: 1.5,
                      borderBottom: idx < selectedModels.length - 1 ? '1px solid rgba(76, 175, 80, 0.15)' : undefined,
                    }}
                  >
                    <Grid size={{ xs: 3 }}>
                      <Typography variant="caption" color="text.secondary">Model</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                        #{m.id}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 3 }}>
                      <Typography variant="caption" color="text.secondary">Type</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                        {m.model_type || '—'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 3 }}>
                      <Typography variant="caption" color="text.secondary">Features</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                        {m.features_count ?? '—'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 3 }}>
                      <Typography variant="caption" color="text.secondary">Accuracy</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', color: '#4caf50' }}>
                        {m.accuracy != null ? `${(m.accuracy * 100).toFixed(1)}%` : '—'}
                      </Typography>
                    </Grid>
                  </Grid>
                ))}
              </Box>
            )}

            {/* Auto-Deploy */}
            <Box
              sx={{
                p: 2,
                bgcolor: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 1.5,
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.auto_retrain_auto_deploy}
                    onChange={(e) => updateField('auto_retrain_auto_deploy', e.target.checked)}
                    sx={{ '& .Mui-checked': { color: '#4caf50' }, '& .Mui-checked+.MuiSwitch-track': { bgcolor: 'rgba(76,175,80,0.5)' } }}
                  />
                }
                label={<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Auto-deploy if new model is better</Typography>}
              />
              <Typography variant="caption" color="text.secondary" display="block" sx={{ pl: 6 }}>
                Automatically replaces the active model if any retrained version shows higher accuracy.
              </Typography>
            </Box>
          </Box>
        )}
      </CollapsibleSection>

      {/* ── Section 2: Drift Detection ──────────────────────── */}
      <CollapsibleSection
        icon={<DriftIcon />}
        iconColor="#ff9800"
        title="Drift Detection"
        subtitle="Monitor active model accuracy over time"
        active={settings.drift_detection_enabled}
        enableSwitch
        enabled={settings.drift_detection_enabled}
        onToggle={(v) => updateField('drift_detection_enabled', v)}
      >
        {settings.drift_detection_enabled && (
          <Box>
            {/* Accuracy Threshold */}
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Accuracy Threshold</Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Drift warning triggers when model accuracy drops below this value
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
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
                sx={{ flex: 1, maxWidth: 400, color: '#ff9800' }}
              />
              <ValueBadge value={`${(settings.drift_accuracy_threshold * 100).toFixed(0)}%`} />
            </Box>

            {/* Check Interval */}
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Check Interval</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
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
                sx={{ flex: 1, maxWidth: 400, color: '#ff9800' }}
              />
              <ValueBadge value={`${settings.drift_check_interval_hours}h`} />
            </Box>

            {/* Drift Action */}
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Drift Action</Typography>
            <Select
              value={settings.drift_action}
              onChange={(e) => updateField('drift_action', e.target.value as Settings['drift_action'])}
              size="small"
              sx={{ minWidth: 200, mb: 1 }}
            >
              <MenuItem value="log_only">Log Only</MenuItem>
              <MenuItem value="auto_retrain">Auto-Retrain</MenuItem>
              <MenuItem value="notify">Notify (n8n)</MenuItem>
            </Select>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              {DRIFT_ACTION_DESCS[settings.drift_action]}
            </Typography>
          </Box>
        )}
      </CollapsibleSection>

      {/* ── Section 3: Training Defaults ────────────────────── */}
      <CollapsibleSection
        icon={<DefaultsIcon />}
        iconColor="#00d4ff"
        title="Training Defaults"
        subtitle="Default values for new model creation"
      >
        {/* Grid: Model Type + Training Window */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Default Model Type</Typography>
            <Select
              value={settings.default_model_type}
              onChange={(e) => updateField('default_model_type', e.target.value)}
              size="small"
              fullWidth
            >
              <MenuItem value="xgboost">XGBoost</MenuItem>
              <MenuItem value="lightgbm">LightGBM</MenuItem>
            </Select>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Default Training Window</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Slider
                value={settings.default_training_window_hours}
                onChange={(_, v) => updateField('default_training_window_hours', v as number)}
                min={12}
                max={168}
                step={6}
                valueLabelDisplay="auto"
                valueLabelFormat={formatHours}
                sx={{ flex: 1, color: '#00d4ff' }}
              />
              <ValueBadge value={formatHours(settings.default_training_window_hours)} color="#00d4ff" />
            </Box>
          </Grid>
        </Grid>

        {/* Early Stopping */}
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Early Stopping Rounds</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
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
            sx={{ flex: 1, maxWidth: 400, color: '#00d4ff' }}
          />
          <ValueBadge
            value={settings.default_early_stopping_rounds === 0 ? 'Off' : `${settings.default_early_stopping_rounds}`}
            color="#00d4ff"
          />
        </Box>

        {/* SHAP */}
        <Box
          sx={{
            p: 1.5,
            mb: 3,
            bgcolor: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 1.5,
          }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={settings.default_enable_shap}
                onChange={(e) => updateField('default_enable_shap', e.target.checked)}
                sx={{ '& .Mui-checked': { color: '#00d4ff' }, '& .Mui-checked+.MuiSwitch-track': { bgcolor: 'rgba(0,212,255,0.5)' } }}
              />
            }
            label={<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Enable SHAP by default</Typography>}
          />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ pl: 6 }}>
            SHAP values provide feature importance explanations but increase training time.
          </Typography>
        </Box>

        {/* Feature Sources */}
        <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 700 }}>Default Feature Sources</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Pre-selection of extra source features for new models. Individually selectable.
        </Typography>

        <FeatureSourceSection
          label="Graph Features (Neo4j)"
          subtitle="Creator history, wallet clusters, similar tokens"
          icon={<GraphIcon />}
          color="#00d4ff"
          allFeatures={GRAPH_FEATURES}
          selected={settings.default_graph_features}
          onToggle={(id) => toggleFeature('default_graph_features', id)}
          onToggleAll={() => toggleAllFeatures('default_graph_features', GRAPH_FEATURES.map((f) => f.id))}
        />
        <FeatureSourceSection
          label="Embedding Features (pgvector)"
          subtitle="Pattern similarity to pumps/rugs"
          icon={<EmbeddingIcon />}
          color="#9c27b0"
          allFeatures={EMBEDDING_FEATURES}
          selected={settings.default_embedding_features}
          onToggle={(id) => toggleFeature('default_embedding_features', id)}
          onToggleAll={() => toggleAllFeatures('default_embedding_features', EMBEDDING_FEATURES.map((f) => f.id))}
        />
        <FeatureSourceSection
          label="Transaction Features"
          subtitle="Wallet concentration, trade bursts, whale activity"
          icon={<TransactionIcon />}
          color="#00bcd4"
          allFeatures={TRANSACTION_FEATURES}
          selected={settings.default_transaction_features}
          onToggle={(id) => toggleFeature('default_transaction_features', id)}
          onToggleAll={() => toggleAllFeatures('default_transaction_features', TRANSACTION_FEATURES.map((f) => f.id))}
        />

        {/* Metadata Features (NEW) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={settings.metadata_features_enabled}
                onChange={(e) => updateField('metadata_features_enabled', e.target.checked)}
                size="small"
                sx={{ '& .Mui-checked': { color: '#e91e63' }, '& .Mui-checked+.MuiSwitch-track': { bgcolor: 'rgba(233,30,99,0.5)' } }}
              />
            }
            label={
              <Typography variant="caption" sx={{ fontWeight: 600, color: settings.metadata_features_enabled ? '#e91e63' : 'text.secondary' }}>
                Metadata Features Master Toggle
              </Typography>
            }
          />
        </Box>
        {settings.metadata_features_enabled && (
          <FeatureSourceSection
            label="Metadata Features"
            subtitle="Token metadata, social signals, risk indicators"
            icon={<MetadataIcon />}
            color="#e91e63"
            allFeatures={METADATA_FEATURES}
            selected={settings.default_metadata_features}
            onToggle={(id) => toggleFeature('default_metadata_features', id)}
            onToggleAll={() => toggleAllFeatures('default_metadata_features', METADATA_FEATURES.map((f) => f.id))}
          />
        )}
      </CollapsibleSection>

      {/* ── Snackbar ────────────────────────────────────────── */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TrainingSettings;
