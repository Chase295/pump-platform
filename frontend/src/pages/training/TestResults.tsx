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
  Card,
  CardContent,
  CardActions,
} from '@mui/material';
import {
  Assessment as TestResultsIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { trainingApi } from '../../services/api';
import type { TestResultResponse } from '../../types/training';

const TestResults: React.FC = () => {
  const navigate = useNavigate();
  const [results, setResults] = useState<TestResultResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [performanceFilter, setPerformanceFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resultToDelete, setResultToDelete] = useState<TestResultResponse | null>(null);

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

  // Stats
  const stats = useMemo(() => {
    const total = results.length;
    const excellent = results.filter((r) => (r.accuracy ?? 0) >= 0.7).length;
    const good = results.filter((r) => (r.accuracy ?? 0) >= 0.5 && (r.accuracy ?? 0) < 0.7).length;
    const poor = results.filter((r) => (r.accuracy ?? 0) < 0.5).length;
    return { total, excellent, good, poor };
  }, [results]);

  // Filter and sort
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

    filtered.sort((a, b) => {
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

  const handleDeleteConfirm = async () => {
    if (!resultToDelete) return;
    try {
      // Note: If the API supports deleting test results individually, call it here.
      // For now, just remove from local state.
      setResults((prev) => prev.filter((r) => r.id !== resultToDelete.id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
    }
    setDeleteDialogOpen(false);
    setResultToDelete(null);
  };

  if (loading && results.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
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
        <Button startIcon={<RefreshIcon />} onClick={loadTestResults} variant="outlined" disabled={loading}>
          Refresh
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total', value: stats.total, color: '#00d4ff', bgColor: 'rgba(0, 212, 255, 0.1)', borderColor: 'rgba(0, 212, 255, 0.3)' },
          { label: 'Excellent', value: stats.excellent, color: '#4caf50', bgColor: 'rgba(76, 175, 80, 0.1)', borderColor: 'rgba(76, 175, 80, 0.3)' },
          { label: 'Good', value: stats.good, color: '#ff9800', bgColor: 'rgba(255, 152, 0, 0.1)', borderColor: 'rgba(255, 152, 0, 0.3)' },
          { label: 'Poor', value: stats.poor, color: '#f44336', bgColor: 'rgba(244, 67, 54, 0.1)', borderColor: 'rgba(244, 67, 54, 0.3)' },
        ].map((s) => (
          <Grid size={{ xs: 6, md: 3 }} key={s.label}>
            <Box sx={{ p: 2, bgcolor: s.bgColor, border: `1px solid ${s.borderColor}`, borderRadius: 1, textAlign: 'center' }}>
              <Typography variant="h4" sx={{ color: s.color }}>{s.value}</Typography>
              <Typography variant="body2" color="textSecondary">{s.label}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Box sx={{ p: 2, mb: 3, bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2 }}>
        <Typography variant="subtitle1" gutterBottom sx={{ color: '#00d4ff', display: 'flex', alignItems: 'center', gap: 1 }}>
          <FilterIcon /> Filter & Search
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
                <MenuItem value="EXCELLENT">Excellent (&gt;=70%)</MenuItem>
                <MenuItem value="GOOD">Good (50-70%)</MenuItem>
                <MenuItem value="POOR">Poor (&lt;50%)</MenuItem>
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
              onClick={() => { setPerformanceFilter('ALL'); setSearchQuery(''); setSortBy('created_at'); setSortOrder('desc'); }}
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
          <TestResultsIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="textSecondary">
            {results.length === 0 ? 'No test results yet' : 'No results match filters'}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
            Test a model from the Model Details page to generate results.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {filteredResults.map((result) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={result.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', '&:hover': { borderColor: 'rgba(0, 212, 255, 0.3)' } }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                    <Box>
                      <Typography variant="subtitle1" fontWeight="bold">
                        Test #{result.id}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Model: {result.model_name || `ID ${result.model_id}`}
                      </Typography>
                    </Box>
                    {result.is_overfitted && (
                      <Chip label="Overfitted" color="warning" size="small" />
                    )}
                  </Box>

                  {/* Metrics */}
                  <Grid container spacing={1} sx={{ mb: 2 }}>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary">Accuracy</Typography>
                      <Typography variant="h6" sx={{ color: getAccuracyColor(result.accuracy) }}>
                        {formatPct(result.accuracy)}
                      </Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary">F1 Score</Typography>
                      <Typography variant="h6" sx={{ color: '#00d4ff' }}>
                        {formatPct(result.f1_score)}
                      </Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary">Precision</Typography>
                      <Typography variant="body1">{formatPct(result.precision_score)}</Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary">Recall</Typography>
                      <Typography variant="body1">{formatPct(result.recall)}</Typography>
                    </Grid>
                  </Grid>

                  {/* Profit */}
                  {result.simulated_profit_pct !== undefined && result.simulated_profit_pct !== null && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">Simulated Profit</Typography>
                      <Typography variant="body1" sx={{ color: result.simulated_profit_pct > 0 ? '#4caf50' : '#f44336', fontWeight: 600 }}>
                        {result.simulated_profit_pct.toFixed(4)}%
                      </Typography>
                    </Box>
                  )}

                  {/* Test period */}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Period: {formatDate(result.test_start)} - {formatDate(result.test_end)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Tested: {formatDate(result.created_at)}
                  </Typography>
                  {result.num_samples && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      Samples: {result.num_samples.toLocaleString()}
                    </Typography>
                  )}
                </CardContent>
                <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                  <Button size="small" startIcon={<ViewIcon />} onClick={() => navigate(`/training/test-results/${result.id}`)}>
                    Details
                  </Button>
                  <IconButton size="small" color="error" onClick={() => { setResultToDelete(result); setDeleteDialogOpen(true); }}>
                    <DeleteIcon />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Test Result</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete test result #{resultToDelete?.id}? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteDialogOpen(false); setResultToDelete(null); }}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TestResults;
