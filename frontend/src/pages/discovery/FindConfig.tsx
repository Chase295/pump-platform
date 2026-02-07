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
    db_dsn: '',
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
        db_dsn: config.db_dsn || '',
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

    // Build an object with only changed fields
    const updateData: Partial<FindConfigUpdateRequest> = {};

    Object.keys(formData).forEach((key) => {
      const formKey = key as keyof FindConfigUpdateRequest;
      if (formData[formKey] !== originalData[formKey]) {
        // Do not send censored passwords
        if (formKey === 'db_dsn' && formData.db_dsn && formData.db_dsn.includes('***')) {
          return;
        }
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
          {/* n8n Configuration */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 2, md: 3 } }}>
            <Box sx={{ flex: 1 }}>
              <Card>
                <CardHeader
                  title="n8n Integration"
                  subheader="Webhook settings for coin discovery"
                />
                <CardContent>
                  <Box sx={{ mb: 2 }}>
                    <TextField
                      fullWidth
                      label="Webhook URL"
                      value={formData.n8n_webhook_url}
                      onChange={(e) => handleInputChange('n8n_webhook_url', e.target.value)}
                      placeholder="https://n8n.example.com/webhook/xyz"
                      helperText="Full URL to the n8n webhook endpoint"
                    />
                  </Box>

                  <FormControl fullWidth>
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
                </CardContent>
              </Card>
            </Box>

            {/* Database Configuration */}
            <Box sx={{ flex: 1 }}>
              <Card>
                <CardHeader
                  title="Database"
                  subheader="PostgreSQL connection string"
                />
                <CardContent>
                  <TextField
                    fullWidth
                    label="Database DSN"
                    value={formData.db_dsn}
                    onChange={(e) => handleInputChange('db_dsn', e.target.value)}
                    placeholder="postgresql://user:pass@host:port/database"
                    helperText="PostgreSQL connection string (password is automatically hidden)"
                    multiline
                    rows={2}
                  />
                </CardContent>
              </Card>
            </Box>
          </Box>

          {/* Performance Settings */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, flexWrap: 'wrap', gap: { xs: 2, md: 3 } }}>
            <Box sx={{ flex: 1 }}>
              <Card>
                <CardHeader
                  title="Cache"
                  subheader="Coin cache settings"
                />
                <CardContent>
                  <TextField
                    fullWidth
                    type="number"
                    label="Cache Time (seconds)"
                    value={formData.coin_cache_seconds}
                    onChange={(e) => handleInputChange('coin_cache_seconds', parseInt(e.target.value))}
                    inputProps={{ min: 10, max: 3600 }}
                    helperText="How long new coins are cached (10-3600s)"
                  />
                </CardContent>
              </Card>
            </Box>

            <Box sx={{ flex: 1 }}>
              <Card>
                <CardHeader
                  title="Refresh"
                  subheader="Database query interval"
                />
                <CardContent>
                  <TextField
                    fullWidth
                    type="number"
                    label="Refresh Interval (seconds)"
                    value={formData.db_refresh_interval}
                    onChange={(e) => handleInputChange('db_refresh_interval', parseInt(e.target.value))}
                    inputProps={{ min: 5, max: 300 }}
                    helperText="How often the DB is queried for new streams"
                  />
                </CardContent>
              </Card>
            </Box>

            <Box sx={{ flex: 1 }}>
              <Card>
                <CardHeader
                  title="Batch"
                  subheader="n8n batch settings"
                />
                <CardContent>
                  <TextField
                    fullWidth
                    type="number"
                    label="Batch Size"
                    value={formData.batch_size}
                    onChange={(e) => handleInputChange('batch_size', parseInt(e.target.value))}
                    inputProps={{ min: 1, max: 100 }}
                    helperText="How many coins per n8n batch"
                  />
                  <TextField
                    fullWidth
                    type="number"
                    label="Batch Timeout (seconds)"
                    value={formData.batch_timeout}
                    onChange={(e) => handleInputChange('batch_timeout', parseInt(e.target.value))}
                    inputProps={{ min: 10, max: 300 }}
                    helperText="Max time before an incomplete batch is sent"
                    sx={{ mt: 2 }}
                  />
                </CardContent>
              </Card>
            </Box>
          </Box>

          {/* Filter Settings */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 2, md: 3 } }}>
            <Box sx={{ flex: 1 }}>
              <Card>
                <CardHeader
                  title="Coin Filter"
                  subheader="Name and spam filters"
                />
                <CardContent>
                  <TextField
                    fullWidth
                    label="Bad Names Pattern"
                    value={formData.bad_names_pattern}
                    onChange={(e) => handleInputChange('bad_names_pattern', e.target.value)}
                    placeholder="test|bot|rug|scam|cant|honey|faucet"
                    helperText="Regex pattern for bad coin names (pipe-separated)"
                    sx={{ mb: 2 }}
                  />

                  <TextField
                    fullWidth
                    type="number"
                    label="Spam Burst Window (seconds)"
                    value={formData.spam_burst_window}
                    onChange={(e) => handleInputChange('spam_burst_window', parseInt(e.target.value))}
                    inputProps={{ min: 5, max: 300 }}
                    helperText="Time window for spam burst detection (5-300s)"
                  />
                </CardContent>
              </Card>
            </Box>

            <Box sx={{ flex: 1 }}>
              <Card>
                <CardHeader
                  title="Filter Statistics"
                  subheader="Live filter results"
                />
                <CardContent>
                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    Filtered coins are shown in Prometheus metrics
                  </Typography>
                  <Typography variant="body2">
                    Bad Name Filter: Removes coins with suspicious names
                  </Typography>
                  <Typography variant="body2">
                    Spam Burst Filter: Prevents coin spam in short periods
                  </Typography>
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
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </Box>
        </Box>
      </form>

      {/* Current Configuration Display */}
      {config && (
        <Card sx={{ mt: 3 }}>
          <CardHeader
            title="Current Configuration"
            subheader="Live values from the service"
          />
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="textSecondary">n8n Webhook</Typography>
                  <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {config.n8n_webhook_url || 'Not set'}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="textSecondary">HTTP Method</Typography>
                  <Typography variant="body1">{config.n8n_webhook_method}</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="textSecondary">Cache Time</Typography>
                  <Typography variant="body1">{config.coin_cache_seconds} seconds</Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="textSecondary">Batch Size</Typography>
                  <Typography variant="body1">{config.batch_size} coins</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mt: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="textSecondary">Bad Names Pattern</Typography>
                  <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {config.bad_names_pattern || 'test|bot|rug|scam|cant|honey|faucet'}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="textSecondary">Spam Burst Window</Typography>
                  <Typography variant="body1">{config.spam_burst_window || 30} seconds</Typography>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default FindConfig;
