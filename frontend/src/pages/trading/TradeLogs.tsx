import { useEffect, useState } from 'react';
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
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { buyApi } from '../../services/api';
import type { Wallet, TradeLog, TransferLog } from '../../types/buy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const truncate = (addr: string, chars = 6) =>
  addr ? `${addr.slice(0, chars)}...${addr.slice(-chars)}` : '';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function TradeLogs() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [transferLogs, setTransferLogs] = useState<TransferLog[]>([]);
  const [filterWallet, setFilterWallet] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const fetchData = async () => {
    try {
      const [walletsRes, tradeRes, transferRes] = await Promise.all([
        buyApi.getWallets(),
        buyApi.getTradeLogs(filterWallet || undefined, filterAction || undefined),
        buyApi.getTransferLogs(filterWallet || undefined),
      ]);
      setWallets(walletsRes.data);
      setTradeLogs(tradeRes.data);
      setTransferLogs(transferRes.data);
    } catch {
      console.error('Failed to load logs');
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterWallet, filterAction]);

  // ---------------------------------------------------------------------------
  // Mobile card for trade log
  // ---------------------------------------------------------------------------
  const renderTradeCard = (log: TradeLog) => (
    <Card key={log.id} sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', mb: 2 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Chip
              label={log.action}
              size="small"
              sx={{
                bgcolor: log.action === 'BUY' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                color: log.action === 'BUY' ? '#4caf50' : '#f44336',
              }}
            />
            <Chip
              label={log.status}
              size="small"
              sx={{
                bgcolor: log.status === 'SUCCESS' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                color: log.status === 'SUCCESS' ? '#4caf50' : '#f44336',
              }}
            />
            {log.is_simulation && (
              <Chip label="SIM" size="small" sx={{ bgcolor: 'rgba(0, 212, 255, 0.2)', color: '#00d4ff' }} />
            )}
          </Box>
          <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
            {new Date(log.created_at).toLocaleString()}
          </Typography>
        </Box>
        <Grid container spacing={1.5}>
          <Grid size={6}>
            <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
              SOL
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {parseFloat(String(log.amount_sol)).toFixed(6)}
            </Typography>
          </Grid>
          <Grid size={6}>
            <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
              Tokens
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {parseFloat(String(log.amount_tokens)).toFixed(2)}
            </Typography>
          </Grid>
          <Grid size={6}>
            <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
              Mint
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
              {log.mint ? truncate(log.mint, 6) : '-'}
            </Typography>
          </Grid>
          <Grid size={6}>
            <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
              Signature
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
              {log.tx_signature ? truncate(log.tx_signature, 6) : '-'}
            </Typography>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Typography variant="h5">Trade Logs</Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchData}>
          Refresh
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl sx={{ minWidth: { xs: '100%', sm: 200 } }}>
          <InputLabel>Filter by Wallet</InputLabel>
          <Select
            value={filterWallet}
            label="Filter by Wallet"
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
          <InputLabel>Action</InputLabel>
          <Select
            value={filterAction}
            label="Action"
            onChange={(e) => setFilterAction(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="BUY">BUY</MenuItem>
            <MenuItem value="SELL">SELL</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Trade Logs */}
      {isMobile ? (
        tradeLogs.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
            <Typography sx={{ color: '#b8c5d6' }}>No trade logs found</Typography>
          </Box>
        ) : (
          tradeLogs.map(renderTradeCard)
        )
      ) : (
        <TableContainer
          component={Paper}
          sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)' }}
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Mint</TableCell>
                <TableCell align="right">SOL</TableCell>
                <TableCell align="right">Tokens</TableCell>
                <TableCell>Signature</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Sim</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tradeLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={log.action}
                      size="small"
                      sx={{
                        bgcolor:
                          log.action === 'BUY' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                        color: log.action === 'BUY' ? '#4caf50' : '#f44336',
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {log.mint ? truncate(log.mint, 6) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {parseFloat(String(log.amount_sol)).toFixed(6)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {parseFloat(String(log.amount_tokens)).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {log.tx_signature ? truncate(log.tx_signature, 8) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={log.status}
                      size="small"
                      sx={{
                        bgcolor:
                          log.status === 'SUCCESS' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                        color: log.status === 'SUCCESS' ? '#4caf50' : '#f44336',
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {log.is_simulation ? (
                      <Chip
                        label="SIM"
                        size="small"
                        sx={{ bgcolor: 'rgba(0, 212, 255, 0.2)', color: '#00d4ff' }}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {tradeLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: 'center', color: '#b8c5d6', py: 4 }}>
                    No trade logs found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Summary */}
      <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(255, 255, 255, 0.05)', borderRadius: 1 }}>
        <Typography variant="body2" sx={{ color: '#b8c5d6' }}>
          Showing {tradeLogs.length} trade log{tradeLogs.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* Transfer History */}
      <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
        Transfer History
      </Typography>
      <TableContainer
        component={Paper}
        sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', overflowX: 'auto' }}
      >
        <Table sx={{ minWidth: 600 }}>
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
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
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
                  No transfer logs found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
