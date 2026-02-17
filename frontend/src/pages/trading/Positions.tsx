import { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Card,
  CardContent,
  Grid,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  TrendingUp as TrendingUpIcon,
  AttachMoney as MoneyIcon,
  AccountBalanceWallet as WalletIcon,
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import {
  useExchangeRate,
  fmtEur,
  fmtSol,
  truncateMint,
  CARD_SX,
  TOOLTIP_STYLE,
} from './tradingUtils';
import type { Wallet, Position, PositionStatus } from '../../types/buy';

export default function Positions() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const ctx = useTradingContext();
  const { data: exchangeRate } = useExchangeRate();
  const solEur = exchangeRate?.sol_price_eur ?? 0;
  const solToEur = (sol: number) => sol * solEur;

  const [filterWallet, setFilterWallet] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | PositionStatus>('');

  // ---- Data fetching via useQuery ----
  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ['buy', 'wallets', ctx.walletType],
    queryFn: async () => (await buyApi.getWallets(ctx.walletType)).data,
    refetchInterval: 10_000,
  });

  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ['buy', 'positions', filterWallet, filterStatus],
    queryFn: async () =>
      (await buyApi.getPositions(filterWallet || undefined, filterStatus || undefined)).data,
    refetchInterval: 10_000,
  });

  const walletLookup = new Map(wallets.map((w) => [w.id, w]));
  const walletIds = new Set(wallets.map((w) => w.id));
  const filteredPositions = positions.filter((p) => walletIds.has(p.wallet_id));

  // Compute stats
  const openPositions = filteredPositions.filter((p) => p.status === 'OPEN');
  const totalInvestedSol = openPositions.reduce((sum, p) => sum + p.initial_sol_spent, 0);
  const avgEntrySol = openPositions.length > 0 ? totalInvestedSol / openPositions.length : 0;

  // Investment per wallet (bar chart data)
  const investmentByWallet = wallets
    .map((w) => {
      const investment = openPositions
        .filter((p) => p.wallet_id === w.id)
        .reduce((sum, p) => sum + p.initial_sol_spent, 0);
      return { name: w.alias, investmentEur: solToEur(investment), investmentSol: investment };
    })
    .filter((d) => d.investmentSol > 0);

  // ---------------------------------------------------------------------------
  // Status badge
  // ---------------------------------------------------------------------------
  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; fg: string }> = {
      OPEN: { bg: 'rgba(255, 152, 0, 0.2)', fg: '#ff9800' },
      CLOSED: { bg: 'rgba(158, 158, 158, 0.2)', fg: '#9e9e9e' },
    };
    const s = map[status] ?? map.CLOSED;
    return <Chip label={status} size="small" sx={{ bgcolor: s.bg, color: s.fg, fontWeight: 600 }} />;
  };

  // ---------------------------------------------------------------------------
  // Stat Card
  // ---------------------------------------------------------------------------
  const StatCard = ({
    title,
    value,
    sub,
    icon,
  }: {
    title: string;
    value: string;
    sub?: string;
    icon: React.ReactNode;
  }) => (
    <Card sx={CARD_SX}>
      <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              p: 1,
              borderRadius: 2,
              bgcolor: `rgba(${ctx.accentColor}, 0.15)`,
              color: `rgb(${ctx.accentColor})`,
              display: 'flex',
            }}
          >
            {icon}
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
              {title}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {value}
            </Typography>
            {sub && (
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                {sub}
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  // ---------------------------------------------------------------------------
  // Mobile card
  // ---------------------------------------------------------------------------
  const renderMobileCard = (pos: Position) => {
    const wallet = walletLookup.get(pos.wallet_id);
    return (
      <Card key={pos.id} sx={{ ...CARD_SX, mb: 2 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {wallet?.alias || 'Unknown'}
            </Typography>
            {statusBadge(pos.status)}
          </Box>
          <Typography
            variant="body2"
            sx={{ fontFamily: 'monospace', fontSize: '0.75rem', mb: 1.5, color: `rgb(${ctx.accentColor})` }}
          >
            {truncateMint(pos.mint)}
          </Typography>
          <Grid container spacing={1.5}>
            <Grid size={4}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                Tokens
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                {pos.tokens_held.toFixed(2)}
              </Typography>
            </Grid>
            <Grid size={4}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                Entry Price
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {pos.entry_price.toFixed(9)}
              </Typography>
            </Grid>
            <Grid size={4}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                Cost
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {fmtEur(solToEur(pos.initial_sol_spent))}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                {fmtSol(pos.initial_sol_spent)}
              </Typography>
            </Grid>
          </Grid>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1, display: 'block' }}>
            {new Date(pos.created_at).toLocaleString()}
          </Typography>
        </CardContent>
      </Card>
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Box>
      {/* ----------------------------------------------------------------- */}
      {/* StatCards                                                          */}
      {/* ----------------------------------------------------------------- */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Open Positions"
            value={String(openPositions.length)}
            sub={`of ${filteredPositions.length} total`}
            icon={<TrendingUpIcon fontSize="small" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Total Invested"
            value={fmtEur(solToEur(totalInvestedSol))}
            sub={fmtSol(totalInvestedSol)}
            icon={<MoneyIcon fontSize="small" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Avg Entry Cost"
            value={fmtEur(solToEur(avgEntrySol))}
            sub={fmtSol(avgEntrySol)}
            icon={<WalletIcon fontSize="small" />}
          />
        </Grid>
      </Grid>

      {/* ----------------------------------------------------------------- */}
      {/* Investment per Wallet BarChart                                      */}
      {/* ----------------------------------------------------------------- */}
      {investmentByWallet.length > 0 && (
        <Card sx={{ ...CARD_SX, mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700 }}>
              Investment per Wallet
            </Typography>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={investmentByWallet}>
                <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number | undefined) => [fmtEur(value ?? 0), 'Invested']}
                />
                <Bar dataKey="investmentEur" radius={[4, 4, 0, 0]}>
                  {investmentByWallet.map((_, i) => (
                    <Cell key={i} fill={`rgba(${ctx.accentColor}, ${0.4 + (i * 0.15)})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Filters                                                            */}
      {/* ----------------------------------------------------------------- */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl sx={{ minWidth: { xs: '100%', sm: 200 } }}>
          <InputLabel>Wallet</InputLabel>
          <Select
            value={filterWallet}
            label="Wallet"
            onChange={(e) => setFilterWallet(e.target.value)}
          >
            <MenuItem value="">All Wallets</MenuItem>
            {wallets.map((w) => (
              <MenuItem key={w.id} value={w.alias}>
                {w.alias}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: { xs: '100%', sm: 150 } }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={filterStatus}
            label="Status"
            onChange={(e) => setFilterStatus(e.target.value as '' | PositionStatus)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="OPEN">OPEN</MenuItem>
            <MenuItem value="CLOSED">CLOSED</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* ----------------------------------------------------------------- */}
      {/* Table / Cards                                                       */}
      {/* ----------------------------------------------------------------- */}
      {isMobile ? (
        filteredPositions.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', ...CARD_SX, borderRadius: 1 }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.4)' }}>No positions found</Typography>
          </Box>
        ) : (
          filteredPositions.map(renderMobileCard)
        )
      ) : (
        <TableContainer component={Paper} sx={CARD_SX}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Wallet</TableCell>
                <TableCell>Mint</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Tokens Held</TableCell>
                <TableCell align="right">Entry Price</TableCell>
                <TableCell align="right">Cost (EUR)</TableCell>
                <TableCell align="right">Cost (SOL)</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredPositions.map((pos) => {
                const wallet = walletLookup.get(pos.wallet_id);
                return (
                  <TableRow key={pos.id}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {wallet?.alias || 'Unknown'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: `rgb(${ctx.accentColor})` }}
                      >
                        {truncateMint(pos.mint)}
                      </Typography>
                    </TableCell>
                    <TableCell>{statusBadge(pos.status)}</TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {pos.tokens_held.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {pos.entry_price.toFixed(9)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {fmtEur(solToEur(pos.initial_sol_spent))}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>
                        {fmtSol(pos.initial_sol_spent)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                        {new Date(pos.created_at).toLocaleString()}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredPositions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', py: 4 }}>
                    No positions found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Summary */}
      <Box sx={{ mt: 3, p: 2, ...CARD_SX, borderRadius: 1 }}>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
          Showing {filteredPositions.length} position{filteredPositions.length !== 1 ? 's' : ''}
          {filterWallet && ` for wallet "${filterWallet}"`}
          {filterStatus && ` with status ${filterStatus}`}
        </Typography>
      </Box>
    </Box>
  );
}
