/**
 * PredictionDefaults Page
 * Global default settings applied to every newly imported model.
 * All values use number/text input fields for exact entry.
 */
import React, { useState } from 'react';
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
  InputAdornment,
} from '@mui/material';
import {
  Save as SaveIcon,
  Settings as SettingsIcon,
  Notifications as AlertIcon,
  Webhook as WebhookIcon,
  Timer as TimerIcon,
  Storage as LogIcon,
  RemoveCircleOutline as BadIcon,
  TrendingUp as PositiveIcon,
  Warning as AlertCoinIcon,
  RestartAlt as ResetIcon,
} from '@mui/icons-material';

import { serverApi } from '../../services/api';

// ── Schema defaults (mirrors backend PREDICTION_DEFAULTS_SCHEMA) ────
const SCHEMA_DEFAULTS: Record<string, unknown> = {
  alert_threshold: 0.7,
  n8n_enabled: true,
  n8n_webhook_url: '',
  n8n_send_mode: ['all'],
  ignore_bad_seconds: 0,
  ignore_positive_seconds: 0,
  ignore_alert_seconds: 0,
  max_log_entries_per_coin_negative: 0,
  max_log_entries_per_coin_positive: 0,
  max_log_entries_per_coin_alert: 0,
  send_ignored_to_n8n: false,
};

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

// ── Number Input Row ─────────────────────────────────────────
const NumberRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  desc: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  helperText?: string;
}> = ({ icon, label, desc, value, onChange, min = 0, max, unit, helperText }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 180 }}>
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
    <TextField
      type="number"
      size="small"
      value={value}
      onChange={(e) => {
        let v = Number(e.target.value);
        if (isNaN(v)) v = min;
        if (v < min) v = min;
        if (max !== undefined && v > max) v = max;
        onChange(v);
      }}
      inputProps={{ min, max, step: 1 }}
      helperText={helperText}
      sx={{ width: 160 }}
      InputProps={unit ? {
        endAdornment: <InputAdornment position="end">{unit}</InputAdornment>,
      } : undefined}
    />
  </Box>
);

