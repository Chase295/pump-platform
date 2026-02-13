import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Grid,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  CircularProgress,
} from '@mui/material';
import {
  ViewList as ModelsIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { trainingApi } from '../../services/api';
import ModelCard from '../../components/training/ModelCard';
import type { ModelResponse } from '../../types/training';

const TrainingOverview: React.FC = () => {
  const navigate = useNavigate();
  const [models, setModels] = useState<ModelResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<ModelResponse | null>(null);

  const fetchModels = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const resp = await trainingApi.listModels();
      setModels(Array.isArray(resp.data) ? resp.data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch models');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  // Filter and sort
  const filteredModels = useMemo(() => {
    let filtered = models;

    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((m) => m.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.model_type.toLowerCase().includes(q) ||
          m.id.toString().includes(q),
      );
    }

    filtered.sort((a, b) => {
      let aVal: any = a[sortBy as keyof ModelResponse];
      let bVal: any = b[sortBy as keyof ModelResponse];
      if (sortBy.includes('_at')) {
        aVal = new Date(aVal as string).getTime();
        bVal = new Date(bVal as string).getTime();
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return 0;
    });

    return filtered;
  }, [models, statusFilter, searchQuery, sortBy, sortOrder]);

  // Stats
  const stats = {
    total: models.length,
    ready: models.filter((m) => m.status === 'READY').length,
    training: models.filter((m) => m.status === 'TRAINING').length,
    failed: models.filter((m) => m.status === 'FAILED').length,
  };

  const handleDelete = async (modelId: number) => {
    const model = models.find((m) => m.id === modelId);
    if (model) {
      setModelToDelete(model);
      setDeleteDialogOpen(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!modelToDelete) return;
    try {
      await trainingApi.deleteModel(modelToDelete.id);
      setModels((prev) => prev.filter((m) => m.id !== modelToDelete.id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete model');
    } finally {
      setDeleteDialogOpen(false);
      setModelToDelete(null);
    }
  };

  const handleDownload = async (modelId: number) => {
    try {
      const resp = await trainingApi.downloadModel(modelId);
      const blob = new Blob([resp.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `model_${modelId}.pkl`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || 'Download failed');
    }
  };

  if (isLoading && models.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 2,
          mb: 3,
        }}
      >
        <Typography
          variant="h5"
          sx={{ color: '#00d4ff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <ModelsIcon /> Model Overview
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button startIcon={<RefreshIcon />} onClick={fetchModels} variant="outlined" disabled={isLoading}>
            Refresh
          </Button>
          <Button
            startIcon={<AddIcon />}
            onClick={() => navigate('/training/new')}
            variant="contained"
            sx={{ bgcolor: '#00d4ff' }}
          >
            Create Model
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total', value: stats.total, color: '#00d4ff', bgColor: 'rgba(0, 212, 255, 0.1)', borderColor: 'rgba(0, 212, 255, 0.3)' },
          { label: 'Ready', value: stats.ready, color: '#4caf50', bgColor: 'rgba(76, 175, 80, 0.1)', borderColor: 'rgba(76, 175, 80, 0.3)' },
          { label: 'Training', value: stats.training, color: '#ff9800', bgColor: 'rgba(255, 152, 0, 0.1)', borderColor: 'rgba(255, 152, 0, 0.3)' },
          { label: 'Failed', value: stats.failed, color: '#f44336', bgColor: 'rgba(244, 67, 54, 0.1)', borderColor: 'rgba(244, 67, 54, 0.3)' },
        ].map((s) => (
          <Grid size={{ xs: 6, md: 3 }} key={s.label}>
            <Box
              sx={{
                p: 2,
                bgcolor: s.bgColor,
                border: `1px solid ${s.borderColor}`,
                borderRadius: 1,
                textAlign: 'center',
              }}
            >
              <Typography variant="h4" sx={{ color: s.color }}>
                {s.value}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {s.label}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Box
        sx={{
          p: 2,
          mb: 3,
          bgcolor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 2,
        }}
      >
        <Typography
          variant="subtitle1"
          gutterBottom
          sx={{ color: '#00d4ff', display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <FilterIcon /> Filter & Search
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by name, type, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                endAdornment: searchQuery ? (
                  <IconButton size="small" onClick={() => setSearchQuery('')}>
                    <ClearIcon />
                  </IconButton>
                ) : null,
              }}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} label="Status">
                <MenuItem value="ALL">All</MenuItem>
                <MenuItem value="READY">Ready</MenuItem>
                <MenuItem value="TRAINING">Training</MenuItem>
                <MenuItem value="FAILED">Failed</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Sort by</InputLabel>
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} label="Sort by">
                <MenuItem value="created_at">Created</MenuItem>
                <MenuItem value="name">Name</MenuItem>
                <MenuItem value="training_accuracy">Accuracy</MenuItem>
                <MenuItem value="training_f1">F1-Score</MenuItem>
                <MenuItem value="training_precision">Precision</MenuItem>
                <MenuItem value="training_recall">Recall</MenuItem>
                <MenuItem value="roc_auc">ROC-AUC</MenuItem>
                <MenuItem value="mcc">MCC</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, md: 1 }}>
            <Button fullWidth variant="outlined" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
              {sortOrder === 'asc' ? 'ASC' : 'DESC'}
            </Button>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<ClearIcon />}
              onClick={() => {
                setStatusFilter('ALL');
                setSearchQuery('');
                setSortBy('created_at');
                setSortOrder('desc');
              }}
            >
              Reset
            </Button>
          </Grid>
        </Grid>
      </Box>

      {/* Results info */}
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        Showing {filteredModels.length} of {models.length} models
      </Typography>

      {/* Models Grid */}
      {filteredModels.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <ModelsIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="textSecondary">
            {models.length === 0 ? 'No models yet' : 'No models match filters'}
          </Typography>
          {models.length === 0 && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate('/training/new')}
              sx={{ mt: 2, bgcolor: '#00d4ff' }}
            >
              Create your first model
            </Button>
          )}
        </Box>
      ) : (
        <Grid container spacing={3}>
          {filteredModels.map((model) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={model.id}>
              <ModelCard
                model={model}
                onDetails={(id) => navigate(`/training/models/${id}`)}
                onDelete={handleDelete}
                onDownload={handleDownload}
                onTest={(id) => navigate(`/training/models/${id}`)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Model</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete model &quot;{modelToDelete?.name}&quot;? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TrainingOverview;
