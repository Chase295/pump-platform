import { useEffect, useState } from 'react';
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
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  SwapHoriz as SwapHorizIcon,
  Inventory as InventoryIcon,
  ShowChart as ShowChartIcon,
} from '@mui/icons-material';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import type { DashboardStats, WalletPerformance, Wallet } from '../../types/buy';

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------
interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string; // rgb triplet e.g. "0, 212, 255"
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <Card
      sx={{
        bgcolor: `rgba(${color}, 0.1)`,
        border: `1px solid rgba(${color}, 0.3)`,
        backdropFilter: 'blur(10px)',
        height: '100%',
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box
            sx={{
              bgcolor: `rgba(${color}, 0.2)`,
              borderRadius: 2,
              p: 1,
              mr: 2,
              display: 'flex',
            }}
          >
            {icon}
          </Box>
          <Typography variant="body2" sx={{ color: '#b8c5d6' }}>
            {title}
          </Typography>
        </Box>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          {value}
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [performance, setPerformance] = useState<WalletPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [statsRes, walletsRes, perfRes] = await Promise.all([
        buyApi.getDashboardStats(),
        buyApi.getWallets(ctx.walletType),
        buyApi.getWalletPerformance(),
      ]);
      setStats(statsRes.data);
      setWallets(walletsRes.data);
      setPerformance(perfRes.data.filter((p: WalletPerformance) => p.type === ctx.walletType));
    } catch (err) {
      console.error('Failed to load trading dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.walletType]);

  if (loading && !stats) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress sx={{ color: '#00d4ff' }} />
      </Box>
    );
  }

  const totalProfit = performance.reduce((sum, p) => sum + p.net_profit_sol, 0);
  const profit24h = performance.reduce((sum, p) => sum + p.profit_24h, 0);
  const totalBalance = wallets.reduce(
    (sum, w) => sum + (w.type === 'TEST' ? w.virtual_sol_balance : w.real_sol_balance),
    0,
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {ctx.label} Dashboard
      </Typography>

      {/* Summary stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Total Wallets"
            value={stats?.total_wallets ?? wallets.length}
            icon={<WalletIcon sx={{ color: '#00d4ff', fontSize: 30 }} />}
            color="0, 212, 255"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Active Wallets"
            value={stats?.active_wallets ?? wallets.filter((w) => w.status === 'ACTIVE').length}
            icon={<TrendingUpIcon sx={{ color: '#4caf50', fontSize: 30 }} />}
            color="76, 175, 80"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Open Positions"
            value={stats?.open_positions ?? 0}
            icon={<InventoryIcon sx={{ color: '#ff9800', fontSize: 30 }} />}
            color="255, 152, 0"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Trades Today"
            value={stats?.total_trades_today ?? 0}
            icon={<SwapHorizIcon sx={{ color: '#9c27b0', fontSize: 30 }} />}
            color="156, 39, 176"
          />
        </Grid>
      </Grid>

      {/* Performance metrics */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Total Profit (All Time)"
            value={`${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(4)} SOL`}
            icon={
              totalProfit >= 0 ? (
                <TrendingUpIcon sx={{ color: '#4caf50', fontSize: 30 }} />
              ) : (
                <TrendingDownIcon sx={{ color: '#f44336', fontSize: 30 }} />
              )
            }
            color={totalProfit >= 0 ? '76, 175, 80' : '244, 67, 54'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="24h Profit / Loss"
            value={`${profit24h >= 0 ? '+' : ''}${profit24h.toFixed(4)} SOL`}
            icon={
              profit24h >= 0 ? (
                <TrendingUpIcon sx={{ color: '#4caf50', fontSize: 30 }} />
              ) : (
                <TrendingDownIcon sx={{ color: '#f44336', fontSize: 30 }} />
              )
            }
            color={profit24h >= 0 ? '76, 175, 80' : '244, 67, 54'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Total Trades"
            value={performance.reduce((sum, p) => sum + p.trade_count, 0)}
            icon={<ShowChartIcon sx={{ color: '#2196f3', fontSize: 30 }} />}
            color="33, 150, 243"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Volume Today"
            value={`${(stats?.total_volume_today ?? 0).toFixed(2)} SOL`}
            icon={<SwapHorizIcon sx={{ color: '#ff9800', fontSize: 30 }} />}
            color="255, 152, 0"
          />
        </Grid>
      </Grid>

      {/* Per-wallet performance table */}
      {performance.length > 0 && (
        <>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Per-Wallet Performance
          </Typography>
          <TableContainer
            component={Paper}
            sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', mb: 4 }}
          >
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Wallet</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Balance</TableCell>
                  <TableCell align="right">Net Profit</TableCell>
                  <TableCell align="right">24h P/L</TableCell>
                  <TableCell align="right">Trades</TableCell>
                  <TableCell align="center">Losses</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {performance.map((p) => (
                  <TableRow key={p.alias}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {p.alias}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={p.type}
                        size="small"
                        sx={{
                          bgcolor: p.type === 'TEST' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(76, 175, 80, 0.2)',
                          color: p.type === 'TEST' ? '#00d4ff' : '#4caf50',
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {p.current_balance.toFixed(4)} SOL
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          color: p.net_profit_sol >= 0 ? '#4caf50' : '#f44336',
                          fontWeight: 600,
                        }}
                      >
                        {p.net_profit_sol >= 0 ? '+' : ''}
                        {p.net_profit_sol.toFixed(4)} SOL
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          color: p.profit_24h >= 0 ? '#4caf50' : '#f44336',
                        }}
                      >
                        {p.profit_24h >= 0 ? '+' : ''}
                        {p.profit_24h.toFixed(4)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{p.trade_count}</TableCell>
                    <TableCell align="center">
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
        </>
      )}

      {/* Wallet overview cards */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Wallet Overview
      </Typography>
      <Grid container spacing={3}>
        {wallets.slice(0, 6).map((wallet) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={wallet.id}>
            <Card
              sx={{
                bgcolor:
                  wallet.type === 'TEST'
                    ? 'rgba(0, 212, 255, 0.1)'
                    : 'rgba(76, 175, 80, 0.1)',
                border: `1px solid ${
                  wallet.type === 'TEST'
                    ? 'rgba(0, 212, 255, 0.3)'
                    : 'rgba(76, 175, 80, 0.3)'
                }`,
                backdropFilter: 'blur(10px)',
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">{wallet.alias}</Typography>
                  <Chip
                    label={wallet.type}
                    size="small"
                    sx={{
                      bgcolor: wallet.type === 'TEST' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(76, 175, 80, 0.2)',
                      color: wallet.type === 'TEST' ? '#00d4ff' : '#4caf50',
                    }}
                  />
                </Box>

                <Typography variant="body2" sx={{ color: '#b8c5d6', mb: 1 }}>
                  Balance
                </Typography>
                <Typography variant="h5" sx={{ mb: 2 }}>
                  {(wallet.type === 'TEST' ? wallet.virtual_sol_balance : wallet.real_sol_balance).toFixed(4)} SOL
                </Typography>

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Typography variant="caption" sx={{ color: wallet.trading_enabled ? '#4caf50' : '#f44336' }}>
                    Trading: {wallet.trading_enabled ? 'ON' : 'OFF'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: wallet.transfer_enabled ? '#4caf50' : '#f44336' }}>
                    Transfer: {wallet.transfer_enabled ? 'ON' : 'OFF'}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Total portfolio */}
      <Box sx={{ mt: 4, p: 3, bgcolor: 'rgba(255, 255, 255, 0.05)', borderRadius: 2 }}>
        <Typography variant="body2" sx={{ color: '#b8c5d6' }}>
          Total Portfolio Value ({ctx.walletType === 'TEST' ? 'Virtual' : 'Real'})
        </Typography>
        <Typography variant="h3" sx={{ color: '#00d4ff', fontWeight: 600 }}>
          {totalBalance.toFixed(4)} SOL
        </Typography>
      </Box>
    </Box>
  );
}
