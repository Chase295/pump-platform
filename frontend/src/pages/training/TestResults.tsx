import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  TextField,
  IconButton,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
} from '@mui/material';
import {
  Assessment as TestResultsIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { trainingApi } from '../../services/api';
import type { TestResultResponse, ModelResponse, DataAvailability } from '../../types/training';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const formatDate = (d: string) => {
  try {
    return new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d;
  }
};

const formatPct = (v?: number) => {
  if (v === undefined || v === null) return 'N/A';
  return `${(v * 100).toFixed(2)}%`;
};

const getAccuracyColor = (acc?: number) => {
  if (acc === undefined || acc === null) return 'text.secondary';
  if (acc >= 0.7) return '#4caf50';
  if (acc >= 0.5) return '#ff9800';
  return '#f44336';
};

const formatDuration = (start: string, end: string) => {
  try {
    const hours = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60);
    if (hours >= 24) return `${(hours / 24).toFixed(1)}d`;
    return `${hours.toFixed(1)}h`;
  } catch {
    return 'N/A';
  }
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const cardSx = {
  p: 2.5,
  bgcolor: 'rgba(0, 212, 255, 0.03)',
  border: '1px solid rgba(0, 212, 255, 0.15)',
  borderRadius: 2,
  transition: 'all 0.2s',
  cursor: 'pointer',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 32px rgba(0, 212, 255, 0.2)',
    borderColor: 'rgba(0, 212, 255, 0.4)',
  },
};

