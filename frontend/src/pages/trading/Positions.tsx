import { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Card,
  CardContent,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  AttachMoney as MoneyIcon,
  AccountBalanceWallet as WalletIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import {
  useExchangeRate,
  fmtEur,
  fmtSol,
  truncateMint,
  CARD_SX,
} from './tradingUtils';
import type { Wallet, Position, PositionStatus } from '../../types/buy';

export default function Positions() {
  const ctx = useTradingContext();
  const navigate = useNavigate();
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

  // ---------------------------------------------------------------------------
  // Group positions by wallet_id
  // ---------------------------------------------------------------------------
  const grouped = new Map<string, Position[]>();
  filteredPositions.forEach((pos) => {
    const key = pos.wallet_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(pos);
  });

  // ---------------------------------------------------------------------------
  // Status badge
  // ---------------------------------------------------------------------------
  const statusColors: Record<string, { bg: string; fg: string }> = {
    OPEN: { bg: 'rgba(255, 152, 0, 0.2)', fg: '#ff9800' },
    CLOSED: { bg: 'rgba(158, 158, 158, 0.2)', fg: '#9e9e9e' },
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
      {/* Grouped Accordion + Position Cards                                 */}
      {/* ----------------------------------------------------------------- */}
      {filteredPositions.length === 0 ? (
        <Box sx={{ p: 4, textAlign: 'center', ...CARD_SX, borderRadius: 1 }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.4)' }}>No positions found</Typography>
        </Box>
      ) : (
        Array.from(grouped.entries()).map(([walletId, walletPositions]) => {
          const wallet = walletLookup.get(walletId);
          const walletAlias = wallet?.alias || 'Unknown';
          const openCount = walletPositions.filter((p) => p.status === 'OPEN').length;
          const totalInvested = walletPositions.reduce((sum, p) => sum + p.initial_sol_spent, 0);

          return (
            <Accordion
              key={walletId}
              sx={{
                ...CARD_SX,
                '&:before': { display: 'none' },
                mb: 2,
              }}
              defaultExpanded
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ color: 'rgba(255,255,255,0.5)' }} />}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                  <Typography sx={{ fontWeight: 700 }}>{walletAlias}</Typography>
                  <Chip
                    label={`${openCount} open`}
                    size="small"
                    sx={{ bgcolor: 'rgba(255,152,0,0.2)', color: '#ff9800' }}
                  />
                  <Typography
                    sx={{ ml: 'auto', fontFamily: 'monospace', fontWeight: 600, mr: 2 }}
                  >
                    {fmtEur(solToEur(totalInvested))}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {walletPositions.map((pos) => {
                    const sc = statusColors[pos.status] ?? statusColors.CLOSED;
                    return (
                      <Grid key={pos.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                        <Card sx={{ ...CARD_SX, height: '100%' }}>
                          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                            {/* Header: mint + status */}
                            <Box
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                mb: 1.5,
                              }}
                            >
                              <Typography
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.8rem',
                                  color: `rgb(${ctx.accentColor})`,
                                }}
                              >
                                {truncateMint(pos.mint)}
                              </Typography>
                              <Chip
                                label={pos.status}
                                size="small"
                                sx={{ bgcolor: sc.bg, color: sc.fg, fontWeight: 600 }}
                              />
                            </Box>

                            {/* Investment */}
                            <Typography
                              variant="h6"
                              sx={{ fontWeight: 700, fontFamily: 'monospace', mb: 0.5 }}
                            >
                              {fmtEur(solToEur(pos.initial_sol_spent))}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}
                            >
                              {fmtSol(pos.initial_sol_spent)}
                            </Typography>

                            {/* Entry price */}
                            <Box sx={{ mt: 1.5 }}>
                              <Typography
                                variant="caption"
                                sx={{ color: 'rgba(255,255,255,0.5)' }}
                              >
                                Entry Price
                              </Typography>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                {pos.entry_price < 0.001
                                  ? pos.entry_price.toExponential(2)
                                  : pos.entry_price.toFixed(6)}
                              </Typography>
                            </Box>

                            {/* Tokens */}
                            <Box sx={{ mt: 1 }}>
                              <Typography
                                variant="caption"
                                sx={{ color: 'rgba(255,255,255,0.5)' }}
                              >
                                Tokens Held
                              </Typography>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                {pos.tokens_held > 1e6
                                  ? `${(pos.tokens_held / 1e6).toFixed(2)}M`
                                  : pos.tokens_held.toFixed(2)}
                              </Typography>
                            </Box>

                            {/* Date */}
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'rgba(255,255,255,0.3)',
                                mt: 1.5,
                                display: 'block',
                              }}
                            >
                              {new Date(pos.created_at).toLocaleDateString()}
                            </Typography>

                            {/* Quick sell button for open positions */}
                            {pos.status === 'OPEN' && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                sx={{ mt: 1.5, width: '100%' }}
                                onClick={() => navigate(`${ctx.basePath}/execute`)}
                              >
                                Sell
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              </AccordionDetails>
            </Accordion>
          );
        })
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
