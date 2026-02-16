import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  Snackbar,
} from '@mui/material';
import {
  CompareArrows as CompareIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  EmojiEvents as TrophyIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { trainingApi } from '../../services/api';
import type { ComparisonResponse, ModelResponse, DataAvailability } from '../../types/training';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const formatDate = (date: string) => {
  try {
    return new Date(date).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return date;
  }
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

const formatPct = (v?: number) => {
  if (v === undefined || v === null) return 'N/A';
  return `${(v * 100).toFixed(1)}%`;
};

const medalColors: Record<number, string> = {
  0: '#FFD700', // Gold
  1: '#C0C0C0', // Silver
  2: '#CD7F32', // Bronze
};

const medalLabels: Record<number, string> = {
  0: '#1',
  1: '#2',
  2: '#3',
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
const Comparisons: React.FC = () => {
  const navigate = useNavigate();

  // Data
  const [comparisons, setComparisons] = useState<ComparisonResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [comparisonToDelete, setComparisonToDelete] = useState<ComparisonResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  // New Comparison dialog
  const [newCompareOpen, setNewCompareOpen] = useState(false);
  const [models, setModels] = useState<ModelResponse[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selectedModelIds, setSelectedModelIds] = useState<number[]>([]);
  const [compareStart, setCompareStart] = useState('');
  const [compareEnd, setCompareEnd] = useState('');
  const [dataAvailability, setDataAvailability] = useState<DataAvailability | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  // ------ Data loading ------
  const loadComparisons = async () => {
    try {
      setLoading(true);
      setError(null);
      const resp = await trainingApi.listComparisons();
      setComparisons(Array.isArray(resp.data) ? resp.data : []);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load comparisons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComparisons();
  }, []);

  // ------ Stats ------
  const stats = useMemo(() => {
    const total = comparisons.length;
    const withWinner = comparisons.filter((c) => c.winner_id).length;
    const uniqueModels = new Set(comparisons.flatMap((c) => c.model_ids ?? [c.model_a_id, c.model_b_id].filter(Boolean)));
    return { total, withWinner, uniqueModels: uniqueModels.size };
  }, [comparisons]);

  // ------ Filter & sort ------
  const filteredComparisons = useMemo(() => {
    let filtered = comparisons;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.id.toString().includes(q) ||
          (c.model_ids ?? []).some((id) => id.toString().includes(q)),
      );
    }

    filtered = [...filtered].sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortBy) {
        case 'models_count':
          aVal = (a.model_ids ?? []).length;
          bVal = (b.model_ids ?? []).length;
          break;
        default:
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
      }
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  }, [comparisons, searchQuery, sortBy, sortOrder]);

  // ------ Delete ------
  const handleDeleteConfirm = async () => {
    if (!comparisonToDelete) return;
    try {
      setDeleting(true);
      await trainingApi.deleteComparison(comparisonToDelete.id);
      setComparisons((prev) => prev.filter((c) => c.id !== comparisonToDelete.id));
      setSnackbar({ open: true, message: `Comparison #${comparisonToDelete.id} deleted`, severity: 'success' });
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Failed to delete', severity: 'error' });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setComparisonToDelete(null);
    }
  };

  // ------ New Comparison dialog ------
  const openNewCompareDialog = async () => {
    setNewCompareOpen(true);
    setSelectedModelIds([]);
    setCompareStart('');
    setCompareEnd('');
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

  const handleToggleModel = (id: number) => {
    setSelectedModelIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev; // max 4
      return [...prev, id];
    });
  };

  const handleSubmitCompare = async () => {
    if (selectedModelIds.length < 2 || !compareStart || !compareEnd) return;
    try {
      setSubmitting(true);
      await trainingApi.compareModels(selectedModelIds, { test_start: new Date(compareStart).toISOString(), test_end: new Date(compareEnd).toISOString() });
      setSnackbar({ open: true, message: 'Comparison job started successfully!', severity: 'success' });
      setNewCompareOpen(false);
      loadComparisons();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.detail || 'Failed to start comparison', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ------ Render ------
  if (loading && comparisons.length === 0) {
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
          <CompareIcon /> Comparisons
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<AddIcon />} onClick={openNewCompareDialog} variant="contained" sx={{ bgcolor: '#00d4ff', '&:hover': { bgcolor: '#00b8d9' } }}>
            New Comparison
          </Button>
          <Button startIcon={<RefreshIcon />} onClick={loadComparisons} variant="outlined" disabled={loading}>
            Refresh
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total', value: stats.total, color: '#00d4ff', bgColor: 'rgba(0, 212, 255, 0.1)', borderColor: 'rgba(0, 212, 255, 0.3)' },
          { label: 'With Winner', value: stats.withWinner, color: '#4caf50', bgColor: 'rgba(76, 175, 80, 0.1)', borderColor: 'rgba(76, 175, 80, 0.3)' },
          { label: 'Unique Models', value: stats.uniqueModels, color: '#ff9800', bgColor: 'rgba(255, 152, 0, 0.1)', borderColor: 'rgba(255, 152, 0, 0.3)' },
        ].map((s) => (
          <Grid size={{ xs: 12, sm: 4 }} key={s.label}>
            <Box sx={{ p: 2, bgcolor: s.bgColor, border: `1px solid ${s.borderColor}`, borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="h4" sx={{ color: s.color, fontFamily: 'monospace' }}>{s.value}</Typography>
              <Typography variant="caption" color="textSecondary">{s.label}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Filter & Search */}
      <Box sx={{ p: 2, mb: 3, bgcolor: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)', borderRadius: 2 }}>
        <Typography variant="subtitle2" gutterBottom sx={{ color: '#00d4ff', display: 'flex', alignItems: 'center', gap: 1 }}>
          <FilterIcon fontSize="small" /> Filter & Search
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by comparison ID or model ID..."
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
          <Grid size={{ xs: 6, md: 2.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Sort by</InputLabel>
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} label="Sort by">
                <MenuItem value="created_at">Date</MenuItem>
                <MenuItem value="models_count">Models Count</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, md: 1.5 }}>
            <Button fullWidth variant="outlined" size="small" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')} sx={{ height: 40 }}>
              {sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
            </Button>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Button
              fullWidth
              variant="outlined"
              size="small"
              startIcon={<ClearIcon />}
              onClick={() => { setSearchQuery(''); setSortBy('created_at'); setSortOrder('desc'); }}
              sx={{ height: 40 }}
            >
              Reset
            </Button>
          </Grid>
        </Grid>
      </Box>

      {/* Results info */}
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        Showing {filteredComparisons.length} of {comparisons.length} comparisons
      </Typography>

      {/* Comparisons Grid */}
      {filteredComparisons.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <CompareIcon sx={{ fontSize: 64, color: 'rgba(0, 212, 255, 0.3)', mb: 2 }} />
          <Typography variant="h6" color="textSecondary">
            {comparisons.length === 0 ? 'No comparisons yet' : 'No comparisons match filters'}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1, mb: 3 }}>
            {comparisons.length === 0 ? 'Compare models to find the best performer.' : 'Try adjusting your search.'}
          </Typography>
          {comparisons.length === 0 && (
            <Button startIcon={<AddIcon />} variant="contained" onClick={openNewCompareDialog} sx={{ bgcolor: '#00d4ff', '&:hover': { bgcolor: '#00b8d9' } }}>
              Compare Your First Models
            </Button>
          )}
        </Box>
      ) : (
        <Grid container spacing={3}>
          {filteredComparisons.map((comparison) => {
            const sortedResults = comparison.results
              ? [...comparison.results].sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0))
              : [];

            return (
              <Grid size={{ xs: 12, md: 6 }} key={comparison.id}>
                <Box sx={cardSx} onClick={() => navigate(`/training/comparisons/${comparison.id}`)}>
                  {/* Card Header */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                    <Box>
                      <Typography variant="subtitle1" fontWeight="bold" sx={{ color: '#fff', mb: 0.5 }}>
                        Comparison #{comparison.id}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(comparison.created_at)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                      {comparison.winner_id && (
                        <Chip
                          icon={<TrophyIcon />}
                          label={`Winner: #${comparison.winner_id}`}
                          size="small"
                          sx={{ bgcolor: 'rgba(76, 175, 80, 0.15)', color: '#4caf50', '& .MuiChip-icon': { color: '#4caf50' } }}
                        />
                      )}
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => { e.stopPropagation(); setComparisonToDelete(comparison); setDeleteDialogOpen(true); }}
                        sx={{ ml: 0.5 }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* Models chips */}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                    {(comparison.model_ids ?? [comparison.model_a_id, comparison.model_b_id].filter(Boolean)).map((mid) => (
                      <Chip
                        key={mid}
                        label={`Model #${mid}`}
                        size="small"
                        sx={{
                          bgcolor: mid === comparison.winner_id ? 'rgba(76, 175, 80, 0.15)' : 'rgba(0, 212, 255, 0.1)',
                          color: mid === comparison.winner_id ? '#4caf50' : '#00d4ff',
                          fontFamily: 'monospace',
                          fontSize: '0.7rem',
                        }}
                      />
                    ))}
                  </Box>

                  {/* Ranking rows */}
                  {sortedResults.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      {sortedResults.slice(0, 4).map((result, idx) => (
                        <Box
                          key={result.model_id}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            py: 0.75,
                            px: 1,
                            mb: 0.5,
                            borderRadius: 1,
                            bgcolor: result.model_id === comparison.winner_id
                              ? 'rgba(76, 175, 80, 0.08)'
                              : 'rgba(255,255,255,0.02)',
                          }}
                        >
                          {/* Medal */}
                          <Box sx={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: idx < 3 ? `${medalColors[idx]}22` : 'rgba(255,255,255,0.05)',
                            color: idx < 3 ? medalColors[idx] : 'text.secondary',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}>
                            {medalLabels[idx] ?? `#${idx + 1}`}
                          </Box>

                          {/* Model ID */}
                          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 60 }}>
                            Model #{result.model_id}
                          </Typography>

                          {/* Inline metrics */}
                          <Box sx={{ display: 'flex', gap: 1.5, flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {[
                              { label: 'Acc', value: result.accuracy },
                              { label: 'F1', value: result.f1_score },
                              { label: 'Profit', value: result.simulated_profit_pct, isProfit: true },
                              { label: 'Score', value: result.avg_score },
                            ].map((m) => (
                              <Typography key={m.label} variant="caption" sx={{ fontFamily: 'monospace', color: m.isProfit && m.value != null ? (m.value > 0 ? '#4caf50' : '#f44336') : 'text.secondary' }}>
                                {m.label}: <strong>{m.value != null ? (m.isProfit ? `${m.value > 0 ? '+' : ''}${m.value.toFixed(1)}%` : formatPct(m.value)) : 'N/A'}</strong>
                              </Typography>
                            ))}
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}

                  {/* Winner reason */}
                  {comparison.winner_reason && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 2, fontSize: '0.8rem' }}>
                      {comparison.winner_reason}
                    </Typography>
                  )}

                  {/* Footer */}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <Typography variant="caption" color="text.secondary">
                      Period: {formatDate(comparison.test_start)} – {formatDate(comparison.test_end)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      Duration: {formatDuration(comparison.test_start, comparison.test_end)}
                    </Typography>
                    {comparison.num_samples && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        Samples: {comparison.num_samples.toLocaleString()}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* ---- Delete Dialog ---- */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} PaperProps={dialogPaperProps}>
        <DialogTitle>Delete Comparison</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete comparison #{comparisonToDelete?.id}? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteDialogOpen(false); setComparisonToDelete(null); }}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={deleting}>
            {deleting ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---- New Comparison Dialog ---- */}
      <Dialog open={newCompareOpen} onClose={() => setNewCompareOpen(false)} PaperProps={dialogPaperProps} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: '#00d4ff' }}>New Comparison</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '16px !important' }}>
          {modelsLoading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress sx={{ color: '#00d4ff' }} /></Box>
          ) : models.length < 2 ? (
            <Alert severity="warning">Need at least 2 READY models. Currently {models.length} available.</Alert>
          ) : (
            <>
              {/* Model multi-select */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                  Select Models (min 2, max 4) — {selectedModelIds.length} selected
                </Typography>
                <Box sx={{ maxHeight: 200, overflow: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1 }}>
                  {models.map((m) => (
                    <Box
                      key={m.id}
                      onClick={() => handleToggleModel(m.id)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        px: 1.5,
                        py: 0.75,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)' },
                        bgcolor: selectedModelIds.includes(m.id) ? 'rgba(0, 212, 255, 0.08)' : 'transparent',
                      }}
                    >
                      <Checkbox
                        checked={selectedModelIds.includes(m.id)}
                        size="small"
                        sx={{ p: 0.5, mr: 1, color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#00d4ff' } }}
                        disabled={!selectedModelIds.includes(m.id) && selectedModelIds.length >= 4}
                      />
                      <ListItemText
                        primary={`#${m.id} — ${m.name}`}
                        secondary={m.model_type}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>

              {/* Selected chips */}
              {selectedModelIds.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selectedModelIds.map((id) => {
                    const m = models.find((x) => x.id === id);
                    return (
                      <Chip
                        key={id}
                        label={`#${id} ${m?.name ?? ''}`}
                        size="small"
                        onDelete={() => handleToggleModel(id)}
                        sx={{ bgcolor: 'rgba(0, 212, 255, 0.15)', color: '#00d4ff' }}
                      />
                    );
                  })}
                </Box>
              )}

              {/* Date range */}
              <TextField
                label="Test Start"
                type="datetime-local"
                fullWidth
                value={compareStart}
                onChange={(e) => setCompareStart(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Test End"
                type="datetime-local"
                fullWidth
                value={compareEnd}
                onChange={(e) => setCompareEnd(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />

              {/* Data availability */}
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
          <Button onClick={() => setNewCompareOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmitCompare}
            variant="contained"
            disabled={submitting || selectedModelIds.length < 2 || !compareStart || !compareEnd}
            sx={{ bgcolor: '#00d4ff', '&:hover': { bgcolor: '#00b8d9' } }}
          >
            {submitting ? <CircularProgress size={20} /> : 'Start Comparison'}
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

export default Comparisons;
