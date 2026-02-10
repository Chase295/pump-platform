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
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Sync as SyncIcon,
  PlayArrow as PlayIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { embeddingsApi } from '../../services/api';
import type { EmbeddingConfig as ConfigType, EmbeddingHealth, EmbeddingJob, Neo4jSyncStatus } from '../../types/embeddings';

const EmbeddingConfigPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);

  // New config form
  const [newConfig, setNewConfig] = useState({
    name: '',
    strategy: 'handcrafted_v1',
    window_seconds: 300,
    window_overlap_seconds: 0,
    min_snapshots: 3,
    normalization: 'minmax',
  });

  // Generate form
  const [generateStart, setGenerateStart] = useState('');
  const [generateEnd, setGenerateEnd] = useState('');
  const [generateConfigId, setGenerateConfigId] = useState<number | ''>('');

  // Health
  const { data: health } = useQuery<EmbeddingHealth>({
    queryKey: ['embeddings', 'health'],
    queryFn: async () => (await embeddingsApi.getHealth()).data,
    refetchInterval: 10000,
  });

  // Configs
  const { data: configs, isLoading: configsLoading } = useQuery<ConfigType[]>({
    queryKey: ['embeddings', 'configs'],
    queryFn: async () => (await embeddingsApi.getConfigs()).data,
  });

  // Jobs
  const { data: jobs } = useQuery<EmbeddingJob[]>({
    queryKey: ['embeddings', 'jobs'],
    queryFn: async () => (await embeddingsApi.getJobs()).data,
    refetchInterval: 5000,
  });

  // Neo4j status
  const { data: neo4jStatus } = useQuery<Neo4jSyncStatus>({
    queryKey: ['embeddings', 'neo4j', 'status'],
    queryFn: async () => (await embeddingsApi.getNeo4jStatus()).data,
  });

  // Create config
  const createMutation = useMutation({
    mutationFn: (data: typeof newConfig) => embeddingsApi.createConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embeddings'] });
      setCreateDialogOpen(false);
      setNewConfig({ name: '', strategy: 'handcrafted_v1', window_seconds: 300, window_overlap_seconds: 0, min_snapshots: 3, normalization: 'minmax' });
    },
  });

  // Toggle config
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      embeddingsApi.updateConfig(id, { is_active: active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['embeddings'] }),
  });

  // Generate
  const generateMutation = useMutation({
    mutationFn: (data: { start: string; end: string; config_id?: number }) =>
      embeddingsApi.generate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embeddings'] });
      setGenerateDialogOpen(false);
    },
  });

  // Neo4j sync
  const syncMutation = useMutation({
    mutationFn: () => embeddingsApi.triggerNeo4jSync(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['embeddings'] }),
  });

  return (
    <Box>
      {/* Service Status */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{ bgcolor: '#1a1a2e' }}>
            <CardHeader title="Embedding Service" sx={{ pb: 0 }} />
            <CardContent>
              {health ? (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Chip
                      label={health.status}
                      size="small"
                      sx={{ bgcolor: health.service_running ? '#4caf50' : '#f44336', color: '#fff' }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {health.active_configs} active config(s) | {health.total_embeddings.toLocaleString()} embeddings
                    </Typography>
                  </Box>
                  {health.last_run && (
                    <Typography variant="body2" color="text.secondary">
                      Last run: {new Date(health.last_run).toLocaleString()}
                    </Typography>
                  )}
                </Box>
              ) : (
                <CircularProgress size={20} />
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{ bgcolor: '#1a1a2e' }}>
            <CardHeader
              title="Neo4j Sync"
              action={
                <Button
                  size="small"
                  startIcon={<SyncIcon />}
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                  sx={{ color: '#00d4ff' }}
                >
                  Sync Now
                </Button>
              }
              sx={{ pb: 0 }}
            />
            <CardContent>
              {neo4jStatus ? (
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Synced: {neo4jStatus.synced} / {neo4jStatus.total_pairs} pairs
                  </Typography>
                  {neo4jStatus.pending > 0 && (
                    <Typography variant="body2" sx={{ color: '#ff9800' }}>
                      {neo4jStatus.pending} pending
                    </Typography>
                  )}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">Loading...</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Configs */}
      <Card sx={{ mb: 3, bgcolor: '#1a1a2e' }}>
        <CardHeader
          title="Embedding Configurations"
          action={
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                startIcon={<PlayIcon />}
                onClick={() => setGenerateDialogOpen(true)}
                sx={{ color: '#00d4ff' }}
              >
                Generate
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setCreateDialogOpen(true)}
                sx={{ bgcolor: '#00d4ff', '&:hover': { bgcolor: '#00b8d4' } }}
              >
                New Config
              </Button>
            </Box>
          }
        />
        <CardContent sx={{ p: 0 }}>
          {configsLoading ? (
            <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
          ) : (
            <TableContainer component={Paper} sx={{ bgcolor: 'transparent' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Strategy</TableCell>
                    <TableCell>Window</TableCell>
                    <TableCell>Normalization</TableCell>
                    <TableCell align="right">Embeddings</TableCell>
                    <TableCell>Last Run</TableCell>
                    <TableCell>Active</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {configs?.map((cfg: ConfigType) => (
                    <TableRow key={cfg.id} hover>
                      <TableCell>{cfg.name}</TableCell>
                      <TableCell>
                        <Chip label={cfg.strategy} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>{cfg.window_seconds}s</TableCell>
                      <TableCell>{cfg.normalization}</TableCell>
                      <TableCell align="right">{cfg.total_embeddings.toLocaleString()}</TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                          {cfg.last_run_at ? new Date(cfg.last_run_at).toLocaleString() : 'Never'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={cfg.is_active}
                          onChange={(e) => toggleMutation.mutate({ id: cfg.id, active: e.target.checked })}
                          size="small"
                          sx={{ '& .Mui-checked': { color: '#00d4ff' } }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {configs?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        <Typography color="text.secondary" sx={{ py: 2 }}>
                          No configs yet. Create one to start generating embeddings.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Jobs */}
      {jobs && jobs.length > 0 && (
        <Card sx={{ bgcolor: '#1a1a2e' }}>
          <CardHeader
            title="Recent Jobs"
            action={
              <Button
                size="small"
                startIcon={<RefreshIcon />}
                onClick={() => queryClient.invalidateQueries({ queryKey: ['embeddings', 'jobs'] })}
                sx={{ color: '#00d4ff' }}
              >
                Refresh
              </Button>
            }
          />
          <CardContent sx={{ p: 0 }}>
            <TableContainer component={Paper} sx={{ bgcolor: 'transparent' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Period</TableCell>
                    <TableCell align="right">Created</TableCell>
                    <TableCell align="right">Completed</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {jobs.map((job: EmbeddingJob) => (
                    <TableRow key={job.id} hover>
                      <TableCell>{job.id}</TableCell>
                      <TableCell>{job.job_type}</TableCell>
                      <TableCell>
                        <Chip
                          label={job.status}
                          size="small"
                          sx={{
                            bgcolor: job.status === 'COMPLETED' ? '#4caf50'
                              : job.status === 'RUNNING' ? '#2196f3'
                              : job.status === 'FAILED' ? '#f44336'
                              : '#9e9e9e',
                            color: '#fff',
                            fontSize: '0.7rem',
                          }}
                        />
                        {job.status === 'RUNNING' && (
                          <LinearProgress sx={{ mt: 0.5 }} />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {new Date(job.process_start).toLocaleDateString()} - {new Date(job.process_end).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                          {new Date(job.created_at).toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                          {job.completed_at ? new Date(job.completed_at).toLocaleString() : '-'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Create Config Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Embedding Configuration</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              label="Name"
              value={newConfig.name}
              onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value })}
              placeholder="e.g., default-5min"
            />
            <FormControl fullWidth>
              <InputLabel>Strategy</InputLabel>
              <Select
                value={newConfig.strategy}
                label="Strategy"
                onChange={(e) => setNewConfig({ ...newConfig, strategy: e.target.value })}
              >
                <MenuItem value="handcrafted_v1">Handcrafted v1</MenuItem>
                <MenuItem value="pca_v1" disabled>PCA v1 (coming soon)</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              type="number"
              label="Window (seconds)"
              value={newConfig.window_seconds}
              onChange={(e) => setNewConfig({ ...newConfig, window_seconds: parseInt(e.target.value) || 300 })}
            />
            <TextField
              fullWidth
              type="number"
              label="Min Snapshots"
              value={newConfig.min_snapshots}
              onChange={(e) => setNewConfig({ ...newConfig, min_snapshots: parseInt(e.target.value) || 3 })}
            />
            <FormControl fullWidth>
              <InputLabel>Normalization</InputLabel>
              <Select
                value={newConfig.normalization}
                label="Normalization"
                onChange={(e) => setNewConfig({ ...newConfig, normalization: e.target.value })}
              >
                <MenuItem value="minmax">MinMax</MenuItem>
                <MenuItem value="zscore">Z-Score</MenuItem>
                <MenuItem value="robust">Robust</MenuItem>
                <MenuItem value="none">None</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate(newConfig)}
            disabled={!newConfig.name || createMutation.isPending}
            sx={{ color: '#00d4ff' }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Generate Dialog */}
      <Dialog open={generateDialogOpen} onClose={() => setGenerateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Generate Embeddings</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Manually trigger embedding generation for a specific time range.
          </Alert>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              type="datetime-local"
              label="Start"
              value={generateStart}
              onChange={(e) => setGenerateStart(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              fullWidth
              type="datetime-local"
              label="End"
              value={generateEnd}
              onChange={(e) => setGenerateEnd(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <FormControl fullWidth>
              <InputLabel>Config (optional)</InputLabel>
              <Select
                value={generateConfigId}
                label="Config (optional)"
                onChange={(e) => setGenerateConfigId(e.target.value as number | '')}
              >
                <MenuItem value="">All active configs</MenuItem>
                {configs?.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGenerateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              const data: { start: string; end: string; config_id?: number } = {
                start: new Date(generateStart).toISOString(),
                end: new Date(generateEnd).toISOString(),
              };
              if (generateConfigId) data.config_id = generateConfigId as number;
              generateMutation.mutate(data);
            }}
            disabled={!generateStart || !generateEnd || generateMutation.isPending}
            sx={{ color: '#00d4ff' }}
          >
            Generate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EmbeddingConfigPage;
