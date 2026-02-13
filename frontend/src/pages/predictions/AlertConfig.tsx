/**
 * AlertConfig Page
 * Per-model alert configuration: threshold, n8n webhook, send mode, ignore settings, max log entries.
 * Uses serverApi.updateAlertConfig(), serverApi.updateIgnoreSettings().
 */
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Alert,
  Button,
  TextField,
  Switch,
  FormControlLabel,
  Slider,
  Checkbox,
  Breadcrumbs,
  Link as MuiLink,
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
} from '@mui/icons-material';

import { serverApi } from '../../services/api';
import type { ServerModel } from '../../types/server';

const AlertConfig: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const modelId = Number(id);

  // Load model
  const { data: modelResponse, isLoading, error } = useQuery({
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

  // Form state - initialized from model data
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

  // Derive current values (form overrides or model defaults)
  const currentThreshold = alertThreshold ?? model?.alert_threshold ?? 0.7;
  const currentWebhookUrl = n8nWebhookUrl ?? model?.n8n_webhook_url ?? '';
  const currentN8nEnabled = n8nEnabled ?? model?.n8n_enabled ?? false;
  const currentSendMode = n8nSendMode ?? (
    Array.isArray(model?.n8n_send_mode)
      ? model.n8n_send_mode
      : model?.n8n_send_mode
        ? [model.n8n_send_mode]
        : ['all']
  );
  const currentIgnoreBad = ignoreBadSeconds ?? ignoreSettings?.ignore_bad_seconds ?? model?.ignore_bad_seconds ?? 300;
  const currentIgnorePositive = ignorePositiveSeconds ?? ignoreSettings?.ignore_positive_seconds ?? model?.ignore_positive_seconds ?? 300;
  const currentIgnoreAlert = ignoreAlertSeconds ?? ignoreSettings?.ignore_alert_seconds ?? model?.ignore_alert_seconds ?? 600;
  const currentMaxLogNegative = maxLogNegative ?? model?.max_log_entries_per_coin_negative ?? 0;
  const currentMaxLogPositive = maxLogPositive ?? model?.max_log_entries_per_coin_positive ?? 0;
  const currentMaxLogAlert = maxLogAlert ?? model?.max_log_entries_per_coin_alert ?? 0;

  // Save alert config
  const saveAlertMutation = useMutation({
    mutationFn: () =>
      serverApi.updateAlertConfig(modelId, {
        alert_threshold: currentThreshold,
        n8n_webhook_url: currentWebhookUrl || undefined,
        n8n_enabled: currentN8nEnabled,
        n8n_send_mode: currentSendMode,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', 'model', modelId] });
      setSnackbar({ open: true, message: 'Alert configuration saved successfully', severity: 'success' });
    },
    onError: (err: any) => {
      setSnackbar({
        open: true,
        message: `Error: ${err.response?.data?.detail || err.message}`,
        severity: 'error',
      });
    },
  });

  // Save ignore settings
  const saveIgnoreMutation = useMutation({
    mutationFn: () =>
      serverApi.updateIgnoreSettings(modelId, {
        ignore_bad_seconds: currentIgnoreBad,
        ignore_positive_seconds: currentIgnorePositive,
        ignore_alert_seconds: currentIgnoreAlert,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', 'model-ignore', modelId] });
      setSnackbar({ open: true, message: 'Ignore settings saved successfully', severity: 'success' });
    },
    onError: (err: any) => {
      setSnackbar({
        open: true,
        message: `Error: ${err.response?.data?.detail || err.message}`,
        severity: 'error',
      });
    },
  });

  // Save max log entries
  const saveMaxLogMutation = useMutation({
    mutationFn: () =>
      serverApi.updateMaxLogEntries(modelId, {
        max_log_entries_per_coin_negative: currentMaxLogNegative,
        max_log_entries_per_coin_positive: currentMaxLogPositive,
        max_log_entries_per_coin_alert: currentMaxLogAlert,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', 'model', modelId] });
      setSnackbar({ open: true, message: 'Max log entries saved successfully', severity: 'success' });
    },
    onError: (err: any) => {
      setSnackbar({
        open: true,
        message: `Error: ${err.response?.data?.detail || err.message}`,
        severity: 'error',
      });
    },
  });

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
    <Box>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 3 }}>
        <MuiLink component="button" variant="body2" onClick={() => navigate('/predictions')} sx={{ cursor: 'pointer' }}>
          Models
        </MuiLink>
        <MuiLink
          component="button"
          variant="body2"
          onClick={() => navigate(`/predictions/models/${modelId}`)}
          sx={{ cursor: 'pointer' }}
        >
          {modelName}
        </MuiLink>
        <Typography color="text.primary">Alert Config</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', sm: '2rem' } }}>
            Alert Configuration
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure alert threshold, webhooks, and ignore settings for {modelName}
          </Typography>
        </Box>
        <Button startIcon={<BackIcon />} onClick={() => navigate(`/predictions/models/${modelId}`)} variant="outlined" size="small">
          Back
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
        {/* Alert Threshold */}
        <Card variant="outlined">
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <AlertIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Alert Threshold
              </Typography>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Predictions with probability above this threshold trigger alerts.
            </Typography>

            <Box sx={{ px: 2 }}>
              <Slider
                value={currentThreshold * 100}
                onChange={(_e, v) => setAlertThreshold((v as number) / 100)}
                min={1}
                max={99}
                step={1}
                marks={[
                  { value: 50, label: '50%' },
                  { value: 70, label: '70%' },
                  { value: 90, label: '90%' },
                ]}
                valueLabelDisplay="on"
                valueLabelFormat={(v) => `${v}%`}
                sx={{ color: '#00d4ff' }}
              />
            </Box>

            <Typography variant="body2" sx={{ mt: 1, textAlign: 'center', fontWeight: 600, color: '#00d4ff' }}>
              Current: {(currentThreshold * 100).toFixed(0)}%
            </Typography>
          </CardContent>
        </Card>

        {/* N8N Webhook */}
        <Card variant="outlined">
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <WebhookIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                N8N Webhook
              </Typography>
            </Box>

            <FormControlLabel
              control={
                <Switch
                  checked={currentN8nEnabled}
                  onChange={(e) => setN8nEnabled(e.target.checked)}
                  color="primary"
                />
              }
              label="Enable N8N notifications"
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Webhook URL"
              value={currentWebhookUrl}
              onChange={(e) => setN8nWebhookUrl(e.target.value)}
              placeholder="https://your-n8n-instance/webhook/..."
              helperText="Leave empty to use global URL"
              disabled={!currentN8nEnabled}
              size="small"
              sx={{ mb: 3 }}
            />

            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Send Mode
            </Typography>
            {[
              { value: 'all', label: 'Send all predictions' },
              { value: 'alerts_only', label: 'Only alerts (above threshold)' },
              { value: 'positive_only', label: 'Only positive predictions' },
              { value: 'negative_only', label: 'Only negative predictions' },
            ].map((option) => (
              <FormControlLabel
                key={option.value}
                control={
                  <Checkbox
                    checked={currentSendMode.includes(option.value)}
                    onChange={() => toggleSendMode(option.value)}
                    disabled={!currentN8nEnabled}
                    size="small"
                  />
                }
                label={<Typography variant="body2">{option.label}</Typography>}
                sx={{ display: 'block', ml: 0 }}
              />
            ))}
          </CardContent>
        </Card>

        {/* Ignore Settings */}
        <Card variant="outlined">
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <TimerIcon sx={{ mr: 1, color: 'warning.main' }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Ignore Settings
              </Typography>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Duration (in seconds) to ignore a coin after it receives a certain prediction type.
            </Typography>

            <TextField
              fullWidth
              label="Ignore Bad Coins (seconds)"
              type="number"
              value={currentIgnoreBad}
              onChange={(e) => setIgnoreBadSeconds(Number(e.target.value))}
              inputProps={{ min: 0, max: 86400 }}
              helperText="How long to ignore coins with negative predictions"
              size="small"
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Ignore Positive Coins (seconds)"
              type="number"
              value={currentIgnorePositive}
              onChange={(e) => setIgnorePositiveSeconds(Number(e.target.value))}
              inputProps={{ min: 0, max: 86400 }}
              helperText="How long to ignore coins with positive predictions"
              size="small"
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Ignore Alert Coins (seconds)"
              type="number"
              value={currentIgnoreAlert}
              onChange={(e) => setIgnoreAlertSeconds(Number(e.target.value))}
              inputProps={{ min: 0, max: 86400 }}
              helperText="How long to ignore coins that triggered alerts"
              size="small"
            />

            <Box sx={{ mt: 3 }}>
              <Button
                variant="contained"
                startIcon={saveIgnoreMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                onClick={() => saveIgnoreMutation.mutate()}
                disabled={saveIgnoreMutation.isPending}
                sx={{ bgcolor: '#ff9800', '&:hover': { bgcolor: '#f57c00' } }}
              >
                {saveIgnoreMutation.isPending ? 'Saving...' : 'Save Ignore Settings'}
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Max Log Entries */}
        <Card variant="outlined">
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <LogIcon sx={{ mr: 1, color: 'info.main' }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Max Log Entries
              </Typography>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Maximum prediction log entries per coin per type. Set to 0 for unlimited.
            </Typography>

            <TextField
              fullWidth
              label="Max Negative Entries"
              type="number"
              value={currentMaxLogNegative}
              onChange={(e) => setMaxLogNegative(Number(e.target.value))}
              inputProps={{ min: 0, max: 1000 }}
              helperText="0 = unlimited"
              size="small"
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Max Positive Entries"
              type="number"
              value={currentMaxLogPositive}
              onChange={(e) => setMaxLogPositive(Number(e.target.value))}
              inputProps={{ min: 0, max: 1000 }}
              helperText="0 = unlimited"
              size="small"
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Max Alert Entries"
              type="number"
              value={currentMaxLogAlert}
              onChange={(e) => setMaxLogAlert(Number(e.target.value))}
              inputProps={{ min: 0, max: 1000 }}
              helperText="0 = unlimited"
              size="small"
            />

            <Box sx={{ mt: 3 }}>
              <Button
                variant="contained"
                startIcon={saveMaxLogMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                onClick={() => saveMaxLogMutation.mutate()}
                disabled={saveMaxLogMutation.isPending}
                sx={{ bgcolor: '#2196f3', '&:hover': { bgcolor: '#1976d2' } }}
              >
                {saveMaxLogMutation.isPending ? 'Saving...' : 'Save Log Settings'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Save Alert Config Button */}
      <Box sx={{ mt: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
        <Button
          variant="contained"
          size="large"
          startIcon={saveAlertMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
          onClick={() => saveAlertMutation.mutate()}
          disabled={saveAlertMutation.isPending}
          sx={{ bgcolor: '#00d4ff', '&:hover': { bgcolor: '#00b8d4' } }}
        >
          {saveAlertMutation.isPending ? 'Saving...' : 'Save Alert Configuration'}
        </Button>
        <Button variant="outlined" onClick={() => navigate(`/predictions/models/${modelId}`)}>
          Cancel
        </Button>
      </Box>

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
