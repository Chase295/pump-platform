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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import { buyApi } from '../../services/api';
import type { Wallet, TransferLog } from '../../types/buy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const truncate = (addr: string, chars = 4) =>
  addr ? `${addr.slice(0, chars)}...${addr.slice(-chars)}` : '';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function Transfers() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transferLogs, setTransferLogs] = useState<TransferLog[]>([]);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const [form, setForm] = useState({
    wallet_alias: '',
    to_address: '',
    amount_sol: 1.0,
    force_sweep: false,
  });
  const [destinationType, setDestinationType] = useState<'wallet' | 'address'>('address');

  const fetchData = async () => {
    try {
      const [walletsRes, logsRes] = await Promise.all([
        buyApi.getWallets(),
        buyApi.getTransferLogs(),
      ]);
      setWallets(walletsRes.data);
      setTransferLogs(logsRes.data);
    } catch {
      console.error('Failed to load transfer data');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const transferWallets = wallets.filter((w) => w.type === 'TEST' && w.transfer_enabled);
  const selectedWallet = wallets.find((w) => w.alias === form.wallet_alias);

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
          message: `Transfer successful! Sent ${response.data.data?.amount_sent?.toFixed(6) ?? '?'} SOL`,
        });
        fetchData();
      } else {
        setAlert({ type: 'error', message: response.data.message || 'Transfer failed' });
      }
    } catch (error: any) {
      setAlert({ type: 'error', message: error.response?.data?.detail || 'Transfer failed' });
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Transfers
      </Typography>

      {alert && (
        <Alert severity={alert.type} sx={{ mb: 3 }} onClose={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Transfer Form */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ bgcolor: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)' }}>
            <CardHeader title="New Transfer" titleTypographyProps={{ color: '#00d4ff' }} />
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>From Wallet</InputLabel>
                  <Select
                    value={form.wallet_alias}
                    label="From Wallet"
                    onChange={(e) => setForm({ ...form, wallet_alias: e.target.value })}
                  >
                    {transferWallets.map((w) => (
                      <MenuItem key={w.id} value={w.alias}>
                        {w.alias} ({w.virtual_sol_balance.toFixed(4)} SOL)
                      </MenuItem>
                    ))}
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
                        .map((w) => (
                          <MenuItem key={w.id} value={w.address}>
                            {w.alias} ({w.type}) -{' '}
                            {(w.type === 'TEST' ? w.virtual_sol_balance : w.real_sol_balance).toFixed(4)} SOL
                          </MenuItem>
                        ))}
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
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.force_sweep}
                      onChange={(e) => setForm({ ...form, force_sweep: e.target.checked })}
                    />
                  }
                  label="Sweep all (send entire balance minus fees)"
                />

                {selectedWallet && (
                  <Box sx={{ p: 2, bgcolor: 'rgba(255, 255, 255, 0.05)', borderRadius: 1 }}>
                    <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
                      Available Balance
                    </Typography>
                    <Typography variant="h6">
                      {selectedWallet.virtual_sol_balance.toFixed(6)} SOL
                    </Typography>
                  </Box>
                )}

                <Button
                  variant="contained"
                  onClick={handleTransfer}
                  disabled={!form.wallet_alias || !form.to_address || (!form.force_sweep && form.amount_sol <= 0)}
                  fullWidth
                  size="large"
                  sx={{ bgcolor: '#00d4ff', '&:hover': { bgcolor: '#00b8d9' } }}
                >
                  Execute Transfer
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Transfer Info */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', height: '100%' }}>
            <CardHeader title="Transfer Info" />
            <CardContent>
              <Typography variant="body2" sx={{ color: '#b8c5d6', mb: 2 }}>
                Transfers move SOL between wallets. For TEST wallets, this is simulated.
              </Typography>

              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Fees Applied:
                </Typography>
                <Typography variant="body2" sx={{ color: '#b8c5d6' }}>
                  - Network Fee: 0.000005 SOL
                </Typography>
                <Typography variant="body2" sx={{ color: '#b8c5d6' }}>
                  - Safety Buffer: 0.001 SOL (reserved)
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Security:
                </Typography>
                <Typography variant="body2" sx={{ color: '#b8c5d6' }}>
                  - transfer_enabled must be TRUE
                </Typography>
                <Typography variant="body2" sx={{ color: '#b8c5d6' }}>
                  - Wallet status must be ACTIVE
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Transfer History */}
      <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
        Transfer History
      </Typography>
      <TableContainer
        component={Paper}
        sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', overflowX: 'auto' }}
      >
        <Table sx={{ minWidth: 700 }}>
          <TableHead>
            <TableRow>
              <TableCell>From</TableCell>
              <TableCell>To</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Signature</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Time</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {transferLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{log.from_alias || 'Unknown'}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {truncate(log.to_address, 6)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {parseFloat(String(log.amount_sol)).toFixed(6)} SOL
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
                    {log.tx_signature ? truncate(log.tx_signature, 8) : '-'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={log.status}
                    size="small"
                    sx={{
                      bgcolor: log.status === 'SUCCESS' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                      color: log.status === 'SUCCESS' ? '#4caf50' : '#f44336',
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                    {new Date(log.created_at).toLocaleString()}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
            {transferLogs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center', color: '#b8c5d6', py: 4 }}>
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
