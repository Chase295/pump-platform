import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  Button,
} from '@mui/material';
import {
  SwapHoriz as TradeIcon,
  TrendingUp as VolumeIcon,
  Receipt as FeeIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import {
  useExchangeRate,
  fmtEur,
  fmtSol,
  truncateMint,
  truncateAddress,
  ACTION_COLORS,
  CARD_SX,
} from './tradingUtils';
import type { Wallet, TradeLog, TransferLog } from '../../types/buy';

export default function TradeLogs() {
  const ctx = useTradingContext();
  const navigate = useNavigate();
  const { data: exchangeRate } = useExchangeRate();
  const solEur = exchangeRate?.sol_price_eur ?? 0;
  const solToEur = (sol: number) => sol * solEur;

  const [filterWallet, setFilterWallet] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [page, setPage] = useState(0);
  const perPage = 25;

  // ---- Data fetching via useQuery ----
  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ['buy', 'wallets', ctx.walletType],
    queryFn: async () => (await buyApi.getWallets(ctx.walletType)).data,
    refetchInterval: 10_000,
  });

  const { data: allTradeLogs = [] } = useQuery<TradeLog[]>({
    queryKey: ['buy', 'tradeLogs', filterWallet, filterAction],
    queryFn: async () =>
      (await buyApi.getTradeLogs(filterWallet || undefined, filterAction || undefined)).data,
    refetchInterval: 10_000,
  });

  const { data: allTransferLogs = [] } = useQuery<TransferLog[]>({
    queryKey: ['buy', 'transferLogs', filterWallet],
    queryFn: async () => (await buyApi.getTransferLogs(filterWallet || undefined)).data,
    refetchInterval: 10_000,
  });

  // Filter to current wallet type
  const walletIds = new Set(wallets.map((w) => w.id));
  const tradeLogs = allTradeLogs.filter((l) => walletIds.has(l.wallet_id));
  const transferLogs = allTransferLogs.filter((l) => walletIds.has(l.wallet_id));

  // Compute stats
  const totalVolumeSol = tradeLogs.reduce((sum, l) => sum + parseFloat(String(l.amount_sol)), 0);
  const totalFeesSol = tradeLogs.reduce((sum, l) => sum + parseFloat(String(l.network_fee_sol)), 0);

  // Pagination
  const currentList = activeTab === 0 ? tradeLogs : transferLogs;
  const totalPages = Math.ceil(currentList.length / perPage);
  const pagedItems = currentList.slice(page * perPage, (page + 1) * perPage);

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
            title="Total Trades"
            value={String(tradeLogs.length)}
            sub={`${tradeLogs.filter((l) => l.action === 'BUY').length} buys / ${tradeLogs.filter((l) => l.action === 'SELL').length} sells`}
            icon={<TradeIcon fontSize="small" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Volume"
            value={fmtEur(solToEur(totalVolumeSol))}
            sub={fmtSol(totalVolumeSol)}
            icon={<VolumeIcon fontSize="small" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Network Fees"
            value={fmtEur(solToEur(totalFeesSol))}
            sub={fmtSol(totalFeesSol)}
            icon={<FeeIcon fontSize="small" />}
          />
        </Grid>
      </Grid>

      {/* ----------------------------------------------------------------- */}
      {/* Filters                                                            */}
      {/* ----------------------------------------------------------------- */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl sx={{ minWidth: { xs: '100%', sm: 200 } }}>
          <InputLabel>Filter by Wallet</InputLabel>
          <Select
            value={filterWallet}
            label="Filter by Wallet"
            onChange={(e) => { setFilterWallet(e.target.value); setPage(0); }}
          >
            <MenuItem value="">All Wallets</MenuItem>
            {wallets.map((w) => (
              <MenuItem key={w.id} value={w.alias}>
                {w.alias}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {activeTab === 0 && (
          <FormControl sx={{ minWidth: { xs: '100%', sm: 150 } }}>
            <InputLabel>Action</InputLabel>
            <Select
              value={filterAction}
              label="Action"
              onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="BUY">BUY</MenuItem>
              <MenuItem value="SELL">SELL</MenuItem>
            </Select>
          </FormControl>
        )}
      </Box>

      {/* ----------------------------------------------------------------- */}
      {/* Tabs                                                               */}
      {/* ----------------------------------------------------------------- */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => { setActiveTab(v); setPage(0); }}
        sx={{
          mb: 2,
          '& .MuiTab-root': { color: 'rgba(255,255,255,0.6)', textTransform: 'none' },
          '& .Mui-selected': { color: `rgb(${ctx.accentColor})` },
          '& .MuiTabs-indicator': { bgcolor: `rgb(${ctx.accentColor})` },
        }}
      >
        <Tab label={`Trades (${tradeLogs.length})`} />
        <Tab label={`Transfers (${transferLogs.length})`} />
      </Tabs>

      {/* ----------------------------------------------------------------- */}
      {/* Trades Tab - Card List                                             */}
      {/* ----------------------------------------------------------------- */}
      {activeTab === 0 && (
        <>
          {tradeLogs.length === 0 ? (
            <Card sx={CARD_SX}>
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                  No trade logs found
                </Typography>
              </Box>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {(pagedItems as TradeLog[]).map((log) => {
                const amountSol = parseFloat(String(log.amount_sol));
                const actionStyle = ACTION_COLORS[log.action] ?? ACTION_COLORS.BUY;
                return (
                  <Card
                    key={log.id}
                    sx={{ ...CARD_SX, cursor: log.mint ? 'pointer' : 'default', transition: 'background 0.15s', '&:hover': log.mint ? { bgcolor: 'rgba(255,255,255,0.05)' } : {} }}
                    onClick={() => log.mint && navigate(`/discovery/coin/${encodeURIComponent(log.mint)}`)}
                  >
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      {/* Row 1: Action chip + Amount + Time */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={log.action}
                            size="small"
                            sx={{ bgcolor: actionStyle.bg, color: actionStyle.color, fontWeight: 600, fontSize: '0.7rem', minWidth: 44 }}
                          />
                          {log.is_simulation && (
                            <Chip label="SIM" size="small" sx={{ bgcolor: 'rgba(0, 212, 255, 0.2)', color: '#00d4ff', fontSize: '0.65rem', height: 20 }} />
                          )}
                          <Chip
                            label={log.status}
                            size="small"
                            sx={{
                              bgcolor: log.status === 'SUCCESS' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                              color: log.status === 'SUCCESS' ? '#4caf50' : '#f44336',
                              fontWeight: 600,
                              fontSize: '0.65rem',
                              height: 20,
                            }}
                          />
                        </Box>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          {fmtEur(solToEur(amountSol))}
                        </Typography>
                      </Box>

                      {/* Row 2: Mint + details */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: `rgb(${ctx.accentColor})` }}
                        >
                          {log.mint ? truncateMint(log.mint) : '-'}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)' }}>
                            {fmtSol(amountSol)}
                          </Typography>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)' }}>
                            {parseFloat(String(log.amount_tokens)).toFixed(0)} tok
                          </Typography>
                        </Box>
                      </Box>

                      {/* Row 3: Wallet + Signature + Time */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>
                          {log.wallet_alias ?? ''} {log.tx_signature ? `· ${truncateAddress(log.tx_signature)}` : ''}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>
                          {new Date(log.created_at).toLocaleString()}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}
        </>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Transfers Tab - Card List                                          */}
      {/* ----------------------------------------------------------------- */}
      {activeTab === 1 && (
        <>
          {transferLogs.length === 0 ? (
            <Card sx={CARD_SX}>
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                  No transfer logs found
                </Typography>
              </Box>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {(pagedItems as TransferLog[]).map((log) => {
                const amountSol = parseFloat(String(log.amount_sol));
                return (
                  <Card key={log.id} sx={CARD_SX}>
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      {/* Row 1: From → To + Amount */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {log.from_alias || 'Unknown'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>→</Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: `rgb(${ctx.accentColor})` }}>
                            {truncateAddress(log.to_address)}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          {fmtEur(solToEur(amountSol))}
                        </Typography>
                      </Box>

                      {/* Row 2: Status + Signature + Time */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={log.status}
                            size="small"
                            sx={{
                              bgcolor: log.status === 'SUCCESS' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                              color: log.status === 'SUCCESS' ? '#4caf50' : '#f44336',
                              fontWeight: 600,
                              fontSize: '0.65rem',
                              height: 20,
                            }}
                          />
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>
                            {fmtSol(amountSol)}
                          </Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>
                          {new Date(log.created_at).toLocaleString()}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 2 }}>
          <Button
            size="small"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            sx={{ color: '#b8c5d6', minWidth: 0 }}
          >
            Prev
          </Button>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
            {page + 1} / {totalPages}
          </Typography>
          <Button
            size="small"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            sx={{ color: '#b8c5d6', minWidth: 0 }}
          >
            Next
          </Button>
        </Box>
      )}
    </Box>
  );
}
