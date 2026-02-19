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
  Divider,
  Collapse,
  IconButton,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import { useExchangeRate, fmtEur, fmtSol, truncateMint, parseApiError, CARD_SX } from './tradingUtils';
import type { Wallet, Position, TradeResponse } from '../../types/buy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const getBalance = (w: Wallet) =>
  w.type === 'TEST' ? w.virtual_sol_balance : w.real_sol_balance;

export default function ExecuteTrade() {
  const ctx = useTradingContext();
  const { data: exchangeRate } = useExchangeRate();
  const solEur = exchangeRate?.sol_price_eur ?? 0;
  const solToEur = (sol: number) => sol * solEur;

  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [lastResult, setLastResult] = useState<TradeResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);

  // ---- Data fetching ----
  const { data: wallets = [], refetch: refetchData } = useQuery<Wallet[]>({
    queryKey: ['buy', 'wallets', ctx.walletType],
    queryFn: async () => (await buyApi.getWallets(ctx.walletType)).data,
    refetchInterval: 10_000,
  });

  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ['buy', 'positions'],
    queryFn: async () => (await buyApi.getPositions()).data,
    refetchInterval: 10_000,
  });

  // Forms
  const [buyForm, setBuyForm] = useState({
    wallet_alias: '',
    mint: '',
    amount_sol: 0.15,
    slippage_bps: 100,
    use_jito: true,
    jito_tip_lamports: 50000,
  });

  const [sellForm, setSellForm] = useState({
    wallet_alias: '',
    mint: '',
    amount_pct: 100,
    slippage_bps: 100,
  });

  // Confirmation dialog (REAL mode)
  const [confirmDialog, setConfirmDialog] = useState<{ action: string; onConfirm: () => void } | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const tradingWallets = wallets.filter((w) => w.trading_enabled);
  const openPositions = positions.filter((p) => p.status === 'OPEN');

  const selectedBuyWallet = tradingWallets.find((w) => w.alias === buyForm.wallet_alias);
  const selectedBuyBalance = selectedBuyWallet ? getBalance(selectedBuyWallet) : 0;

  const selectedSellWallet = tradingWallets.find((w) => w.alias === sellForm.wallet_alias);
  const sellWalletPositions = openPositions.filter((p) => {
    return selectedSellWallet && p.wallet_id === selectedSellWallet.id;
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleBuy = async () => {
    try {
      setLoading(true);
      setAlert({ type: 'info', message: 'Executing buy order...' });
      const response = await buyApi.executeBuy(buyForm);
      setLastResult(response.data);
      if (response.data.status === 'success') {
        setAlert({
          type: 'success',
          message: `Buy executed! Received ${response.data.data?.tokens_received?.toFixed(2) ?? '?'} tokens`,
        });
        refetchData();
      } else {
        setAlert({ type: 'error', message: response.data.message || 'Buy failed' });
      }
    } catch (error: any) {
      setAlert({ type: 'error', message: parseApiError(error, 'Buy failed') });
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    try {
      setLoading(true);
      setAlert({ type: 'info', message: 'Executing sell order...' });
      const response = await buyApi.executeSell(sellForm);
      setLastResult(response.data);
      if (response.data.status === 'success') {
        const d = response.data.data;
        setAlert({
          type: 'success',
          message: `Sell executed! Received ${fmtSol(d?.sol_received_net ?? 0)} (${fmtEur(solToEur(d?.sol_received_net ?? 0))})`,
        });
        refetchData();
      } else {
        setAlert({ type: 'error', message: response.data.message || 'Sell failed' });
      }
    } catch (error: any) {
      setAlert({ type: 'error', message: parseApiError(error, 'Sell failed') });
    } finally {
      setLoading(false);
    }
  };

  const handleSellAll = async () => {
    if (!sellForm.wallet_alias) return;
    try {
      setLoading(true);
      setAlert({ type: 'info', message: `Selling all positions for ${sellForm.wallet_alias}...` });
      const response = await buyApi.sellAll({ wallet_alias: sellForm.wallet_alias });
      setLastResult(response.data);
      setAlert({ type: 'success', message: 'Sell-all completed!' });
      refetchData();
    } catch (error: any) {
      setAlert({ type: 'error', message: parseApiError(error, 'Sell-all failed') });
    } finally {
      setLoading(false);
    }
  };

  const withConfirm = (action: string, fn: () => void) => {
    if (ctx.walletType === 'REAL') {
      setConfirmDialog({ action, onConfirm: fn });
    } else {
      fn();
    }
  };

  // ---------------------------------------------------------------------------
  // Shared styles
  // ---------------------------------------------------------------------------
  const accentRgb = ctx.accentColor;
  const buyColor = '#4caf50';
  const sellColor = '#f44336';
  const activeColor = activeTab === 'buy' ? buyColor : sellColor;

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: 'rgba(255,255,255,0.03)',
      '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
      '&:hover fieldset': { borderColor: `rgba(${accentRgb}, 0.3)` },
      '&.Mui-focused fieldset': { borderColor: activeColor },
    },
  };

  // Quick amount buttons for buy
  const setAmountPercent = (pct: number) => {
    if (selectedBuyBalance > 0) {
      const amount = Math.floor(selectedBuyBalance * pct * 10000) / 10000;
      setBuyForm({ ...buyForm, amount_sol: amount });
    }
  };

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

      {ctx.walletType === 'REAL' && (
        <Alert
          severity="warning"
          sx={{ mb: 2, bgcolor: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)' }}
        >
          Real trading is not yet implemented. Buy/Sell orders will return NOT_IMPLEMENTED status.
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* ================================================================= */}
        {/* LEFT: Trading Panel                                                */}
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
            {loading && <LinearProgress sx={{ height: 2, bgcolor: 'transparent', '& .MuiLinearProgress-bar': { bgcolor: activeColor } }} />}

            {/* ---- Tab Toggle ---- */}
            <Box sx={{ display: 'flex', p: 0 }}>
              {(['buy', 'sell'] as const).map((tab) => {
                const isActive = activeTab === tab;
                const color = tab === 'buy' ? buyColor : sellColor;
                return (
                  <Box
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    sx={{
                      flex: 1,
                      py: 2,
                      textAlign: 'center',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '1rem',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      color: isActive ? color : 'rgba(255,255,255,0.35)',
                      bgcolor: isActive ? `${color}10` : 'transparent',
                      borderBottom: isActive ? `3px solid ${color}` : '3px solid transparent',
                      transition: 'all 0.2s',
                      '&:hover': { bgcolor: `${color}08`, color: isActive ? color : 'rgba(255,255,255,0.6)' },
                    }}
                  >
                    {tab}
                  </Box>
                );
              })}
            </Box>

            <CardContent sx={{ p: 3 }}>
              {/* ============================================================ */}
              {/* BUY TAB                                                       */}
              {/* ============================================================ */}
              {activeTab === 'buy' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  {/* Wallet Selector */}
                  <FormControl fullWidth sx={inputSx}>
                    <InputLabel>Wallet</InputLabel>
                    <Select
                      value={buyForm.wallet_alias}
                      label="Wallet"
                      onChange={(e) => setBuyForm({ ...buyForm, wallet_alias: e.target.value })}
                    >
                      {tradingWallets.map((w) => {
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
                  {selectedBuyWallet && (
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
                        Available
                      </Typography>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body1" sx={{ fontWeight: 700, color: `rgb(${accentRgb})` }}>
                          {fmtEur(solToEur(selectedBuyBalance))}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                          {fmtSol(selectedBuyBalance)}
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  {/* Token Mint */}
                  <TextField
                    label="Token Mint Address"
                    value={buyForm.mint}
                    onChange={(e) => setBuyForm({ ...buyForm, mint: e.target.value })}
                    fullWidth
                    placeholder="Paste token mint address..."
                    sx={inputSx}
                  />

                  {/* Amount Input */}
                  <Box>
                    <TextField
                      label="Amount (SOL)"
                      type="number"
                      value={buyForm.amount_sol}
                      onChange={(e) => setBuyForm({ ...buyForm, amount_sol: parseFloat(e.target.value) || 0 })}
                      fullWidth
                      inputProps={{ step: 0.01, min: 0.001 }}
                      sx={inputSx}
                    />
                    {/* EUR conversion */}
                    {solEur > 0 && (
                      <Typography
                        variant="body2"
                        sx={{ mt: 0.5, ml: 1, color: 'rgba(255,255,255,0.4)' }}
                      >
                        ≈ {fmtEur(solToEur(buyForm.amount_sol))}
                      </Typography>
                    )}
                    {/* Quick amount buttons */}
                    {selectedBuyWallet && (
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
                              color: buyColor,
                              bgcolor: `${buyColor}12`,
                              border: `1px solid ${buyColor}30`,
                              borderRadius: 1.5,
                              '&:hover': { bgcolor: `${buyColor}25` },
                            }}
                          >
                            {label}
                          </Button>
                        ))}
                      </Box>
                    )}
                  </Box>

                  {/* Advanced Settings Toggle */}
                  <Box
                    onClick={() => setShowAdvanced(!showAdvanced)}
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
                      Advanced Settings
                    </Typography>
                    <IconButton size="small" sx={{ color: 'inherit' }}>
                      {showAdvanced ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </IconButton>
                  </Box>

                  <Collapse in={showAdvanced}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <TextField
                        label="Slippage (bps)"
                        type="number"
                        value={buyForm.slippage_bps}
                        onChange={(e) => setBuyForm({ ...buyForm, slippage_bps: parseInt(e.target.value) })}
                        fullWidth
                        helperText="100 = 1%, 500 = 5%"
                        sx={inputSx}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={buyForm.use_jito}
                            onChange={(e) => setBuyForm({ ...buyForm, use_jito: e.target.checked })}
                            sx={{
                              color: 'rgba(255,255,255,0.3)',
                              '&.Mui-checked': { color: `rgb(${accentRgb})` },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                            Use Jito Bundles
                          </Typography>
                        }
                      />
                      {buyForm.use_jito && (
                        <TextField
                          label="Jito Tip (lamports)"
                          type="number"
                          value={buyForm.jito_tip_lamports}
                          onChange={(e) =>
                            setBuyForm({ ...buyForm, jito_tip_lamports: parseInt(e.target.value) })
                          }
                          fullWidth
                          helperText="Default: 50,000 lamports"
                          sx={inputSx}
                        />
                      )}
                    </Box>
                  </Collapse>

                  {/* Execute Button */}
                  <Button
                    variant="contained"
                    onClick={() => withConfirm('BUY', handleBuy)}
                    disabled={!buyForm.wallet_alias || !buyForm.mint || buyForm.amount_sol <= 0 || loading}
                    fullWidth
                    size="large"
                    sx={{
                      mt: 1,
                      py: 1.8,
                      bgcolor: buyColor,
                      '&:hover': { bgcolor: '#388e3c' },
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      letterSpacing: 0.5,
                      borderRadius: 2,
                      boxShadow: `0 4px 20px ${buyColor}40`,
                    }}
                  >
                    {loading ? 'Processing...' : 'Buy'}
                  </Button>
                </Box>
              )}

              {/* ============================================================ */}
              {/* SELL TAB                                                      */}
              {/* ============================================================ */}
              {activeTab === 'sell' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  {/* Wallet Selector */}
                  <FormControl fullWidth sx={inputSx}>
                    <InputLabel>Wallet</InputLabel>
                    <Select
                      value={sellForm.wallet_alias}
                      label="Wallet"
                      onChange={(e) => setSellForm({ ...sellForm, wallet_alias: e.target.value, mint: '' })}
                    >
                      {tradingWallets.map((w) => {
                        const posCount = openPositions.filter((p) => p.wallet_id === w.id).length;
                        return (
                          <MenuItem key={w.id} value={w.alias}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                              <span>{w.alias}</span>
                              <Typography component="span" sx={{ color: 'rgba(255,255,255,0.5)', ml: 2 }}>
                                {posCount} position{posCount !== 1 ? 's' : ''}
                              </Typography>
                            </Box>
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>

                  {/* Position Selector */}
                  <FormControl fullWidth sx={inputSx}>
                    <InputLabel>Position</InputLabel>
                    <Select
                      value={sellForm.mint}
                      label="Position"
                      onChange={(e) => setSellForm({ ...sellForm, mint: e.target.value })}
                    >
                      {sellWalletPositions.map((p) => (
                        <MenuItem key={p.id} value={p.mint}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                              {truncateMint(p.mint)}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                              <Typography component="span" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                                {p.tokens_held.toFixed(0)} tokens
                              </Typography>
                              <Typography component="span" sx={{ fontWeight: 600 }}>
                                {fmtEur(solToEur(p.initial_sol_spent))}
                              </Typography>
                            </Box>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Sell Percentage Buttons */}
                  <Box>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1, fontSize: '0.8rem' }}>
                      Sell Amount
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      {[25, 50, 75, 100].map((pct) => (
                        <Button
                          key={pct}
                          onClick={() => setSellForm({ ...sellForm, amount_pct: pct })}
                          sx={{
                            flex: 1,
                            py: 1.2,
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            color: sellForm.amount_pct === pct ? '#fff' : sellColor,
                            bgcolor: sellForm.amount_pct === pct ? sellColor : `${sellColor}12`,
                            border: `1px solid ${sellForm.amount_pct === pct ? sellColor : `${sellColor}30`}`,
                            borderRadius: 2,
                            '&:hover': {
                              bgcolor: sellForm.amount_pct === pct ? sellColor : `${sellColor}25`,
                            },
                          }}
                        >
                          {pct}%
                        </Button>
                      ))}
                    </Box>
                  </Box>

                  {/* Advanced Settings Toggle */}
                  <Box
                    onClick={() => setShowAdvanced(!showAdvanced)}
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
                      Advanced Settings
                    </Typography>
                    <IconButton size="small" sx={{ color: 'inherit' }}>
                      {showAdvanced ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </IconButton>
                  </Box>

                  <Collapse in={showAdvanced}>
                    <TextField
                      label="Slippage (bps)"
                      type="number"
                      value={sellForm.slippage_bps}
                      onChange={(e) => setSellForm({ ...sellForm, slippage_bps: parseInt(e.target.value) })}
                      fullWidth
                      helperText="100 = 1%, 500 = 5%"
                      sx={inputSx}
                    />
                  </Collapse>

                  {/* Execute Sell Button */}
                  <Button
                    variant="contained"
                    onClick={() => withConfirm('SELL', handleSell)}
                    disabled={!sellForm.wallet_alias || !sellForm.mint || loading}
                    fullWidth
                    size="large"
                    sx={{
                      mt: 1,
                      py: 1.8,
                      bgcolor: sellColor,
                      '&:hover': { bgcolor: '#c62828' },
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      letterSpacing: 0.5,
                      borderRadius: 2,
                      boxShadow: `0 4px 20px ${sellColor}40`,
                    }}
                  >
                    {loading ? 'Processing...' : `Sell ${sellForm.amount_pct}%`}
                  </Button>

                  {/* Sell All Divider */}
                  {sellForm.wallet_alias && sellWalletPositions.length > 1 && (
                    <>
                      <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', my: 0.5 }} />
                      <Button
                        variant="outlined"
                        onClick={() => withConfirm('SELL ALL', handleSellAll)}
                        disabled={loading}
                        fullWidth
                        sx={{
                          py: 1.2,
                          color: '#ff9800',
                          borderColor: 'rgba(255, 152, 0, 0.3)',
                          fontWeight: 700,
                          borderRadius: 2,
                          '&:hover': { bgcolor: 'rgba(255, 152, 0, 0.08)', borderColor: '#ff9800' },
                        }}
                      >
                        Sell All {sellWalletPositions.length} Positions
                      </Button>
                    </>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* ---- Last Result ---- */}
          {lastResult && (
            <Card sx={{ ...CARD_SX, mt: 2, borderRadius: 3 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <Chip
                    label={lastResult.status.toUpperCase()}
                    size="small"
                    sx={{
                      bgcolor: lastResult.status === 'success' ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.2)',
                      color: lastResult.status === 'success' ? buyColor : sellColor,
                      fontWeight: 700,
                    }}
                  />
                  {lastResult.message && (
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                      {lastResult.message}
                    </Typography>
                  )}
                </Box>
                {lastResult.data && (
                  <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {lastResult.data.tokens_received != null && (
                      <Box>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Tokens</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{lastResult.data.tokens_received.toFixed(2)}</Typography>
                      </Box>
                    )}
                    {lastResult.data.sol_received_net != null && (
                      <Box>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Received</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmtEur(solToEur(lastResult.data.sol_received_net))}</Typography>
                      </Box>
                    )}
                    {lastResult.data.pnl_sol != null && (
                      <Box>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>P&L</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: lastResult.data.pnl_sol >= 0 ? buyColor : sellColor }}>
                          {lastResult.data.pnl_sol >= 0 ? '+' : ''}{fmtEur(solToEur(lastResult.data.pnl_sol))}
                        </Typography>
                      </Box>
                    )}
                    {lastResult.data.entry_price != null && (
                      <Box>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Entry</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{lastResult.data.entry_price.toFixed(9)}</Typography>
                      </Box>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* ================================================================= */}
        {/* RIGHT: Positions + Wallet Overview                                 */}
        {/* ================================================================= */}
        <Grid size={{ xs: 12, md: 5 }}>
          {/* Wallet Balances */}
          <Card sx={{ ...CARD_SX, borderRadius: 3, mb: 2 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: 'rgba(255,255,255,0.7)' }}>
                Wallets
              </Typography>
              {tradingWallets.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', py: 2 }}>
                  No trading wallets
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {tradingWallets.map((w) => {
                    const bal = getBalance(w);
                    const posCount = openPositions.filter((p) => p.wallet_id === w.id).length;
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
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{w.alias}</Typography>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                            {posCount} position{posCount !== 1 ? 's' : ''}
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

          {/* Open Positions */}
          <Card sx={{ ...CARD_SX, borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                  Open Positions
                </Typography>
                <Chip
                  label={openPositions.length}
                  size="small"
                  sx={{ bgcolor: `rgba(${accentRgb}, 0.15)`, color: `rgb(${accentRgb})`, fontWeight: 700, minWidth: 28 }}
                />
              </Box>

              {openPositions.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                    No open positions
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {openPositions.map((pos) => {
                    const wallet = wallets.find((w) => w.id === pos.wallet_id);
                    return (
                      <Box
                        key={pos.id}
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
                              {wallet?.alias}
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => {
                                navigator.clipboard.writeText(pos.mint);
                                if (activeTab === 'buy') {
                                  setBuyForm({ ...buyForm, mint: pos.mint });
                                }
                              }}
                              sx={{ p: 0.3, color: 'rgba(255,255,255,0.3)', '&:hover': { color: `rgb(${accentRgb})` } }}
                            >
                              <CopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Box>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: `rgb(${accentRgb})` }}
                          >
                            {truncateMint(pos.mint)}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Box>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>TOKENS</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                              {pos.tokens_held.toFixed(0)}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>ENTRY</Typography>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                              {pos.entry_price.toFixed(9)}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>COST</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                              {fmtEur(solToEur(pos.initial_sol_spent))}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Confirmation Dialog for REAL trades */}
      <Dialog open={!!confirmDialog} onClose={() => { setConfirmDialog(null); setConfirmText(''); }}>
        <DialogTitle sx={{ color: '#ff9800' }}>Confirm Real Trade</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            You are about to execute a REAL {confirmDialog?.action} order.
            Type <strong>CONFIRM</strong> to proceed.
          </DialogContentText>
          <TextField
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            fullWidth
            placeholder="Type CONFIRM"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setConfirmDialog(null); setConfirmText(''); }}>Cancel</Button>
          <Button
            onClick={() => { confirmDialog?.onConfirm(); setConfirmDialog(null); setConfirmText(''); }}
            disabled={confirmText !== 'CONFIRM'}
            variant="contained"
            color="warning"
          >
            Execute
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
