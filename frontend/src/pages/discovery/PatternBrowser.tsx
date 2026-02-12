import React, { useState } from 'react';
import {
  Typography,
  Box,
  Card,
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
  GridView as GridViewIcon,
  LabelOff as LabelOffIcon,
  Settings as SettingsIcon,
  Storage as StorageIcon,
  Category as CategoryIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { embeddingsApi, findApi } from '../../services/api';
import type { EmbeddingRecord, EmbeddingStats, LabelStat } from '../../types/embeddings';
import type { Phase } from '../../types/find';
import DiscoveryStatCard from '../../components/discovery/DiscoveryStatCard';

const LABEL_COLORS: Record<string, string> = {
  pump: '#4caf50',
  rug: '#f44336',
  organic_growth: '#2196f3',
  flat: '#9e9e9e',
  dump: '#ff9800',
  mixed: '#9c27b0',
};

const formatRelativeTime = (timestamp: string): string => {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
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

  // Phases
  const { data: phases } = useQuery<Phase[]>({
    queryKey: ['find', 'phases'],
    queryFn: async () => {
      const res = await findApi.getPhases();
      return res.data.phases ?? res.data;
    },
    staleTime: 60000,
  });

  // Stats
  const { data: stats, isLoading: statsLoading } = useQuery<EmbeddingStats>({
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

  const unlabeled = stats ? stats.total_embeddings - stats.total_labeled : 0;
  const strategiesCount = stats ? Object.keys(stats.embeddings_by_strategy).length : 0;

  return (
    <Box>
      {/* Stats Overview */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <DiscoveryStatCard
            label="Total Embeddings"
            value={stats?.total_embeddings.toLocaleString() ?? '0'}
            icon={<GridViewIcon />}
            accentColor="0, 212, 255"
            loading={statsLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <DiscoveryStatCard
            label="Labeled"
            value={stats?.total_labeled.toLocaleString() ?? '0'}
            icon={<LabelIcon />}
            accentColor="76, 175, 80"
            loading={statsLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <DiscoveryStatCard
            label="Unlabeled"
            value={unlabeled.toLocaleString()}
            icon={<LabelOffIcon />}
            accentColor="255, 152, 0"
            loading={statsLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <DiscoveryStatCard
            label="Active Configs"
            value={stats?.active_configs ?? '0'}
            icon={<SettingsIcon />}
            accentColor="156, 39, 176"
            loading={statsLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <DiscoveryStatCard
            label="Storage"
            value={stats ? `${stats.storage_size_mb.toFixed(1)} MB` : '0 MB'}
            icon={<StorageIcon />}
            accentColor="33, 150, 243"
            loading={statsLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
          <DiscoveryStatCard
            label="Strategies"
            value={strategiesCount}
            icon={<CategoryIcon />}
            accentColor="0, 188, 212"
            loading={statsLoading}
          />
        </Grid>
      </Grid>

      {/* Label Stats */}
      {labels && labels.length > 0 && (
        <Card
          sx={{
            mb: 3,
            bgcolor: 'rgba(0, 212, 255, 0.03)',
            border: '1px solid rgba(0, 212, 255, 0.15)',
            p: 2,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: 1,
              mb: 1.5,
            }}
          >
            Labels
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {labels.map((l) => (
              <Chip
                key={l.label}
                label={`${l.label}: ${l.count}`}
                sx={{
                  bgcolor: LABEL_COLORS[l.label] || '#666',
                  color: '#fff',
                  cursor: 'pointer',
                  border: l.label === labelFilter ? '2px solid #fff' : 'none',
                }}
                onClick={() => setLabelFilter(l.label === labelFilter ? '' : l.label)}
              />
            ))}
          </Box>
        </Card>
      )}

      {/* Filters */}
      <Card
        sx={{
          mb: 3,
          bgcolor: 'rgba(0, 212, 255, 0.03)',
          border: '1px solid rgba(0, 212, 255, 0.15)',
          p: 2,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: 1,
            mb: 1.5,
          }}
        >
          Filters
        </Typography>
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
                {phases?.filter((p) => p.id < 99).map((p) => (
                  <MenuItem key={p.id} value={String(p.id)}>{p.name}</MenuItem>
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
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load embeddings</Alert>}

      {/* Embeddings Table */}
      <Card
        sx={{
          bgcolor: 'rgba(0, 212, 255, 0.03)',
          border: '1px solid rgba(0, 212, 255, 0.15)',
        }}
      >
        <Box sx={{ p: 2, pb: 0 }}>
          <Typography
            variant="body2"
            sx={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Embeddings
          </Typography>
        </Box>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress sx={{ color: '#00d4ff' }} />
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{
                        bgcolor: '#1a1a2e',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.5)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      ID
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: '#1a1a2e',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.5)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Mint
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: '#1a1a2e',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.5)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Strategy
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: '#1a1a2e',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.5)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Label
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: '#1a1a2e',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.5)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Phase
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: '#1a1a2e',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.5)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Snapshots
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: '#1a1a2e',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.5)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Quality
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: '#1a1a2e',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.5)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Window
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {embeddings?.map((emb: EmbeddingRecord) => (
                    <TableRow
                      key={emb.id}
                      sx={{
                        '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)' },
                        '&:nth-of-type(odd)': { bgcolor: 'rgba(255,255,255,0.02)' },
                      }}
                    >
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {emb.id}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                          >
                            {emb.mint.slice(0, 8)}...{emb.mint.slice(-4)}
                          </Typography>
                          <Tooltip title="Copy mint">
                            <IconButton
                              size="small"
                              onClick={() => copyMint(emb.mint)}
                              sx={{ opacity: 0.4, '&:hover': { opacity: 1 } }}
                            >
                              <CopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={emb.strategy}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem', height: 20 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {emb.label ? (
                            <Chip
                              label={emb.label}
                              size="small"
                              sx={{
                                bgcolor: LABEL_COLORS[emb.label] || '#666',
                                color: '#fff',
                                fontSize: '0.7rem',
                                height: 20,
                              }}
                            />
                          ) : (
                            <Tooltip title="Add label">
                              <IconButton
                                size="small"
                                onClick={() => handleOpenLabel(emb.id)}
                                sx={{
                                  opacity: 0.4,
                                  '&:hover': { opacity: 1, color: '#00d4ff' },
                                }}
                              >
                                <AddIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.85rem' }}>
                        {emb.phase_id_at_time ?? '-'}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {emb.num_snapshots}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {emb.quality_score !== undefined && emb.quality_score !== null
                          ? emb.quality_score.toFixed(2)
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.75rem',
                            color: 'rgba(255,255,255,0.6)',
                            fontFamily: 'monospace',
                          }}
                        >
                          {formatRelativeTime(emb.window_start)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  {embeddings?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
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
              sx={{
                borderTop: '1px solid rgba(0, 212, 255, 0.15)',
                '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
                  fontSize: '0.8rem',
                },
              }}
            />
          </>
        )}
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
