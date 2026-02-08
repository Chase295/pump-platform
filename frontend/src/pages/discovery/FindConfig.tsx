import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  TextField,
  Button,
  Alert,
  Card,
  CardContent,
  CardHeader,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from '@mui/material';
import { Save as SaveIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { findApi } from '../../services/api';
import type { FindConfigResponse, FindConfigUpdateRequest } from '../../types/find';

const FindConfig: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: config, isLoading, error: fetchError } = useQuery<FindConfigResponse>({
    queryKey: ['find', 'config'],
    queryFn: async () => {
      const res = await findApi.getConfig();
      return res.data;
    },
  });

  const [formData, setFormData] = useState<FindConfigUpdateRequest>({
    n8n_webhook_url: '',
    n8n_webhook_method: 'POST',
    coin_cache_seconds: 120,
    db_refresh_interval: 10,
    batch_size: 10,
    batch_timeout: 30,
    bad_names_pattern: 'test|bot|rug|scam|cant|honey|faucet',
    spam_burst_window: 30,
  });

  const [originalData, setOriginalData] = useState<FindConfigUpdateRequest | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');

  useEffect(() => {
    if (config) {
      const newFormData: FindConfigUpdateRequest = {
        n8n_webhook_url: config.n8n_webhook_url || '',
        n8n_webhook_method: config.n8n_webhook_method || 'POST',
        coin_cache_seconds: config.coin_cache_seconds || 120,
        db_refresh_interval: config.db_refresh_interval || 10,
        batch_size: config.batch_size || 10,
        batch_timeout: config.batch_timeout || 30,
        bad_names_pattern: config.bad_names_pattern || 'test|bot|rug|scam|cant|honey|faucet',
        spam_burst_window: config.spam_burst_window || 30,
      };
      setFormData(newFormData);
      setOriginalData(newFormData);
    }
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<FindConfigUpdateRequest>) => {
      const res = await findApi.updateConfig(data as Record<string, unknown>);
      return res.data;
    },
    onSuccess: () => {
      setSuccessMessage('Configuration updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
      queryClient.invalidateQueries({ queryKey: ['find', 'config'] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setValidationError(axiosErr.response?.data?.detail || axiosErr.message || 'Failed to update config');
    },
  });

  const handleInputChange = (field: keyof FindConfigUpdateRequest, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!originalData) return;

    const updateData: Partial<FindConfigUpdateRequest> = {};

    Object.keys(formData).forEach((key) => {
      const formKey = key as keyof FindConfigUpdateRequest;
      if (formData[formKey] !== originalData[formKey]) {
        (updateData as Record<string, unknown>)[formKey] = formData[formKey];
      }
    });

    if (Object.keys(updateData).length === 0) {
      setSuccessMessage('No changes detected.');
      setTimeout(() => setSuccessMessage(''), 3000);
      return;
    }

    updateMutation.mutate(updateData);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['find', 'config'] });
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Service Configuration
      </Typography>

      {fetchError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {fetchError instanceof Error ? fetchError.message : 'Failed to load config'}
        </Alert>
      )}

      {validationError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setValidationError('')}>
          {validationError}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Row 1: n8n + Discovery Timing */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 2, md: 3 } }}>
            <Box sx={{ flex: 1 }}>
              <Card>
                <CardHeader title="n8n Integration" subheader="Webhook for new coin notifications" />
                <CardContent>
                  <TextField
                    fullWidth
                    label="Webhook URL"
                    value={formData.n8n_webhook_url}
                    onChange={(e) => handleInputChange('n8n_webhook_url', e.target.value)}
                    placeholder="https://n8n.example.com/webhook/xyz"
                    helperText="n8n webhook endpoint URL"
                    sx={{ mb: 2 }}
                  />
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>HTTP Method</InputLabel>
                    <Select
                      value={formData.n8n_webhook_method}
                      onChange={(e) => handleInputChange('n8n_webhook_method', e.target.value)}
                      label="HTTP Method"
                    >
                      <MenuItem value="GET">GET</MenuItem>
                      <MenuItem value="POST">POST</MenuItem>
                    </Select>
                  </FormControl>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Batch Size"
                      value={formData.batch_size}
                      onChange={(e) => handleInputChange('batch_size', parseInt(e.target.value))}
                      inputProps={{ min: 1, max: 100 }}
                      helperText="Coins per batch (1-100)"
                    />
                    <TextField
                      fullWidth
                      type="number"
                      label="Batch Timeout (s)"
                      value={formData.batch_timeout}
                      onChange={(e) => handleInputChange('batch_timeout', parseInt(e.target.value))}
                      inputProps={{ min: 10, max: 300 }}
                      helperText="Max wait before send (10-300s)"
                    />
                  </Box>
                </CardContent>
              </Card>
            </Box>

            <Box sx={{ flex: 1 }}>
              <Card>
                <CardHeader title="Discovery Timing" subheader="Cache and refresh intervals" />
                <CardContent>
                  <TextField
                    fullWidth
                    type="number"
                    label="Coin Cache Time (seconds)"
                    value={formData.coin_cache_seconds}
                    onChange={(e) => handleInputChange('coin_cache_seconds', parseInt(e.target.value))}
                    inputProps={{ min: 10, max: 3600 }}
                    helperText="How long new coins are cached before activation (10-3600s)"
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    fullWidth
                    type="number"
                    label="DB Refresh Interval (seconds)"
                    value={formData.db_refresh_interval}
                    onChange={(e) => handleInputChange('db_refresh_interval', parseInt(e.target.value))}
                    inputProps={{ min: 5, max: 300 }}
                    helperText="How often phase transitions are checked (5-300s)"
                  />
                </CardContent>
              </Card>
            </Box>
          </Box>

          {/* Row 2: Filters + Thresholds (read-only) */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 2, md: 3 } }}>
            <Box sx={{ flex: 1 }}>
              <Card>
                <CardHeader title="Coin Filters" subheader="Name patterns and spam detection" />
                <CardContent>
                  <TextField
                    fullWidth
                    label="Bad Names Pattern"
                    value={formData.bad_names_pattern}
                    onChange={(e) => handleInputChange('bad_names_pattern', e.target.value)}
                    placeholder="test|bot|rug|scam|cant|honey|faucet"
                    helperText="Regex pattern to filter suspicious coin names (pipe-separated)"
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    fullWidth
                    type="number"
                    label="Spam Burst Window (seconds)"
                    value={formData.spam_burst_window}
                    onChange={(e) => handleInputChange('spam_burst_window', parseInt(e.target.value))}
                    inputProps={{ min: 5, max: 300 }}
                    helperText="Time window for duplicate coin detection (5-300s)"
                  />
                </CardContent>
              </Card>
            </Box>

            <Box sx={{ flex: 1 }}>
              <Card>
                <CardHeader
                  title="Trading Thresholds"
                  subheader="Read-only values from environment"
                  action={<Chip label="ENV" size="small" variant="outlined" />}
                />
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box>
                      <Typography variant="body2" color="textSecondary">SOL Reserves Full</Typography>
                      <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                        {config?.sol_reserves_full ?? '—'} SOL
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Bonding curve threshold for "graduated" coins
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="textSecondary">Whale Threshold</Typography>
                      <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                        {config?.whale_threshold_sol ?? '—'} SOL
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Minimum trade size to flag as whale activity
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="textSecondary">Trade Buffer</Typography>
                      <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                        {config?.trade_buffer_seconds ?? '—'} seconds
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Grace period for trade subscription after cache expires
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </Box>

          {/* Actions */}
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleRefresh}
              disabled={isLoading}
            >
              Refresh
            </Button>

            <Button
              type="submit"
              variant="contained"
              startIcon={<SaveIcon />}
              disabled={isLoading || updateMutation.isPending}
              size="large"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </Box>
        </Box>
      </form>
    </Box>
  );
};

export default FindConfig;
