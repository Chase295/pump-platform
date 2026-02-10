import React, { useState } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Button,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  TextField,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Label as LabelIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { embeddingsApi } from '../../services/api';
import type { EmbeddingRecord, EmbeddingStats, LabelStat } from '../../types/embeddings';

const LABEL_COLORS: Record<string, string> = {
  pump: '#4caf50',
  rug: '#f44336',
  organic_growth: '#2196f3',
  flat: '#9e9e9e',
  dump: '#ff9800',
  mixed: '#9c27b0',
};

const PatternBrowser: React.FC = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [strategyFilter, setStrategyFilter] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [mintFilter, setMintFilter] = useState('');

  // Label dialog
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [selectedEmbeddingId, setSelectedEmbeddingId] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState('');

  // Stats
  const { data: stats } = useQuery<EmbeddingStats>({
    queryKey: ['embeddings', 'stats'],
    queryFn: async () => (await embeddingsApi.getStats()).data,
  });

  // Labels
  const { data: labels } = useQuery<LabelStat[]>({
    queryKey: ['embeddings', 'labels'],
    queryFn: async () => (await embeddingsApi.getLabels()).data,
  });

  // Embeddings list
  const { data: embeddings, isLoading, error } = useQuery<EmbeddingRecord[]>({
    queryKey: ['embeddings', 'browse', page, rowsPerPage, strategyFilter, labelFilter, phaseFilter, mintFilter],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        limit: rowsPerPage,
        offset: page * rowsPerPage,
      };
      if (strategyFilter) params.strategy = strategyFilter;
      if (labelFilter) params.label = labelFilter;
      if (phaseFilter) params.phase_id = parseInt(phaseFilter);
      if (mintFilter) params.mint = mintFilter;
      return (await embeddingsApi.browse(params)).data;
    },
  });

  // Add label mutation
  const addLabelMutation = useMutation({
    mutationFn: async ({ embeddingId, label }: { embeddingId: number; label: string }) => {
      return embeddingsApi.addLabel({
        embedding_id: embeddingId,
        label,
        confidence: 1.0,
        source: 'manual',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embeddings'] });
      setLabelDialogOpen(false);
      setNewLabel('');
    },
  });

  const handleOpenLabel = (embeddingId: number) => {
    setSelectedEmbeddingId(embeddingId);
    setLabelDialogOpen(true);
  };

  const copyMint = (value: string) => {
    navigator.clipboard.writeText(value);
  };

  return (
    <Box>
      {/* Stats Overview */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card sx={{ bgcolor: '#1a1a2e', textAlign: 'center' }}>
              <CardContent sx={{ py: 1.5 }}>
                <Typography variant="h5" sx={{ color: '#00d4ff' }}>
                  {stats.total_embeddings.toLocaleString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">Total Embeddings</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card sx={{ bgcolor: '#1a1a2e', textAlign: 'center' }}>
              <CardContent sx={{ py: 1.5 }}>
                <Typography variant="h5" sx={{ color: '#4caf50' }}>
                  {stats.total_labeled.toLocaleString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">Labeled</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card sx={{ bgcolor: '#1a1a2e', textAlign: 'center' }}>
              <CardContent sx={{ py: 1.5 }}>
                <Typography variant="h5" sx={{ color: '#ff9800' }}>
                  {stats.active_configs}
                </Typography>
                <Typography variant="body2" color="text.secondary">Active Configs</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card sx={{ bgcolor: '#1a1a2e', textAlign: 'center' }}>
              <CardContent sx={{ py: 1.5 }}>
                <Typography variant="h5" sx={{ color: '#9c27b0' }}>
                  {stats.storage_size_mb.toFixed(1)} MB
                </Typography>
                <Typography variant="body2" color="text.secondary">Storage</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Label Stats */}
      {labels && labels.length > 0 && (
        <Box sx={{ mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {labels.map((l) => (
            <Chip
              key={l.label}
              label={`${l.label}: ${l.count}`}
              sx={{
                bgcolor: LABEL_COLORS[l.label] || '#666',
                color: '#fff',
                cursor: 'pointer',
              }}
              onClick={() => setLabelFilter(l.label === labelFilter ? '' : l.label)}
              variant={l.label === labelFilter ? 'filled' : 'outlined'}
            />
          ))}
        </Box>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3, bgcolor: '#1a1a2e' }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Filter by Mint"
                value={mintFilter}
                onChange={(e) => { setMintFilter(e.target.value); setPage(0); }}
                placeholder="Mint address..."
              />
            </Grid>
            <Grid size={{ xs: 4, sm: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Strategy</InputLabel>
                <Select
                  value={strategyFilter}
                  label="Strategy"
                  onChange={(e) => { setStrategyFilter(e.target.value); setPage(0); }}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="handcrafted_v1">Handcrafted v1</MenuItem>
                  <MenuItem value="pca_v1">PCA v1</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 4, sm: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Label</InputLabel>
                <Select
                  value={labelFilter}
                  label="Label"
                  onChange={(e) => { setLabelFilter(e.target.value); setPage(0); }}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="pump">Pump</MenuItem>
                  <MenuItem value="rug">Rug</MenuItem>
                  <MenuItem value="organic_growth">Organic</MenuItem>
                  <MenuItem value="flat">Flat</MenuItem>
                  <MenuItem value="dump">Dump</MenuItem>
                  <MenuItem value="mixed">Mixed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 4, sm: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Phase</InputLabel>
                <Select
                  value={phaseFilter}
                  label="Phase"
                  onChange={(e) => { setPhaseFilter(e.target.value); setPage(0); }}
                >
                  <MenuItem value="">All</MenuItem>
                  {[1, 2, 3, 4, 5].map((p) => (
                    <MenuItem key={p} value={String(p)}>P{p}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 2 }}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => queryClient.invalidateQueries({ queryKey: ['embeddings'] })}
                sx={{ borderColor: '#00d4ff', color: '#00d4ff' }}
              >
                Refresh
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load embeddings</Alert>}

      {/* Embeddings Table */}
      <Card sx={{ bgcolor: '#1a1a2e' }}>
        <CardHeader title="Embeddings" />
        <CardContent sx={{ p: 0 }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress sx={{ color: '#00d4ff' }} />
            </Box>
          ) : (
            <>
              <TableContainer component={Paper} sx={{ bgcolor: 'transparent' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>ID</TableCell>
                      <TableCell>Mint</TableCell>
                      <TableCell>Strategy</TableCell>
                      <TableCell>Label</TableCell>
                      <TableCell>Phase</TableCell>
                      <TableCell>Snapshots</TableCell>
                      <TableCell>Window</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {embeddings?.map((emb: EmbeddingRecord) => (
                      <TableRow key={emb.id} hover>
                        <TableCell>{emb.id}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                              {emb.mint.slice(0, 8)}...{emb.mint.slice(-4)}
                            </Typography>
                            <Tooltip title="Copy">
                              <IconButton size="small" onClick={() => copyMint(emb.mint)}>
                                <CopyIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip label={emb.strategy} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          {emb.label ? (
                            <Chip
                              label={emb.label}
                              size="small"
                              sx={{ bgcolor: LABEL_COLORS[emb.label] || '#666', color: '#fff', fontSize: '0.7rem' }}
                            />
                          ) : '-'}
                        </TableCell>
                        <TableCell>{emb.phase_id_at_time ?? '-'}</TableCell>
                        <TableCell>{emb.num_snapshots}</TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            {new Date(emb.window_start).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Tooltip title="Add label">
                            <IconButton size="small" onClick={() => handleOpenLabel(emb.id)}>
                              <LabelIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                    {embeddings?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} align="center">
                          <Typography color="text.secondary">No embeddings found</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={-1}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
                rowsPerPageOptions={[25, 50, 100]}
                labelDisplayedRows={({ from, to }) => `${from}-${to}`}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Label Dialog */}
      <Dialog open={labelDialogOpen} onClose={() => setLabelDialogOpen(false)}>
        <DialogTitle>Add Label</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Label</InputLabel>
            <Select value={newLabel} label="Label" onChange={(e) => setNewLabel(e.target.value)}>
              <MenuItem value="pump">Pump</MenuItem>
              <MenuItem value="rug">Rug</MenuItem>
              <MenuItem value="organic_growth">Organic Growth</MenuItem>
              <MenuItem value="flat">Flat</MenuItem>
              <MenuItem value="dump">Dump</MenuItem>
              <MenuItem value="mixed">Mixed</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLabelDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => selectedEmbeddingId && addLabelMutation.mutate({ embeddingId: selectedEmbeddingId, label: newLabel })}
            disabled={!newLabel || addLabelMutation.isPending}
            sx={{ color: '#00d4ff' }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PatternBrowser;
