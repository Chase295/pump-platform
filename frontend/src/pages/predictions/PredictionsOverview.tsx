/**
 * PredictionsOverview Page
 * Grid of active prediction models with live stats.
 * Migrated from pump-server/frontend/src/pages/Overview.tsx
 */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Alert,
  Button,
  Chip,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  CircularProgress,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Refresh as RefreshIcon, Add as AddIcon } from '@mui/icons-material';

import { serverApi } from '../../services/api';
import ModelCard from '../../components/predictions/ModelCard';
import type { ServerModel, AlertStatistics } from '../../types/server';

const PredictionsOverview: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Load models
  const {
    data: modelsResponse,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['server', 'models'],
    queryFn: () => serverApi.listActiveModels(true),
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const models: ServerModel[] = modelsResponse?.data?.models || [];

  // Load alert statistics for all models in parallel
  const { data: alertStatsMap } = useQuery({
    queryKey: ['server', 'models', 'alert-stats', models.map((m) => m.id)],
    queryFn: async () => {
      if (models.length === 0) return {};
      const results = await Promise.all(
        models
          .filter((m) => m.id)
          .map(async (model) => {
            try {
              const res = await serverApi.getAlertStatistics({ model_id: model.id });
              return { modelId: model.id, stats: res.data as AlertStatistics };
            } catch {
              return { modelId: model.id, stats: null };
            }
          }),
      );
      const map: Record<number, AlertStatistics> = {};
      results.forEach(({ modelId, stats }) => {
        if (stats) map[modelId] = stats;
      });
      return map;
    },
    enabled: models.length > 0,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  // Enrich models with stats
  const modelsWithStats = useMemo(() => {
    if (!alertStatsMap) return models;
    return models.map((model) => ({
      ...model,
      alert_stats: alertStatsMap[model.id] || undefined,
    }));
  }, [models, alertStatsMap]);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<{ id: number; name: string } | null>(null);
  const [errorSnackbar, setErrorSnackbar] = useState<{ open: boolean; message: string }>({
    open: false,
    message: '',
  });

  // Delete model
  const deleteMutation = useMutation({
    mutationFn: (modelId: number) => serverApi.deleteModel(modelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', 'models'] });
      setDeleteDialogOpen(false);
      setModelToDelete(null);
    },
    onError: () => {
      setDeleteDialogOpen(false);
      setModelToDelete(null);
    },
  });

  // Toggle active
  const toggleActiveMutation = useMutation({
    mutationFn: ({ modelId, active }: { modelId: number; active: boolean }) =>
      active ? serverApi.deactivateModel(modelId) : serverApi.activateModel(modelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', 'models'] });
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail;
      let msg = 'Error toggling model status';
      if (detail?.includes('Modell-Datei nicht gefunden')) {
        msg = 'Model cannot be activated because the model file is missing. Please re-import.';
      } else if (detail) {
        msg = detail;
      }
      setErrorSnackbar({ open: true, message: msg });
    },
  });

  const handleToggleActive = (modelId: number, active: boolean) => {
    toggleActiveMutation.mutate({ modelId, active });
  };

  const handleDetailsClick = (modelId: number) => navigate(`/predictions/models/${modelId}`);
  const handleAlertConfigClick = (modelId: number) => navigate(`/predictions/alerts/config/${modelId}`);
  const handleLogsClick = (modelId: number) => navigate(`/predictions/logs/${modelId}`);

  const handleDeleteClick = (modelId: number, modelName: string) => {
    setModelToDelete({ id: modelId, name: modelName });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (modelToDelete) deleteMutation.mutate(modelToDelete.id);
  };

  // Stats
  const summaryStats = useMemo(() => {
    return {
      total: models.length,
      active: models.filter((m) => m.is_active).length,
      inactive: models.filter((m) => !m.is_active).length,
    };
  }, [models]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 3 }}>
          Error loading models: {(error as Error).message}
        </Alert>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => refetch()}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
            Models Overview
          </Typography>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => refetch()}
            disabled={isRefetching}
            size="small"
          >
            {isRefetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Box>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Manage your active prediction models for crypto price forecasting
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Chip label={`${summaryStats.total} Total`} color="primary" variant="outlined" />
          <Chip label={`${summaryStats.active} Active`} color="success" variant="filled" />
          <Chip label={`${summaryStats.inactive} Inactive`} color="default" variant="outlined" />
        </Box>
      </Box>

      {/* Models Grid */}
      {modelsWithStats.length === 0 ? (
        <Card sx={{ textAlign: 'center', py: 6 }}>
          <CardContent>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No models found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              No models have been imported yet.
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              size="large"
              onClick={() => navigate('/predictions/import')}
            >
              Import Model
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
            gap: 3,
          }}
        >
          {modelsWithStats.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              onDetailsClick={handleDetailsClick}
              onAlertConfigClick={handleAlertConfigClick}
              onLogsClick={handleLogsClick}
              onToggleActive={handleToggleActive}
              onDelete={handleDeleteClick}
              isActivating={toggleActiveMutation.isPending && toggleActiveMutation.variables?.modelId === model.id}
              isDeactivating={toggleActiveMutation.isPending && toggleActiveMutation.variables?.modelId === model.id}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === model.id}
            />
          ))}
        </Box>
      )}

      {/* Footer */}
      <Box sx={{ mt: 4, p: 2, backgroundColor: 'background.paper', borderRadius: 2 }}>
        <Typography variant="body2" color="text.secondary" align="center">
          Data auto-refreshes every 30 seconds | Last update: {new Date().toLocaleTimeString()}
        </Typography>
      </Box>

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onClose={() => { setDeleteDialogOpen(false); setModelToDelete(null); }}>
        <DialogTitle>Delete model?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;{modelToDelete?.name}&quot;? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteDialogOpen(false); setModelToDelete(null); }} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Error Snackbar */}
      <Snackbar
        open={errorSnackbar.open}
        autoHideDuration={8000}
        onClose={() => setErrorSnackbar({ open: false, message: '' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setErrorSnackbar({ open: false, message: '' })}
          severity="error"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {errorSnackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default PredictionsOverview;
