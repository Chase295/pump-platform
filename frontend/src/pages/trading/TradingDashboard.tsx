import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  LinearProgress,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ShowChart as ChartIcon,
  Receipt as ReceiptIcon,
  Speed as SpeedIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import {
  useExchangeRate,
  fmtEur,
  fmtSol,
  fmtRelativeTime,
  truncateMint,
  CARD_SX,
  TOOLTIP_STYLE,
} from './tradingUtils';
import type {
  Wallet,
  WalletPerformance,
  DashboardStats,
  PnlHistoryResponse,
  TradeAnalytics,
  RecentSell,
  ValuedPosition,
} from '../../types/buy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const POS = '#4caf50';
const NEG = '#f44336';
const WARN = '#ff9800';
const MUTED = 'rgba(255,255,255,0.4)';
const MUTED2 = 'rgba(255,255,255,0.3)';

const profitColor = (v: number) => (v >= 0 ? POS : NEG);
const signed = (v: number, s: string) => (v >= 0 ? `+${s}` : s);

// Detail row used inside analysis card
function DetailRow({
  label,
  value,
  color,
  mono = true,
}: {
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.6, alignItems: 'center' }}>
      <Typography variant="body2" sx={{ color: '#b8c5d6', fontSize: '0.8rem' }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontFamily: mono ? 'monospace' : undefined,
          fontWeight: 600,
          fontSize: '0.8rem',
          color: color ?? 'inherit',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function TradingDashboard() {
  const ctx = useTradingContext();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<'24h' | '7d' | '30d' | 'all'>('24h');

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------
  const { data: exchangeRate } = useExchangeRate();

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ['buy', 'wallets', ctx.walletType],
    queryFn: async () => (await buyApi.getWallets(ctx.walletType)).data,
    refetchInterval: 10_000,
  });

  const { data: performance = [] } = useQuery<WalletPerformance[]>({
    queryKey: ['buy', 'performance', ctx.walletType],
    queryFn: async () => {
      const res = await buyApi.getWalletPerformance();
      return res.data.filter((p: WalletPerformance) => p.type === ctx.walletType);
    },
    refetchInterval: 10_000,
  });

  const { data: dashboardStats } = useQuery<DashboardStats>({
    queryKey: ['buy', 'dashboardStats'],
    queryFn: async () => (await buyApi.getDashboardStats()).data,
    refetchInterval: 10_000,
  });

  const { data: pnlHistory } = useQuery<PnlHistoryResponse>({
    queryKey: ['buy', 'pnlHistory', ctx.walletType, period],
    queryFn: async () => (await buyApi.getPnlHistory(ctx.walletType, period)).data,
    refetchInterval: 10_000,
  });

  const { data: analytics } = useQuery<TradeAnalytics>({
    queryKey: ['buy', 'analytics', ctx.walletType, period],
    queryFn: async () => (await buyApi.getTradeAnalytics(ctx.walletType, period)).data,
    refetchInterval: 10_000,
  });

  const { data: recentSells = [] } = useQuery<RecentSell[]>({
    queryKey: ['buy', 'recentSells', ctx.walletType],
    queryFn: async () => (await buyApi.getRecentSells(ctx.walletType, 20)).data ?? [],
    refetchInterval: 10_000,
  });

  // Open positions with live valuation
  const activeWalletAliases = wallets
    .filter((w) => w.status === 'ACTIVE')
    .map((w) => w.alias);

  const { data: allPositionsValued = [] } = useQuery<
    (ValuedPosition & { wallet_alias: string })[]
  >({
    queryKey: ['buy', 'positionsValued', activeWalletAliases],
    queryFn: async () => {
      const results: (ValuedPosition & { wallet_alias: string })[] = [];
      for (const alias of activeWalletAliases) {
        try {
          const res = await buyApi.getWalletPositionsValued(alias);
          const positions: ValuedPosition[] = res.data ?? [];
          for (const p of positions) {
            results.push({ ...p, wallet_alias: alias });
          }
        } catch {
          // wallet may have no positions
        }
      }
      return results;
    },
    enabled: activeWalletAliases.length > 0,
    refetchInterval: 15_000,
  });

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------
  const solEur = exchangeRate?.sol_price_eur ?? 0;
  const solToEur = (sol: number) => sol * solEur;

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

  const totalBalance = wallets.reduce(
    (sum, w) => sum + (w.type === 'TEST' ? w.virtual_sol_balance : w.real_sol_balance),
    0,
  );
  const totalProfit = performance.reduce((sum, p) => sum + p.net_profit_sol, 0);
  const profit24h = performance.reduce((sum, p) => sum + p.profit_24h, 0);

  const winCount = analytics?.winning_trades ?? 0;
  const loseCount = analytics?.losing_trades ?? 0;
  const totalTrades = winCount + loseCount;
  const winRate = analytics?.win_rate ?? 0;
  const profitFactor = analytics?.profit_factor ?? 0;
  const openPositions = dashboardStats?.open_positions ?? allPositionsValued.length;

  // Ø pro Trade: single value = net_pnl / total_trades
  const avgPerTrade = totalTrades > 0 ? (analytics?.net_pnl_sol ?? 0) / totalTrades : 0;

  const maxConsecLosses = performance.length > 0
    ? Math.max(...performance.map((p) => p.consecutive_losses))
    : 0;

  // -----------------------------------------------------------------------
  // Loading
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
      {/* ================================================================ */}
      {/* ROW 1 — Hero Cards: Portfolio, Gewinn Gesamt, Heute             */}
      {/* ================================================================ */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {/* Portfolio */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            sx={{
              bgcolor: `rgba(${ctx.accentColor}, 0.07)`,
              border: `1px solid rgba(${ctx.accentColor}, 0.25)`,
              backdropFilter: 'blur(10px)',
              height: '100%',
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1,
                    bgcolor: `rgba(${ctx.accentColor}, 0.2)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <WalletIcon sx={{ color: `rgb(${ctx.accentColor})`, fontSize: 18 }} />
                </Box>
                <Typography
                  variant="caption"
                  sx={{ color: MUTED, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: 1.2, fontWeight: 600 }}
                >
                  Portfolio
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.1 }}>
                {fmtEur(solToEur(totalBalance))}
              </Typography>
              <Typography variant="body2" sx={{ color: MUTED, fontFamily: 'monospace', mt: 0.5 }}>
                {fmtSol(totalBalance)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Gewinn Gesamt */}
        <Grid size={{ xs: 6, md: 4 }}>
          <Card
            sx={{
              bgcolor: `rgba(${totalProfit >= 0 ? '76,175,80' : '244,67,54'}, 0.06)`,
              border: `1px solid rgba(${totalProfit >= 0 ? '76,175,80' : '244,67,54'}, 0.2)`,
              backdropFilter: 'blur(10px)',
              height: '100%',
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                {totalProfit >= 0 ? (
                  <TrendingUpIcon sx={{ color: POS, fontSize: 18 }} />
                ) : (
                  <TrendingDownIcon sx={{ color: NEG, fontSize: 18 }} />
                )}
                <Typography
                  variant="caption"
                  sx={{ color: MUTED, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: 1.2, fontWeight: 600 }}
                >
                  Gewinn Gesamt
                </Typography>
              </Box>
              <Typography
                variant="h4"
                sx={{ fontWeight: 700, fontFamily: 'monospace', color: profitColor(totalProfit), lineHeight: 1.1 }}
              >
                {signed(totalProfit, fmtEur(solToEur(totalProfit)))}
              </Typography>
              <Typography variant="body2" sx={{ color: MUTED, fontFamily: 'monospace', mt: 0.5 }}>
                {signed(totalProfit, fmtSol(totalProfit))}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Heute */}
        <Grid size={{ xs: 6, md: 4 }}>
          <Card
            sx={{
              bgcolor: `rgba(${profit24h >= 0 ? '76,175,80' : '244,67,54'}, 0.06)`,
              border: `1px solid rgba(${profit24h >= 0 ? '76,175,80' : '244,67,54'}, 0.2)`,
              backdropFilter: 'blur(10px)',
              height: '100%',
            }}
          >
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <ChartIcon sx={{ color: profitColor(profit24h), fontSize: 18 }} />
                <Typography
                  variant="caption"
                  sx={{ color: MUTED, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: 1.2, fontWeight: 600 }}
                >
                  Heute
                </Typography>
              </Box>
              <Typography
                variant="h4"
                sx={{ fontWeight: 700, fontFamily: 'monospace', color: profitColor(profit24h), lineHeight: 1.1 }}
              >
                {signed(profit24h, fmtEur(solToEur(profit24h)))}
              </Typography>
              <Typography variant="body2" sx={{ color: MUTED, fontFamily: 'monospace', mt: 0.5 }}>
                {signed(profit24h, fmtSol(profit24h))}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ================================================================ */}
      {/* ROW 2 — KPI Strip: 6 compact metric cards                       */}
      {/* ================================================================ */}
      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {(
          [
            {
              label: 'Trades',
              value: `${totalTrades}`,
              sub: `${winCount} gew. / ${loseCount} verl.`,
              icon: <ChartIcon sx={{ color: WARN, fontSize: 16 }} />,
              accent: '255,152,0',
            },
            {
              label: 'Gewinnrate',
              value: `${winRate.toFixed(1)}%`,
              sub: null, // progress bar instead
              icon: <SpeedIcon sx={{ color: winRate > 50 ? POS : NEG, fontSize: 16 }} />,
              accent: winRate > 50 ? '76,175,80' : '244,67,54',
              progress: winRate,
            },
            {
              label: '\u00D8 pro Trade',
              value: signed(avgPerTrade, fmtEur(solToEur(avgPerTrade))),
              sub: signed(avgPerTrade, fmtSol(avgPerTrade)),
              icon: avgPerTrade >= 0
                ? <TrendingUpIcon sx={{ color: POS, fontSize: 16 }} />
                : <TrendingDownIcon sx={{ color: NEG, fontSize: 16 }} />,
              accent: avgPerTrade >= 0 ? '76,175,80' : '244,67,54',
              valueColor: profitColor(avgPerTrade),
            },
            {
              label: 'Gewinnfaktor',
              value: profitFactor.toFixed(2),
              sub: profitFactor >= 1.5 ? 'Gut' : profitFactor >= 1 ? 'OK' : 'Schlecht',
              icon: <SpeedIcon sx={{ color: profitFactor >= 1 ? POS : NEG, fontSize: 16 }} />,
              accent: profitFactor >= 1 ? '76,175,80' : '244,67,54',
            },
            {
              label: 'Geb\u00FChren',
              value: fmtEur(solToEur(analytics?.total_fees_sol ?? 0)),
              sub: fmtSol(analytics?.total_fees_sol ?? 0),
              icon: <ReceiptIcon sx={{ color: WARN, fontSize: 16 }} />,
              accent: '255,152,0',
            },
            {
              label: 'Offene Pos.',
              value: `${openPositions}`,
              sub: `${wallets.filter((w) => w.status === 'ACTIVE').length} Wallets aktiv`,
              icon: <OpenIcon sx={{ color: `rgb(${ctx.accentColor})`, fontSize: 16 }} />,
              accent: ctx.accentColor,
            },
          ] as const
        ).map((kpi) => (
          <Grid size={{ xs: 6, sm: 4, md: 2 }} key={kpi.label}>
            <Card
              sx={{
                bgcolor: `rgba(${kpi.accent}, 0.04)`,
                border: `1px solid rgba(${kpi.accent}, 0.15)`,
                backdropFilter: 'blur(10px)',
                height: '100%',
              }}
            >
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography
                    variant="caption"
                    sx={{ color: MUTED, textTransform: 'uppercase', fontSize: '0.55rem', letterSpacing: 0.8, fontWeight: 600 }}
                  >
                    {kpi.label}
                  </Typography>
                  {kpi.icon}
                </Box>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    lineHeight: 1.2,
                    fontSize: '1.05rem',
                    color: ('valueColor' in kpi ? kpi.valueColor : undefined) ?? 'inherit',
                  }}
                >
                  {kpi.value}
                </Typography>
                {'progress' in kpi && kpi.progress != null ? (
                  <LinearProgress
                    variant="determinate"
                    value={kpi.progress}
                    sx={{
                      mt: 0.5,
                      height: 4,
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.06)',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: `rgb(${kpi.accent})`,
                        borderRadius: 2,
                      },
                    }}
                  />
                ) : (
                  <Typography variant="caption" sx={{ color: MUTED2, fontFamily: 'monospace', fontSize: '0.65rem' }}>
                    {kpi.sub}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ================================================================ */}
      {/* ROW 3 — P&L Chart (md:8) + Detaillierte Analyse (md:4)          */}
      {/* ================================================================ */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {/* P&L Chart */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ ...CARD_SX, p: 2, height: '100%' }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 2,
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Typography variant="subtitle2" sx={{ color: '#b8c5d6' }}>
                Gewinn-Verlauf
              </Typography>
              <ToggleButtonGroup
                value={period}
                exclusive
                onChange={(_, v) => v && setPeriod(v)}
                size="small"
              >
                {(
                  [
                    ['24h', '24h'],
                    ['7d', '7 Tage'],
                    ['30d', '30 Tage'],
                    ['all', 'Gesamt'],
                  ] as const
                ).map(([val, label]) => (
                  <ToggleButton
                    key={val}
                    value={val}
                    sx={{
                      color: '#b8c5d6',
                      fontSize: '0.65rem',
                      px: 1.2,
                      py: 0.3,
                      '&.Mui-selected': {
                        color: `rgb(${ctx.accentColor})`,
                        bgcolor: `rgba(${ctx.accentColor}, 0.15)`,
                      },
                    }}
                  >
                    {label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={pnlHistory?.data ?? []}>
                <defs>
                  <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={POS} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={POS} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} stroke="#666" fontSize={11} />
                <YAxis stroke="#666" fontSize={11} tickFormatter={(v: number) => fmtEur(solToEur(v))} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={formatBucket}
                  formatter={(value: number | undefined) => [fmtEur(solToEur(value ?? 0)), 'Gewinn']}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative_pnl_sol"
                  stroke={POS}
                  fill="url(#pnlGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Grid>

        {/* Detaillierte Analyse */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ ...CARD_SX, p: 2, height: '100%' }}>
            <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 1.5 }}>
              Trade-Analyse
            </Typography>

            {/* Netto / Brutto */}
            <DetailRow
              label="Netto-Gewinn"
              value={signed(analytics?.net_pnl_sol ?? 0, fmtEur(solToEur(analytics?.net_pnl_sol ?? 0)))}
              color={profitColor(analytics?.net_pnl_sol ?? 0)}
            />
            <DetailRow
              label="Brutto-Gewinn"
              value={signed(analytics?.gross_pnl_sol ?? 0, fmtEur(solToEur(analytics?.gross_pnl_sol ?? 0)))}
              color={profitColor(analytics?.gross_pnl_sol ?? 0)}
            />

            <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.06)', my: 1 }} />

            {/* Best / Worst */}
            <DetailRow
              label="Bester Trade"
              value={`${signed(analytics?.best_trade_sol ?? 0, fmtEur(solToEur(analytics?.best_trade_sol ?? 0)))} ${truncateMint(analytics?.best_trade_mint ?? '')}`}
              color={POS}
            />
            <DetailRow
              label="Schlechtester Trade"
              value={`${signed(analytics?.worst_trade_sol ?? 0, fmtEur(solToEur(analytics?.worst_trade_sol ?? 0)))} ${truncateMint(analytics?.worst_trade_mint ?? '')}`}
              color={NEG}
            />

            <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.06)', my: 1 }} />

            {/* Fees breakdown */}
            <DetailRow
              label="Netzwerk-Geb\u00FChren"
              value={fmtEur(solToEur(analytics?.total_network_fees_sol ?? 0))}
            />
            <DetailRow
              label="Jito-Geb\u00FChren"
              value={fmtEur(solToEur(analytics?.total_jito_tips_sol ?? 0))}
            />
            <DetailRow
              label="Geb\u00FChren Gesamt"
              value={fmtEur(solToEur(analytics?.total_fees_sol ?? 0))}
              color={WARN}
            />

            <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.06)', my: 1 }} />

            {/* Streaks */}
            <DetailRow
              label="Verluste in Folge (max)"
              value={`${maxConsecLosses}`}
              color={maxConsecLosses > 3 ? NEG : maxConsecLosses > 0 ? WARN : POS}
            />
            <DetailRow
              label="Heutiges Volumen"
              value={fmtEur(solToEur(dashboardStats?.total_volume_today ?? 0))}
            />
          </Card>
        </Grid>
      </Grid>

      {/* ================================================================ */}
      {/* ROW 4 — Offene Positionen                                        */}
      {/* ================================================================ */}
      <Card sx={{ ...CARD_SX, p: 2, mb: 2.5 }}>
        <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 1.5 }}>
          Offene Positionen ({allPositionsValued.length})
        </Typography>
        {allPositionsValued.length === 0 ? (
          <Typography variant="body2" sx={{ color: MUTED2, textAlign: 'center', py: 3 }}>
            Keine offenen Positionen
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {allPositionsValued.map((pos) => {
              const pnl = pos.unrealized_pnl_sol ?? 0;
              const currentVal = pos.current_value_sol ?? pos.initial_sol_spent;
              const pnlPct =
                pos.initial_sol_spent > 0
                  ? (currentVal / pos.initial_sol_spent - 1) * 100
                  : 0;
              return (
                <Box
                  key={`${pos.wallet_alias}-${pos.mint}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    py: 1.2,
                    px: 1.5,
                    bgcolor: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 1.5,
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Mint + Wallet */}
                  <Box sx={{ minWidth: 100, flex: '1 1 auto' }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                      {truncateMint(pos.mint)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: MUTED, fontSize: '0.6rem' }}>
                      {pos.wallet_alias}
                    </Typography>
                  </Box>

                  {/* Einsatz */}
                  <Box sx={{ textAlign: 'center', minWidth: 70 }}>
                    <Typography variant="caption" sx={{ color: MUTED, fontSize: '0.55rem', textTransform: 'uppercase' }}>
                      Einsatz
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {fmtSol(pos.initial_sol_spent)}
                    </Typography>
                  </Box>

                  {/* Aktuell */}
                  <Box sx={{ textAlign: 'center', minWidth: 70 }}>
                    <Typography variant="caption" sx={{ color: MUTED, fontSize: '0.55rem', textTransform: 'uppercase' }}>
                      Aktuell
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: profitColor(pnl) }}
                    >
                      {fmtSol(currentVal)}
                    </Typography>
                  </Box>

                  {/* P&L */}
                  <Box sx={{ textAlign: 'center', minWidth: 80 }}>
                    <Typography variant="caption" sx={{ color: MUTED, fontSize: '0.55rem', textTransform: 'uppercase' }}>
                      Gewinn
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, color: profitColor(pnl) }}
                    >
                      {signed(pnl, fmtEur(solToEur(pnl)))}
                    </Typography>
                  </Box>

                  {/* % */}
                  <Chip
                    label={`${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%`}
                    size="small"
                    sx={{
                      bgcolor: `rgba(${pnl >= 0 ? '76,175,80' : '244,67,54'}, 0.15)`,
                      color: profitColor(pnl),
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      minWidth: 70,
                    }}
                  />

                  {/* Zeit */}
                  <Typography variant="caption" sx={{ color: MUTED2, fontSize: '0.65rem', minWidth: 60, textAlign: 'right' }}>
                    {fmtRelativeTime(pos.created_at)}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </Card>

      {/* ================================================================ */}
      {/* ROW 5 — Wallet Performance                                       */}
      {/* ================================================================ */}
      {performance.length > 0 && (
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 1.5 }}>
            Wallet-\u00DCbersicht
          </Typography>
          <Grid container spacing={1.5}>
            {performance.map((p) => {
              const balance = p.current_balance;
              return (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={p.alias}>
                  <Card sx={{ ...CARD_SX, height: '100%' }}>
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      {/* Header */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Typography variant="body1" sx={{ fontWeight: 700 }}>
                          {p.alias}
                        </Typography>
                        <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          {fmtSol(balance)}
                        </Typography>
                      </Box>

                      {/* EUR value */}
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: MUTED, mb: 1.5 }}>
                        {fmtEur(solToEur(balance))}
                      </Typography>

                      {/* Stats grid */}
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        <Box>
                          <Typography variant="caption" sx={{ color: MUTED, fontSize: '0.55rem', textTransform: 'uppercase' }}>
                            Netto-Gewinn
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: 'monospace', fontWeight: 600, color: profitColor(p.net_profit_sol) }}
                          >
                            {signed(p.net_profit_sol, fmtEur(solToEur(p.net_profit_sol)))}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: MUTED, fontSize: '0.55rem', textTransform: 'uppercase' }}>
                            Heute
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: 'monospace', color: profitColor(p.profit_24h) }}
                          >
                            {signed(p.profit_24h, fmtEur(solToEur(p.profit_24h)))}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: MUTED, fontSize: '0.55rem', textTransform: 'uppercase' }}>
                            Trades
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {p.trade_count}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: MUTED, fontSize: '0.55rem', textTransform: 'uppercase' }}>
                            Verluste i.F.
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              color: p.consecutive_losses > 3 ? NEG : p.consecutive_losses > 0 ? WARN : POS,
                            }}
                          >
                            {p.consecutive_losses}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* ================================================================ */}
      {/* ROW 6 — Letzte Verkäufe (mit P&L)                                */}
      {/* ================================================================ */}
      <Card sx={{ ...CARD_SX, p: 2 }}>
        <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 1.5 }}>
          Letzte Verk\u00E4ufe
        </Typography>
        {recentSells.length === 0 ? (
          <Typography variant="body2" sx={{ color: MUTED2, textAlign: 'center', py: 4 }}>
            Keine Verk\u00E4ufe vorhanden
          </Typography>
        ) : (
          <Box>
            {recentSells.map((sell) => (
              <Box
                key={sell.id}
                onClick={() => navigate(`${ctx.basePath}/coin/${encodeURIComponent(sell.mint)}`)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: { xs: 1, sm: 2 },
                  py: 1.2,
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  flexWrap: 'wrap',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                }}
              >
                {/* P&L % Chip */}
                <Chip
                  label={`${sell.pnl_percent >= 0 ? '+' : ''}${sell.pnl_percent.toFixed(1)}%`}
                  size="small"
                  sx={{
                    bgcolor: `rgba(${sell.pnl_sol >= 0 ? '76,175,80' : '244,67,54'}, 0.15)`,
                    color: profitColor(sell.pnl_sol),
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    minWidth: 65,
                  }}
                />

                {/* Mint + Wallet */}
                <Box sx={{ flex: 1, minWidth: 80 }}>
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: 'monospace', color: '#b8c5d6', fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    {truncateMint(sell.mint)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: MUTED2, fontSize: '0.6rem' }}>
                    {sell.wallet_alias}
                  </Typography>
                </Box>

                {/* P&L EUR */}
                <Box sx={{ textAlign: 'right', minWidth: 70 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      color: profitColor(sell.pnl_sol),
                    }}
                  >
                    {signed(sell.pnl_sol, fmtEur(solToEur(sell.pnl_sol)))}
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: MUTED, fontSize: '0.6rem' }}>
                    {signed(sell.pnl_sol, fmtSol(sell.pnl_sol))}
                  </Typography>
                </Box>

                {/* Erlös */}
                <Box sx={{ textAlign: 'right', minWidth: 65 }}>
                  <Typography
                    variant="caption"
                    sx={{ color: MUTED, fontSize: '0.55rem', textTransform: 'uppercase' }}
                  >
                    Erl\u00F6s
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                  >
                    {fmtSol(sell.amount_sol)}
                  </Typography>
                </Box>

                {/* Zeit */}
                <Typography
                  variant="caption"
                  sx={{ color: MUTED2, fontSize: '0.6rem', minWidth: 55, textAlign: 'right' }}
                >
                  {fmtRelativeTime(sell.created_at)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Card>
    </Box>
  );
}
