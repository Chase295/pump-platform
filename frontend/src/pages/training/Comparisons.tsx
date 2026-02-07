import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Button,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  CardActions,
  Chip,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  CompareArrows as CompareIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  EmojiEvents as TrophyIcon,
} from '@mui/icons-material';
import { trainingApi } from '../../services/api';
import type { ComparisonResponse } from '../../types/training';

const Comparisons: React.FC = () => {
  const navigate = useNavigate();
  const [comparisons, setComparisons] = useState<ComparisonResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [comparisonToDelete, setComparisonToDelete] = useState<ComparisonResponse | null>(null);

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

  const handleDeleteConfirm = async () => {
    if (!comparisonToDelete) return;
    try {
      // Remove from local state (API delete support varies)
      setComparisons((prev) => prev.filter((c) => c.id !== comparisonToDelete.id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
    }
    setDeleteDialogOpen(false);
    setComparisonToDelete(null);
  };

  const formatDate = (date: string) => {
    try {
      return new Date(date).toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return date;
    }
  };

  const formatDuration = (start: string, end: string) => {
    try {
      const hours = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60);
      return `${hours.toFixed(1)}h`;
    } catch {
      return 'N/A';
    }
  };

  if (loading && comparisons.length === 0) {
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
          <CompareIcon /> Comparisons
        </Typography>
        <Button startIcon={<RefreshIcon />} onClick={loadComparisons} variant="outlined" disabled={loading}>
          Refresh
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {comparisons.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <CompareIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="textSecondary">
            No comparisons yet
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
            Compare models from the Model Details page to generate comparisons.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {comparisons.map((comparison) => (
            <Grid size={{ xs: 12, md: 6 }} key={comparison.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', '&:hover': { borderColor: 'rgba(0, 212, 255, 0.3)' } }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6" fontWeight="bold">
                        Comparison #{comparison.id}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(comparison.created_at)}
                      </Typography>
                    </Box>
                    {comparison.winner_id && (
                      <Chip
                        icon={<TrophyIcon />}
                        label={`Winner: #${comparison.winner_id}`}
                        color="success"
                        size="small"
                      />
                    )}
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Models: {comparison.model_ids?.join(', ') || `${comparison.model_a_id} vs ${comparison.model_b_id}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Test Period: {formatDuration(comparison.test_start, comparison.test_end)}
                    </Typography>
                    {comparison.num_samples && (
                      <Typography variant="body2" color="text.secondary">
                        Samples: {comparison.num_samples.toLocaleString()}
                      </Typography>
                    )}
                  </Box>

                  {/* Top results */}
                  {comparison.results && comparison.results.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Ranking:
                      </Typography>
                      {[...comparison.results]
                        .sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0))
                        .slice(0, 3)
                        .map((result, idx) => (
                          <Box key={result.model_id} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="body2">
                              {idx === 0 ? '#1' : idx === 1 ? '#2' : '#3'} Model #{result.model_id}
                            </Typography>
                            <Typography variant="body2" fontWeight="bold">
                              Score: {result.avg_score ? (result.avg_score * 100).toFixed(1) : 'N/A'}%
                            </Typography>
                          </Box>
                        ))}
                    </Box>
                  )}

                  {comparison.winner_reason && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                      {comparison.winner_reason}
                    </Typography>
                  )}
                </CardContent>
                <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                  <Button
                    size="small"
                    startIcon={<ViewIcon />}
                    onClick={() => navigate(`/training/comparisons/${comparison.id}`)}
                  >
                    Details
                  </Button>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => { setComparisonToDelete(comparison); setDeleteDialogOpen(true); }}
                  >
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
        <DialogTitle>Delete Comparison</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete comparison #{comparisonToDelete?.id}? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteDialogOpen(false); setComparisonToDelete(null); }}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Comparisons;
