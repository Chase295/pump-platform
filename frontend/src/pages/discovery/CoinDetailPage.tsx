import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Alert,
  Button,
  Chip,
  CircularProgress,
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
  ArrowBack as BackIcon,
  ContentCopy as ContentCopyIcon,
  TrendingUp as UpIcon,
  TrendingDown as DownIcon,
  Remove as FlatIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { findApi } from '../../services/api';
import type { CoinDetailResponse, AnalyticsResponse, RecentMetric, WindowAnalytics } from '../../types/find';
import { getPhaseColor } from '../../utils/phaseColors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmtPrice = (v: number | null | undefined): string => {
  if (v == null) return '--';
  return v.toExponential(3);
};

const fmtSol = (v: number | null | undefined): string => {
  if (v == null) return '--';
  return v.toFixed(4);
};

const fmtNum = (v: number | null | undefined): string => {
  if (v == null) return '--';
  return v.toLocaleString('en-US');
};

const fmtPct = (v: number | null | undefined): string => {
  if (v == null) return '--';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
};

const fmtTimeMs = (ms: number) =>
  new Date(ms).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const timeAgo = (ts: string): string => {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 0) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const truncateAddress = (addr: string): string => {
  if (!addr || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const trendColor = (trend: string): string => {
  switch (trend) {
    case 'PUMP': return '#4caf50';
    case 'DUMP': return '#f44336';
    case 'FLAT': return '#ff9800';
    default: return 'rgba(255,255,255,0.3)';
  }
};

const WINDOWS = ['30s', '1m', '3m', '5m', '15m', '30m', '1h'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const CoinDetailPage: React.FC = () => {
  const { mint } = useParams<{ mint: string }>();
  const navigate = useNavigate();

  // Fetch coin detail
  const { data: detailRes, isLoading: detailLoading, error: detailError } = useQuery<CoinDetailResponse>({
    queryKey: ['find', 'coinDetail', mint],
    queryFn: async () => (await findApi.getCoinDetail(mint!)).data,
    enabled: !!mint,
    refetchInterval: 10000,
  });

  // Fetch analytics
  const { data: analytics } = useQuery<AnalyticsResponse>({
    queryKey: ['find', 'coinAnalytics', mint],
    queryFn: async () => (await findApi.getCoinAnalytics(mint!)).data,
    enabled: !!mint,
    refetchInterval: 10000,
  });

  // Fetch recent metrics for chart
  const { data: metrics } = useQuery<RecentMetric[]>({
    queryKey: ['find', 'coinMetrics', mint],
    queryFn: async () => {
      const res = await findApi.getRecentMetrics(200, mint!);
      return res.data.metrics ?? res.data;
    },
    enabled: !!mint,
    refetchInterval: 15000,
  });

  // Chart data
  const chartData = useMemo(() => {
    if (!metrics || metrics.length === 0) return [];
    return metrics
      .map((m) => ({
        timestampMs: new Date(m.timestamp).getTime(),
        price: m.price_close,
      }))
      .sort((a, b) => a.timestampMs - b.timestampMs);
  }, [metrics]);

  // Derived values
  const coin = detailRes?.coin;
  const stream = detailRes?.stream;
  const liveTracking = detailRes?.live_tracking;
  const latestMetric = detailRes?.latest_metrics;

  const coinName = (coin?.name as string) || null;
  const coinSymbol = (coin?.symbol as string) || null;

  // Helper: pick first truthy (non-zero, non-null) number from candidates
  const pick = (...vals: (number | null | undefined)[]): number | null => {
    for (const v of vals) {
      if (v != null && v !== 0) return v;
    }
    return null;
  };

  // Best-effort values: live_tracking > latest_metrics > discovered_coins
  const bestPrice = pick(liveTracking?.price_close, latestMetric?.price_close, coin?.price_sol as number);
  const bestMcap = pick(liveTracking?.market_cap_sol, latestMetric?.market_cap_close, coin?.market_cap_sol as number);
  const bestVolume = pick(liveTracking?.volume_sol, latestMetric?.volume_sol);
  const bestBuys = pick(liveTracking?.num_buys, latestMetric?.num_buys);
  const bestSells = pick(liveTracking?.num_sells, latestMetric?.num_sells);
  const bestWallets = pick(liveTracking?.unique_wallets, latestMetric?.unique_wallets);
  const bestAth = pick(stream?.ath_price_sol);

  if (detailLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (detailError) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 3 }}>
          Error loading coin details: {(detailError as Error)?.message || 'Data not found'}
        </Alert>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/discovery')}>
          Back to Discovery
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <Button
              startIcon={<BackIcon />}
              onClick={() => navigate('/discovery')}
              variant="outlined"
              size="small"
              sx={{ minWidth: 'auto' }}
            >
              Back
            </Button>
            <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', sm: '1.8rem' } }}>
              {coinName && coinSymbol ? `${coinName} (${coinSymbol})` : truncateAddress(mint || '')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography
              variant="body2"
              sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all' }}
            >
              {mint}
            </Typography>
            <Tooltip title="Copy address">
              <IconButton
                size="small"
                onClick={() => navigator.clipboard.writeText(mint || '')}
                sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1 } }}
              >
                <ContentCopyIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            {stream && (
              <>
                <Chip
                  label={`Phase ${stream.current_phase_id}`}
                  size="small"
                  sx={{
                    bgcolor: `${getPhaseColor(stream.current_phase_id)}20`,
                    color: getPhaseColor(stream.current_phase_id),
                    fontSize: '0.7rem',
                    height: 22,
                  }}
                />
                <Chip
                  label={stream.is_active ? 'Active' : 'Ended'}
                  size="small"
                  sx={{
                    bgcolor: stream.is_active ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)',
                    color: stream.is_active ? '#4caf50' : '#f44336',
                    fontSize: '0.7rem',
                    height: 22,
                  }}
                />
                {stream.is_graduated && (
                  <Chip
                    label="Graduated"
                    size="small"
                    sx={{ bgcolor: 'rgba(156,39,176,0.15)', color: '#9c27b0', fontSize: '0.7rem', height: 22 }}
                  />
                )}
              </>
            )}
          </Box>
        </Box>
      </Box>

      {/* ================================================================ */}
      {/* COIN INFO (from discovered_coins)                                */}
      {/* ================================================================ */}
      {coin && (
        <Card sx={{ bgcolor: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)', mb: 2 }}>
          <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1 }}>
              Coin Info
            </Typography>
          </Box>
          <Box sx={{ px: 2, pb: 1.5 }}>
            <Grid container spacing={1.5}>
              {([
                ['Platform', coin.deploy_platform],
                ['Pool Type', coin.pool_type],
                ['Classification', coin.classification],
                ['Outcome', coin.final_outcome],
                ['Liquidity', coin.liquidity_sol != null ? `${Number(coin.liquidity_sol).toFixed(2)} SOL` : null],
                ['Initial Buy', coin.initial_buy_sol != null ? `${Number(coin.initial_buy_sol).toFixed(4)} SOL` : null],
                ['Risk Score', coin.risk_score],
                ['Top 10 Holders', coin.top_10_holders_pct != null ? `${Number(coin.top_10_holders_pct).toFixed(1)}%` : null],
                ['Socials', coin.has_socials ? `${coin.social_count} links` : 'None'],
                ['Discovered', coin.discovered_at ? new Date(coin.discovered_at as string).toLocaleString('de-DE') : null],
              ] as [string, unknown][])
                .filter(([, v]) => v != null && v !== '' && v !== 'None')
                .map(([label, value]) => (
                  <Grid key={label} size={{ xs: 6, sm: 4, md: 3 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block' }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {String(value)}
                    </Typography>
                  </Grid>
                ))}
            </Grid>
          </Box>
        </Card>
      )}

      {/* ================================================================ */}
      {/* STAT CARDS                                                        */}
      {/* ================================================================ */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatCard label="Price" value={fmtPrice(bestPrice)} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatCard label="Market Cap" value={fmtSol(bestMcap)} suffix="SOL" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatCard label="ATH" value={fmtPrice(bestAth)} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatCard label="Volume" value={fmtSol(bestVolume)} suffix="SOL" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatCard
            label="Buy / Sell"
            value={bestBuys != null || bestSells != null ? `${fmtNum(bestBuys)} / ${fmtNum(bestSells)}` : '--'}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatCard label="Wallets" value={fmtNum(bestWallets)} />
        </Grid>
      </Grid>

      {/* ================================================================ */}
      {/* PERFORMANCE TABLE                                                */}
      {/* ================================================================ */}
      {analytics?.performance && (
        <Card sx={{ bgcolor: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)', mb: 2 }}>
          <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1 }}>
              Performance Windows
            </Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Window', 'Price Change', 'Trend', 'Data Age'].map((h) => (
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
                {WINDOWS.map((w) => {
                  const perf: WindowAnalytics | undefined = analytics.performance[w];
                  if (!perf) return null;
                  return (
                    <TableRow key={w} sx={{ '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)' } }}>
                      <TableCell sx={{ py: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{w}</Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: perf.price_change_pct == null
                              ? 'rgba(255,255,255,0.3)'
                              : perf.price_change_pct >= 0 ? '#4caf50' : '#f44336',
                          }}
                        >
                          {fmtPct(perf.price_change_pct)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <Chip
                          icon={
                            perf.trend === 'PUMP' ? <UpIcon sx={{ fontSize: 14 }} /> :
                            perf.trend === 'DUMP' ? <DownIcon sx={{ fontSize: 14 }} /> :
                            <FlatIcon sx={{ fontSize: 14 }} />
                          }
                          label={perf.trend}
                          size="small"
                          sx={{
                            bgcolor: `${trendColor(perf.trend)}15`,
                            color: trendColor(perf.trend),
                            fontSize: '0.65rem',
                            height: 22,
                            fontWeight: 600,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                          {perf.data_age_seconds != null ? `${Math.floor(perf.data_age_seconds)}s` : '--'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* ================================================================ */}
      {/* PRICE CHART                                                      */}
      {/* ================================================================ */}
      <Card sx={{ bgcolor: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)', mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1 }}>
              Price History
            </Typography>
            <Chip label={`${chartData.length} points`} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
          </Box>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" />
                <XAxis
                  dataKey="timestampMs"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  stroke="rgba(255, 255, 255, 0.5)"
                  tick={{ fontSize: 10 }}
                  tickFormatter={fmtTimeMs}
                />
                <YAxis
                  stroke="rgba(255, 255, 255, 0.5)"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.toExponential(2)}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 15, 35, 0.95)',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 12,
                  }}
                  labelFormatter={(ms) => fmtTimeMs(ms as number)}
                  formatter={(value: number | undefined) => [
                    value !== undefined ? value.toExponential(4) : '--',
                    'Price',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#00d4ff"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#00d4ff' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                No price data available
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* METRICS TABLE                                                    */}
      {/* ================================================================ */}
      <Card sx={{ bgcolor: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)' }}>
        <Box sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1 }}>
            Recent Metrics
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem' }}>
            {metrics?.length ?? 0} entries
          </Typography>
        </Box>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {['Time', 'Price', 'Volume', 'Buys', 'Sells', 'Wallets', 'Market Cap'].map((h) => (
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
              {metrics && metrics.length > 0 ? (
                metrics.map((m, i) => (
                  <TableRow
                    key={`${m.timestamp}-${i}`}
                    sx={{
                      '&:nth-of-type(odd)': { bgcolor: 'rgba(255,255,255,0.02)' },
                      '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)' },
                    }}
                  >
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>
                        {timeAgo(m.timestamp)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {fmtPrice(m.price_close)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {fmtSol(m.volume_sol)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2" sx={{ color: '#4caf50', fontSize: '0.75rem' }}>
                        {fmtNum(m.num_buys)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2" sx={{ color: '#f44336', fontSize: '0.75rem' }}>
                        {fmtNum(m.num_sells)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {fmtNum(m.unique_wallets)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {m.market_cap_close != null ? fmtSol(m.market_cap_close) : '--'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="textSecondary" variant="body2">
                      {metrics ? 'No metrics data' : 'Loading...'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------
function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <Card sx={{ bgcolor: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)', height: '100%' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.95rem', mt: 0.25 }}>
          {value}
          {suffix && (
            <Typography component="span" sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', ml: 0.5 }}>
              {suffix}
            </Typography>
          )}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default CoinDetailPage;
