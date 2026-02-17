import { useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardHeader,
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  TrendingUp as TrendingUpIcon,
  SwapHoriz as SwapIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import { useExchangeRate, fmtEur, fmtSol, truncateMint, CARD_SX } from './tradingUtils';
import type { Wallet, Position, TradeResponse } from '../../types/buy';

export default function ExecuteTrade() {
  const ctx = useTradingContext();
  const { data: exchangeRate } = useExchangeRate();
  const solEur = exchangeRate?.sol_price_eur ?? 0;
  const solToEur = (sol: number) => sol * solEur;

  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [lastResult, setLastResult] = useState<TradeResponse | null>(null);

  // ---- Data fetching via useQuery ----
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

  // Buy form
  const [buyForm, setBuyForm] = useState({
    wallet_alias: '',
    mint: '',
    amount_sol: 0.15,
    slippage_bps: 100,
    use_jito: true,
    jito_tip_lamports: 50000,
  });

  // Sell form
  const [sellForm, setSellForm] = useState({
    wallet_alias: '',
    mint: '',
    amount_pct: 100,
    slippage_bps: 100,
  });

  // Sell-all state
  const [sellAllWallet, setSellAllWallet] = useState('');

  // Confirmation dialog state (for REAL mode)
  const [confirmDialog, setConfirmDialog] = useState<{ action: string; onConfirm: () => void } | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const tradingWallets = wallets.filter((w) => w.trading_enabled);
  const openPositions = positions.filter((p) => p.status === 'OPEN');

  // Compute quick-info values
  const selectedBuyWallet = tradingWallets.find((w) => w.alias === buyForm.wallet_alias);
  const selectedBuyBalance = selectedBuyWallet
    ? selectedBuyWallet.type === 'TEST'
      ? selectedBuyWallet.virtual_sol_balance
      : selectedBuyWallet.real_sol_balance
    : 0;
  const totalBalance = tradingWallets.reduce(
    (sum, w) => sum + (w.type === 'TEST' ? w.virtual_sol_balance : w.real_sol_balance),
    0,
  );

  // ---------------------------------------------------------------------------
  // Buy handler
  // ---------------------------------------------------------------------------
  const handleBuy = async () => {
    try {
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
      setAlert({ type: 'error', message: error.response?.data?.detail || 'Buy failed' });
    }
  };

  // ---------------------------------------------------------------------------
  // Sell handler
  // ---------------------------------------------------------------------------
  const handleSell = async () => {
    try {
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
      setAlert({ type: 'error', message: error.response?.data?.detail || 'Sell failed' });
    }
  };

  // ---------------------------------------------------------------------------
  // Sell All handler
  // ---------------------------------------------------------------------------
  const handleSellAll = async () => {
    if (!sellAllWallet) return;
    try {
      setAlert({ type: 'info', message: `Selling all positions for ${sellAllWallet}...` });
      const response = await buyApi.sellAll({ wallet_alias: sellAllWallet });
      setLastResult(response.data);
      setAlert({ type: 'success', message: 'Sell-all completed!' });
      refetchData();
    } catch (error: any) {
      setAlert({ type: 'error', message: error.response?.data?.detail || 'Sell-all failed' });
    }
  };

  // Confirmation wrappers for REAL mode
  const handleBuyClick = () => {
    if (ctx.walletType === 'REAL') {
      setConfirmDialog({ action: 'BUY', onConfirm: handleBuy });
    } else {
      handleBuy();
    }
  };

  const handleSellClick = () => {
    if (ctx.walletType === 'REAL') {
      setConfirmDialog({ action: 'SELL', onConfirm: handleSell });
    } else {
      handleSell();
    }
  };

  const handleSellAllClick = () => {
    if (ctx.walletType === 'REAL') {
      setConfirmDialog({ action: 'SELL ALL', onConfirm: handleSellAll });
    } else {
      handleSellAll();
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
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

  return (
    <Box>
      {alert && (
        <Alert severity={alert.type} sx={{ mb: 3 }} onClose={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      {ctx.walletType === 'REAL' && (
        <Alert
          severity="warning"
          sx={{ mb: 3, bgcolor: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)' }}
        >
          Real trading is not yet implemented. Buy/Sell orders will return NOT_IMPLEMENTED status.
        </Alert>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Quick-info StatCards                                               */}
      {/* ----------------------------------------------------------------- */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Available Balance"
            value={fmtEur(solToEur(totalBalance))}
            sub={fmtSol(totalBalance)}
            icon={<WalletIcon fontSize="small" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Open Positions"
            value={String(openPositions.length)}
            sub={`across ${tradingWallets.length} wallets`}
            icon={<TrendingUpIcon fontSize="small" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Trading Wallets"
            value={`${tradingWallets.length} / ${wallets.length}`}
            sub="enabled for trading"
            icon={<SwapIcon fontSize="small" />}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* ----------------------------------------------------------------- */}
        {/* Buy Card                                                          */}
        {/* ----------------------------------------------------------------- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ bgcolor: 'rgba(76, 175, 80, 0.06)', border: '1px solid rgba(76, 175, 80, 0.2)', backdropFilter: 'blur(10px)' }}>
            <CardHeader
              title="Buy"
              titleTypographyProps={{ color: '#4caf50', fontWeight: 700 }}
              subheader={
                selectedBuyWallet
                  ? `Balance: ${fmtEur(solToEur(selectedBuyBalance))} (${fmtSol(selectedBuyBalance)})`
                  : 'Select a wallet'
              }
              subheaderTypographyProps={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}
            />
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Wallet</InputLabel>
                  <Select
                    value={buyForm.wallet_alias}
                    label="Wallet"
                    onChange={(e) => setBuyForm({ ...buyForm, wallet_alias: e.target.value })}
                  >
                    {tradingWallets.map((w) => {
                      const bal = w.type === 'TEST' ? w.virtual_sol_balance : w.real_sol_balance;
                      return (
                        <MenuItem key={w.id} value={w.alias}>
                          {w.alias} — {fmtEur(solToEur(bal))} ({fmtSol(bal)})
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>

                <TextField
                  label="Token Mint Address"
                  value={buyForm.mint}
                  onChange={(e) => setBuyForm({ ...buyForm, mint: e.target.value })}
                  fullWidth
                  placeholder="e.g., 7BadU..."
                />

                <TextField
                  label="Amount (SOL)"
                  type="number"
                  value={buyForm.amount_sol}
                  onChange={(e) => setBuyForm({ ...buyForm, amount_sol: parseFloat(e.target.value) })}
                  fullWidth
                  inputProps={{ step: 0.01, min: 0.001 }}
                  helperText={
                    solEur > 0
                      ? `~ ${fmtEur(solToEur(buyForm.amount_sol))}`
                      : undefined
                  }
                />

                <TextField
                  label="Slippage (bps)"
                  type="number"
                  value={buyForm.slippage_bps}
                  onChange={(e) => setBuyForm({ ...buyForm, slippage_bps: parseInt(e.target.value) })}
                  fullWidth
                  helperText="100 = 1%, 500 = 5%"
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={buyForm.use_jito}
                      onChange={(e) => setBuyForm({ ...buyForm, use_jito: e.target.checked })}
                      sx={{ color: `rgba(${ctx.accentColor}, 0.6)`, '&.Mui-checked': { color: `rgb(${ctx.accentColor})` } }}
                    />
                  }
                  label="Use Jito Bundles"
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
                  />
                )}

                <Button
                  variant="contained"
                  onClick={handleBuyClick}
                  disabled={!buyForm.wallet_alias || !buyForm.mint || buyForm.amount_sol <= 0}
                  fullWidth
                  size="large"
                  sx={{
                    bgcolor: '#4caf50',
                    '&:hover': { bgcolor: '#388e3c' },
                    fontWeight: 700,
                    fontSize: '1rem',
                  }}
                >
                  Execute Buy
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* ----------------------------------------------------------------- */}
        {/* Sell Card                                                          */}
        {/* ----------------------------------------------------------------- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ bgcolor: 'rgba(244, 67, 54, 0.06)', border: '1px solid rgba(244, 67, 54, 0.2)', backdropFilter: 'blur(10px)' }}>
            <CardHeader
              title="Sell"
              titleTypographyProps={{ color: '#f44336', fontWeight: 700 }}
              subheader={
                sellForm.wallet_alias
                  ? `${openPositions.filter((p) => {
                      const w = wallets.find((ww) => ww.alias === sellForm.wallet_alias);
                      return w && p.wallet_id === w.id;
                    }).length} open positions`
                  : 'Select a wallet'
              }
              subheaderTypographyProps={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}
            />
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Wallet</InputLabel>
                  <Select
                    value={sellForm.wallet_alias}
                    label="Wallet"
                    onChange={(e) => setSellForm({ ...sellForm, wallet_alias: e.target.value })}
                  >
                    {tradingWallets.map((w) => (
                      <MenuItem key={w.id} value={w.alias}>
                        {w.alias}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth>
                  <InputLabel>Position</InputLabel>
                  <Select
                    value={sellForm.mint}
                    label="Position"
                    onChange={(e) => setSellForm({ ...sellForm, mint: e.target.value })}
                  >
                    {openPositions
                      .filter((p) => {
                        const wallet = wallets.find((w) => w.alias === sellForm.wallet_alias);
                        return wallet && p.wallet_id === wallet.id;
                      })
                      .map((p) => (
                        <MenuItem key={p.id} value={p.mint}>
                          {truncateMint(p.mint)} — {p.tokens_held.toFixed(2)} tokens ({fmtEur(solToEur(p.initial_sol_spent))})
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>

                <TextField
                  label="Sell Percentage"
                  type="number"
                  value={sellForm.amount_pct}
                  onChange={(e) => setSellForm({ ...sellForm, amount_pct: parseFloat(e.target.value) })}
                  fullWidth
                  inputProps={{ step: 10, min: 1, max: 100 }}
                  helperText="100 = sell all"
                />

                <TextField
                  label="Slippage (bps)"
                  type="number"
                  value={sellForm.slippage_bps}
                  onChange={(e) => setSellForm({ ...sellForm, slippage_bps: parseInt(e.target.value) })}
                  fullWidth
                />

                <Button
                  variant="contained"
                  onClick={handleSellClick}
                  disabled={!sellForm.wallet_alias || !sellForm.mint}
                  fullWidth
                  size="large"
                  sx={{
                    bgcolor: '#f44336',
                    '&:hover': { bgcolor: '#c62828' },
                    fontWeight: 700,
                    fontSize: '1rem',
                  }}
                >
                  Execute Sell
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* ----------------------------------------------------------------- */}
        {/* Sell All Card                                                      */}
        {/* ----------------------------------------------------------------- */}
        <Grid size={12}>
          <Card sx={{ bgcolor: 'rgba(255, 152, 0, 0.06)', border: '1px solid rgba(255, 152, 0, 0.2)', backdropFilter: 'blur(10px)' }}>
            <CardHeader title="Sell All Positions" titleTypographyProps={{ color: '#ff9800', fontWeight: 700 }} />
            <CardContent>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <FormControl sx={{ minWidth: 240 }}>
                  <InputLabel>Wallet</InputLabel>
                  <Select
                    value={sellAllWallet}
                    label="Wallet"
                    onChange={(e) => setSellAllWallet(e.target.value)}
                  >
                    {tradingWallets.map((w) => {
                      const posCount = openPositions.filter((p) => p.wallet_id === w.id).length;
                      return (
                        <MenuItem key={w.id} value={w.alias}>
                          {w.alias} — {posCount} position{posCount !== 1 ? 's' : ''}
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  onClick={handleSellAllClick}
                  disabled={!sellAllWallet}
                  size="large"
                  sx={{
                    bgcolor: '#ff9800',
                    '&:hover': { bgcolor: '#e65100' },
                    fontWeight: 700,
                  }}
                >
                  Sell All for Wallet
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ----------------------------------------------------------------- */}
      {/* Open Positions                                                      */}
      {/* ----------------------------------------------------------------- */}
      <Typography variant="h6" sx={{ mt: 4, mb: 2, fontWeight: 700 }}>
        Open Positions
      </Typography>
      <Grid container spacing={2}>
        {openPositions.map((position) => {
          const wallet = wallets.find((w) => w.id === position.wallet_id);
          return (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={position.id}>
              <Card sx={CARD_SX}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                      {wallet?.alias || 'Unknown'}
                    </Typography>
                    <Chip
                      label="OPEN"
                      size="small"
                      sx={{ bgcolor: 'rgba(255, 152, 0, 0.2)', color: '#ff9800', fontWeight: 600 }}
                    />
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: 'monospace', mb: 2, color: `rgb(${ctx.accentColor})` }}
                  >
                    {truncateMint(position.mint)}
                  </Typography>
                  <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.08)' }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        Tokens
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {position.tokens_held.toFixed(2)}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        Entry
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {position.entry_price.toFixed(9)}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        Cost
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {fmtEur(solToEur(position.initial_sol_spent))}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                        {fmtSol(position.initial_sol_spent)}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
        {openPositions.length === 0 && (
          <Grid size={12}>
            <Typography sx={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', py: 4 }}>
              No open positions
            </Typography>
          </Grid>
        )}
      </Grid>

      {/* ----------------------------------------------------------------- */}
      {/* Last Execution Result (formatted card)                              */}
      {/* ----------------------------------------------------------------- */}
      {lastResult && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
            Last Execution Result
          </Typography>
          <Card sx={CARD_SX}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Chip
                  label={lastResult.status.toUpperCase()}
                  size="small"
                  sx={{
                    bgcolor: lastResult.status === 'success' ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.2)',
                    color: lastResult.status === 'success' ? '#4caf50' : '#f44336',
                    fontWeight: 700,
                  }}
                />
                {lastResult.message && (
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                    {lastResult.message}
                  </Typography>
                )}
              </Box>
              {lastResult.data && (
                <Grid container spacing={2}>
                  {lastResult.data.tokens_received != null && (
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        Tokens Received
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>
                        {lastResult.data.tokens_received.toFixed(2)}
                      </Typography>
                    </Grid>
                  )}
                  {lastResult.data.sol_received_net != null && (
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        SOL Received
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>
                        {fmtEur(solToEur(lastResult.data.sol_received_net))}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                        {fmtSol(lastResult.data.sol_received_net)}
                      </Typography>
                    </Grid>
                  )}
                  {lastResult.data.pnl_sol != null && (
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        P&L
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{
                          fontWeight: 700,
                          color: lastResult.data.pnl_sol >= 0 ? '#4caf50' : '#f44336',
                        }}
                      >
                        {lastResult.data.pnl_sol >= 0 ? '+' : ''}
                        {fmtEur(solToEur(lastResult.data.pnl_sol))}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                        {lastResult.data.pnl_sol >= 0 ? '+' : ''}
                        {fmtSol(lastResult.data.pnl_sol)}
                      </Typography>
                    </Grid>
                  )}
                  {lastResult.data.amount_sent != null && (
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        Amount Sent
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>
                        {fmtEur(solToEur(lastResult.data.amount_sent))}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                        {fmtSol(lastResult.data.amount_sent)}
                      </Typography>
                    </Grid>
                  )}
                  {lastResult.data.entry_price != null && (
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        Entry Price
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>
                        {lastResult.data.entry_price.toFixed(9)}
                      </Typography>
                    </Grid>
                  )}
                  {lastResult.data.exit_price != null && (
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        Exit Price
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>
                        {lastResult.data.exit_price.toFixed(9)}
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Box>
      )}

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