const dialogPaperProps = {
  sx: { bgcolor: '#1a1a2e', border: '1px solid rgba(0, 212, 255, 0.2)', minWidth: 480 },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const TestResults: React.FC = () => {
  const navigate = useNavigate();

  // Data
  const [results, setResults] = useState<TestResultResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [performanceFilter, setPerformanceFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resultToDelete, setResultToDelete] = useState<TestResultResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  // New Test dialog
  const [newTestOpen, setNewTestOpen] = useState(false);
  const [models, setModels] = useState<ModelResponse[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<number | ''>('');
  const [testStart, setTestStart] = useState('');
  const [testEnd, setTestEnd] = useState('');
  const [dataAvailability, setDataAvailability] = useState<DataAvailability | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  // ------ Data loading ------
  const loadTestResults = async () => {
    try {
      setLoading(true);
      setError(null);
      const resp = await trainingApi.listTestResults();
      setResults(Array.isArray(resp.data) ? resp.data : []);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load test results');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTestResults();
  }, []);

  // ------ Stats ------
  const stats = useMemo(() => {
    const total = results.length;
    const excellent = results.filter((r) => (r.accuracy ?? 0) >= 0.7).length;
    const good = results.filter((r) => (r.accuracy ?? 0) >= 0.5 && (r.accuracy ?? 0) < 0.7).length;
    const poor = results.filter((r) => (r.accuracy ?? 0) < 0.5).length;
    const overfitted = results.filter((r) => r.is_overfitted).length;
    return { total, excellent, good, poor, overfitted };
  }, [results]);

  // ------ Filter & sort ------
  const filteredResults = useMemo(() => {
    let filtered = results;

    if (performanceFilter !== 'ALL') {
      switch (performanceFilter) {
        case 'EXCELLENT':
          filtered = filtered.filter((r) => (r.accuracy ?? 0) >= 0.7);
          break;
        case 'GOOD':
          filtered = filtered.filter((r) => (r.accuracy ?? 0) >= 0.5 && (r.accuracy ?? 0) < 0.7);
          break;
        case 'POOR':
          filtered = filtered.filter((r) => (r.accuracy ?? 0) < 0.5);
          break;
        case 'OVERFITTED':
          filtered = filtered.filter((r) => r.is_overfitted);
          break;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          (r.model_name || `ID ${r.model_id}`).toLowerCase().includes(q) ||
          r.id.toString().includes(q),
      );
    }

    filtered = [...filtered].sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortBy) {
        case 'accuracy':
          aVal = a.accuracy ?? 0;
          bVal = b.accuracy ?? 0;
          break;
        case 'f1':
          aVal = a.f1_score ?? 0;
          bVal = b.f1_score ?? 0;
          break;
        case 'profit':
          aVal = a.simulated_profit_pct ?? 0;
          bVal = b.simulated_profit_pct ?? 0;
          break;
        default:
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
      }
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  }, [results, performanceFilter, searchQuery, sortBy, sortOrder]);

  // ------ Delete ------
  const handleDeleteConfirm = async () => {
    if (!resultToDelete) return;
    try {
      setDeleting(true);
      await trainingApi.deleteTestResult(resultToDelete.id);
      setResults((prev) => prev.filter((r) => r.id !== resultToDelete.id));
      setSnackbar({ open: true, message: `Test result #${resultToDelete.id} deleted`, severity: 'success' });
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Failed to delete', severity: 'error' });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setResultToDelete(null);
    }
  };

  // ------ New Test dialog ------
  const openNewTestDialog = async () => {
    setNewTestOpen(true);
    setSelectedModelId('');
    setTestStart('');
    setTestEnd('');
    setModelsLoading(true);
    try {
      const [modelsResp, dataResp] = await Promise.all([
        trainingApi.listModels({ status: 'READY' }),
        trainingApi.getDataAvailability(),
      ]);
      setModels(Array.isArray(modelsResp.data) ? modelsResp.data : []);
      setDataAvailability(dataResp.data || null);
    } catch {
      setModels([]);
      setDataAvailability(null);
    } finally {
      setModelsLoading(false);
    }
  };

  const handleSubmitTest = async () => {
    if (!selectedModelId || !testStart || !testEnd) return;
    try {
      setSubmitting(true);
      await trainingApi.testModel(selectedModelId as number, { test_start: new Date(testStart).toISOString(), test_end: new Date(testEnd).toISOString() });
      setSnackbar({ open: true, message: 'Test job started successfully!', severity: 'success' });
      setNewTestOpen(false);
      loadTestResults();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Failed to start test', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedModel = models.find((m) => m.id === selectedModelId);

  // ------ Render ------
  if (loading && results.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress sx={{ color: '#00d4ff' }} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 2, mb: 3 }}>
        <Typography variant="h5" sx={{ color: '#00d4ff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
          <TestResultsIcon /> Test Results
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<AddIcon />} onClick={openNewTestDialog} variant="contained" sx={{ bgcolor: '#00d4ff', '&:hover': { bgcolor: '#00b8d9' } }}>
            New Test
          </Button>
          <Button startIcon={<RefreshIcon />} onClick={loadTestResults} variant="outlined" disabled={loading}>
            Refresh
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total', value: stats.total, color: '#00d4ff', bgColor: 'rgba(0, 212, 255, 0.1)', borderColor: 'rgba(0, 212, 255, 0.3)' },
          { label: 'Excellent (≥70%)', value: stats.excellent, color: '#4caf50', bgColor: 'rgba(76, 175, 80, 0.1)', borderColor: 'rgba(76, 175, 80, 0.3)' },
          { label: 'Good (50-70%)', value: stats.good, color: '#ff9800', bgColor: 'rgba(255, 152, 0, 0.1)', borderColor: 'rgba(255, 152, 0, 0.3)' },
          { label: 'Poor (<50%)', value: stats.poor, color: '#f44336', bgColor: 'rgba(244, 67, 54, 0.1)', borderColor: 'rgba(244, 67, 54, 0.3)' },
          { label: 'Overfitted', value: stats.overfitted, color: '#e040fb', bgColor: 'rgba(224, 64, 251, 0.1)', borderColor: 'rgba(224, 64, 251, 0.3)' },
        ].map((s) => (
          <Grid size={{ xs: 6, sm: 4, md: 2.4 }} key={s.label}>
            <Box sx={{ p: 2, bgcolor: s.bgColor, border: `1px solid ${s.borderColor}`, borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="h4" sx={{ color: s.color, fontFamily: 'monospace' }}>{s.value}</Typography>
              <Typography variant="caption" color="textSecondary">{s.label}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Box sx={{ p: 2, mb: 3, bgcolor: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)', borderRadius: 2 }}>
        <Typography variant="subtitle2" gutterBottom sx={{ color: '#00d4ff', display: 'flex', alignItems: 'center', gap: 1 }}>
          <FilterIcon fontSize="small" /> Filter & Search
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by model name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                endAdornment: searchQuery ? (
                  <IconButton size="small" onClick={() => setSearchQuery('')}><ClearIcon /></IconButton>
                ) : null,
              }}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Performance</InputLabel>
              <Select value={performanceFilter} onChange={(e) => setPerformanceFilter(e.target.value)} label="Performance">
                <MenuItem value="ALL">All</MenuItem>
                <MenuItem value="EXCELLENT">Excellent (≥70%)</MenuItem>
                <MenuItem value="GOOD">Good (50-70%)</MenuItem>
                <MenuItem value="POOR">Poor (&lt;50%)</MenuItem>
                <MenuItem value="OVERFITTED">Overfitted</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Sort by</InputLabel>
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} label="Sort by">
                <MenuItem value="created_at">Date</MenuItem>
                <MenuItem value="accuracy">Accuracy</MenuItem>
                <MenuItem value="f1">F1 Score</MenuItem>
                <MenuItem value="profit">Profit</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, md: 1.5 }}>
            <Button fullWidth variant="outlined" size="small" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')} sx={{ height: 40 }}>
              {sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
            </Button>
          </Grid>
          <Grid size={{ xs: 6, md: 2.5 }}>
            <Button
              fullWidth
              variant="outlined"
              size="small"
              startIcon={<ClearIcon />}
              onClick={() => { setPerformanceFilter('ALL'); setSearchQuery(''); setSortBy('created_at'); setSortOrder('desc'); }}
              sx={{ height: 40 }}
            >
              Reset
            </Button>
          </Grid>
        </Grid>
      </Box>

      {/* Results info */}
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        Showing {filteredResults.length} of {results.length} test results
      </Typography>

      {/* Results Grid */}
      {filteredResults.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <TestResultsIcon sx={{ fontSize: 64, color: 'rgba(0, 212, 255, 0.3)', mb: 2 }} />
          <Typography variant="h6" color="textSecondary">
            {results.length === 0 ? 'No test results yet' : 'No results match filters'}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1, mb: 3 }}>
            {results.length === 0 ? 'Run your first test to evaluate model performance.' : 'Try adjusting your search or filters.'}
          </Typography>
          {results.length === 0 && (
            <Button startIcon={<AddIcon />} variant="contained" onClick={openNewTestDialog} sx={{ bgcolor: '#00d4ff', '&:hover': { bgcolor: '#00b8d9' } }}>
              Run Your First Test
            </Button>
          )}
        </Box>
      ) : (
        <Grid container spacing={3}>
          {filteredResults.map((result) => (
            <Grid size={{ xs: 12, md: 6 }} key={result.id}>
              <Box sx={cardSx} onClick={() => navigate(`/training/test-results/${result.id}`)}>
                {/* Card Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography variant="subtitle1" fontWeight="bold" sx={{ color: '#fff' }}>
                        Test #{result.id}
                      </Typography>
                      {result.model_name && (
                        <Chip label={result.model_name} size="small" sx={{ bgcolor: 'rgba(0, 212, 255, 0.15)', color: '#00d4ff', fontSize: '0.7rem' }} />
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Model #{result.model_id}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    {result.has_overlap && (
                      <Chip icon={<WarningIcon />} label="Overlap" size="small" sx={{ bgcolor: 'rgba(255, 152, 0, 0.15)', color: '#ff9800', '& .MuiChip-icon': { color: '#ff9800' } }} />
                    )}
                    {result.is_overfitted && (
                      <Chip label="Overfitted" size="small" sx={{ bgcolor: 'rgba(224, 64, 251, 0.15)', color: '#e040fb' }} />
                    )}
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => { e.stopPropagation(); setResultToDelete(result); setDeleteDialogOpen(true); }}
                      sx={{ ml: 0.5 }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>

                {/* 6-Metric Grid */}
                <Grid container spacing={1} sx={{ mb: 2 }}>
                  {[
                    { label: 'Accuracy', value: result.accuracy, format: formatPct, colorFn: getAccuracyColor },
                    { label: 'F1 Score', value: result.f1_score, format: formatPct, colorFn: getAccuracyColor },
                    { label: 'Precision', value: result.precision_score, format: formatPct, colorFn: getAccuracyColor },
                    { label: 'Recall', value: result.recall, format: formatPct, colorFn: getAccuracyColor },
                    { label: 'ROC-AUC', value: result.roc_auc, format: formatPct, colorFn: getAccuracyColor },
                    { label: 'MCC', value: result.mcc, format: (v?: number) => v !== undefined && v !== null ? v.toFixed(3) : 'N/A', colorFn: (v?: number) => v !== undefined && v !== null ? (v >= 0.4 ? '#4caf50' : v >= 0.2 ? '#ff9800' : '#f44336') : 'text.secondary' },
                  ].map((m) => (
                    <Grid size={4} key={m.label}>
                      <Box sx={{ textAlign: 'center', p: 0.75, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>{m.label}</Typography>
                        <Typography variant="body2" sx={{ color: m.colorFn(m.value), fontFamily: 'monospace', fontWeight: 600 }}>
                          {m.format(m.value)}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>

                {/* Confusion Matrix Mini + Profit */}
                <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                  {/* Mini Confusion Matrix */}
                  {(result.tp !== undefined || result.confusion_matrix) && (
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', width: 100, flexShrink: 0 }}>
                      {[
                        { label: 'TP', value: result.tp ?? result.confusion_matrix?.tp, color: '#4caf50', bg: 'rgba(76, 175, 80, 0.15)' },
                        { label: 'FP', value: result.fp ?? result.confusion_matrix?.fp, color: '#f44336', bg: 'rgba(244, 67, 54, 0.15)' },
                        { label: 'FN', value: result.fn ?? result.confusion_matrix?.fn, color: '#ff9800', bg: 'rgba(255, 152, 0, 0.15)' },
                        { label: 'TN', value: result.tn ?? result.confusion_matrix?.tn, color: '#4caf50', bg: 'rgba(76, 175, 80, 0.15)' },
                      ].map((cell) => (
                        <Box key={cell.label} sx={{ bgcolor: cell.bg, borderRadius: 0.5, p: 0.5, textAlign: 'center' }}>
                          <Typography sx={{ fontSize: '0.6rem', color: cell.color, fontWeight: 600 }}>{cell.label}</Typography>
                          <Typography sx={{ fontSize: '0.7rem', color: cell.color, fontFamily: 'monospace' }}>{cell.value ?? '-'}</Typography>
                        </Box>
                      ))}
                    </Box>
                  )}

                  {/* Profit */}
                  {result.simulated_profit_pct !== undefined && result.simulated_profit_pct !== null && (
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">Simulated Profit</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {result.simulated_profit_pct > 0 ? (
                          <ArrowUpIcon sx={{ color: '#4caf50', fontSize: 20 }} />
                        ) : (
                          <ArrowDownIcon sx={{ color: '#f44336', fontSize: 20 }} />
                        )}
                        <Typography
                          variant="h6"
                          sx={{
                            color: result.simulated_profit_pct > 0 ? '#4caf50' : '#f44336',
                            fontWeight: 700,
                            fontFamily: 'monospace',
                          }}
                        >
                          {result.simulated_profit_pct > 0 ? '+' : ''}{result.simulated_profit_pct.toFixed(2)}%
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </Box>

                {/* Footer: Period, Duration, Samples */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <Typography variant="caption" color="text.secondary">
                    Period: {formatDate(result.test_start)} – {formatDate(result.test_end)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    Duration: {formatDuration(result.test_start, result.test_end)}
                  </Typography>
                  {result.num_samples && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      Samples: {result.num_samples.toLocaleString()}
                    </Typography>
                  )}
                </Box>
              </Box>
            </Grid>
          ))}
        </Grid>
      )}

      {/* ---- Delete Dialog ---- */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} PaperProps={dialogPaperProps}>
        <DialogTitle>Delete Test Result</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete test result #{resultToDelete?.id}? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteDialogOpen(false); setResultToDelete(null); }}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={deleting}>
            {deleting ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---- New Test Dialog ---- */}
      <Dialog open={newTestOpen} onClose={() => setNewTestOpen(false)} PaperProps={dialogPaperProps} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: '#00d4ff' }}>New Test</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '16px !important' }}>
          {modelsLoading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress sx={{ color: '#00d4ff' }} /></Box>
          ) : models.length === 0 ? (
            <Alert severity="warning">No READY models found. Train a model first.</Alert>
          ) : (
            <>
              {/* Model select */}
              <FormControl fullWidth>
                <InputLabel>Model</InputLabel>
                <Select
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value as number)}
                  label="Model"
                >
                  {models.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      #{m.id} — {m.name} ({m.model_type})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Selected model info */}
              {selectedModel && (
                <Box sx={{ p: 1.5, bgcolor: 'rgba(0, 212, 255, 0.05)', borderRadius: 1, border: '1px solid rgba(0, 212, 255, 0.1)' }}>
                  <Typography variant="caption" color="text.secondary">
                    Type: <strong>{selectedModel.model_type}</strong> &nbsp;|&nbsp;
                    Train Period: {formatDate(selectedModel.train_start)} – {formatDate(selectedModel.train_end)} &nbsp;|&nbsp;
                    Features: {selectedModel.features?.length ?? 0}
                  </Typography>
                </Box>
              )}

              {/* Date range */}
              <TextField
                label="Test Start"
                type="datetime-local"
                fullWidth
                value={testStart}
                onChange={(e) => setTestStart(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Test End"
                type="datetime-local"
                fullWidth
                value={testEnd}
                onChange={(e) => setTestEnd(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />

              {/* Data availability info */}
              {dataAvailability && (
                <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <Typography variant="caption" color="text.secondary">
                    Data available: {formatDate(dataAvailability.min_timestamp)} – {formatDate(dataAvailability.max_timestamp)}
                    &nbsp;({dataAvailability.total_records?.toLocaleString() ?? '?'} records)
                  </Typography>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewTestOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmitTest}
            variant="contained"
            disabled={submitting || !selectedModelId || !testStart || !testEnd}
            sx={{ bgcolor: '#00d4ff', '&:hover': { bgcolor: '#00b8d9' } }}
          >
            {submitting ? <CircularProgress size={20} /> : 'Start Test'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TestResults;
