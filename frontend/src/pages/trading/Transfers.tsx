import { useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Checkbox,
  Alert,
  Chip,
  Collapse,
  IconButton,
  LinearProgress,
  Divider,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  SwapHoriz as TransferIcon,
  ArrowForward as ArrowIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import {
  useExchangeRate,
  fmtEur,
  fmtSol,
  truncateAddress,
  CARD_SX,
} from './tradingUtils';
import type { Wallet, TransferLog } from '../../types/buy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const getBalance = (w: Wallet) =>
  w.type === 'TEST' ? w.virtual_sol_balance : w.real_sol_balance;

export default function Transfers() {
  const ctx = useTradingContext();
  const { data: exchangeRate } = useExchangeRate();
  const solEur = exchangeRate?.sol_price_eur ?? 0;
  const solToEur = (sol: number) => sol * solEur;

  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [destTab, setDestTab] = useState<'wallet' | 'address'>('wallet');
  const [form, setForm] = useState({
    wallet_alias: '',
    to_address: '',
    amount_sol: 1.0,
    force_sweep: false,
  });

  // ---- Data fetching ----
  const { data: wallets = [], refetch: refetchData } = useQuery<Wallet[]>({
    queryKey: ['buy', 'wallets', ctx.walletType],
    queryFn: async () => (await buyApi.getWallets(ctx.walletType)).data,
    refetchInterval: 10_000,
  });

  const { data: transferLogs = [] } = useQuery<TransferLog[]>({
    queryKey: ['buy', 'transferLogs'],
    queryFn: async () => (await buyApi.getTransferLogs()).data,
    refetchInterval: 10_000,
  });

  const transferWallets = wallets.filter((w) => w.transfer_enabled);
  const selectedWallet = wallets.find((w) => w.alias === form.wallet_alias);
  const selectedBalance = selectedWallet ? getBalance(selectedWallet) : 0;

  // Stats
  const totalTransferred = transferLogs.reduce((sum, l) => sum + parseFloat(String(l.amount_sol)), 0);
  const successfulTransfers = transferLogs.filter((l) => l.status === 'SUCCESS').length;

  // ---------------------------------------------------------------------------
  // Transfer handler
  // ---------------------------------------------------------------------------
  const handleTransfer = async () => {
    try {
      setLoading(true);
      setAlert({ type: 'info', message: 'Executing transfer...' });
      const response = await buyApi.executeTransfer(form);

      if (response.data.status === 'success') {
        setAlert({
          type: 'success',
          message: `Transfer successful! Sent ${fmtSol(response.data.data?.amount_sent ?? 0)} (${fmtEur(solToEur(response.data.data?.amount_sent ?? 0))})`,
        });
        refetchData();
      } else {
        setAlert({ type: 'error', message: response.data.message || 'Transfer failed' });
      }
    } catch (error: any) {
      setAlert({ type: 'error', message: error.response?.data?.detail || 'Transfer failed' });
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  const accentRgb = ctx.accentColor;
  const transferColor = '#00d4ff';

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: 'rgba(255,255,255,0.03)',
      '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
      '&:hover fieldset': { borderColor: `rgba(${accentRgb}, 0.3)` },
      '&.Mui-focused fieldset': { borderColor: transferColor },
    },
  };

  // Quick amount buttons
  const setAmountPercent = (pct: number) => {
    if (selectedBalance > 0) {
      const amount = Math.floor(selectedBalance * pct * 10000) / 10000;
      setForm({ ...form, amount_sol: amount, force_sweep: pct === 1 });
    }
  };

  // Destination wallet for preview
  const destWallet = destTab === 'wallet'
    ? wallets.find((w) => w.address === form.to_address)
    : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Box>
      {alert && (
        <Alert severity={alert.type} sx={{ mb: 2 }} onClose={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* ================================================================= */}
        {/* LEFT: Transfer Panel                                               */}
        {/* ================================================================= */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card
            sx={{
              bgcolor: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            {loading && (
              <LinearProgress
                sx={{
                  height: 2,
                  bgcolor: 'transparent',
                  '& .MuiLinearProgress-bar': { bgcolor: transferColor },
                }}
              />
            )}

            {/* ---- Header ---- */}
            <Box sx={{ px: 3, pt: 3, pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                <TransferIcon sx={{ color: transferColor, fontSize: 22 }} />
                <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                  Transfer SOL
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                Move funds between wallets or to external addresses
              </Typography>
            </Box>

            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {/* From Wallet */}
                <FormControl fullWidth sx={inputSx}>
                  <InputLabel>From Wallet</InputLabel>
                  <Select
                    value={form.wallet_alias}
                    label="From Wallet"
                    onChange={(e) => setForm({ ...form, wallet_alias: e.target.value })}
                  >
                    {transferWallets.map((w) => {
                      const bal = getBalance(w);
                      return (
                        <MenuItem key={w.id} value={w.alias}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <span>{w.alias}</span>
                            <Typography component="span" sx={{ color: 'rgba(255,255,255,0.5)', ml: 2 }}>
                              {fmtEur(solToEur(bal))}
                            </Typography>
                          </Box>
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>

                {/* Balance Bar */}
                {selectedWallet && (
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      px: 2,
                      py: 1.5,
                      borderRadius: 2,
                      bgcolor: `rgba(${accentRgb}, 0.06)`,
                      border: `1px solid rgba(${accentRgb}, 0.12)`,
                    }}
                  >
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                      Available Balance
                    </Typography>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="body1" sx={{ fontWeight: 700, color: `rgb(${accentRgb})` }}>
                        {fmtEur(solToEur(selectedBalance))}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                        {fmtSol(selectedBalance)}
                      </Typography>
                    </Box>
                  </Box>
                )}

                {/* Arrow Divider */}
                <Box sx={{ display: 'flex', justifyContent: 'center', my: -0.5 }}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      bgcolor: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ArrowIcon sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 18, transform: 'rotate(90deg)' }} />
                  </Box>
                </Box>

                {/* ---- Destination Tab Toggle ---- */}
                <Box
                  sx={{
                    display: 'flex',
                    borderRadius: 2,
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {(['wallet', 'address'] as const).map((tab) => {
                    const isActive = destTab === tab;
                    return (
                      <Box
                        key={tab}
                        onClick={() => {
                          setDestTab(tab);
                          setForm({ ...form, to_address: '' });
                        }}
                        sx={{
                          flex: 1,
                          py: 1.2,
                          textAlign: 'center',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          color: isActive ? transferColor : 'rgba(255,255,255,0.35)',
                          bgcolor: isActive ? `${transferColor}10` : 'transparent',
                          borderBottom: isActive ? `2px solid ${transferColor}` : '2px solid transparent',
                          transition: 'all 0.2s',
                          '&:hover': {
                            bgcolor: `${transferColor}08`,
                            color: isActive ? transferColor : 'rgba(255,255,255,0.6)',
                          },
                        }}
                      >
                        {tab === 'wallet' ? 'To Wallet' : 'To Address'}
                      </Box>
                    );
                  })}
                </Box>

                {/* Destination Input */}
                {destTab === 'wallet' ? (
                  <FormControl fullWidth sx={inputSx}>
                    <InputLabel>Destination Wallet</InputLabel>
                    <Select
                      value={form.to_address}
                      label="Destination Wallet"
                      onChange={(e) => setForm({ ...form, to_address: e.target.value })}
                    >
                      {wallets
                        .filter((w) => w.alias !== form.wallet_alias)
                        .map((w) => {
                          const bal = getBalance(w);
                          return (
                            <MenuItem key={w.id} value={w.address}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                <span>{w.alias}</span>
                                <Typography component="span" sx={{ color: 'rgba(255,255,255,0.5)', ml: 2 }}>
                                  {fmtEur(solToEur(bal))}
                                </Typography>
                              </Box>
                            </MenuItem>
                          );
                        })}
                    </Select>
                  </FormControl>
                ) : (
                  <TextField
                    label="Destination Address"
                    value={form.to_address}
                    onChange={(e) => setForm({ ...form, to_address: e.target.value })}
                    fullWidth
                    placeholder="Paste Solana address..."
                    sx={inputSx}
                  />
                )}

                {/* Transfer Preview (wallet-to-wallet) */}
                {destWallet && selectedWallet && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                      px: 2,
                      py: 1.5,
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>From</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedWallet.alias}</Typography>
                    </Box>
                    <ArrowIcon sx={{ color: transferColor, fontSize: 20 }} />
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>To</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{destWallet.alias}</Typography>
                    </Box>
                  </Box>
                )}

                {/* Amount Input */}
                <Box>
                  <TextField
                    label="Amount (SOL)"
                    type="number"
                    value={form.amount_sol}
                    onChange={(e) => setForm({ ...form, amount_sol: parseFloat(e.target.value) || 0 })}
                    fullWidth
                    disabled={form.force_sweep}
                    inputProps={{ step: 0.1, min: 0.001 }}
                    sx={inputSx}
                  />
                  {/* EUR conversion */}
                  {solEur > 0 && !form.force_sweep && (
                    <Typography
                      variant="body2"
                      sx={{ mt: 0.5, ml: 1, color: 'rgba(255,255,255,0.4)' }}
                    >
                      ≈ {fmtEur(solToEur(form.amount_sol))}
                    </Typography>
                  )}
                  {/* Quick amount buttons */}
                  {selectedWallet && !form.force_sweep && (
                    <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                      {[
                        { label: '25%', pct: 0.25 },
                        { label: '50%', pct: 0.5 },
                        { label: '75%', pct: 0.75 },
                        { label: 'Max', pct: 1 },
                      ].map(({ label, pct }) => (
                        <Button
                          key={label}
                          size="small"
                          onClick={() => setAmountPercent(pct)}
                          sx={{
                            flex: 1,
                            py: 0.5,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: transferColor,
                            bgcolor: `${transferColor}12`,
                            border: `1px solid ${transferColor}30`,
                            borderRadius: 1.5,
                            '&:hover': { bgcolor: `${transferColor}25` },
                          }}
                        >
                          {label}
                        </Button>
                      ))}
                    </Box>
                  )}
                </Box>

                {/* Sweep Checkbox */}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.force_sweep}
                      onChange={(e) => setForm({ ...form, force_sweep: e.target.checked })}
                      sx={{
                        color: 'rgba(255,255,255,0.3)',
                        '&.Mui-checked': { color: `rgb(${accentRgb})` },
                      }}
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                      Sweep all (send entire balance minus fees)
                    </Typography>
                  }
                />

                {/* Fee Info (collapsible) */}
                <Box
                  onClick={() => setShowHistory(!showHistory)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    py: 0.5,
                    color: 'rgba(255,255,255,0.4)',
                    '&:hover': { color: 'rgba(255,255,255,0.6)' },
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                    Fee Details
                  </Typography>
                  <IconButton size="small" sx={{ color: 'inherit' }}>
                    {showHistory ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                </Box>

                <Collapse in={showHistory}>
                  <Box
                    sx={{
                      px: 2,
                      py: 1.5,
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                        Network Fee
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        0.000005 SOL
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                        Safety Buffer
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        0.001 SOL
                      </Typography>
                    </Box>
                  </Box>
                </Collapse>

                {/* Execute Button */}
                <Button
                  variant="contained"
                  onClick={handleTransfer}
                  disabled={!form.wallet_alias || !form.to_address || (!form.force_sweep && form.amount_sol <= 0) || loading}
                  fullWidth
                  size="large"
                  sx={{
                    mt: 1,
                    py: 1.8,
                    bgcolor: transferColor,
                    '&:hover': { bgcolor: '#00b8d9' },
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    letterSpacing: 0.5,
                    borderRadius: 2,
                    boxShadow: `0 4px 20px ${transferColor}40`,
                  }}
                >
                  {loading ? 'Processing...' : form.force_sweep ? 'Sweep All Funds' : 'Execute Transfer'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* ================================================================= */}
        {/* RIGHT: Wallets + Transfer History                                   */}
        {/* ================================================================= */}
        <Grid size={{ xs: 12, md: 5 }}>
          {/* Wallet Balances */}
          <Card sx={{ ...CARD_SX, borderRadius: 3, mb: 2 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: 'rgba(255,255,255,0.7)' }}>
                Wallets
              </Typography>
              {wallets.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', py: 2 }}>
                  No wallets
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {wallets.map((w) => {
                    const bal = getBalance(w);
                    return (
                      <Box
                        key={w.id}
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          px: 2,
                          py: 1.2,
                          borderRadius: 2,
                          bgcolor: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                        }}
                      >
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{w.alias}</Typography>
                            {w.transfer_enabled && (
                              <Chip
                                label="Transfer"
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: '0.6rem',
                                  bgcolor: `${transferColor}15`,
                                  color: transferColor,
                                  fontWeight: 600,
                                }}
                              />
                            )}
                          </Box>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                            {truncateAddress(w.address)}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: `rgb(${accentRgb})` }}>
                            {fmtEur(solToEur(bal))}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
                            {fmtSol(bal)}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Transfer Stats */}
          <Card sx={{ ...CARD_SX, borderRadius: 3, mb: 2 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: 'rgba(255,255,255,0.7)' }}>
                Transfer Stats
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>Total Transferred</Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmtEur(solToEur(totalTransferred))}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', display: 'block' }}>{fmtSol(totalTransferred)}</Typography>
                  </Box>
                </Box>
                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>Transfers</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{transferLogs.length}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>Successful</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#4caf50' }}>{successfulTransfers}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>Failed</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: transferLogs.length - successfulTransfers > 0 ? '#f44336' : 'rgba(255,255,255,0.5)' }}>
                    {transferLogs.length - successfulTransfers}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Recent Transfers */}
          <Card sx={{ ...CARD_SX, borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                  Recent Transfers
                </Typography>
                <Chip
                  label={transferLogs.length}
                  size="small"
                  sx={{ bgcolor: `rgba(${accentRgb}, 0.15)`, color: `rgb(${accentRgb})`, fontWeight: 700, minWidth: 28 }}
                />
              </Box>

              {transferLogs.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                    No transfers yet
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {transferLogs.slice(0, 10).map((log) => {
                    const amountSol = parseFloat(String(log.amount_sol));
                    const isSuccess = log.status === 'SUCCESS';
                    return (
                      <Box
                        key={log.id}
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          bgcolor: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          '&:hover': { border: `1px solid rgba(${accentRgb}, 0.2)` },
                          transition: 'border 0.2s',
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                              {log.from_alias || 'Unknown'}
                            </Typography>
                            <ArrowIcon sx={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }} />
                            <Typography
                              variant="body2"
                              sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: `rgb(${accentRgb})` }}
                            >
                              {truncateAddress(log.to_address)}
                            </Typography>
                          </Box>
                          <Chip
                            label={log.status}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.65rem',
                              bgcolor: isSuccess ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.2)',
                              color: isSuccess ? '#4caf50' : '#f44336',
                              fontWeight: 600,
                            }}
                          />
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Box>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>AMOUNT</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                              {fmtEur(solToEur(amountSol))}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
                              {fmtSol(amountSol)}
                            </Typography>
                          </Box>
                          {log.tx_signature && (
                            <Box sx={{ textAlign: 'right' }}>
                              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>TX</Typography>
                              <Typography
                                variant="body2"
                                sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}
                              >
                                {truncateAddress(log.tx_signature)}
                              </Typography>
                            </Box>
                          )}
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>TIME</Typography>
                            <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                              {new Date(log.created_at).toLocaleString()}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    );
                  })}
                  {transferLogs.length > 10 && (
                    <Typography variant="caption" sx={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', mt: 0.5 }}>
                      + {transferLogs.length - 10} more transfers
                    </Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
