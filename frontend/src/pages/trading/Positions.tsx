import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
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
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import type { Wallet, Position, PositionStatus } from '../../types/buy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const truncate = (addr: string, chars = 6) =>
  addr ? `${addr.slice(0, chars)}...${addr.slice(-chars)}` : '';

const statusBadge = (status: string) => {
  const map: Record<string, { bg: string; fg: string }> = {
    OPEN: { bg: 'rgba(255, 152, 0, 0.2)', fg: '#ff9800' },
    CLOSED: { bg: 'rgba(158, 158, 158, 0.2)', fg: '#9e9e9e' },
  };
  const s = map[status] ?? map.CLOSED;
  return <Chip label={status} size="small" sx={{ bgcolor: s.bg, color: s.fg }} />;
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function Positions() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const ctx = useTradingContext();

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [filterWallet, setFilterWallet] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | PositionStatus>('');

  const fetchData = async () => {
    try {
      const [walletsRes, positionsRes] = await Promise.all([
        buyApi.getWallets(ctx.walletType),
        buyApi.getPositions(filterWallet || undefined, filterStatus || undefined),
      ]);
      setWallets(walletsRes.data);
      setPositions(positionsRes.data);
    } catch {
      console.error('Failed to load positions');
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterWallet, filterStatus]);

  const walletLookup = new Map(wallets.map((w) => [w.id, w]));
  const walletIds = new Set(wallets.map((w) => w.id));
  const filteredPositions = positions.filter((p) => walletIds.has(p.wallet_id));

  // ---------------------------------------------------------------------------
  // Mobile card
  // ---------------------------------------------------------------------------
  const renderMobileCard = (pos: Position) => {
    const wallet = walletLookup.get(pos.wallet_id);
    return (
      <Card key={pos.id} sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', mb: 2 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {wallet?.alias || 'Unknown'}
            </Typography>
            {statusBadge(pos.status)}
          </Box>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', mb: 1.5 }}>
            {truncate(pos.mint, 8)}
          </Typography>
          <Grid container spacing={1.5}>
            <Grid size={4}>
              <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
                Tokens
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {pos.tokens_held.toFixed(2)}
              </Typography>
            </Grid>
            <Grid size={4}>
              <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
                Entry Price
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {pos.entry_price.toFixed(9)}
              </Typography>
            </Grid>
            <Grid size={4}>
              <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
                Cost
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {pos.initial_sol_spent.toFixed(4)}
              </Typography>
            </Grid>
          </Grid>
          <Typography variant="caption" sx={{ color: '#b8c5d6', mt: 1, display: 'block' }}>
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
        <Typography variant="h5">{ctx.label} - Positions</Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchData}>
          Refresh
        </Button>
      </Box>

      {/* Filters */}
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

      {/* Table / Cards */}
      {isMobile ? (
        filteredPositions.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
            <Typography sx={{ color: '#b8c5d6' }}>No positions found</Typography>
          </Box>
        ) : (
          filteredPositions.map(renderMobileCard)
        )
      ) : (
        <TableContainer
          component={Paper}
          sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)' }}
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Wallet</TableCell>
                <TableCell>Mint</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Tokens Held</TableCell>
                <TableCell align="right">Entry Price</TableCell>
                <TableCell align="right">SOL Spent</TableCell>
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
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {truncate(pos.mint, 8)}
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
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {pos.initial_sol_spent.toFixed(4)} SOL
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
                  <TableCell colSpan={7} sx={{ textAlign: 'center', color: '#b8c5d6', py: 4 }}>
                    No positions found
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
          Showing {filteredPositions.length} position{filteredPositions.length !== 1 ? 's' : ''}
          {filterWallet && ` for wallet "${filterWallet}"`}
          {filterStatus && ` with status ${filterStatus}`}
        </Typography>
      </Box>
    </Box>
  );
}
