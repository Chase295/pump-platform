import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Card,
  Chip,
  Alert,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Grid,
} from '@mui/material';
import {
  Wifi as WifiIcon,
  Storage as StorageIcon,
  AccessTime as AccessTimeIcon,
  Cached as CachedIcon,
  ShowChart as ShowChartIcon,
  SwapHoriz as SwapHorizIcon,
  Inventory as InventoryIcon,
  ContentCopy as ContentCopyIcon,
  Webhook as WebhookIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { findApi } from '../../services/api';
import type { FindHealthResponse, StreamStats, Phase, RecentMetric } from '../../types/find';
import DiscoveryStatCard from '../../components/discovery/DiscoveryStatCard';
import PipelineVisualization from '../../components/discovery/PipelineVisualization';
import PhaseDistributionChart from '../../components/discovery/PhaseDistributionChart';
import { getPhaseColor } from '../../utils/phaseColors';

const fmt = (n: number | undefined | null): string => {
  if (n == null) return '--';
  return n.toLocaleString('en-US');
};

const fmtUptime = (seconds: number | undefined | null): string => {
  if (seconds == null) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const fmtAgo = (seconds: number | null | undefined): string => {
  if (seconds == null) return '--';
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
};

const truncateAddress = (addr: string): string => {
  if (!addr || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const timeAgo = (ts: string): string => {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 0) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
};

const DiscoveryOverview: React.FC = () => {
  const navigate = useNavigate();

  const { data: health, error: healthError, isLoading: healthLoading } = useQuery<FindHealthResponse>({
    queryKey: ['find', 'health'],
    queryFn: async () => (await findApi.getHealth()).data,
    refetchInterval: 5000,
  });

  const { data: streamStats } = useQuery<StreamStats>({
    queryKey: ['find', 'streamStats'],
    queryFn: async () => (await findApi.getStreamStats()).data,
    refetchInterval: 10000,
  });

  const { data: phases } = useQuery<Phase[]>({
    queryKey: ['find', 'phases'],
    queryFn: async () => {
      const res = await findApi.getPhases();
      return res.data.phases ?? res.data;
    },
    staleTime: 60000,
  });

  const { data: recentMetrics } = useQuery<RecentMetric[]>({
    queryKey: ['find', 'recentMetrics'],
    queryFn: async () => {
      const res = await findApi.getRecentMetrics(20);
      return res.data.metrics ?? res.data;
    },
    refetchInterval: 10000,
  });

  const loading = healthLoading && !health;
  const statusColor = health?.status === 'healthy' ? '#4caf50' : health?.status === 'degraded' ? '#ff9800' : '#f44336';

  if (loading) {
    return (
      <Box sx={{ mt: 4 }}>
        <LinearProgress sx={{ mb: 2 }} />
        <Typography variant="h6" sx={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
          Connecting to Discovery Service...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {healthError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {healthError instanceof Error ? healthError.message : 'Failed to fetch health data'}
        </Alert>
      )}

      {/* A) System Status Bar */}
      <Card
        sx={{
          mb: 2,
          bgcolor: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderTop: `2px solid ${statusColor}`,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: { xs: 1.5, sm: 3 },
            px: { xs: 1.5, sm: 2 },
            py: 1,
          }}
        >
          {/* WS Status */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: health?.ws_connected ? '#4caf50' : '#f44336',
                animation: health?.ws_connected ? 'pulse 2s infinite' : 'none',
                '@keyframes pulse': {
                  '0%': { boxShadow: '0 0 0 0 rgba(76,175,80,0.6)' },
                  '70%': { boxShadow: '0 0 0 6px rgba(76,175,80,0)' },
                  '100%': { boxShadow: '0 0 0 0 rgba(76,175,80,0)' },
                },
              }}
            />
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
              WS {health?.ws_connected ? 'Connected' : 'Disconnected'}
            </Typography>
          </Box>

          {/* DB Status */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <StorageIcon sx={{ fontSize: 14, color: health?.db_connected ? '#4caf50' : '#f44336' }} />
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
              DB {health?.db_connected ? 'OK' : 'Down'}
            </Typography>
          </Box>

          {/* Uptime */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AccessTimeIcon sx={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }} />
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', fontSize: '0.8rem' }}>
              {fmtUptime(health?.uptime_seconds)}
            </Typography>
          </Box>

          {/* n8n Status */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {(() => {
              const ds = health?.discovery_stats;
              const available = ds?.n8n_available;
              const noUrl = ds?.n8n_no_url;
              const bufferSize = ds?.n8n_buffer_size ?? 0;
              let color: string;
              let label: string;
              if (available) {
                color = '#4caf50'; label = 'Online';
              } else if (noUrl) {
                color = '#ff9800'; label = 'No URL';
              } else if (bufferSize === 0) {
                color = '#ff9800'; label = 'Idle';
              } else {
                color = '#f44336'; label = 'Offline';
              }
              return (
                <>
                  <WebhookIcon sx={{ fontSize: 14, color }} />
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
                    n8n {label}
                  </Typography>
                  {bufferSize > 0 && (
                    <Chip
                      label={`${bufferSize} buffered`}
                      size="small"
                      sx={{ bgcolor: 'rgba(255,152,0,0.15)', color: '#ff9800', fontSize: '0.65rem', height: 20 }}
                    />
                  )}
                </>
              );
            })()}
          </Box>

          {/* Last Message */}
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
            Last msg: {fmtAgo(health?.last_message_ago)}
          </Typography>

          {/* Reconnects */}
          {(health?.reconnect_count ?? 0) > 0 && (
            <Chip
              label={`${health?.reconnect_count} reconnects`}
              size="small"
              sx={{ bgcolor: 'rgba(255,152,0,0.15)', color: '#ff9800', fontSize: '0.7rem', height: 22 }}
            />
          )}
        </Box>
      </Card>

      {/* B) Live Counter Row */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
          <DiscoveryStatCard
            label="Active Streams"
            value={fmt(streamStats?.active_streams)}
            sublabel={
              streamStats?.streams_by_phase
                ? Object.entries(streamStats.streams_by_phase)
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => `P${k}:${v}`)
                    .join(' ')
                : undefined
            }
            icon={<ShowChartIcon />}
            accentColor="0, 212, 255"
            loading={!streamStats}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
          <DiscoveryStatCard
            label="Discovered"
            value={fmt(health?.discovery_stats?.total_coins_discovered)}
            sublabel="total coins found"
            icon={<WifiIcon />}
            accentColor="76, 175, 80"
            loading={!health}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
          <DiscoveryStatCard
            label="Metrics Saved"
            value={fmt(health?.tracking_stats?.total_metrics_saved)}
            sublabel="OHLCV snapshots"
            icon={<InventoryIcon />}
            accentColor="33, 150, 243"
            loading={!health}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
          <DiscoveryStatCard
            label="Trades"
            value={fmt(health?.tracking_stats?.total_trades)}
            sublabel="transactions recorded"
            icon={<SwapHorizIcon />}
            accentColor="156, 39, 176"
            loading={!health}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
          <DiscoveryStatCard
            label="n8n Buffer"
            value={health?.discovery_stats?.n8n_buffer_size ?? '--'}
            sublabel={health?.discovery_stats?.n8n_available ? 'webhook active' : health?.discovery_stats?.n8n_no_url ? 'no webhook URL configured' : 'webhook offline'}
            icon={<WebhookIcon />}
            accentColor={health?.discovery_stats?.n8n_available ? '76, 175, 80' : health?.discovery_stats?.n8n_no_url ? '255, 152, 0' : '244, 67, 54'}
            loading={!health}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
          <DiscoveryStatCard
            label="Cache"
            value={`${health?.cache_stats?.activated_coins ?? 0}/${health?.cache_stats?.total_coins ?? 0}`}
            sublabel={`${health?.cache_stats?.expired_coins ?? 0} expired`}
            icon={<CachedIcon />}
            accentColor="0, 212, 255"
            loading={!health}
          />
        </Grid>
      </Grid>

      {/* C) Pipeline Visualization */}
      <Box sx={{ mb: 2 }}>
        <PipelineVisualization
          wsConnected={health?.ws_connected ?? false}
          totalDiscovered={health?.discovery_stats?.total_coins_discovered ?? 0}
          cacheTotal={health?.cache_stats?.total_coins ?? 0}
          cacheActivated={health?.cache_stats?.activated_coins ?? 0}
          activeStreams={streamStats?.active_streams ?? 0}
          metricsSaved={health?.tracking_stats?.total_metrics_saved ?? 0}
          totalTrades={health?.tracking_stats?.total_trades ?? 0}
        />
      </Box>

      {/* D) Phase Distribution + Stream Stats */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ bgcolor: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)', p: 2, height: '100%' }}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1 }}>
              Phase Distribution
            </Typography>
            {streamStats?.streams_by_phase && phases ? (
              <PhaseDistributionChart streamsByPhase={streamStats.streams_by_phase} phases={phases} />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                <Typography color="textSecondary">Loading...</Typography>
              </Box>
            )}
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ bgcolor: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)', p: 2, height: '100%' }}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 2, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1 }}>
              Stream Summary
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <StatRow label="Total Streams" value={fmt(streamStats?.total_streams)} color="#00d4ff" />
              <StatRow label="Active" value={fmt(streamStats?.active_streams)} color="#4caf50" />
              <StatRow
                label="Ended"
                value={fmt(
                  streamStats ? streamStats.total_streams - streamStats.active_streams : null
                )}
                color="#f44336"
              />
              <StatRow
                label="Graduated"
                value={fmt(streamStats?.streams_by_phase?.[100])}
                color="#9c27b0"
              />
              {phases && phases.length > 0 && (
                <>
                  <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 1.5, mt: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontSize: '0.65rem' }}>
                      Active Phases
                    </Typography>
                  </Box>
                  {phases.map((p) => (
                    <Box key={p.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getPhaseColor(p.id) }} />
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>
                          {p.name}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {p.interval_seconds}s / {p.min_age_minutes}-{p.max_age_minutes}m
                      </Typography>
                    </Box>
                  ))}
                </>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* E) Recent Metrics Feed */}
      <Card sx={{ bgcolor: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)', mb: 2 }}>
        <Box sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1 }}>
            Recent Metrics Feed
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem' }}>
            Last 20 entries - refreshes every 10s
          </Typography>
        </Box>
        <TableContainer sx={{ maxHeight: 380 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {['Coin', 'Phase', 'Price', 'Volume', 'B/S', 'Wallets', 'Age'].map((h) => (
                  <TableCell
                    key={h}
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      color: 'rgba(255,255,255,0.5)',
                      bgcolor: '#1a1a2e',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      py: 0.75,
                    }}
                  >
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {recentMetrics && recentMetrics.length > 0 ? (
                recentMetrics.map((m, i) => (
                  <TableRow
                    key={`${m.mint}-${m.timestamp}-${i}`}
                    onClick={() => navigate(`/discovery/coin/${m.mint}`)}
                    sx={{
                      cursor: 'pointer',
                      '&:nth-of-type(odd)': { bgcolor: 'rgba(255,255,255,0.02)' },
                      '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.08)' },
                    }}
                  >
                    <TableCell sx={{ py: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {truncateAddress(m.mint)}
                        </Typography>
                        <Tooltip title="Copy address">
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(m.mint); }}
                            sx={{ p: 0.25, opacity: 0.4, '&:hover': { opacity: 1 } }}
                          >
                            <ContentCopyIcon sx={{ fontSize: 12 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Chip
                        label={`P${m.phase_id_at_time}`}
                        size="small"
                        sx={{
                          bgcolor: `${getPhaseColor(m.phase_id_at_time)}20`,
                          color: getPhaseColor(m.phase_id_at_time),
                          fontSize: '0.65rem',
                          height: 20,
                          minWidth: 36,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {m.price_close?.toExponential(2) ?? '--'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {m.volume_sol?.toFixed(2) ?? '--'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                        <Box component="span" sx={{ color: '#4caf50' }}>{m.num_buys}</Box>
                        {'/'}
                        <Box component="span" sx={{ color: '#f44336' }}>{m.num_sells}</Box>
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {m.unique_wallets}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>
                        {timeAgo(m.timestamp)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="textSecondary" variant="body2">
                      {recentMetrics ? 'No recent metrics' : 'Loading...'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* F) Error Display */}
      {health?.last_error && (
        <Alert
          severity="warning"
          sx={{
            bgcolor: 'rgba(255, 152, 0, 0.08)',
            border: '1px solid rgba(255, 152, 0, 0.2)',
            color: '#ff9800',
            '& .MuiAlert-icon': { color: '#ff9800' },
          }}
        >
          <Typography variant="body2">
            <strong>Last Error:</strong> {health.last_error}
          </Typography>
        </Alert>
      )}
    </Box>
  );
};

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, color: color || '#fff', fontSize: '0.9rem' }}>
        {value}
      </Typography>
    </Box>
  );
}

export default DiscoveryOverview;