// ── Main Component ───────────────────────────────────────────
const PredictionDefaults: React.FC = () => {
  const queryClient = useQueryClient();

  // Load current defaults
  const { data: defaultsResponse, isLoading } = useQuery({
    queryKey: ['server', 'defaults'],
    queryFn: () => serverApi.getDefaults(),
  });

  const defaults = defaultsResponse?.data;

  // Form state
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
  const [sendIgnoredToN8n, setSendIgnoredToN8n] = useState<boolean | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Derive current values
  const currentThreshold = alertThreshold ?? defaults?.alert_threshold ?? 0.7;
  const currentWebhookUrl = n8nWebhookUrl ?? defaults?.n8n_webhook_url ?? '';
  const currentN8nEnabled = n8nEnabled ?? defaults?.n8n_enabled ?? true;
  const currentSendMode =
    n8nSendMode ??
    (Array.isArray(defaults?.n8n_send_mode) ? defaults.n8n_send_mode : ['all']);
  const currentIgnoreBad = ignoreBadSeconds ?? defaults?.ignore_bad_seconds ?? 0;
  const currentIgnorePositive = ignorePositiveSeconds ?? defaults?.ignore_positive_seconds ?? 0;
  const currentIgnoreAlert = ignoreAlertSeconds ?? defaults?.ignore_alert_seconds ?? 0;
  const currentMaxLogNegative = maxLogNegative ?? defaults?.max_log_entries_per_coin_negative ?? 0;
  const currentMaxLogPositive = maxLogPositive ?? defaults?.max_log_entries_per_coin_positive ?? 0;
  const currentMaxLogAlert = maxLogAlert ?? defaults?.max_log_entries_per_coin_alert ?? 0;
  const currentSendIgnored = sendIgnoredToN8n ?? defaults?.send_ignored_to_n8n ?? false;

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
    maxLogAlert !== null ||
    sendIgnoredToN8n !== null;

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: () =>
      serverApi.updateDefaults({
        alert_threshold: currentThreshold,
        n8n_enabled: currentN8nEnabled,
        n8n_webhook_url: currentWebhookUrl,
        n8n_send_mode: currentSendMode,
        ignore_bad_seconds: currentIgnoreBad,
        ignore_positive_seconds: currentIgnorePositive,
        ignore_alert_seconds: currentIgnoreAlert,
        max_log_entries_per_coin_negative: currentMaxLogNegative,
        max_log_entries_per_coin_positive: currentMaxLogPositive,
        max_log_entries_per_coin_alert: currentMaxLogAlert,
        send_ignored_to_n8n: currentSendIgnored,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', 'defaults'] });
      resetFormState();
      setSnackbar({ open: true, message: 'Settings saved', severity: 'success' });
    },
    onError: (err: any) => {
      setSnackbar({
        open: true,
        message: `Error: ${err.response?.data?.detail || err.message}`,
        severity: 'error',
      });
    },
  });

  const resetFormState = () => {
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
    setSendIgnoredToN8n(null);
  };

  const handleResetToSchemaDefaults = () => {
    setAlertThreshold(SCHEMA_DEFAULTS.alert_threshold as number);
    setN8nEnabled(SCHEMA_DEFAULTS.n8n_enabled as boolean);
    setN8nWebhookUrl(SCHEMA_DEFAULTS.n8n_webhook_url as string);
    setN8nSendMode(SCHEMA_DEFAULTS.n8n_send_mode as string[]);
    setIgnoreBadSeconds(SCHEMA_DEFAULTS.ignore_bad_seconds as number);
    setIgnorePositiveSeconds(SCHEMA_DEFAULTS.ignore_positive_seconds as number);
    setIgnoreAlertSeconds(SCHEMA_DEFAULTS.ignore_alert_seconds as number);
    setMaxLogNegative(SCHEMA_DEFAULTS.max_log_entries_per_coin_negative as number);
    setMaxLogPositive(SCHEMA_DEFAULTS.max_log_entries_per_coin_positive as number);
    setMaxLogAlert(SCHEMA_DEFAULTS.max_log_entries_per_coin_alert as number);
    setSendIgnoredToN8n(SCHEMA_DEFAULTS.send_ignored_to_n8n as boolean);
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
          <IconBox color="#00d4ff" size={44}>
            <SettingsIcon sx={{ color: '#00d4ff', fontSize: 24 }} />
          </IconBox>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#00d4ff' }}>
              Default Settings
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Applied to newly imported models
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
          <Button
            startIcon={<ResetIcon />}
            onClick={handleResetToSchemaDefaults}
            variant="outlined"
            size="small"
          >
            Reset
          </Button>
          <Button
            startIcon={saveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
            variant="contained"
            size="small"
            sx={{
              bgcolor: '#00d4ff',
              '&:hover': { bgcolor: '#00b8d4' },
              '&.Mui-disabled': { bgcolor: 'rgba(0, 212, 255, 0.2)', color: 'rgba(255,255,255,0.3)' },
            }}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save All'}
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
              Predictions above this probability trigger alerts (0.01 – 0.99)
            </Typography>
          </Box>
        </Box>
        <TextField
          type="number"
          size="small"
          value={currentThreshold}
          onChange={(e) => {
            let v = parseFloat(e.target.value);
            if (isNaN(v)) v = 0.01;
            if (v < 0.01) v = 0.01;
            if (v > 0.99) v = 0.99;
            setAlertThreshold(Math.round(v * 100) / 100);
          }}
          inputProps={{ min: 0.01, max: 0.99, step: 0.01 }}
          helperText="e.g. 0.7 = 70%"
          sx={{ width: 160 }}
        />
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
              Duration in seconds to ignore a coin after a prediction type (0 = off, max 86400)
            </Typography>
          </Box>
        </Box>
        <NumberRow
          icon={<BadIcon sx={{ color: '#ef5350', fontSize: 18 }} />}
          label="Bad Coins"
          desc="Negative predictions"
          value={currentIgnoreBad}
          onChange={setIgnoreBadSeconds}
          max={86400}
          unit="s"
        />
        <NumberRow
          icon={<PositiveIcon sx={{ color: '#66bb6a', fontSize: 18 }} />}
          label="Positive Coins"
          desc="Positive predictions"
          value={currentIgnorePositive}
          onChange={setIgnorePositiveSeconds}
          max={86400}
          unit="s"
        />
        <NumberRow
          icon={<AlertCoinIcon sx={{ color: '#ffa726', fontSize: 18 }} />}
          label="Alert Coins"
          desc="Above threshold"
          value={currentIgnoreAlert}
          onChange={setIgnoreAlertSeconds}
          max={86400}
          unit="s"
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
              Max prediction log entries per coin per type (0 = unlimited, max 1000)
            </Typography>
          </Box>
        </Box>
        <NumberRow
          icon={<BadIcon sx={{ color: '#ef5350', fontSize: 18 }} />}
          label="Negative Entries"
          desc="Bad predictions"
          value={currentMaxLogNegative}
          onChange={setMaxLogNegative}
          max={1000}
        />
        <NumberRow
          icon={<PositiveIcon sx={{ color: '#66bb6a', fontSize: 18 }} />}
          label="Positive Entries"
          desc="Good predictions"
          value={currentMaxLogPositive}
          onChange={setMaxLogPositive}
          max={1000}
        />
        <NumberRow
          icon={<AlertCoinIcon sx={{ color: '#ffa726', fontSize: 18 }} />}
          label="Alert Entries"
          desc="Alert predictions"
          value={currentMaxLogAlert}
          onChange={setMaxLogAlert}
          max={1000}
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

export default PredictionDefaults;
