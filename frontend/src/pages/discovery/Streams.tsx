import React, { useState, useMemo } from 'react';
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
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ButtonGroup,
  IconButton,
  Tooltip,
  TableSortLabel,
  Grid,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  ContentCopy as ContentCopyIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { findApi } from '../../services/api';
import type { Stream, StreamStats, Phase } from '../../types/find';
import DiscoveryStatCard from '../../components/discovery/DiscoveryStatCard';

const PHASE_COLORS: Record<number, string> = {
  1: '#2196f3',
  2: '#ff9800',
  3: '#4caf50',
  99: '#f44336',
  100: '#9c27b0',
};

const getPhaseColor = (id: number): string => PHASE_COLORS[id] || '#607d8b';

const fmt = (n: number | undefined | null): string => {
  if (n == null) return '--';
  return n.toLocaleString('en-US');
};

const formatAge = (startedAt: string): string => {
  const diff = (Date.now() - new Date(startedAt).getTime()) / 1000;
  if (diff < 0) return 'just now';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const truncateAddress = (addr: string): string => {
  if (!addr || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const formatDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return dateStr;
  }
};

const timeAgo = (ts: string): string => {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 0) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

type SortCol = 'token_address' | 'current_phase_id' | 'started_at' | 'ath_price_sol' | 'is_active' | 'is_graduated' | 'last_metric_at';
type SortDir = 'asc' | 'desc';

const Streams: React.FC = () => {
  const [phaseFilter, setPhaseFilter] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('started_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [limit, setLimit] = useState(50);

  const { data: streamStats } = useQuery<StreamStats>({
    queryKey: ['find', 'streamStats'],
    queryFn: async () => (await findApi.getStreamStats()).data,
    refetchInterval: 10000,
  });

  const {
    data: streams,
    isLoading: streamsLoading,
    error: streamsError,
    refetch: refetchStreams,
  } = useQuery<Stream[]>({
    queryKey: ['find', 'streams', limit],
    queryFn: async () => {
      const res = await findApi.getStreams(limit);
      return res.data.streams ?? res.data;
    },
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

  const phaseMap = useMemo(() => {
    const m: Record<number, string> = {};
    phases?.forEach((p) => { m[p.id] = p.name; });
    return m;
  }, [phases]);

  // Filtered and sorted streams
  const filteredStreams = useMemo(() => {
    if (!streams) return [];
    let result = [...streams];

    // Phase filter
    if (phaseFilter !== '') {
      result = result.filter((s) => s.current_phase_id === phaseFilter);
    }

    // Status filter
    if (statusFilter === 'active') {
      result = result.filter((s) => s.is_active);
    } else if (statusFilter === 'inactive') {
      result = result.filter((s) => !s.is_active);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((s) => s.token_address.toLowerCase().includes(q));
    }

    // Sort
    result.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortCol) {
        case 'token_address':
          return dir * a.token_address.localeCompare(b.token_address);
        case 'current_phase_id':
          return dir * (a.current_phase_id - b.current_phase_id);
        case 'started_at':
          return dir * (new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
        case 'ath_price_sol':
          return dir * ((a.ath_price_sol ?? 0) - (b.ath_price_sol ?? 0));
        case 'is_active':
          return dir * (Number(a.is_active) - Number(b.is_active));
        case 'is_graduated':
          return dir * (Number(a.is_graduated) - Number(b.is_graduated));
        case 'last_metric_at':
          return dir * ((a.last_metric_at ?? '').localeCompare(b.last_metric_at ?? ''));
        default:
          return 0;
      }
    });

    return result;
  }, [streams, phaseFilter, statusFilter, searchQuery, sortCol, sortDir]);

  // Phase bar chart data
  const phaseChartData = useMemo(() => {
    if (!streamStats?.streams_by_phase) return [];
    return Object.entries(streamStats.streams_by_phase)
      .map(([id, count]) => ({
        id: Number(id),
        name: phaseMap[Number(id)] || `Phase ${id}`,
        count,
        color: getPhaseColor(Number(id)),
      }))
      .filter((d) => d.count > 0)
      .sort((a, b) => a.id - b.id);
  }, [streamStats, phaseMap]);

  // Computed stats
  const graduated = streamStats?.streams_by_phase?.[100] ?? 0;
  const ended = streamStats ? streamStats.total_streams - streamStats.active_streams : 0;
  const finished = streamStats?.streams_by_phase?.[99] ?? 0;

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  return (
    <Box>
      {streamsError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {streamsError instanceof Error ? streamsError.message : 'Failed to load streams'}
        </Alert>
      )}

      {/* A) Filter Bar */}
      <Card
        sx={{
          mb: 2,
          bgcolor: 'rgba(0, 212, 255, 0.03)',
          border: '1px solid rgba(0, 212, 255, 0.15)',
          p: { xs: 1.5, sm: 2 },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1.5,
            alignItems: 'center',
          }}
        >
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>Phase</InputLabel>
            <Select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value as number | '')}
              label="Phase"
              sx={{ fontSize: '0.85rem' }}
            >
              <MenuItem value="">All Phases</MenuItem>
              {phases?.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <ButtonGroup size="small" variant="outlined">
            {(['all', 'active', 'inactive'] as const).map((s) => (
              <Button
                key={s}
                onClick={() => setStatusFilter(s)}
                variant={statusFilter === s ? 'contained' : 'outlined'}
                sx={{
                  textTransform: 'capitalize',
                  fontSize: '0.75rem',
                  ...(statusFilter === s && { bgcolor: 'rgba(0, 212, 255, 0.2)', borderColor: '#00d4ff' }),
                }}
              >
                {s}
              </Button>
            ))}
          </ButtonGroup>

          <TextField
            size="small"
            placeholder="Search address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{
              flex: { xs: '1 1 100%', sm: '0 1 220px' },
              '& .MuiInputBase-input': { fontSize: '0.85rem' },
            }}
          />

          <Box sx={{ ml: 'auto' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => refetchStreams()}
              disabled={streamsLoading}
              sx={{ fontSize: '0.75rem' }}
            >
              Refresh
            </Button>
          </Box>
        </Box>
      </Card>

      {/* B) Summary Stats */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 2.4 }}>
          <DiscoveryStatCard
            label="Active"
            value={fmt(streamStats?.active_streams)}
            accentColor="76, 175, 80"
            loading={!streamStats}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 2.4 }}>
          <DiscoveryStatCard
            label="Finished"
            value={fmt(finished)}
            accentColor="244, 67, 54"
            loading={!streamStats}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 2.4 }}>
          <DiscoveryStatCard
            label="Graduated"
            value={fmt(graduated)}
            accentColor="156, 39, 176"
            loading={!streamStats}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 2.4 }}>
          <DiscoveryStatCard
            label="Total"
            value={fmt(streamStats?.total_streams)}
            accentColor="0, 212, 255"
            loading={!streamStats}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 2.4 }}>
          <DiscoveryStatCard
            label="Ended"
            value={fmt(ended)}
            accentColor="158, 158, 158"
            loading={!streamStats}
          />
        </Grid>
      </Grid>

      {/* C) Phase Distribution Bar Chart */}
      {phaseChartData.length > 0 && (
        <Card sx={{ bgcolor: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)', p: 2, mb: 2 }}>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1 }}>
            Streams by Phase
          </Typography>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={phaseChartData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
              <XAxis type="number" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} />
              <YAxis
                dataKey="name"
                type="category"
                width={100}
                stroke="rgba(255,255,255,0.3)"
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }}
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 15, 35, 0.95)',
                  border: '1px solid rgba(0, 212, 255, 0.3)',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: '0.8rem',
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => [`${value ?? 0} streams`, 'Count']}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                {phaseChartData.map((entry) => (
                  <Cell key={entry.id} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* D) Enhanced Streams Table */}
      {streamsLoading && !streams ? (
        <LinearProgress />
      ) : (
        <Card sx={{ bgcolor: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)', overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: '60vh' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <SortableCell col="token_address" label="Token" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortableCell col="current_phase_id" label="Phase" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="center" />
                  <SortableCell col="started_at" label="Age" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortableCell col="ath_price_sol" label="ATH Price" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortableCell col="is_active" label="Active" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="center" />
                  <SortableCell col="is_graduated" label="Graduated" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="center" />
                  <SortableCell col="started_at" label="Started" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortableCell col="last_metric_at" label="Last Metric" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredStreams.length > 0 ? (
                  filteredStreams.map((stream, index) => (
                    <TableRow
                      key={stream.token_address || index}
                      sx={{
                        '&:nth-of-type(odd)': { bgcolor: 'rgba(255,255,255,0.02)' },
                        '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)' },
                        opacity: stream.is_active ? 1 : 0.5,
                      }}
                    >
                      <TableCell sx={{ py: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }} title={stream.token_address}>
                            {truncateAddress(stream.token_address)}
                          </Typography>
                          <Tooltip title="Copy address">
                            <IconButton
                              size="small"
                              onClick={() => navigator.clipboard.writeText(stream.token_address)}
                              sx={{ p: 0.25, opacity: 0.4, '&:hover': { opacity: 1 } }}
                            >
                              <ContentCopyIcon sx={{ fontSize: 12 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                      <TableCell align="center" sx={{ py: 0.5 }}>
                        <Chip
                          label={phaseMap[stream.current_phase_id] || `P${stream.current_phase_id}`}
                          size="small"
                          sx={{
                            bgcolor: `${getPhaseColor(stream.current_phase_id)}20`,
                            color: getPhaseColor(stream.current_phase_id),
                            fontSize: '0.65rem',
                            height: 22,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {formatAge(stream.started_at)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {stream.ath_price_sol != null ? stream.ath_price_sol.toFixed(8) : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={{ py: 0.5 }}>
                        {stream.is_active ? (
                          <CheckCircleIcon sx={{ fontSize: 16, color: '#4caf50' }} />
                        ) : (
                          <CancelIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.2)' }} />
                        )}
                      </TableCell>
                      <TableCell align="center" sx={{ py: 0.5 }}>
                        {stream.is_graduated ? (
                          <CheckCircleIcon sx={{ fontSize: 16, color: '#9c27b0' }} />
                        ) : (
                          <CancelIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.2)' }} />
                        )}
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>
                          {formatDate(stream.started_at)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
                          {stream.last_metric_at ? timeAgo(stream.last_metric_at) : '-'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography color="textSecondary">
                        {streams && streams.length > 0 ? 'No streams match filters' : 'No streams found'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* E) Load More + Info */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
          Showing {filteredStreams.length} of {streams?.length ?? 0} loaded ({streamStats?.total_streams ?? 0} total) - auto-refresh 10s
        </Typography>
        <Button
          variant="outlined"
          size="small"
          endIcon={<ExpandMoreIcon />}
          onClick={() => setLimit((prev) => prev + 50)}
          sx={{ fontSize: '0.75rem' }}
        >
          Load More
        </Button>
      </Box>
    </Box>
  );
};

function SortableCell({
  col,
  label,
  sortCol,
  sortDir,
  onSort,
  align,
}: {
  col: SortCol;
  label: string;
  sortCol: SortCol;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
  align?: 'center' | 'left' | 'right';
}) {
  return (
    <TableCell
      align={align}
      sortDirection={sortCol === col ? sortDir : false}
      sx={{
        fontWeight: 600,
        fontSize: '0.7rem',
        color: 'rgba(255,255,255,0.5)',
        bgcolor: '#1a1a2e',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        py: 0.75,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <TableSortLabel
        active={sortCol === col}
        direction={sortCol === col ? sortDir : 'asc'}
        onClick={() => onSort(col)}
        sx={{
          color: 'rgba(255,255,255,0.5) !important',
          '&.Mui-active': { color: '#00d4ff !important' },
          '& .MuiTableSortLabel-icon': { color: '#00d4ff !important' },
        }}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

export default Streams;
