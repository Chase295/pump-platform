/**
 * PredictionModelDetails Page
 * Full model detail view with tabs.
 * Migrated from pump-server/frontend/src/pages/ModelDetails.tsx
 */
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Typography,
  Box,
  Tabs,
  Tab,
  Breadcrumbs,
  Link as MuiLink,
  Chip,
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from '@mui/material';
import { ArrowBack as BackIcon, Delete as DeleteIcon } from '@mui/icons-material';

import { serverApi } from '../../services/api';
import type { ServerModel, AlertStatistics } from '../../types/server';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index, ...other }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const PredictionModelDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const modelId = Number(id);

  // Load model data
  const { data: modelResponse, isLoading, error } = useQuery({
    queryKey: ['server', 'model', modelId],
    queryFn: () => serverApi.getModelDetails(modelId),
    enabled: !!modelId,
    refetchInterval: 30000,
  });

  const model: ServerModel | undefined = modelResponse?.data;

  // Load alert stats
  const { data: alertStatsResponse } = useQuery({
    queryKey: ['server', 'model-alert-stats', modelId],
    queryFn: () => serverApi.getAlertStatistics({ model_id: modelId }),
    enabled: !!modelId,
    refetchInterval: 30000,
  });

  const alertStats: AlertStatistics | undefined = alertStatsResponse?.data;

  // Load model statistics
  const { data: modelStatsResponse } = useQuery({
    queryKey: ['server', 'model-statistics', modelId],
    queryFn: () => serverApi.getModelStatistics(modelId),
    enabled: !!modelId,
    refetchInterval: 30000,
  });

  const modelStats = modelStatsResponse?.data;

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => serverApi.deleteModel(modelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', 'models'] });
      navigate('/predictions', { replace: true });
    },
  });

  const handleBack = () => navigate('/predictions');

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
        <Button startIcon={<BackIcon />} onClick={handleBack}>
          Back to Overview
        </Button>
      </Box>
    );
  }

  const modelName = model.custom_name || model.name;
  const isActive = model.is_active;

  const formatPct = (v?: number) => {
    if (v === undefined || v === null) return 'N/A';
    return `${(v * 100).toFixed(1)}%`;
  };

  return (
    <Box>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 3 }}>
        <MuiLink component="button" variant="body2" onClick={() => navigate('/predictions')} sx={{ cursor: 'pointer' }}>
          Models
        </MuiLink>
        <Typography color="text.primary">{modelName}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'flex-start' },
            gap: 2,
            mb: 2,
          }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, fontSize: { xs: '1.5rem', sm: '2rem' } }}>
              {modelName}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              ID: {model.id} | Type: {model.model_type} | Target: {model.target_direction?.toUpperCase()}{' '}
              {model.price_change_percent}% in {model.future_minutes}min
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              label={isActive ? 'Active' : 'Inactive'}
              color={isActive ? 'success' : 'default'}
              variant={isActive ? 'filled' : 'outlined'}
            />
            <Button
              startIcon={<DeleteIcon />}
              onClick={() => setDeleteDialogOpen(true)}
              variant="contained"
              color="error"
              size="small"
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
            <Button startIcon={<BackIcon />} onClick={handleBack} variant="outlined" size="small">
              Back
            </Button>
          </Box>
        </Box>

        {/* Quick Stats */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            gap: { xs: 1.5, sm: 3 },
          }}
        >
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography color="primary" sx={{ fontSize: '2rem', fontWeight: 600 }}>
                {model.total_predictions || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Predictions
              </Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography color="success.main" sx={{ fontSize: '2rem', fontWeight: 600 }}>
                {model.average_probability ? `${(model.average_probability * 100).toFixed(1)}%` : 'N/A'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Avg Probability
              </Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography color="info.main" sx={{ fontSize: '2rem', fontWeight: 600 }}>
                {model.accuracy ? `${(model.accuracy * 100).toFixed(1)}%` : 'N/A'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Accuracy
              </Typography>
            </CardContent>
          </Card>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography color="warning.main" sx={{ fontSize: '2rem', fontWeight: 600 }}>
                {model.positive_predictions || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Positive Predictions
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={(_e, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 500 },
          }}
        >
          <Tab label="Overview" />
          <Tab label="Performance" />
          <Tab label="Configuration" />
        </Tabs>
      </Box>

      {/* Tab: Overview */}
      <TabPanel value={activeTab} index={0}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                Model Info
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">Name:</Typography>
                <Typography variant="body2">{model.name}</Typography>
                <Typography variant="body2" color="text.secondary">Custom Name:</Typography>
                <Typography variant="body2">{model.custom_name || '-'}</Typography>
                <Typography variant="body2" color="text.secondary">Type:</Typography>
                <Typography variant="body2">{model.model_type}</Typography>
                <Typography variant="body2" color="text.secondary">Target:</Typography>
                <Typography variant="body2">
                  {model.target_direction?.toUpperCase()} {model.price_change_percent}% in {model.future_minutes}min
                </Typography>
                <Typography variant="body2" color="text.secondary">Features:</Typography>
                <Typography variant="body2">{model.features.length} features</Typography>
                {model.phases && model.phases.length > 0 && (
                  <>
                    <Typography variant="body2" color="text.secondary">Phases:</Typography>
                    <Typography variant="body2">{model.phases.join(', ')}</Typography>
                  </>
                )}
                <Typography variant="body2" color="text.secondary">Created:</Typography>
                <Typography variant="body2">
                  {model.created_at ? new Date(model.created_at).toLocaleString() : '-'}
                </Typography>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                Alert Configuration
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">Alert Threshold:</Typography>
                <Typography variant="body2">{(model.alert_threshold * 100).toFixed(0)}%</Typography>
                <Typography variant="body2" color="text.secondary">N8N Enabled:</Typography>
                <Typography variant="body2">{model.n8n_enabled ? 'Yes' : 'No'}</Typography>
                <Typography variant="body2" color="text.secondary">Webhook:</Typography>
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                  {model.n8n_webhook_url || 'Global'}
                </Typography>
                <Typography variant="body2" color="text.secondary">Coin Filter:</Typography>
                <Typography variant="body2">{model.coin_filter_mode}</Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => navigate(`/predictions/alerts/config/${modelId}`)}
                >
                  Edit Alert Config
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Feature list */}
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Features ({model.features.length})
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {model.features.map((f) => (
                <Chip key={f} label={f} size="small" variant="outlined" />
              ))}
            </Box>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab: Performance */}
      <TabPanel value={activeTab} index={1}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                Training Metrics
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">Accuracy:</Typography>
                <Typography variant="body2">{formatPct(model.accuracy)}</Typography>
                <Typography variant="body2" color="text.secondary">F1 Score:</Typography>
                <Typography variant="body2">{formatPct(model.f1_score)}</Typography>
                <Typography variant="body2" color="text.secondary">Precision:</Typography>
                <Typography variant="body2">{formatPct(model.precision)}</Typography>
                <Typography variant="body2" color="text.secondary">Recall:</Typography>
                <Typography variant="body2">{formatPct(model.recall)}</Typography>
                <Typography variant="body2" color="text.secondary">ROC AUC:</Typography>
                <Typography variant="body2">{formatPct(model.roc_auc)}</Typography>
                <Typography variant="body2" color="text.secondary">MCC:</Typography>
                <Typography variant="body2">{model.mcc !== undefined ? model.mcc.toFixed(3) : 'N/A'}</Typography>
              </Box>
            </CardContent>
          </Card>

          {alertStats && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                  Alert Performance
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">Total Alerts:</Typography>
                  <Typography variant="body2">{alertStats.total_alerts}</Typography>
                  <Typography variant="body2" color="text.secondary">Success:</Typography>
                  <Typography variant="body2" color="success.main">{alertStats.alerts_success || 0}</Typography>
                  <Typography variant="body2" color="text.secondary">Failed:</Typography>
                  <Typography variant="body2" color="error.main">{alertStats.alerts_failed || 0}</Typography>
                  <Typography variant="body2" color="text.secondary">Pending:</Typography>
                  <Typography variant="body2" color="warning.main">{alertStats.alerts_pending || 0}</Typography>
                  <Typography variant="body2" color="text.secondary">Success Rate:</Typography>
                  <Typography variant="body2">
                    {alertStats.alerts_success_rate !== undefined
                      ? `${alertStats.alerts_success_rate.toFixed(1)}%`
                      : 'N/A'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Net Performance:</Typography>
                  <Typography
                    variant="body2"
                    color={
                      (alertStats.total_performance_pct || 0) >= 0 ? 'success.main' : 'error.main'
                    }
                  >
                    {alertStats.total_performance_pct !== undefined
                      ? `${alertStats.total_performance_pct >= 0 ? '+' : ''}${alertStats.total_performance_pct.toFixed(1)}%`
                      : 'N/A'}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>

        {/* Quick links */}
        <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
          <Button variant="outlined" onClick={() => navigate(`/predictions/logs/${modelId}`)}>
            View Prediction Logs
          </Button>
          <Button variant="outlined" onClick={() => navigate('/predictions/alerts')}>
            View Alert System
          </Button>
        </Box>
      </TabPanel>

      {/* Tab: Configuration */}
      <TabPanel value={activeTab} index={2}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Current Configuration
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
              <Box>
                <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                  Alert Settings
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">Threshold:</Typography>
                  <Typography variant="body2">{(model.alert_threshold * 100).toFixed(0)}%</Typography>
                  <Typography variant="body2" color="text.secondary">N8N Enabled:</Typography>
                  <Typography variant="body2">{model.n8n_enabled ? 'Yes' : 'No'}</Typography>
                  <Typography variant="body2" color="text.secondary">Send Mode:</Typography>
                  <Typography variant="body2">
                    {Array.isArray(model.n8n_send_mode) ? model.n8n_send_mode.join(', ') : model.n8n_send_mode}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Filter Mode:</Typography>
                  <Typography variant="body2">{model.coin_filter_mode}</Typography>
                </Box>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                  Ignore Settings
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">Bad Coins:</Typography>
                  <Typography variant="body2">{model.ignore_bad_seconds}s</Typography>
                  <Typography variant="body2" color="text.secondary">Positive Coins:</Typography>
                  <Typography variant="body2">{model.ignore_positive_seconds}s</Typography>
                  <Typography variant="body2" color="text.secondary">Alert Coins:</Typography>
                  <Typography variant="body2">{model.ignore_alert_seconds}s</Typography>
                </Box>
              </Box>
            </Box>
            <Box sx={{ mt: 3 }}>
              <Button variant="contained" onClick={() => navigate(`/predictions/alerts/config/${modelId}`)}>
                Edit Configuration
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* JSON Export */}
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Raw Model Data (JSON)
            </Typography>
            <Box
              component="pre"
              sx={{
                p: 2,
                bgcolor: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 1,
                overflow: 'auto',
                maxHeight: 400,
                fontSize: '0.8rem',
              }}
            >
              {JSON.stringify(model, null, 2)}
            </Box>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete model?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete &quot;{modelName}&quot;? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} color="inherit">Cancel</Button>
          <Button
            onClick={() => { deleteMutation.mutate(); setDeleteDialogOpen(false); }}
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PredictionModelDetails;
