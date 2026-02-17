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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  SwapHoriz as TransferIcon,
  Receipt as ReceiptIcon,
  AccountBalanceWallet as WalletIcon,
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

export default function Transfers() {
  const ctx = useTradingContext();
  const { data: exchangeRate } = useExchangeRate();
  const solEur = exchangeRate?.sol_price_eur ?? 0;
  const solToEur = (sol: number) => sol * solEur;

  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const [form, setForm] = useState({
    wallet_alias: '',
    to_address: '',
    amount_sol: 1.0,
    force_sweep: false,
  });
  const [destinationType, setDestinationType] = useState<'wallet' | 'address'>('address');

  // ---- Data fetching via useQuery ----
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
  const selectedBalance = selectedWallet
    ? ctx.walletType === 'TEST'
      ? selectedWallet.virtual_sol_balance
      : selectedWallet.real_sol_balance
    : 0;

  // Compute stats
  const totalTransferred = transferLogs.reduce((sum, l) => sum + parseFloat(String(l.amount_sol)), 0);
  const successfulTransfers = transferLogs.filter((l) => l.status === 'SUCCESS').length;

  // ---------------------------------------------------------------------------
  // Transfer handler
  // ---------------------------------------------------------------------------
  const handleTransfer = async () => {
    try {
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

      {/* ----------------------------------------------------------------- */}
      {/* StatCards                                                          */}
      {/* ----------------------------------------------------------------- */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Total Transferred"
            value={fmtEur(solToEur(totalTransferred))}
            sub={fmtSol(totalTransferred)}
            icon={<TransferIcon fontSize="small" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Transfer Count"
            value={String(transferLogs.length)}
            sub={`${successfulTransfers} successful`}
            icon={<ReceiptIcon fontSize="small" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Transfer Wallets"
            value={`${transferWallets.length} / ${wallets.length}`}
            sub="enabled for transfers"
            icon={<WalletIcon fontSize="small" />}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* ----------------------------------------------------------------- */}
        {/* Transfer Form                                                     */}
        {/* ----------------------------------------------------------------- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card
            sx={{
              bgcolor: `rgba(${ctx.accentColor}, 0.06)`,
              border: `1px solid rgba(${ctx.accentColor}, 0.2)`,
              backdropFilter: 'blur(10px)',
            }}
          >
            <CardHeader
              title="New Transfer"
              titleTypographyProps={{ color: `rgb(${ctx.accentColor})`, fontWeight: 700 }}
              subheader={
                selectedWallet
                  ? `Balance: ${fmtEur(solToEur(selectedBalance))} (${fmtSol(selectedBalance)})`
                  : 'Select a wallet'
              }
              subheaderTypographyProps={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}
            />
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>From Wallet</InputLabel>
                  <Select
                    value={form.wallet_alias}
                    label="From Wallet"
                    onChange={(e) => setForm({ ...form, wallet_alias: e.target.value })}
                  >
                    {transferWallets.map((w) => {
                      const bal = ctx.walletType === 'TEST' ? w.virtual_sol_balance : w.real_sol_balance;
                      return (
                        <MenuItem key={w.id} value={w.alias}>
                          {w.alias} — {fmtEur(solToEur(bal))} ({fmtSol(bal)})
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>

                <FormControl fullWidth>
                  <InputLabel>Destination Type</InputLabel>
                  <Select
                    value={destinationType}
                    label="Destination Type"
                    onChange={(e) => {
                      setDestinationType(e.target.value as 'wallet' | 'address');
                      setForm({ ...form, to_address: '' });
                    }}
                  >
                    <MenuItem value="wallet">Existing Wallet</MenuItem>
                    <MenuItem value="address">External Address</MenuItem>
                  </Select>
                </FormControl>

                {destinationType === 'wallet' ? (
                  <FormControl fullWidth>
                    <InputLabel>To Wallet</InputLabel>
                    <Select
                      value={form.to_address}
                      label="To Wallet"
                      onChange={(e) => setForm({ ...form, to_address: e.target.value })}
                    >
                      {wallets
                        .filter((w) => w.alias !== form.wallet_alias)
                        .map((w) => {
                          const bal = w.type === 'TEST' ? w.virtual_sol_balance : w.real_sol_balance;
                          return (
                            <MenuItem key={w.id} value={w.address}>
                              {w.alias} ({w.type}) — {fmtEur(solToEur(bal))}
                            </MenuItem>
                          );
                        })}
                    </Select>
                  </FormControl>
                ) : (
                  <TextField
                    label="To Address"
                    value={form.to_address}
                    onChange={(e) => setForm({ ...form, to_address: e.target.value })}
                    fullWidth
                    placeholder="Destination Solana address"
                  />
                )}

                <TextField
                  label="Amount (SOL)"
                  type="number"
                  value={form.amount_sol}
                  onChange={(e) => setForm({ ...form, amount_sol: parseFloat(e.target.value) })}
                  fullWidth
                  disabled={form.force_sweep}
                  inputProps={{ step: 0.1, min: 0.001 }}
                  helperText={
                    !form.force_sweep && solEur > 0
                      ? `~ ${fmtEur(solToEur(form.amount_sol))}`
                      : undefined
                  }
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.force_sweep}
                      onChange={(e) => setForm({ ...form, force_sweep: e.target.checked })}
                      sx={{ color: `rgba(${ctx.accentColor}, 0.6)`, '&.Mui-checked': { color: `rgb(${ctx.accentColor})` } }}
                    />
                  }
                  label="Sweep all (send entire balance minus fees)"
                />

                <Button
                  variant="contained"
                  onClick={handleTransfer}
                  disabled={!form.wallet_alias || !form.to_address || (!form.force_sweep && form.amount_sol <= 0)}
                  fullWidth
                  size="large"
                  sx={{
                    bgcolor: `rgb(${ctx.accentColor})`,
                    '&:hover': { bgcolor: `rgba(${ctx.accentColor}, 0.8)` },
                    fontWeight: 700,
                    fontSize: '1rem',
                  }}
                >
                  Execute Transfer
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* ----------------------------------------------------------------- */}
        {/* Transfer Info                                                      */}
        {/* ----------------------------------------------------------------- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ ...CARD_SX, height: '100%' }}>
            <CardHeader title="Transfer Info" titleTypographyProps={{ fontWeight: 700 }} />
            <CardContent>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 2 }}>
                Transfers move SOL between wallets. For TEST wallets, this is simulated.
              </Typography>

              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Fees Applied:
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                  - Network Fee: 0.000005 SOL
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                  - Safety Buffer: 0.001 SOL (reserved)
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Security:
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                  - transfer_enabled must be TRUE
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                  - Wallet status must be ACTIVE
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ----------------------------------------------------------------- */}
      {/* Transfer History                                                    */}
      {/* ----------------------------------------------------------------- */}
      <Typography variant="h6" sx={{ mt: 4, mb: 2, fontWeight: 700 }}>
        Transfer History
      </Typography>
      <TableContainer
        component={Paper}
        sx={{ ...CARD_SX, overflowX: 'auto' }}
      >
        <Table sx={{ minWidth: 700 }}>
          <TableHead>
            <TableRow>
              <TableCell>From</TableCell>
              <TableCell>To</TableCell>
              <TableCell align="right">Amount (EUR)</TableCell>
              <TableCell align="right">Amount (SOL)</TableCell>
              <TableCell>Signature</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Time</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {transferLogs.map((log) => {
              const amountSol = parseFloat(String(log.amount_sol));
              return (
                <TableRow key={log.id}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {log.from_alias || 'Unknown'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {truncateAddress(log.to_address)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {fmtEur(solToEur(amountSol))}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                      {fmtSol(amountSol)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {log.tx_signature ? truncateAddress(log.tx_signature) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={log.status}
                      size="small"
                      sx={{
                        bgcolor: log.status === 'SUCCESS' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                        color: log.status === 'SUCCESS' ? '#4caf50' : '#f44336',
                        fontWeight: 600,
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
            {transferLogs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} sx={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', py: 4 }}>
                  No transfers yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
