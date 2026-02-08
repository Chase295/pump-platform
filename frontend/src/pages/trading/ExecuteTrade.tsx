import { useEffect, useState } from 'react';
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
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import type { Wallet, Position, TradeResponse } from '../../types/buy';

export default function ExecuteTrade() {
  const ctx = useTradingContext();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [lastResult, setLastResult] = useState<TradeResponse | null>(null);

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

  const fetchData = async () => {
    try {
      const [walletsRes, positionsRes] = await Promise.all([
        buyApi.getWallets(ctx.walletType),
        buyApi.getPositions(),
      ]);
      setWallets(walletsRes.data);
      setPositions(positionsRes.data);
    } catch {
      console.error('Failed to load data');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const tradingWallets = wallets.filter((w) => w.trading_enabled);
  const openPositions = positions.filter((p) => p.status === 'OPEN');

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
        fetchData();
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
          message: `Sell executed! Received ${d?.sol_received_net?.toFixed(6) ?? '?'} SOL (PnL: ${d?.pnl_sol?.toFixed(6) ?? '?'} SOL)`,
        });
        fetchData();
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
      fetchData();
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

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {ctx.label} - Trade
      </Typography>

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

      <Grid container spacing={3}>
        {/* ----------------------------------------------------------------- */}
        {/* Buy Card                                                          */}
        {/* ----------------------------------------------------------------- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ bgcolor: 'rgba(76, 175, 80, 0.1)', border: '1px solid rgba(76, 175, 80, 0.3)' }}>
            <CardHeader title="Buy" titleTypographyProps={{ color: '#4caf50' }} />
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Wallet</InputLabel>
                  <Select
                    value={buyForm.wallet_alias}
                    label="Wallet"
                    onChange={(e) => setBuyForm({ ...buyForm, wallet_alias: e.target.value })}
                  >
                    {tradingWallets.map((w) => (
                      <MenuItem key={w.id} value={w.alias}>
                        {w.alias} ({(w.type === 'TEST' ? w.virtual_sol_balance : w.real_sol_balance).toFixed(4)} SOL)
                      </MenuItem>
                    ))}
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
                  color="success"
                  onClick={handleBuyClick}
                  disabled={!buyForm.wallet_alias || !buyForm.mint || buyForm.amount_sol <= 0}
                  fullWidth
                  size="large"
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
          <Card sx={{ bgcolor: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.3)' }}>
            <CardHeader title="Sell" titleTypographyProps={{ color: '#f44336' }} />
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
                          {p.mint.slice(0, 8)}... ({p.tokens_held.toFixed(2)} tokens)
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
                  color="error"
                  onClick={handleSellClick}
                  disabled={!sellForm.wallet_alias || !sellForm.mint}
                  fullWidth
                  size="large"
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
          <Card sx={{ bgcolor: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)' }}>
            <CardHeader title="Sell All Positions" titleTypographyProps={{ color: '#ff9800' }} />
            <CardContent>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <FormControl sx={{ minWidth: 200 }}>
                  <InputLabel>Wallet</InputLabel>
                  <Select
                    value={sellAllWallet}
                    label="Wallet"
                    onChange={(e) => setSellAllWallet(e.target.value)}
                  >
                    {tradingWallets.map((w) => (
                      <MenuItem key={w.id} value={w.alias}>
                        {w.alias}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  color="warning"
                  onClick={handleSellAllClick}
                  disabled={!sellAllWallet}
                  size="large"
                >
                  Sell All for Wallet
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Open Positions */}
      <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
        Open Positions
      </Typography>
      <Grid container spacing={2}>
        {openPositions.map((position) => {
          const wallet = wallets.find((w) => w.id === position.wallet_id);
          return (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={position.id}>
              <Card sx={{ bgcolor: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" sx={{ color: '#b8c5d6' }}>
                      {wallet?.alias || 'Unknown'}
                    </Typography>
                    <Chip
                      label="OPEN"
                      size="small"
                      sx={{ bgcolor: 'rgba(255, 152, 0, 0.2)', color: '#ff9800' }}
                    />
                  </Box>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 2 }}>
                    {position.mint.slice(0, 16)}...
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
                        Tokens
                      </Typography>
                      <Typography variant="body2">{position.tokens_held.toFixed(2)}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
                        Entry
                      </Typography>
                      <Typography variant="body2">{position.entry_price.toFixed(9)}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
                        Cost
                      </Typography>
                      <Typography variant="body2">{position.initial_sol_spent.toFixed(4)} SOL</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
        {openPositions.length === 0 && (
          <Grid size={12}>
            <Typography sx={{ color: '#b8c5d6', textAlign: 'center', py: 4 }}>
              No open positions
            </Typography>
          </Grid>
        )}
      </Grid>

      {/* Last Result */}
      {lastResult && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Last Execution Result
          </Typography>
          <Card sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)' }}>
            <CardContent>
              <pre
                style={{
                  margin: 0,
                  overflow: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  color: '#e0e0e0',
                }}
              >
                {JSON.stringify(lastResult, null, 2)}
              </pre>
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
