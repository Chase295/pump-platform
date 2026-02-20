/**
 * AlertConfig Page
 * Per-model alert configuration: threshold, n8n webhook, send mode, ignore settings, max log entries.
 * Redesigned with modern section boxes, number inputs, chips, and a single Save All button.
 */
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Typography,
  Box,
  Alert,
  Button,
  TextField,
  Switch,
  Chip,
  Collapse,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Save as SaveIcon,
  Notifications as AlertIcon,
  Webhook as WebhookIcon,
  Timer as TimerIcon,
  Storage as LogIcon,
  RemoveCircleOutline as BadIcon,
  TrendingUp as PositiveIcon,
  Warning as AlertCoinIcon,
} from '@mui/icons-material';

import { serverApi } from '../../services/api';
import type { ServerModel } from '../../types/server';

// ── Helpers ──────────────────────────────────────────────────

const formatSeconds = (s: number) => {
  if (s === 0) return 'Off';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)}h`;
};

const formatLogEntries = (n: number) => (n === 0 ? '\u221e' : String(n));

const sendModes = [
  { value: 'all', label: 'All' },
  { value: 'alerts_only', label: 'Alerts Only' },
  { value: 'positive_only', label: 'Positive' },
  { value: 'negative_only', label: 'Negative' },
];

// ── Icon Box ─────────────────────────────────────────────────

const IconBox: React.FC<{ color: string; size?: number; children: React.ReactNode }> = ({
  color,
  size = 40,
  children,
}) => (
  <Box
    sx={{
      width: size,
      height: size,
      borderRadius: 1.5,
      bgcolor: `${color}18`,
      border: `1px solid ${color}40`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    {children}
  </Box>
);

// ── Section Box ──────────────────────────────────────────────

const SectionBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      bgcolor: 'rgba(0, 212, 255, 0.03)',
      border: '1px solid rgba(0, 212, 255, 0.15)',
      borderRadius: 2,
      p: 3,
      mb: 3,
    }}
  >
    {children}
  </Box>
);

// ── Setting Row (Number Input + Badge) ───────────────────────

const SettingRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  desc: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  formatValue: (v: number) => string;
  color: string;
  suffix?: string;
}> = ({ icon, label, desc, value, onChange, min, max, formatValue, color, suffix }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 160 }}>
      {icon}
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {desc}
        </Typography>
      </Box>
    </Box>
    <Box sx={{ flex: 1 }} />
    <TextField
      type="number"
      value={value}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (!isNaN(v) && v >= min && v <= max) onChange(v);
      }}
      size="small"
      inputProps={{ min, max, style: { textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 } }}
      sx={{
        width: 110,
        '& .MuiOutlinedInput-root': {
          '& fieldset': { borderColor: `${color}40` },
          '&:hover fieldset': { borderColor: `${color}80` },
          '&.Mui-focused fieldset': { borderColor: color },
        },
        '& input': { color },
      }}
    />
    <Box
      sx={{
        px: 1.5,
        py: 0.5,
        bgcolor: `${color}18`,
        border: `1px solid ${color}50`,
        borderRadius: 1,
        minWidth: 60,
        textAlign: 'center',
      }}
    >
      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color }}>
        {suffix ? `${formatValue(value)} ${suffix}` : formatValue(value)}
      </Typography>
    </Box>
  </Box>
);

// ── Main Component ───────────────────────────────────────────

const AlertConfig: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const modelId = Number(id);

  // Load model
  const {
    data: modelResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['server', 'model', modelId],
    queryFn: () => serverApi.getModelDetails(modelId),
    enabled: !!modelId,
  });

  const model: ServerModel | undefined = modelResponse?.data;

  // Load ignore settings
  const { data: ignoreResponse } = useQuery({
    queryKey: ['server', 'model-ignore', modelId],
    queryFn: () => serverApi.getIgnoreSettings(modelId),
    enabled: !!modelId,
  });

  const ignoreSettings = ignoreResponse?.data;

  // Load max log entries
  const { data: maxLogResponse } = useQuery({
    queryKey: ['server', 'model-maxlog', modelId],
    queryFn: () => serverApi.getMaxLogEntries(modelId),
    enabled: !!modelId,
  });

  const maxLogSettings = maxLogResponse?.data;

  // Form state — null means "unchanged"
  const [alertThreshold, setAlertThreshold] = useState<number | null>(null);
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState<string | null>(null);
  const [n8nEnabled, setN8nEnabled] = useState<boolean | null>(null);
  const [n8nSendMode, setN8nSendMode] = useState<string[] | null>(null);
  const [ignoreBadSeconds, setIgnoreBadSeconds] = useState<number | null>(null);
  const [ignorePositiveSeconds, setIgnorePositiveSeconds] = useState<number | null>(null);
  const [ignoreAlertSeconds, setIgnoreAlertSeconds] = useState<number | null>(null);
  const [maxLogNegative, setMaxLogNegative] = useState<number | null>(null);
  const [maxLogPositive, setMaxLogPositive] = useState<number | null>(null);
  const [maxLogAlert, setMaxLogAlert] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Derive current values
  const currentThreshold = alertThreshold ?? model?.alert_threshold ?? 0.7;
  const currentWebhookUrl = n8nWebhookUrl ?? model?.n8n_webhook_url ?? '';
  const currentN8nEnabled = n8nEnabled ?? model?.n8n_enabled ?? false;
  const currentSendMode =
    n8nSendMode ??
    (Array.isArray(model?.n8n_send_mode)
      ? model.n8n_send_mode
      : model?.n8n_send_mode
        ? [model.n8n_send_mode]
        : ['all']);
  const currentIgnoreBad = ignoreBadSeconds ?? ignoreSettings?.ignore_bad_seconds ?? model?.ignore_bad_seconds ?? 300;
  const currentIgnorePositive =
    ignorePositiveSeconds ?? ignoreSettings?.ignore_positive_seconds ?? model?.ignore_positive_seconds ?? 300;
  const currentIgnoreAlert =
    ignoreAlertSeconds ?? ignoreSettings?.ignore_alert_seconds ?? model?.ignore_alert_seconds ?? 600;
  const currentMaxLogNegative =
    maxLogNegative ?? maxLogSettings?.max_log_entries_per_coin_negative ?? model?.max_log_entries_per_coin_negative ?? 0;
  const currentMaxLogPositive =
    maxLogPositive ?? maxLogSettings?.max_log_entries_per_coin_positive ?? model?.max_log_entries_per_coin_positive ?? 0;
  const currentMaxLogAlert =
    maxLogAlert ?? maxLogSettings?.max_log_entries_per_coin_alert ?? model?.max_log_entries_per_coin_alert ?? 0;

  const hasChanges =
    alertThreshold !== null ||
    n8nWebhookUrl !== null ||
    n8nEnabled !== null ||
    n8nSendMode !== null ||
    ignoreBadSeconds !== null ||
    ignorePositiveSeconds !== null ||
    ignoreAlertSeconds !== null ||
    maxLogNegative !== null ||
    maxLogPositive !== null ||
    maxLogAlert !== null;

  // Mutations
  const saveAlertMutation = useMutation({
    mutationFn: () =>
      serverApi.updateAlertConfig(modelId, {
        alert_threshold: currentThreshold,
        n8n_webhook_url: currentWebhookUrl || undefined,
        n8n_enabled: currentN8nEnabled,
        n8n_send_mode: currentSendMode,
      }),
  });

  const saveIgnoreMutation = useMutation({
    mutationFn: () =>
      serverApi.updateIgnoreSettings(modelId, {
        ignore_bad_seconds: currentIgnoreBad,
        ignore_positive_seconds: currentIgnorePositive,
        ignore_alert_seconds: currentIgnoreAlert,
      }),
  });

  const saveMaxLogMutation = useMutation({
    mutationFn: () =>
      serverApi.updateMaxLogEntries(modelId, {
        max_log_entries_per_coin_negative: currentMaxLogNegative,
        max_log_entries_per_coin_positive: currentMaxLogPositive,
        max_log_entries_per_coin_alert: currentMaxLogAlert,
      }),
  });

  const isSaving = saveAlertMutation.isPending || saveIgnoreMutation.isPending || saveMaxLogMutation.isPending;

  const handleSaveAll = async () => {
    try {
      await Promise.all([
        saveAlertMutation.mutateAsync(),
        saveIgnoreMutation.mutateAsync(),
        saveMaxLogMutation.mutateAsync(),
      ]);
      queryClient.invalidateQueries({ queryKey: ['server', 'model', modelId] });
      queryClient.invalidateQueries({ queryKey: ['server', 'model-ignore', modelId] });
      queryClient.invalidateQueries({ queryKey: ['server', 'model-maxlog', modelId] });
      // Reset form state
      setAlertThreshold(null);
      setN8nWebhookUrl(null);
      setN8nEnabled(null);
      setN8nSendMode(null);
      setIgnoreBadSeconds(null);
      setIgnorePositiveSeconds(null);
      setIgnoreAlertSeconds(null);
      setMaxLogNegative(null);
      setMaxLogPositive(null);
      setMaxLogAlert(null);
      setSnackbar({ open: true, message: 'All settings saved successfully', severity: 'success' });
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: `Error: ${err.response?.data?.detail || err.message}`,
        severity: 'error',
      });
    }
  };

  const toggleSendMode = (mode: string) => {
    const current = [...currentSendMode];
    if (current.includes(mode)) {
      if (current.length > 1) {
        setN8nSendMode(current.filter((m) => m !== mode));
      }
    } else {
      setN8nSendMode([...current, mode]);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !model) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 3 }}>
          Error loading model: {(error as Error)?.message || 'Model not found'}
        </Alert>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/predictions')}>
          Back to Overview
        </Button>
      </Box>
    );
  }

  const modelName = model.custom_name || model.name;

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 2,
          mb: 4,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconBox color="#ff9800" size={44}>
            <AlertIcon sx={{ color: '#ff9800', fontSize: 24 }} />
          </IconBox>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#00d4ff' }}>
              Alert Configuration
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Model: {modelName} · #{modelId}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {hasChanges && (
            <Chip
              label="Unsaved changes"
              size="small"
              sx={{
                bgcolor: 'rgba(255, 152, 0, 0.15)',
                color: '#ff9800',
                borderColor: '#ff980040',
                border: '1px solid',
                fontWeight: 600,
              }}
            />
          )}
          <Button startIcon={<BackIcon />} onClick={() => navigate('/predictions')} variant="outlined" size="small">
            Back
          </Button>
          <Button
            startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={handleSaveAll}
            disabled={!hasChanges || isSaving}
            variant="contained"
            size="small"
            sx={{
              bgcolor: '#00d4ff',
              '&:hover': { bgcolor: '#00b8d4' },
              '&.Mui-disabled': { bgcolor: 'rgba(0, 212, 255, 0.2)', color: 'rgba(255,255,255,0.3)' },
            }}
          >
            {isSaving ? 'Saving...' : 'Save All'}
          </Button>
        </Box>
      </Box>

      {/* Section 1: Alert Threshold */}
      <SectionBox>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
          <IconBox color="#ff9800">
            <AlertIcon sx={{ color: '#ff9800', fontSize: 20 }} />
          </IconBox>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Alert Threshold
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Predictions above this probability trigger alerts
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 1 }}>
          <Box sx={{ flex: 1 }} />
          <TextField
            type="number"
            value={Math.round(currentThreshold * 100)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!isNaN(v) && v >= 1 && v <= 99) setAlertThreshold(v / 100);
            }}
            size="small"
            inputProps={{ min: 1, max: 99, style: { textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 } }}
            sx={{
              width: 110,
              '& .MuiOutlinedInput-root': {
                '& fieldset': { borderColor: '#ff980040' },
                '&:hover fieldset': { borderColor: '#ff980080' },
                '&.Mui-focused fieldset': { borderColor: '#ff9800' },
              },
              '& input': { color: '#ff9800' },
            }}
          />
          <Box
            sx={{
              px: 1.5,
              py: 0.5,
              bgcolor: '#ff980018',
              border: '1px solid #ff980050',
              borderRadius: 1,
              minWidth: 60,
              textAlign: 'center',
            }}
          >
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#ff9800' }}>
              {(currentThreshold * 100).toFixed(0)}%
            </Typography>
          </Box>
        </Box>
      </SectionBox>

      {/* Section 2: N8N Webhook */}
      <SectionBox>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: currentN8nEnabled ? 2.5 : 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <IconBox color="#4caf50">
              <WebhookIcon sx={{ color: '#4caf50', fontSize: 20 }} />
            </IconBox>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                N8N Webhook
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Send predictions to n8n automation workflows
              </Typography>
            </Box>
          </Box>
          <Switch
            checked={currentN8nEnabled}
            onChange={(e) => setN8nEnabled(e.target.checked)}
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': { color: '#4caf50' },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#4caf5080' },
            }}
          />
        </Box>
        <Collapse in={currentN8nEnabled}>
          <TextField
            fullWidth
            label="Webhook URL"
            value={currentWebhookUrl}
            onChange={(e) => setN8nWebhookUrl(e.target.value)}
            placeholder="https://your-n8n-instance/webhook/..."
            helperText="Leave empty to use global URL"
            size="small"
            sx={{ mb: 2.5 }}
          />
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Send Mode
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {sendModes.map((mode) => {
              const active = currentSendMode.includes(mode.value);
              return (
                <Chip
                  key={mode.value}
                  label={mode.label}
                  onClick={() => toggleSendMode(mode.value)}
                  variant={active ? 'filled' : 'outlined'}
                  sx={{
                    bgcolor: active ? 'rgba(76, 175, 80, 0.15)' : 'transparent',
                    borderColor: active ? '#4caf50' : 'rgba(255,255,255,0.2)',
                    color: active ? '#4caf50' : 'inherit',
                    fontWeight: active ? 600 : 400,
                    '&:hover': {
                      bgcolor: active ? 'rgba(76, 175, 80, 0.25)' : 'rgba(255,255,255,0.05)',
                    },
                  }}
                />
              );
            })}
          </Box>
        </Collapse>
      </SectionBox>

      {/* Section 3: Ignore Cooldowns */}
      <SectionBox>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
          <IconBox color="#00d4ff">
            <TimerIcon sx={{ color: '#00d4ff', fontSize: 20 }} />
          </IconBox>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Ignore Cooldowns
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Duration to ignore a coin after a prediction type
            </Typography>
          </Box>
        </Box>
        <SettingRow
          icon={<BadIcon sx={{ color: '#ef5350', fontSize: 18 }} />}
          label="Bad Coins"
          desc="Negative predictions"
          value={currentIgnoreBad}
          onChange={setIgnoreBadSeconds}
          min={0}
          max={86400}
          formatValue={formatSeconds}
          color="#00d4ff"
          suffix="sec"
        />
        <SettingRow
          icon={<PositiveIcon sx={{ color: '#66bb6a', fontSize: 18 }} />}
          label="Positive Coins"
          desc="Positive predictions"
          value={currentIgnorePositive}
          onChange={setIgnorePositiveSeconds}
          min={0}
          max={86400}
          formatValue={formatSeconds}
          color="#00d4ff"
          suffix="sec"
        />
        <SettingRow
          icon={<AlertCoinIcon sx={{ color: '#ffa726', fontSize: 18 }} />}
          label="Alert Coins"
          desc="Above threshold"
          value={currentIgnoreAlert}
          onChange={setIgnoreAlertSeconds}
          min={0}
          max={86400}
          formatValue={formatSeconds}
          color="#00d4ff"
          suffix="sec"
        />
      </SectionBox>

      {/* Section 4: Log Retention */}
      <SectionBox>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
          <IconBox color="#2196f3">
            <LogIcon sx={{ color: '#2196f3', fontSize: 20 }} />
          </IconBox>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Log Retention
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Maximum prediction log entries per coin per type (0 = unlimited)
            </Typography>
          </Box>
        </Box>
        <SettingRow
          icon={<BadIcon sx={{ color: '#ef5350', fontSize: 18 }} />}
          label="Negative Entries"
          desc="Bad predictions"
          value={currentMaxLogNegative}
          onChange={setMaxLogNegative}
          min={0}
          max={10000}
          formatValue={formatLogEntries}
          color="#2196f3"
        />
        <SettingRow
          icon={<PositiveIcon sx={{ color: '#66bb6a', fontSize: 18 }} />}
          label="Positive Entries"
          desc="Good predictions"
          value={currentMaxLogPositive}
          onChange={setMaxLogPositive}
          min={0}
          max={10000}
          formatValue={formatLogEntries}
          color="#2196f3"
        />
        <SettingRow
          icon={<AlertCoinIcon sx={{ color: '#ffa726', fontSize: 18 }} />}
          label="Alert Entries"
          desc="Alert predictions"
          value={currentMaxLogAlert}
          onChange={setMaxLogAlert}
          min={0}
          max={10000}
          formatValue={formatLogEntries}
          color="#2196f3"
        />
      </SectionBox>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AlertConfig;
