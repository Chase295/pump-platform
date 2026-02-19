import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ContentCopy as ContentCopyIcon,
  Edit as EditIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ShowChart as ChartIcon,
  Speed as SpeedIcon,
  Sell as SellIcon,
} from '@mui/icons-material';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import {
  useExchangeRate,
  fmtEur,
  fmtSol,
  truncateMint,
  parseApiError,
  STATUS_COLORS,
  TYPE_COLORS,
  ACTION_COLORS,
  CARD_SX,
  TOOLTIP_STYLE,
} from './tradingUtils';
import type {
  Wallet,
  WalletAnalytics,
  ValuedPosition,
  TradeLog,
  WalletStatus,
  PnlBucket,
} from '../../types/buy';

// ---------------------------------------------------------------------------
// Stat Card (local to this page)
// ---------------------------------------------------------------------------
function StatCard({
  title,
  mainValue,
  subValue,
  icon,
  color,
}: {
  title: string;
  mainValue: string;
  subValue: string;
  icon: React.ReactNode;
  color: string;
}) {
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
export default function WalletDetail() {
  const { alias } = useParams<{ alias: string }>();
  const navigate = useNavigate();
  const ctx = useTradingContext();
  const queryClient = useQueryClient();

  // State
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    virtual_loss_percent: 0,
    max_consecutive_losses: 0,
    max_daily_loss_pct: 0,
    status: 'ACTIVE' as WalletStatus,
    trading_enabled: false,
    transfer_enabled: false,
  });
  const [pnlPeriod, setPnlPeriod] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------
  const { data: exchangeRate } = useExchangeRate();

  const { data: wallet, isLoading: walletLoading } = useQuery<Wallet>({
    queryKey: ['buy', 'wallet', alias],
    queryFn: async () => (await buyApi.getWallet(alias!)).data,
    enabled: !!alias,
  });

  const { data: analytics } = useQuery<WalletAnalytics>({
    queryKey: ['buy', 'walletAnalytics', alias],
    queryFn: async () => (await buyApi.getWalletAnalytics(alias!)).data,
    enabled: !!alias,
  });

  const { data: pnlData } = useQuery<PnlBucket[]>({
    queryKey: ['buy', 'walletPnl', alias, pnlPeriod],
    queryFn: async () => {
      const res = await buyApi.getWalletPnlHistory(alias!, pnlPeriod);
      return res.data?.data ?? res.data ?? [];
    },
    enabled: !!alias,
  });

  const { data: positions = [] } = useQuery<ValuedPosition[]>({
    queryKey: ['buy', 'walletPositions', alias],
    queryFn: async () => (await buyApi.getWalletPositionsValued(alias!)).data,
    enabled: !!alias,
  });

  const { data: trades = [] } = useQuery<TradeLog[]>({
    queryKey: ['buy', 'walletTrades', alias],
    queryFn: async () => (await buyApi.getTradeLogs(alias!, undefined, 100)).data,
    enabled: !!alias,
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const solEur = exchangeRate?.sol_price_eur ?? 0;
  const solToEur = (sol: number) => sol * solEur;

  const formatBucket = (bucket: unknown) => {
    try {
      const d = new Date(String(bucket));
      return pnlPeriod === '24h'
        ? format(d, 'HH:mm')
        : pnlPeriod === '7d'
          ? format(d, 'EEE HH:mm')
          : format(d, 'dd.MM');
    } catch {
      return String(bucket);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ['buy', 'wallet', alias] });
    queryClient.invalidateQueries({ queryKey: ['buy', 'walletAnalytics', alias] });
  };

  // -------------------------------------------------------------------------
  // Edit handlers
  // -------------------------------------------------------------------------
  const startEditing = () => {
    if (!wallet) return;
    setEditFields({
      virtual_loss_percent: wallet.virtual_loss_percent,
      max_consecutive_losses: wallet.max_consecutive_losses,
      max_daily_loss_pct: wallet.max_daily_loss_pct,
      status: wallet.status,
      trading_enabled: wallet.trading_enabled,
      transfer_enabled: wallet.transfer_enabled,
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!wallet || !alias) return;
    try {
      // Update wallet fields
      await buyApi.updateWallet(alias, {
        virtual_loss_percent: editFields.virtual_loss_percent,
        max_consecutive_losses: editFields.max_consecutive_losses,
        max_daily_loss_pct: editFields.max_daily_loss_pct,
        status: editFields.status,
      });

      // Toggle trading if changed
      if (editFields.trading_enabled !== wallet.trading_enabled) {
        await buyApi.toggleTrading(alias, editFields.trading_enabled);
      }
      // Toggle transfer if changed
      if (editFields.transfer_enabled !== wallet.transfer_enabled) {
        await buyApi.toggleTransfer(alias, editFields.transfer_enabled);
      }

      setEditing(false);
      refetchAll();
      setAlert({ type: 'success', message: 'Wallet updated successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: parseApiError(error, 'Failed to update wallet') });
    }
  };

  // -------------------------------------------------------------------------
  // Loading / Error states
  // -------------------------------------------------------------------------
  if (walletLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress sx={{ color: '#00d4ff' }} />
      </Box>
    );
  }

  if (!wallet) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`${ctx.basePath}/wallets`)}>
          Back to Wallets
        </Button>
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.5)' }}>
            Wallet &quot;{alias}&quot; not found
          </Typography>
        </Box>
      </Box>
    );
  }

  const balance = wallet.type === 'TEST' ? wallet.virtual_sol_balance : wallet.real_sol_balance;
  const pnlArray = Array.isArray(pnlData) ? pnlData : [];
  const lastPnl = pnlArray.length > 0 ? pnlArray[pnlArray.length - 1].cumulative_pnl_sol : 0;
  const pnlPositive = lastPnl >= 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <Box>
      {/* ================================================================= */}
      {/* 1. Back Button + Header                                           */}
      {/* ================================================================= */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(`${ctx.basePath}/wallets`)}
        sx={{ mb: 2, color: '#b8c5d6' }}
      >
        Back to Wallets
      </Button>

      {alert && (
        <Alert severity={alert.type} sx={{ mb: 2 }} onClose={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      <Card sx={{ ...CARD_SX, p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {wallet.alias}
              </Typography>
              <Chip
                label={wallet.status}
                size="small"
                sx={{
                  bgcolor: STATUS_COLORS[wallet.status]?.bg ?? 'rgba(255,255,255,0.1)',
                  color: STATUS_COLORS[wallet.status]?.color ?? '#fff',
                  fontWeight: 600,
                }}
              />
              <Chip
                label={wallet.type}
                size="small"
                sx={{
                  bgcolor: TYPE_COLORS[wallet.type]?.bg ?? 'rgba(255,255,255,0.1)',
                  color: TYPE_COLORS[wallet.type]?.color ?? '#fff',
                  fontWeight: 600,
                }}
              />
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Typography
                variant="body2"
                sx={{ fontFamily: 'monospace', color: '#8892a4', wordBreak: 'break-all' }}
              >
                {wallet.address}
              </Typography>
              <IconButton
                size="small"
                onClick={() => handleCopy(wallet.address)}
                title={copied ? 'Copied!' : 'Copy address'}
              >
                <ContentCopyIcon sx={{ fontSize: 16, color: copied ? '#4caf50' : '#8892a4' }} />
              </IconButton>
            </Box>

            {wallet.tag && (
              <Chip
                label={wallet.tag}
                size="small"
                sx={{
                  bgcolor: `rgba(${ctx.accentColor}, 0.12)`,
                  color: `rgb(${ctx.accentColor})`,
                  mb: 1,
                }}
              />
            )}

            <Typography variant="caption" sx={{ color: '#8892a4', display: 'block' }}>
              Created {format(new Date(wallet.created_at), 'dd.MM.yyyy HH:mm')}
            </Typography>
          </Box>

          <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
            <Typography variant="h4" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {fmtEur(solToEur(balance))}
            </Typography>
            <Typography variant="subtitle1" sx={{ color: '#8892a4', fontFamily: 'monospace' }}>
              {fmtSol(balance)}
            </Typography>
          </Box>
        </Box>
      </Card>

      {/* ================================================================= */}
      {/* 2. Risk & Settings Card                                           */}
      {/* ================================================================= */}
      <Card sx={{ ...CARD_SX, p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Risk &amp; Settings
          </Typography>
          {!editing ? (
            <Button startIcon={<EditIcon />} onClick={startEditing} size="small" variant="outlined">
              Edit
            </Button>
          ) : (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button onClick={cancelEditing} size="small" variant="outlined" color="inherit">
                Cancel
              </Button>
              <Button onClick={handleSave} size="small" variant="contained">
                Save
              </Button>
            </Box>
          )}
        </Box>

        {!editing ? (
          <Grid container spacing={2}>
            {([
              ['Pain Mode', `${wallet.virtual_loss_percent}%`],
              ['Max Consecutive Losses', `${wallet.max_consecutive_losses}`],
              ['Max Daily Loss', `${wallet.max_daily_loss_pct}%`],
              ['Status', wallet.status],
              ['Trading Enabled', wallet.trading_enabled ? 'Yes' : 'No'],
              ['Transfer Enabled', wallet.transfer_enabled ? 'Yes' : 'No'],
            ] as const).map(([label, value]) => (
              <Grid key={label} size={{ xs: 6, sm: 4, md: 2 }}>
                <Typography variant="caption" sx={{ color: '#b8c5d6', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {label}
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                  {value}
                </Typography>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Pain Mode %"
                type="number"
                value={editFields.virtual_loss_percent}
                onChange={(e) => setEditFields({ ...editFields, virtual_loss_percent: parseFloat(e.target.value) || 0 })}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Max Consecutive Losses"
                type="number"
                value={editFields.max_consecutive_losses}
                onChange={(e) => setEditFields({ ...editFields, max_consecutive_losses: parseInt(e.target.value) || 0 })}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Max Daily Loss %"
                type="number"
                value={editFields.max_daily_loss_pct}
                onChange={(e) => setEditFields({ ...editFields, max_daily_loss_pct: parseFloat(e.target.value) || 0 })}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={editFields.status}
                  label="Status"
                  onChange={(e) => setEditFields({ ...editFields, status: e.target.value as WalletStatus })}
                >
                  <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                  <MenuItem value="PAUSED">PAUSED</MenuItem>
                  <MenuItem value="DRAINED">DRAINED</MenuItem>
                  <MenuItem value="FROZEN">FROZEN</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ color: '#b8c5d6' }}>Trading</Typography>
                <Switch
                  checked={editFields.trading_enabled}
                  onChange={(e) => setEditFields({ ...editFields, trading_enabled: e.target.checked })}
                  size="small"
                />
              </Box>
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ color: '#b8c5d6' }}>Transfer</Typography>
                <Switch
                  checked={editFields.transfer_enabled}
                  onChange={(e) => setEditFields({ ...editFields, transfer_enabled: e.target.checked })}
                  size="small"
                />
              </Box>
            </Grid>
          </Grid>
        )}
      </Card>

      {/* ================================================================= */}
      {/* 3. Performance KPIs                                               */}
      {/* ================================================================= */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard
            title="Total P&L"
            mainValue={`${(analytics?.total_pnl_sol ?? 0) >= 0 ? '+' : ''}${fmtEur(solToEur(analytics?.total_pnl_sol ?? 0))}`}
            subValue={fmtSol(analytics?.total_pnl_sol ?? 0)}
            icon={
              (analytics?.total_pnl_sol ?? 0) >= 0
                ? <TrendingUpIcon sx={{ color: '#4caf50', fontSize: 20 }} />
                : <TrendingDownIcon sx={{ color: '#f44336', fontSize: 20 }} />
            }
            color={(analytics?.total_pnl_sol ?? 0) >= 0 ? '76, 175, 80' : '244, 67, 54'}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard
            title="Win Rate"
            mainValue={`${(analytics?.win_rate ?? 0).toFixed(1)}%`}
            subValue={`${analytics?.wins ?? 0}W / ${analytics?.losses ?? 0}L`}
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
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard
            title="Total Trades"
            mainValue={`${analytics?.total_trades ?? 0}`}
            subValue={`${analytics?.total_buys ?? 0} buys / ${analytics?.total_sells ?? 0} sells`}
            icon={<ChartIcon sx={{ color: '#ff9800', fontSize: 20 }} />}
            color="255, 152, 0"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <StatCard
            title="Volume"
            mainValue={fmtEur(solToEur(analytics?.total_volume_sol ?? 0))}
            subValue={fmtSol(analytics?.total_volume_sol ?? 0)}
            icon={<ChartIcon sx={{ color: `rgb(${ctx.accentColor})`, fontSize: 20 }} />}
            color="0, 212, 255"
          />
        </Grid>
      </Grid>

      {/* ================================================================= */}
      {/* 4. P&L Chart                                                      */}
      {/* ================================================================= */}
      <Card sx={{ ...CARD_SX, p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle2" sx={{ color: '#b8c5d6' }}>
            P&amp;L History
          </Typography>
          <ToggleButtonGroup
            value={pnlPeriod}
            exclusive
            onChange={(_, v) => v && setPnlPeriod(v)}
            size="small"
          >
            {(['24h', '7d', '30d', 'all'] as const).map((p) => (
              <ToggleButton
                key={p}
                value={p}
                sx={{
                  color: '#b8c5d6',
                  px: 1.5,
                  py: 0.5,
                  fontSize: '0.75rem',
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

        {pnlArray.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={pnlArray}>
              <defs>
                <linearGradient id="walletPnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={pnlPositive ? '#4caf50' : '#f44336'} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={pnlPositive ? '#4caf50' : '#f44336'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="bucket" tickFormatter={formatBucket} stroke="#666" fontSize={11} />
              <YAxis
                stroke="#666"
                fontSize={11}
                tickFormatter={(v: number) => fmtEur(solToEur(v))}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={formatBucket}
                formatter={(value: number | undefined) => [fmtEur(solToEur(value ?? 0)), 'P&L']}
              />
              <Area
                type="monotone"
                dataKey="cumulative_pnl_sol"
                stroke={pnlPositive ? '#4caf50' : '#f44336'}
                fill="url(#walletPnlGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant="body2" sx={{ color: '#8892a4' }}>
              No P&amp;L data available for this period
            </Typography>
          </Box>
        )}
      </Card>

      {/* ================================================================= */}
      {/* 5. Open Positions with Live Prices                                */}
      {/* ================================================================= */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Open Positions
        </Typography>

        {positions.length > 0 ? (
          <Grid container spacing={2}>
            {positions.map((pos) => {
              const unrealized = pos.unrealized_pnl_sol;
              const pnlColor =
                unrealized === null ? '#8892a4' : unrealized >= 0 ? '#4caf50' : '#f44336';

              return (
                <Grid key={pos.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                  <Card sx={{ ...CARD_SX, height: '100%' }}>
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontFamily: 'monospace', color: `rgb(${ctx.accentColor})`, mb: 1.5, wordBreak: 'break-all' }}
                      >
                        {truncateMint(pos.mint)}
                      </Typography>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: '#b8c5d6' }}>Invested</Typography>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {fmtEur(solToEur(pos.initial_sol_spent))}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#8892a4', fontFamily: 'monospace' }}>
                            {fmtSol(pos.initial_sol_spent)}
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: '#b8c5d6' }}>Current Value</Typography>
                        <Box sx={{ textAlign: 'right' }}>
                          {pos.current_value_sol !== null ? (
                            <>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                {fmtEur(solToEur(pos.current_value_sol))}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#8892a4', fontFamily: 'monospace' }}>
                                {fmtSol(pos.current_value_sol)}
                              </Typography>
                            </>
                          ) : (
                            <Typography variant="body2" sx={{ color: '#8892a4' }}>N/A</Typography>
                          )}
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                        <Typography variant="caption" sx={{ color: '#b8c5d6' }}>Unrealized P&amp;L</Typography>
                        <Box sx={{ textAlign: 'right' }}>
                          {unrealized !== null ? (
                            <>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, color: pnlColor }}>
                                {unrealized >= 0 ? '+' : ''}{fmtEur(solToEur(unrealized))}
                              </Typography>
                              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: pnlColor }}>
                                {unrealized >= 0 ? '+' : ''}{fmtSol(unrealized)}
                              </Typography>
                            </>
                          ) : (
                            <Typography variant="body2" sx={{ color: '#8892a4' }}>N/A</Typography>
                          )}
                        </Box>
                      </Box>

                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<SellIcon />}
                        fullWidth
                        onClick={() => navigate(`${ctx.basePath}/execute`)}
                        sx={{
                          borderColor: `rgba(${ctx.accentColor}, 0.4)`,
                          color: `rgb(${ctx.accentColor})`,
                          '&:hover': { borderColor: `rgb(${ctx.accentColor})` },
                        }}
                      >
                        Quick Sell
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        ) : (
          <Card sx={{ ...CARD_SX }}>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                No open positions
              </Typography>
            </Box>
          </Card>
        )}
      </Box>

      {/* ================================================================= */}
      {/* 6. Trade History (paginated table)                                */}
      {/* ================================================================= */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Trade History
        </Typography>

        <TableContainer
          component={Paper}
          sx={{ bgcolor: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)' }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Time', 'Action', 'Mint', 'Amount EUR', 'Amount SOL', 'Status'].map((h) => (
                  <TableCell key={h} sx={{ color: '#b8c5d6', borderColor: 'rgba(255,255,255,0.08)', fontWeight: 600 }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {trades.length > 0 ? (
                trades
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {format(new Date(trade.created_at), 'dd.MM.yy HH:mm:ss')}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Chip
                          label={trade.action}
                          size="small"
                          sx={{
                            bgcolor: ACTION_COLORS[trade.action]?.bg ?? 'rgba(255,255,255,0.1)',
                            color: ACTION_COLORS[trade.action]?.color ?? '#fff',
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            minWidth: 44,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', color: `rgb(${ctx.accentColor})` }}>
                          {truncateMint(trade.mint)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {fmtEur(solToEur(trade.amount_sol))}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {fmtSol(trade.amount_sol)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Chip
                          label={trade.status}
                          size="small"
                          sx={{
                            bgcolor: trade.status === 'SUCCESS' ? 'rgba(76,175,80,0.2)' : 'rgba(255,152,0,0.2)',
                            color: trade.status === 'SUCCESS' ? '#4caf50' : '#ff9800',
                            fontSize: '0.65rem',
                            height: 20,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', borderColor: 'rgba(255,255,255,0.05)', py: 4 }}>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                      No trades found
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {trades.length > 0 && (
            <TablePagination
              component="div"
              count={trades.length}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 25, 50, 100]}
              sx={{
                color: '#b8c5d6',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                '.MuiTablePagination-selectIcon': { color: '#b8c5d6' },
              }}
            />
          )}
        </TableContainer>
      </Box>
    </Box>
  );
}
