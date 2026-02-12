import React, { useState } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
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
  PlayArrow as PlayIcon,
  PlayCircleOutline as PlayCircleIcon,
  Settings as SettingsIcon,
  GridView as GridViewIcon,
  Cached as CachedIcon,
  Hub as HubIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { embeddingsApi } from '../../services/api';
import type { EmbeddingConfig as ConfigType, EmbeddingHealth, EmbeddingJob, Neo4jSyncStatus } from '../../types/embeddings';
import DiscoveryStatCard from '../../components/discovery/DiscoveryStatCard';

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

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  };

  return (
    <Box>
      {/* System Status Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 2,
          p: 1.5,
          bgcolor: 'rgba(0, 212, 255, 0.03)',
          border: '1px solid rgba(0, 212, 255, 0.15)',
          borderRadius: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: health?.service_running ? '#4caf50' : '#f44336',
              animation: health?.service_running ? 'pulse 2s ease-in-out infinite' : 'none',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.5 },
              },
            }}
          />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Service: {health?.status || 'Unknown'}
          </Typography>
        </Box>
        {health?.last_run && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
            Last run: {new Date(health.last_run).toLocaleString()}
          </Typography>
        )}
        {health?.stats && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
            Errors: {(health.stats.total_errors as number) || 0}
          </Typography>
        )}
      </Box>

      {/* Service Status Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <DiscoveryStatCard
            label="Service Status"
            value={health?.service_running ? 'Running' : 'Stopped'}
            sublabel={health?.status}
            icon={<PlayCircleIcon />}
            accentColor={health?.service_running ? '76, 175, 80' : '244, 67, 54'}
            loading={!health}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <DiscoveryStatCard
            label="Active Configs"
            value={health?.active_configs ?? '-'}
            sublabel="configurations"
            icon={<SettingsIcon />}
            accentColor="156, 39, 176"
            loading={!health}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <DiscoveryStatCard
            label="Total Embeddings"
            value={health?.total_embeddings?.toLocaleString() ?? '-'}
            sublabel="vectors"
            icon={<GridViewIcon />}
            accentColor="0, 212, 255"
            loading={!health}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <DiscoveryStatCard
            label="Total Runs"
            value={(health?.stats?.total_runs as number)?.toLocaleString() ?? '-'}
            sublabel="generations"
            icon={<CachedIcon />}
            accentColor="33, 150, 243"
            loading={!health}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Box sx={{ position: 'relative', height: '100%' }}>
            <DiscoveryStatCard
              label="Neo4j Sync"
              value={
                neo4jStatus ? `${neo4jStatus.synced}/${neo4jStatus.total_pairs}` : '-'
              }
              sublabel={neo4jStatus?.pending ? `${neo4jStatus.pending} pending` : 'synced'}
              icon={<HubIcon />}
              accentColor={
                neo4jStatus?.pending && neo4jStatus.pending > 0
                  ? '255, 152, 0'
                  : '76, 175, 80'
              }
              loading={!neo4jStatus}
            />
            <Button
              size="small"
              startIcon={syncMutation.isPending ? <CircularProgress size={12} /> : <RefreshIcon />}
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                fontSize: '0.7rem',
                minWidth: 'auto',
                px: 1,
                py: 0.5,
                color: '#00d4ff',
                bgcolor: 'rgba(0, 212, 255, 0.1)',
                '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.2)' },
              }}
            >
              Sync
            </Button>
          </Box>
        </Grid>
      </Grid>

      {/* Configs Table */}
      <Card
        sx={{
          mb: 3,
          bgcolor: 'rgba(0, 212, 255, 0.03)',
          border: '1px solid rgba(0, 212, 255, 0.15)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 2,
            borderBottom: '1px solid rgba(0, 212, 255, 0.15)',
          }}
        >
          <Typography
            sx={{
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: 'rgba(255,255,255,0.5)',
              fontWeight: 600,
            }}
          >
            Embedding Configurations
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              startIcon={<PlayIcon />}
              onClick={() => setGenerateDialogOpen(true)}
              sx={{
                color: '#00d4ff',
                borderColor: '#00d4ff',
                '&:hover': {
                  bgcolor: 'rgba(0, 212, 255, 0.1)',
                  borderColor: '#00d4ff',
                },
              }}
              variant="outlined"
            >
              Generate
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialogOpen(true)}
              sx={{
                bgcolor: '#00d4ff',
                color: '#000',
                '&:hover': { bgcolor: '#00b8d4' },
              }}
            >
              New Config
            </Button>
          </Box>
        </Box>
        <CardContent sx={{ p: 0 }}>
          {configsLoading ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <CircularProgress size={24} sx={{ color: '#00d4ff' }} />
            </Box>
          ) : configs && configs.length > 0 ? (
            <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
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
                      Name
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
                      Window
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
                      Phases
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
                      Norm
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        bgcolor: '#1a1a2e',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.5)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Embeddings
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
                      Last Run
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
                      Active
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {configs.map((cfg: ConfigType) => (
                    <TableRow
                      key={cfg.id}
                      sx={{
                        '&:nth-of-type(odd)': { bgcolor: 'rgba(255,255,255,0.02)' },
                        '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)' },
                      }}
                    >
                      <TableCell sx={{ fontSize: '0.85rem', fontWeight: 500 }}>
                        {cfg.name}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={cfg.strategy}
                          size="small"
                          sx={{
                            bgcolor: 'rgba(156, 39, 176, 0.2)',
                            color: '#ce93d8',
                            fontSize: '0.7rem',
                            height: 20,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.85rem' }}>
                        {formatDuration(cfg.window_seconds)}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.85rem' }}>
                        {cfg.phases ? cfg.phases.join(', ') : 'All'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.85rem' }}>{cfg.normalization}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>
                        {cfg.total_embeddings.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontSize: '0.75rem' }}
                        >
                          {cfg.last_run_at
                            ? new Date(cfg.last_run_at).toLocaleString()
                            : 'Never'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={cfg.is_active}
                          onChange={(e) =>
                            toggleMutation.mutate({ id: cfg.id, active: e.target.checked })
                          }
                          size="small"
                          sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': {
                              color: '#00d4ff',
                            },
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                              bgcolor: '#00d4ff',
                            },
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                No embedding configurations yet.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Create your first configuration to start generating embeddings for pattern
                similarity search.
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setCreateDialogOpen(true)}
                sx={{
                  bgcolor: '#00d4ff',
                  color: '#000',
                  '&:hover': { bgcolor: '#00b8d4' },
                }}
              >
                Create First Config
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Jobs Table */}
      {jobs && jobs.length > 0 && (
        <Card
          sx={{
            bgcolor: 'rgba(0, 212, 255, 0.03)',
            border: '1px solid rgba(0, 212, 255, 0.15)',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: 2,
              borderBottom: '1px solid rgba(0, 212, 255, 0.15)',
            }}
          >
            <Typography
              sx={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: 1,
                color: 'rgba(255,255,255,0.5)',
                fontWeight: 600,
              }}
            >
              Recent Jobs
            </Typography>
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ['embeddings', 'jobs'] })
              }
              sx={{
                color: '#00d4ff',
                fontSize: '0.75rem',
                '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.1)' },
              }}
            >
              Refresh
            </Button>
          </Box>
          <CardContent sx={{ p: 0 }}>
            <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
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
                      Type
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
                      Status
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
                      Period
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        bgcolor: '#1a1a2e',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.5)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Created
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        bgcolor: '#1a1a2e',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.5)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Completed
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        bgcolor: '#1a1a2e',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.5)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Embeddings
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {jobs.map((job: EmbeddingJob) => (
                    <TableRow
                      key={job.id}
                      sx={{
                        '&:nth-of-type(odd)': { bgcolor: 'rgba(255,255,255,0.02)' },
                        '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)' },
                      }}
                    >
                      <TableCell sx={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>
                        {job.id}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.85rem' }}>{job.job_type}</TableCell>
                      <TableCell>
                        <Box>
                          <Chip
                            label={job.status}
                            size="small"
                            sx={{
                              bgcolor:
                                job.status === 'COMPLETED'
                                  ? 'rgba(76, 175, 80, 0.2)'
                                  : job.status === 'RUNNING'
                                  ? 'rgba(33, 150, 243, 0.2)'
                                  : job.status === 'FAILED'
                                  ? 'rgba(244, 67, 54, 0.2)'
                                  : 'rgba(158, 158, 158, 0.2)',
                              color:
                                job.status === 'COMPLETED'
                                  ? '#4caf50'
                                  : job.status === 'RUNNING'
                                  ? '#2196f3'
                                  : job.status === 'FAILED'
                                  ? '#f44336'
                                  : '#9e9e9e',
                              fontSize: '0.7rem',
                              height: 20,
                            }}
                          />
                          {job.status === 'RUNNING' && (
                            <LinearProgress
                              sx={{
                                mt: 0.5,
                                height: 2,
                                bgcolor: 'rgba(33, 150, 243, 0.1)',
                                '& .MuiLinearProgress-bar': { bgcolor: '#2196f3' },
                              }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {new Date(job.process_start).toLocaleDateString()} -{' '}
                          {new Date(job.process_end).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontSize: '0.75rem' }}
                        >
                          {new Date(job.created_at).toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontSize: '0.75rem' }}
                        >
                          {job.completed_at ? new Date(job.completed_at).toLocaleString() : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#00d4ff' }}
                        >
                          {job.embeddings_created.toLocaleString()}
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
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
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
                <MenuItem value="pca_v1" disabled>
                  PCA v1 (coming soon)
                </MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              type="number"
              label="Window (seconds)"
              value={newConfig.window_seconds}
              onChange={(e) =>
                setNewConfig({ ...newConfig, window_seconds: parseInt(e.target.value) || 300 })
              }
            />
            <TextField
              fullWidth
              type="number"
              label="Min Snapshots"
              value={newConfig.min_snapshots}
              onChange={(e) =>
                setNewConfig({ ...newConfig, min_snapshots: parseInt(e.target.value) || 3 })
              }
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
      <Dialog
        open={generateDialogOpen}
        onClose={() => setGenerateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
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
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
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
