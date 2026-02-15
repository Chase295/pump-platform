import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  TextField,
  Button,
  Alert,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Grid,
  LinearProgress,
} from '@mui/material';
import {
  Save as SaveIcon,
  Webhook as WebhookIcon,
  Speed as SpeedIcon,
  FilterAlt as FilterAltIcon,
  AccountBalance as AccountBalanceIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { findApi } from '../../services/api';
import type { FindConfigResponse, FindConfigUpdateRequest } from '../../types/find';

const darkTextFieldSx = {
  '& .MuiOutlinedInput-root': {
    color: '#fff',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
    '&:hover fieldset': { borderColor: 'rgba(0,212,255,0.4)' },
    '&.Mui-focused fieldset': { borderColor: '#00d4ff' },
  },
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.45)' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#00d4ff' },
  '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.35)' },
};

const darkSelectSx = {
  color: '#fff',
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,212,255,0.4)' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00d4ff' },
  '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' },
};

interface SectionCardProps {
  title: string;
  subtitle: string;
  accentColor: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({ title, subtitle, accentColor, icon, badge, children }) => (
  <Card sx={{
    bgcolor: `rgba(${accentColor}, 0.04)`,
    border: `1px solid rgba(${accentColor}, 0.18)`,
    borderLeft: `3px solid rgba(${accentColor}, 0.6)`,
    backdropFilter: 'blur(10px)',
    height: '100%',
  }}>
    <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ color: `rgba(${accentColor}, 0.7)`, display: 'flex' }}>{icon}</Box>
          <Box>
            <Typography sx={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem', lineHeight: 1.2 }}>
              {title}
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>
              {subtitle}
            </Typography>
          </Box>
        </Box>
        {badge}
      </Box>
      {children}
    </CardContent>
  </Card>
);

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
  const [successMessage, setSuccessMessage] = useState('');
  const [validationError, setValidationError] = useState('');

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

  if (isLoading && !config) {
    return (
      <Box sx={{ mt: 4 }}>
        <LinearProgress sx={{ mb: 2, '& .MuiLinearProgress-bar': { bgcolor: '#00d4ff' } }} />
        <Typography variant="h6" sx={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
          Loading configuration...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#fff' }}>
          Service Configuration
        </Typography>
      </Box>

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
        {/* Row 1: n8n Integration + Discovery Timing */}
        <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <SectionCard
              title="n8n Integration"
              subtitle="Webhook for new coin notifications"
              accentColor="0, 212, 255"
              icon={<WebhookIcon />}
            >
              <TextField
                fullWidth
                label="Webhook URL"
                value={formData.n8n_webhook_url}
                onChange={(e) => handleInputChange('n8n_webhook_url', e.target.value)}
                placeholder="https://n8n.example.com/webhook/xyz"
                helperText="n8n webhook endpoint URL"
                sx={{ ...darkTextFieldSx, mb: 2 }}
              />
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel sx={{ color: 'rgba(255,255,255,0.45)', '&.Mui-focused': { color: '#00d4ff' } }}>
                  HTTP Method
                </InputLabel>
                <Select
                  value={formData.n8n_webhook_method}
                  onChange={(e) => handleInputChange('n8n_webhook_method', e.target.value)}
                  label="HTTP Method"
                  sx={darkSelectSx}
                  MenuProps={{ PaperProps: { sx: { bgcolor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' } } }}
                >
                  <MenuItem value="GET" sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(0,212,255,0.1)' } }}>GET</MenuItem>
                  <MenuItem value="POST" sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(0,212,255,0.1)' } }}>POST</MenuItem>
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
                  sx={darkTextFieldSx}
                />
                <TextField
                  fullWidth
                  type="number"
                  label="Batch Timeout (s)"
                  value={formData.batch_timeout}
                  onChange={(e) => handleInputChange('batch_timeout', parseInt(e.target.value))}
                  inputProps={{ min: 10, max: 300 }}
                  helperText="Max wait before send (10-300s)"
                  sx={darkTextFieldSx}
                />
              </Box>
            </SectionCard>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <SectionCard
              title="Discovery Timing"
              subtitle="Cache and refresh intervals"
              accentColor="76, 175, 80"
              icon={<SpeedIcon />}
            >
              <TextField
                fullWidth
                type="number"
                label="Coin Cache Time (seconds)"
                value={formData.coin_cache_seconds}
                onChange={(e) => handleInputChange('coin_cache_seconds', parseInt(e.target.value))}
                inputProps={{ min: 10, max: 3600 }}
                helperText="How long new coins are cached before activation (10-3600s)"
                sx={{ ...darkTextFieldSx, mb: 2 }}
              />
              <TextField
                fullWidth
                type="number"
                label="DB Refresh Interval (seconds)"
                value={formData.db_refresh_interval}
                onChange={(e) => handleInputChange('db_refresh_interval', parseInt(e.target.value))}
                inputProps={{ min: 5, max: 300 }}
                helperText="How often phase transitions are checked (5-300s)"
                sx={darkTextFieldSx}
              />
            </SectionCard>
          </Grid>
        </Grid>

        {/* Row 2: Coin Filters + Trading Thresholds */}
        <Grid container spacing={2.5} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <SectionCard
              title="Coin Filters"
              subtitle="Name patterns and spam detection"
              accentColor="255, 152, 0"
              icon={<FilterAltIcon />}
            >
              <TextField
                fullWidth
                label="Bad Names Pattern"
                value={formData.bad_names_pattern}
                onChange={(e) => handleInputChange('bad_names_pattern', e.target.value)}
                placeholder="test|bot|rug|scam|cant|honey|faucet"
                helperText="Regex pattern to filter suspicious coin names (pipe-separated)"
                sx={{ ...darkTextFieldSx, mb: 2 }}
              />
              <TextField
                fullWidth
                type="number"
                label="Spam Burst Window (seconds)"
                value={formData.spam_burst_window}
                onChange={(e) => handleInputChange('spam_burst_window', parseInt(e.target.value))}
                inputProps={{ min: 5, max: 300 }}
                helperText="Time window for duplicate coin detection (5-300s)"
                sx={darkTextFieldSx}
              />
            </SectionCard>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <SectionCard
              title="Trading Thresholds"
              subtitle="Read-only values from environment"
              accentColor="156, 39, 176"
              icon={<AccountBalanceIcon />}
              badge={
                <Chip
                  label="ENV"
                  size="small"
                  sx={{ bgcolor: 'rgba(156,39,176,0.15)', color: '#ce93d8', fontWeight: 700, fontSize: '0.65rem', height: 22 }}
                />
              }
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <Box>
                  <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.25 }}>
                    SOL Reserves Full
                  </Typography>
                  <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff', fontSize: '1.1rem' }}>
                    {config?.sol_reserves_full ?? '--'} <Typography component="span" sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>SOL</Typography>
                  </Typography>
                  <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>
                    Bonding curve threshold for "graduated" coins
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.25 }}>
                    Whale Threshold
                  </Typography>
                  <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff', fontSize: '1.1rem' }}>
                    {config?.whale_threshold_sol ?? '--'} <Typography component="span" sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>SOL</Typography>
                  </Typography>
                  <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>
                    Minimum trade size to flag as whale activity
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.25 }}>
                    Trade Buffer
                  </Typography>
                  <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff', fontSize: '1.1rem' }}>
                    {config?.trade_buffer_seconds ?? '--'} <Typography component="span" sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>seconds</Typography>
                  </Typography>
                  <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>
                    Grace period for trade subscription after cache expires
                  </Typography>
                </Box>
              </Box>
            </SectionCard>
          </Grid>
        </Grid>

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button
            type="submit"
            variant="contained"
            startIcon={<SaveIcon />}
            disabled={isLoading || updateMutation.isPending}
            sx={{
              bgcolor: '#00d4ff',
              color: '#0f0f23',
              fontWeight: 700,
              px: 4,
              '&:hover': { bgcolor: '#00b8e6' },
              '&.Mui-disabled': { bgcolor: 'rgba(0,212,255,0.2)', color: 'rgba(255,255,255,0.3)' },
            }}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </Box>
      </form>
    </Box>
  );
};

export default FindConfig;
