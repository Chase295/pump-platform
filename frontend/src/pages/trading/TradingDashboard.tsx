import { useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ShowChart as ChartIcon,
  Receipt as ReceiptIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import type {
  Wallet,
  WalletPerformance,
  ExchangeRate,
  PnlHistoryResponse,
  TradeActivityResponse,
  TradeAnalytics,
  TradeLog,
} from '../../types/buy';

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------
interface StatCardProps {
  title: string;
  mainValue: string;
  subValue: string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ title, mainValue, subValue, icon, color }: StatCardProps) {
  return (
    <Card
      sx={{
        bgcolor: `rgba(${color}, 0.06)`,
        border: `1px solid rgba(${color}, 0.25)`,
        backdropFilter: 'blur(10px)',
        height: '100%',
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Typography
            variant="caption"
            sx={{ color: '#b8c5d6', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: 1 }}
          >
            {title}
          </Typography>
          {icon}
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.2 }}>
          {mainValue}
        </Typography>
        <Typography variant="caption" sx={{ color: '#8892a4', fontFamily: 'monospace' }}>
          {subValue}
        </Typography>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function TradingDashboard() {
  const ctx = useTradingContext();
  const [period, setPeriod] = useState<'24h' | '7d' | '30d' | 'all'>('24h');

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  // Exchange rate (refresh every 60s)
  const { data: exchangeRate } = useQuery<ExchangeRate>({
    queryKey: ['buy', 'exchangeRate'],
    queryFn: async () => (await buyApi.getExchangeRate()).data,
    refetchInterval: 60_000,
  });

  // Wallets (refresh every 10s)
  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ['buy', 'wallets', ctx.walletType],
    queryFn: async () => (await buyApi.getWallets(ctx.walletType)).data,
    refetchInterval: 10_000,
  });

  // Performance (refresh every 10s)
  const { data: performance = [] } = useQuery<WalletPerformance[]>({
    queryKey: ['buy', 'performance', ctx.walletType],
    queryFn: async () => {
      const res = await buyApi.getWalletPerformance();
      return res.data.filter((p: WalletPerformance) => p.type === ctx.walletType);
    },
    refetchInterval: 10_000,
  });

  // P&L History (refresh every 10s, depends on period)
  const { data: pnlHistory } = useQuery<PnlHistoryResponse>({
    queryKey: ['buy', 'pnlHistory', ctx.walletType, period],
    queryFn: async () => (await buyApi.getPnlHistory(ctx.walletType, period)).data,
    refetchInterval: 10_000,
  });

  // Trade Activity (refresh every 10s, depends on period)
  const { data: tradeActivity } = useQuery<TradeActivityResponse>({
    queryKey: ['buy', 'tradeActivity', ctx.walletType, period],
    queryFn: async () => (await buyApi.getTradeActivity(ctx.walletType, period)).data,
    refetchInterval: 10_000,
  });

  // Trade Analytics (refresh every 10s, depends on period)
  const { data: analytics } = useQuery<TradeAnalytics>({
    queryKey: ['buy', 'analytics', ctx.walletType, period],
    queryFn: async () => (await buyApi.getTradeAnalytics(ctx.walletType, period)).data,
    refetchInterval: 10_000,
  });

  // Recent trades (refresh every 10s)
  const { data: recentTrades = [] } = useQuery<TradeLog[]>({
    queryKey: ['buy', 'recentTrades', ctx.walletType],
    queryFn: async () => {
      const res = await buyApi.getTradeLogs(undefined, undefined, 10);
      return res.data.filter
        ? res.data.filter(() => {
            return true; // show all recent trades regardless of type
          })
        : res.data || [];
    },
    refetchInterval: 10_000,
  });

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  const solEur = exchangeRate?.sol_price_eur ?? 0;
  const solToEur = (sol: number) => sol * solEur;
  const fmtEur = (n: number) =>
    n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const fmtSol = (n: number) => `${n.toFixed(4)} SOL`;
  const truncateMint = (mint: string) =>
    mint ? `${mint.slice(0, 4)}...${mint.slice(-4)}` : '';
  const formatBucket = (bucket: unknown) => {
    try {
      const d = new Date(String(bucket));
      return period === '24h'
        ? format(d, 'HH:mm')
        : period === '7d'
          ? format(d, 'EEE HH:mm')
          : format(d, 'dd.MM');
    } catch {
      return String(bucket);
    }
  };

  // -----------------------------------------------------------------------
  // Computed values
  // -----------------------------------------------------------------------
  const totalBalance = wallets.reduce(
    (sum, w) => sum + (w.type === 'TEST' ? w.virtual_sol_balance : w.real_sol_balance),
    0,
  );
  const profit24h = performance.reduce((sum, p) => sum + p.profit_24h, 0);
  const totalTrades = performance.reduce((sum, p) => sum + p.trade_count, 0);
  const activeWallets = wallets.filter((w) => w.status === 'ACTIVE').length;

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  if (wallets.length === 0 && !exchangeRate) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress sx={{ color: '#00d4ff' }} />
      </Box>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <Box>
      {/* Header with period toggle */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Typography variant="h5">{ctx.label} Dashboard</Typography>
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(_, v) => v && setPeriod(v)}
          size="small"
        >
          {(['24h', '7d', '30d', 'all'] as const).map((p) => (
            <ToggleButton
              key={p}
              value={p}
              sx={{
                color: '#b8c5d6',
                '&.Mui-selected': {
                  color: `rgb(${ctx.accentColor})`,
                  bgcolor: `rgba(${ctx.accentColor}, 0.15)`,
                },
              }}
            >
              {p === 'all' ? 'All' : p}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Row 1: 6 KPI Stat Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatCard
            title="Portfolio"
            mainValue={fmtEur(solToEur(totalBalance))}
            subValue={fmtSol(totalBalance)}
            icon={<WalletIcon sx={{ color: `rgb(${ctx.accentColor})`, fontSize: 20 }} />}
            color="0, 212, 255"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatCard
            title="P&L 24h"
            mainValue={fmtEur(solToEur(profit24h))}
            subValue={fmtSol(profit24h)}
            icon={
              profit24h >= 0 ? (
                <TrendingUpIcon sx={{ color: '#4caf50', fontSize: 20 }} />
              ) : (
                <TrendingDownIcon sx={{ color: '#f44336', fontSize: 20 }} />
              )
            }
            color={profit24h >= 0 ? '76, 175, 80' : '244, 67, 54'}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatCard
            title="Trades"
            mainValue={`${totalTrades}`}
            subValue={`${analytics?.winning_trades ?? 0}W / ${analytics?.losing_trades ?? 0}L`}
            icon={<ChartIcon sx={{ color: '#ff9800', fontSize: 20 }} />}
            color="255, 152, 0"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatCard
            title="Win-Rate"
            mainValue={`${(analytics?.win_rate ?? 0).toFixed(1)}%`}
            subValue={`${analytics?.winning_trades ?? 0}W / ${analytics?.losing_trades ?? 0}L`}
            icon={
              <SpeedIcon
                sx={{
                  color: (analytics?.win_rate ?? 0) > 50 ? '#4caf50' : '#f44336',
                  fontSize: 20,
                }}
              />
            }
            color={(analytics?.win_rate ?? 0) > 50 ? '76, 175, 80' : '244, 67, 54'}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatCard
            title="Fees"
            mainValue={fmtEur(solToEur(analytics?.total_fees_sol ?? 0))}
            subValue={fmtSol(analytics?.total_fees_sol ?? 0)}
            icon={<ReceiptIcon sx={{ color: '#ff9800', fontSize: 20 }} />}
            color="255, 152, 0"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <StatCard
            title="Active Wallets"
            mainValue={`${activeWallets}/${wallets.length}`}
            subValue="Wallets"
            icon={<WalletIcon sx={{ color: `rgb(${ctx.accentColor})`, fontSize: 20 }} />}
            color="0, 212, 255"
          />
        </Grid>
      </Grid>

      {/* Row 2: P&L Chart (md:8) + Trade Activity Chart (md:4) */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card
            sx={{
              bgcolor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(10px)',
              p: 2,
            }}
          >
            <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
              P&L Zeitverlauf
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={pnlHistory?.data ?? []}>
                <defs>
                  <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4caf50" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#4caf50" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} stroke="#666" fontSize={11} />
                <YAxis
                  stroke="#666"
                  fontSize={11}
                  tickFormatter={(v: number) => fmtEur(solToEur(v))}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15,15,35,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                  }}
                  labelFormatter={formatBucket}
                  formatter={(value: number | undefined) => [fmtEur(solToEur(value ?? 0)), 'P&L']}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative_pnl_sol"
                  stroke="#4caf50"
                  fill="url(#pnlGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            sx={{
              bgcolor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(10px)',
              p: 2,
            }}
          >
            <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
              Trade Aktivitaet
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={tradeActivity?.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={formatBucket}
                  stroke="#666"
                  fontSize={11}
                />
                <YAxis stroke="#666" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15,15,35,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                  }}
                  labelFormatter={formatBucket}
                />
                <Bar dataKey="buy_count" name="BUY" stackId="a" fill="#4caf50" radius={[2, 2, 0, 0]} />
                <Bar
                  dataKey="sell_count"
                  name="SELL"
                  stackId="a"
                  fill="#f44336"
                  radius={[2, 2, 0, 0]}
                />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Grid>
      </Grid>

      {/* Row 3: Win/Loss Analysis (md:6) + Fee Breakdown (md:6) */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              bgcolor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(10px)',
              p: 2,
            }}
          >
            <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
              Win/Loss Analyse
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 5 }}>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Win', value: analytics?.winning_trades ?? 0 },
                        { name: 'Loss', value: analytics?.losing_trades ?? 0 },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      <Cell fill="#4caf50" />
                      <Cell fill="#f44336" />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15,15,35,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <Typography variant="h4" align="center" sx={{ fontWeight: 700, mt: -1 }}>
                  {analytics?.win_rate?.toFixed(1) ?? '0'}%
                </Typography>
                <Typography
                  variant="caption"
                  align="center"
                  display="block"
                  sx={{ color: '#8892a4' }}
                >
                  Win Rate
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 7 }}>
                {(
                  [
                    ['Profit Factor', analytics?.profit_factor?.toFixed(2) ?? '0'],
                    ['Avg Win', fmtEur(solToEur(analytics?.avg_win_sol ?? 0))],
                    ['Avg Loss', fmtEur(solToEur(analytics?.avg_loss_sol ?? 0))],
                    [
                      'Best Trade',
                      `${fmtEur(solToEur(analytics?.best_trade_sol ?? 0))} ${truncateMint(analytics?.best_trade_mint ?? '')}`,
                    ],
                    [
                      'Worst Trade',
                      `${fmtEur(solToEur(analytics?.worst_trade_sol ?? 0))} ${truncateMint(analytics?.worst_trade_mint ?? '')}`,
                    ],
                  ] as const
                ).map(([label, value]) => (
                  <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                    <Typography variant="body2" sx={{ color: '#b8c5d6' }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {value}
                    </Typography>
                  </Box>
                ))}
              </Grid>
            </Grid>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              bgcolor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(10px)',
              p: 2,
            }}
          >
            <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
              Gebuehren-Breakdown
            </Typography>
            {[
              { label: 'Network Fees', value: analytics?.total_network_fees_sol ?? 0, color: '#ff9800' },
              { label: 'Jito Tips', value: analytics?.total_jito_tips_sol ?? 0, color: '#f44336' },
            ].map(({ label, value, color }) => {
              const maxFee = Math.max(
                analytics?.total_network_fees_sol ?? 0,
                analytics?.total_jito_tips_sol ?? 0,
                0.0001,
              );
              return (
                <Box key={label} sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" sx={{ color: '#b8c5d6' }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {fmtEur(solToEur(value))}
                    </Typography>
                  </Box>
                  <Box sx={{ bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1, height: 8 }}>
                    <Box
                      sx={{
                        bgcolor: color,
                        borderRadius: 1,
                        height: 8,
                        width: `${(value / maxFee) * 100}%`,
                        transition: 'width 0.3s',
                      }}
                    />
                  </Box>
                </Box>
              );
            })}
            <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', mt: 2, pt: 2 }}>
              {(
                [
                  ['Total Fees', fmtEur(solToEur(analytics?.total_fees_sol ?? 0))],
                  ['Brutto P&L', fmtEur(solToEur(analytics?.gross_pnl_sol ?? 0))],
                  ['Netto P&L', fmtEur(solToEur(analytics?.net_pnl_sol ?? 0))],
                ] as const
              ).map(([label, value]) => (
                <Box
                  key={label}
                  sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}
                >
                  <Typography variant="body2" sx={{ color: '#b8c5d6' }}>
                    {label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Row 4: Wallet Performance Table */}
      {performance.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
            Wallet Performance
          </Typography>
          <TableContainer
            component={Paper}
            sx={{ bgcolor: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)' }}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: '#b8c5d6', borderColor: 'rgba(255,255,255,0.08)' }}>
                    Wallet
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: '#b8c5d6', borderColor: 'rgba(255,255,255,0.08)' }}
                  >
                    Balance
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: '#b8c5d6', borderColor: 'rgba(255,255,255,0.08)' }}
                  >
                    Net P&L
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: '#b8c5d6', borderColor: 'rgba(255,255,255,0.08)' }}
                  >
                    24h P&L
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: '#b8c5d6', borderColor: 'rgba(255,255,255,0.08)' }}
                  >
                    Trades
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ color: '#b8c5d6', borderColor: 'rgba(255,255,255,0.08)' }}
                  >
                    Losses
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {performance.map((p) => (
                  <TableRow key={p.alias}>
                    <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {p.alias}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {fmtEur(solToEur(p.current_balance))}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          color: p.net_profit_sol >= 0 ? '#4caf50' : '#f44336',
                          fontWeight: 600,
                        }}
                      >
                        {p.net_profit_sol >= 0 ? '+' : ''}
                        {fmtEur(solToEur(p.net_profit_sol))}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          color: p.profit_24h >= 0 ? '#4caf50' : '#f44336',
                        }}
                      >
                        {p.profit_24h >= 0 ? '+' : ''}
                        {fmtEur(solToEur(p.profit_24h))}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      {p.trade_count}
                    </TableCell>
                    <TableCell align="center" sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      <Typography
                        variant="body2"
                        sx={{ color: p.consecutive_losses > 0 ? '#ff9800' : '#4caf50' }}
                      >
                        {p.consecutive_losses}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Row 5: Wallet Comparison BarChart (md:6) + Live Trade Feed (md:6) */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              bgcolor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(10px)',
              p: 2,
            }}
          >
            <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
              Wallet Vergleich
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={performance}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="alias" stroke="#666" fontSize={11} />
                <YAxis
                  stroke="#666"
                  fontSize={11}
                  tickFormatter={(v: number) => fmtEur(solToEur(v))}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15,15,35,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                  }}
                  formatter={(value: number | undefined) => [fmtEur(solToEur(value ?? 0))]}
                />
                <Bar dataKey="net_profit_sol" name="Net P&L" fill="#00d4ff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit_24h" name="24h P&L" fill="#ff9800" radius={[4, 4, 0, 0]} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              bgcolor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(10px)',
              p: 2,
            }}
          >
            <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
              Letzte Trades
            </Typography>
            {recentTrades.length === 0 ? (
              <Typography variant="body2" sx={{ color: '#8892a4', textAlign: 'center', py: 4 }}>
                Keine Trades vorhanden
              </Typography>
            ) : (
              <Box>
                {recentTrades.map((trade) => (
                  <Box
                    key={trade.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      py: 1,
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <Chip
                      label={trade.action}
                      size="small"
                      sx={{
                        bgcolor:
                          trade.action === 'BUY'
                            ? 'rgba(76,175,80,0.2)'
                            : 'rgba(244,67,54,0.2)',
                        color: trade.action === 'BUY' ? '#4caf50' : '#f44336',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        minWidth: 44,
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace', color: '#b8c5d6', flex: 1 }}
                    >
                      {truncateMint(trade.mint)}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {fmtEur(solToEur(trade.amount_sol))}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: '#666', minWidth: 50, textAlign: 'right' }}
                    >
                      {format(new Date(trade.created_at), 'HH:mm')}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
