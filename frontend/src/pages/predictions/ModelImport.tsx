/**
 * ModelImport Page
 * Import new models from the training service.
 * Migrated from pump-server/frontend/src/pages/ModelImport.tsx
 */
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Alert,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import {
  CloudDownload as ImportIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  Psychology as PsychologyIcon,
  Speed as SpeedIcon,
  BarChart as BarChartIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Timer as TimerIcon,
  Category as CategoryIcon,
  Layers as LayersIcon,
} from '@mui/icons-material';

import { serverApi } from '../../services/api';
import type { AvailableModel, ImportResponse } from '../../types/server';

const ModelImport: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedModel, setSelectedModel] = useState<AvailableModel | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  // Available models
  const { data: availableResponse, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['server', 'available-models'],
    queryFn: () => serverApi.listAvailableModels(),
  });

  const availableModels: AvailableModel[] = availableResponse?.data?.models || [];

  // Active models (to check already imported)
  const { data: activeResponse } = useQuery({
    queryKey: ['server', 'models'],
    queryFn: () => serverApi.listActiveModels(true),
  });

  const activeModels = activeResponse?.data?.models || [];

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (modelId: number) => serverApi.importModel(modelId),
    onSuccess: (res) => {
      const data = res.data as ImportResponse;
      setSnackbar({ open: true, message: data.message || 'Model imported successfully', severity: 'success' });
      setConfirmDialogOpen(false);
      setSelectedModel(null);
      queryClient.invalidateQueries({ queryKey: ['server', 'available-models'] });
      queryClient.invalidateQueries({ queryKey: ['server', 'models'] });
    },
    onError: (error: Error) => {
      setSnackbar({ open: true, message: `Import failed: ${error.message}`, severity: 'error' });
    },
  });

  const handleImportClick = (model: AvailableModel) => {
    setSelectedModel(model);
    setConfirmDialogOpen(true);
  };

  const handleConfirmImport = () => {
    if (selectedModel) importMutation.mutate(selectedModel.id);
  };

  const isAlreadyImported = (modelId: number) =>
    activeModels.some((m: any) => m.model_id === modelId);

  const formatPercentage = (value: number | undefined): string => {
    if (value === undefined || value === null) return 'N/A';
    return `${(value * 100).toFixed(1)}%`;
  };

  const getModelTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      random_forest: 'RF',
      xgboost: 'XGB',
      neural_network: 'NN',
      svm: 'SVM',
    };
    return labels[type] || type.toUpperCase();
  };

  const stats = useMemo(() => ({
    total: availableModels.length + activeModels.length,
    ready: availableModels.length,
    imported: activeModels.length,
  }), [availableModels, activeModels]);

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
          Error loading available models: {(error as Error).message}
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
            Model Import
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
          Import models from the training service into Pump Server
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Chip label={`${stats.total} Total`} color="primary" variant="outlined" />
          <Chip label={`${stats.ready} Available`} color="success" variant="filled" />
          <Chip label={`${stats.imported} Already imported`} color="default" variant="outlined" />
        </Box>
      </Box>

      {/* Models Grid */}
      {availableModels.length === 0 ? (
        <Card sx={{ textAlign: 'center', py: 6 }}>
          <CardContent>
            <InfoIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No models available
            </Typography>
            <Typography variant="body2" color="text.secondary">
              No new models available for import. New models appear after training.
            </Typography>
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
          {availableModels.map((model) => {
            const imported = isAlreadyImported(model.id);
            const isImporting = importMutation.isPending && selectedModel?.id === model.id;
            const directionColor = model.target_direction === 'up' ? 'success.main' : 'error.main';

            return (
              <Card
                key={model.id}
                variant="outlined"
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.3s ease',
                  background: imported
                    ? 'rgba(255, 255, 255, 0.02)'
                    : 'linear-gradient(135deg, rgba(76, 175, 80, 0.05) 0%, rgba(76, 175, 80, 0.02) 100%)',
                  border: `1px solid ${imported ? 'rgba(255, 255, 255, 0.1)' : 'rgba(76, 175, 80, 0.3)'}`,
                  opacity: imported ? 0.7 : 1,
                  position: 'relative',
                  overflow: 'hidden',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '3px',
                    background: imported
                      ? 'rgba(158, 158, 158, 0.5)'
                      : 'linear-gradient(90deg, #4caf50 0%, #66bb6a 100%)',
                  },
                  '&:hover': {
                    transform: imported ? 'none' : 'translateY(-4px)',
                    boxShadow: imported ? 'none' : '0 8px 24px rgba(76, 175, 80, 0.2)',
                  },
                }}
              >
                <CardContent sx={{ flexGrow: 1, p: 2.5 }}>
                  {/* Header */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: 2,
                          background: imported
                            ? 'rgba(158, 158, 158, 0.2)'
                            : 'linear-gradient(135deg, #4caf50 0%, #66bb6a 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <PsychologyIcon
                          sx={{ color: imported ? 'rgba(255,255,255,0.4)' : '#fff', fontSize: 28 }}
                        />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="h6"
                          sx={{
                            fontWeight: 700,
                            fontSize: '1.1rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {model.name}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Chip
                            label={getModelTypeLabel(model.model_type)}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              bgcolor: 'rgba(76, 175, 80, 0.15)',
                              color: 'success.main',
                              border: '1px solid rgba(76, 175, 80, 0.3)',
                            }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            ID: {model.id}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Box>

                  {/* Training metrics */}
                  <Box
                    sx={{
                      mb: 2,
                      p: 2,
                      background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.08) 0%, rgba(76, 175, 80, 0.03) 100%)',
                      borderRadius: 2,
                      border: '1px solid rgba(76, 175, 80, 0.2)',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        mb: 1.5,
                        display: 'block',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        color: 'success.main',
                      }}
                    >
                      Training Metrics
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <SpeedIcon fontSize="small" sx={{ color: 'success.main' }} />
                          <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>
                            {formatPercentage(model.training_accuracy)}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">Accuracy</Typography>
                      </Box>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <BarChartIcon fontSize="small" sx={{ color: 'info.main' }} />
                          <Typography variant="h6" sx={{ fontWeight: 700, color: 'info.main' }}>
                            {formatPercentage(model.training_f1)}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">F1-Score</Typography>
                      </Box>
                    </Box>
                  </Box>

                  {/* Target configuration */}
                  <Box
                    sx={{
                      mb: 2,
                      p: 2,
                      background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.08) 0%, rgba(0, 212, 255, 0.03) 100%)',
                      borderRadius: 2,
                      border: '1px solid rgba(0, 212, 255, 0.2)',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        mb: 1.5,
                        display: 'block',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        color: 'primary.main',
                      }}
                    >
                      Target Config
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          {model.target_direction === 'up' ? (
                            <TrendingUpIcon fontSize="small" sx={{ color: 'success.main' }} />
                          ) : (
                            <TrendingDownIcon fontSize="small" sx={{ color: 'error.main' }} />
                          )}
                          <Typography variant="h6" sx={{ fontWeight: 700, color: directionColor }}>
                            {model.target_direction?.toUpperCase()} {model.price_change_percent}%
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">Direction & Threshold</Typography>
                      </Box>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <TimerIcon fontSize="small" sx={{ color: 'primary.main' }} />
                          <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                            {model.future_minutes} min
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">Time Window</Typography>
                      </Box>
                    </Box>
                  </Box>

                  {/* Features & Phases */}
                  <Box
                    sx={{
                      mb: 2,
                      p: 1.5,
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: 2,
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 1,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CategoryIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      <Typography variant="body2" color="text.secondary">
                        {model.features.length} Features
                      </Typography>
                    </Box>
                    {model.phases && model.phases.length > 0 && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LayersIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          Phase {model.phases.join(', ')}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Action */}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      pt: 1.5,
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <Button
                      variant="contained"
                      size="small"
                      color={imported ? 'inherit' : 'success'}
                      startIcon={isImporting ? <CircularProgress size={16} color="inherit" /> : <ImportIcon />}
                      onClick={() => !imported && !isImporting && handleImportClick(model)}
                      disabled={imported || isImporting}
                      sx={{ fontWeight: 600 }}
                    >
                      {isImporting ? 'Importing...' : imported ? 'Already imported' : 'Import'}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* Footer */}
      <Box sx={{ mt: 4, p: 2, backgroundColor: 'background.paper', borderRadius: 2 }}>
        <Typography variant="body2" color="text.secondary" align="center">
          Models loaded from training service | Last update: {new Date().toLocaleTimeString()}
        </Typography>
      </Box>

      {/* Confirm Import Dialog */}
      <Dialog
        open={confirmDialogOpen}
        onClose={() => !importMutation.isPending && setConfirmDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Import Model</DialogTitle>
        <DialogContent>
          {selectedModel && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Import model <strong>{selectedModel.name}</strong>?
              </Typography>
              <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1, mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  Details:
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
                  <Typography variant="caption">Type: {getModelTypeLabel(selectedModel.model_type)}</Typography>
                  <Typography variant="caption">Accuracy: {formatPercentage(selectedModel.training_accuracy)}</Typography>
                  <Typography variant="caption">F1-Score: {formatPercentage(selectedModel.training_f1)}</Typography>
                  <Typography variant="caption">Features: {selectedModel.features.length}</Typography>
                  <Typography variant="caption">
                    Target: {selectedModel.target_direction?.toUpperCase()} {selectedModel.price_change_percent}%
                  </Typography>
                  <Typography variant="caption">Window: {selectedModel.future_minutes} min</Typography>
                </Box>
              </Box>
              <Alert severity="info">
                After import the model will be immediately available and can be activated in the overview.
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)} disabled={importMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmImport}
            variant="contained"
            color="success"
            disabled={importMutation.isPending}
            startIcon={importMutation.isPending ? <CircularProgress size={16} /> : <ImportIcon />}
          >
            {importMutation.isPending ? 'Importing...' : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
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

export default ModelImport;
