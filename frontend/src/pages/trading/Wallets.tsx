import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Card,
  CardContent,
  Chip,
  Switch,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  IconButton,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { buyApi } from '../../services/api';
import type { Wallet, WalletStatus } from '../../types/buy';

// ---------------------------------------------------------------------------
// Status badge colours
// ---------------------------------------------------------------------------
const statusColor: Record<string, { bg: string; fg: string }> = {
  ACTIVE: { bg: 'rgba(76, 175, 80, 0.2)', fg: '#4caf50' },
  PAUSED: { bg: 'rgba(255, 152, 0, 0.2)', fg: '#ff9800' },
  DRAINED: { bg: 'rgba(244, 67, 54, 0.2)', fg: '#f44336' },
  FROZEN: { bg: 'rgba(33, 150, 243, 0.2)', fg: '#2196f3' },
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function Wallets() {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newWallet, setNewWallet] = useState({
    alias: '',
    address: '',
    type: 'TEST' as 'TEST' | 'REAL',
    tag: '',
    virtual_sol_balance: 10,
    virtual_loss_percent: 1,
    max_consecutive_losses: 3,
    max_daily_loss_pct: 15,
  });

  // Edit dialog state
  const [editDialog, setEditDialog] = useState<string | null>(null);
  const [editWallet, setEditWallet] = useState({
    tag: '',
    status: 'ACTIVE' as WalletStatus,
    virtual_loss_percent: 1,
    max_consecutive_losses: 3,
    max_daily_loss_pct: 15,
  });

  // Add balance dialog state
  const [addBalanceDialog, setAddBalanceDialog] = useState<string | null>(null);
  const [addAmount, setAddAmount] = useState('1');

  // Delete dialog state
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  const fetchWallets = async () => {
    try {
      const res = await buyApi.getWallets();
      setWallets(res.data);
    } catch {
      console.error('Failed to fetch wallets');
    }
  };

  useEffect(() => {
    fetchWallets();
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleCreateWallet = async () => {
    try {
      await buyApi.createWallet(newWallet);
      setDialogOpen(false);
      setNewWallet({
        alias: '',
        address: '',
        type: 'TEST',
        tag: '',
        virtual_sol_balance: 10,
        virtual_loss_percent: 1,
        max_consecutive_losses: 3,
        max_daily_loss_pct: 15,
      });
      fetchWallets();
      setAlert({ type: 'success', message: 'Wallet created successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: error.response?.data?.detail || 'Failed to create wallet' });
    }
  };

  const handleToggleTrading = async (alias: string, current: boolean) => {
    try {
      await buyApi.toggleTrading(alias, !current);
      fetchWallets();
    } catch {
      setAlert({ type: 'error', message: 'Failed to toggle trading' });
    }
  };

  const handleToggleTransfer = async (alias: string, current: boolean) => {
    try {
      await buyApi.toggleTransfer(alias, !current);
      fetchWallets();
    } catch {
      setAlert({ type: 'error', message: 'Failed to toggle transfer' });
    }
  };

  const handleAddBalance = async () => {
    if (!addBalanceDialog) return;
    try {
      await buyApi.addBalance(addBalanceDialog, parseFloat(addAmount));
      setAddBalanceDialog(null);
      fetchWallets();
      setAlert({ type: 'success', message: 'Balance added successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: error.response?.data?.detail || 'Failed to add balance' });
    }
  };

  const handleDeleteWallet = async () => {
    if (!deleteDialog) return;
    try {
      await buyApi.deleteWallet(deleteDialog);
      setDeleteDialog(null);
      fetchWallets();
      setAlert({ type: 'success', message: `Wallet '${deleteDialog}' deleted successfully!` });
    } catch (error: any) {
      setAlert({ type: 'error', message: error.response?.data?.detail || 'Failed to delete wallet' });
    }
  };

  const handleOpenEdit = (wallet: Wallet) => {
    setEditWallet({
      tag: wallet.tag || '',
      status: wallet.status,
      virtual_loss_percent: wallet.virtual_loss_percent,
      max_consecutive_losses: wallet.max_consecutive_losses,
      max_daily_loss_pct: wallet.max_daily_loss_pct,
    });
    setEditDialog(wallet.alias);
  };

  const handleSaveEdit = async () => {
    if (!editDialog) return;
    try {
      await buyApi.updateWallet(editDialog, editWallet);
      setEditDialog(null);
      fetchWallets();
      setAlert({ type: 'success', message: 'Wallet updated successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: error.response?.data?.detail || 'Failed to update wallet' });
    }
  };

  // ---------------------------------------------------------------------------
  // Mobile card renderer
  // ---------------------------------------------------------------------------
  const renderMobileCard = (wallet: Wallet) => (
    <Card key={wallet.id} sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', mb: 2 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {wallet.alias}
            </Typography>
            <Typography variant="caption" sx={{ color: '#b8c5d6', fontFamily: 'monospace' }}>
              {wallet.address.slice(0, 8)}...
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Chip
              label={wallet.type}
              size="small"
              sx={{
                bgcolor: wallet.type === 'TEST' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(76, 175, 80, 0.2)',
                color: wallet.type === 'TEST' ? '#00d4ff' : '#4caf50',
              }}
            />
            <Chip
              label={wallet.status}
              size="small"
              sx={{
                bgcolor: statusColor[wallet.status]?.bg ?? 'rgba(255,255,255,0.1)',
                color: statusColor[wallet.status]?.fg ?? '#fff',
              }}
            />
          </Box>
        </Box>

        {/* Body */}
        <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
          <Grid size={6}>
            <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
              Balance
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {(wallet.type === 'TEST' ? wallet.virtual_sol_balance : wallet.real_sol_balance).toFixed(4)} SOL
            </Typography>
          </Grid>
          <Grid size={6}>
            <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
              Losses
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color:
                  wallet.consecutive_losses >= wallet.max_consecutive_losses ? '#f44336' : '#ffffff',
              }}
            >
              {wallet.consecutive_losses} / {wallet.max_consecutive_losses}
            </Typography>
          </Grid>
          <Grid size={12}>
            <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
              Pain Mode
            </Typography>
            <Typography variant="body2">
              {wallet.virtual_loss_percent}%
            </Typography>
          </Grid>
        </Grid>

        {/* Switches + Actions */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="caption" sx={{ color: '#b8c5d6', mr: 0.5 }}>
                Trade
              </Typography>
              <Switch
                checked={wallet.trading_enabled}
                onChange={() => handleToggleTrading(wallet.alias, wallet.trading_enabled)}
                color="primary"
                size="small"
              />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="caption" sx={{ color: '#b8c5d6', mr: 0.5 }}>
                Transfer
              </Typography>
              <Switch
                checked={wallet.transfer_enabled}
                onChange={() => handleToggleTransfer(wallet.alias, wallet.transfer_enabled)}
                color="primary"
                size="small"
              />
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton size="small" onClick={() => handleOpenEdit(wallet)} title="Edit wallet">
              <EditIcon fontSize="small" />
            </IconButton>
            {wallet.type === 'TEST' && (
              <>
                <Button size="small" variant="outlined" onClick={() => setAddBalanceDialog(wallet.alias)}>
                  + SOL
                </Button>
                <IconButton
                  size="small"
                  onClick={() => setDeleteDialog(wallet.alias)}
                  title="Delete wallet"
                  sx={{ color: '#f44336' }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </>
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
        <Typography variant="h5">Wallets</Typography>
        <Box sx={{ display: 'flex', gap: 2, width: { xs: '100%', sm: 'auto' } }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchWallets}
            sx={{ flex: { xs: 1, sm: 'none' } }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
            sx={{ flex: { xs: 1, sm: 'none' } }}
          >
            Add Wallet
          </Button>
        </Box>
      </Box>

      {alert && (
        <Alert severity={alert.type} sx={{ mb: 2 }} onClose={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      {/* Desktop table / mobile cards */}
      {isSmall ? (
        wallets.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
            <Typography sx={{ color: '#b8c5d6' }}>No wallets found</Typography>
          </Box>
        ) : (
          wallets.map(renderMobileCard)
        )
      ) : (
        <TableContainer
          component={Paper}
          sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)' }}
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Alias</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell align="center">Trading</TableCell>
                <TableCell align="center">Transfer</TableCell>
                <TableCell align="center">Losses</TableCell>
                <TableCell align="center">Pain %</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {wallets.map((wallet) => {
                const lossRatio =
                  wallet.max_consecutive_losses > 0
                    ? (wallet.consecutive_losses / wallet.max_consecutive_losses) * 100
                    : 0;
                return (
                  <TableRow key={wallet.id}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {wallet.alias}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#b8c5d6', fontFamily: 'monospace' }}>
                        {wallet.address.slice(0, 8)}...
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={wallet.type}
                        size="small"
                        sx={{
                          bgcolor: wallet.type === 'TEST' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(76, 175, 80, 0.2)',
                          color: wallet.type === 'TEST' ? '#00d4ff' : '#4caf50',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={wallet.status}
                        size="small"
                        sx={{
                          bgcolor: statusColor[wallet.status]?.bg ?? 'rgba(255,255,255,0.1)',
                          color: statusColor[wallet.status]?.fg ?? '#fff',
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {(wallet.type === 'TEST' ? wallet.virtual_sol_balance : wallet.real_sol_balance).toFixed(
                          4,
                        )}{' '}
                        SOL
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={wallet.trading_enabled}
                        onChange={() => handleToggleTrading(wallet.alias, wallet.trading_enabled)}
                        color="primary"
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={wallet.transfer_enabled}
                        onChange={() => handleToggleTransfer(wallet.alias, wallet.transfer_enabled)}
                        color="primary"
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            color:
                              wallet.consecutive_losses >= wallet.max_consecutive_losses
                                ? '#f44336'
                                : '#ffffff',
                          }}
                        >
                          {wallet.consecutive_losses} / {wallet.max_consecutive_losses}
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(lossRatio, 100)}
                          sx={{
                            width: 60,
                            height: 4,
                            borderRadius: 2,
                            bgcolor: 'rgba(255,255,255,0.1)',
                            '& .MuiLinearProgress-bar': {
                              bgcolor: lossRatio >= 100 ? '#f44336' : lossRatio >= 66 ? '#ff9800' : '#4caf50',
                            },
                          }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {wallet.virtual_loss_percent}%
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                        <IconButton size="small" onClick={() => handleOpenEdit(wallet)} title="Edit wallet">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        {wallet.type === 'TEST' && (
                          <>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => setAddBalanceDialog(wallet.alias)}
                            >
                              + SOL
                            </Button>
                            <IconButton
                              size="small"
                              onClick={() => setDeleteDialog(wallet.alias)}
                              title="Delete wallet"
                              sx={{ color: '#f44336' }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
              {wallets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} sx={{ textAlign: 'center', color: '#b8c5d6', py: 4 }}>
                    No wallets found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Create Wallet Dialog                                                 */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isSmall}>
        <DialogTitle>Create New Wallet</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Alias"
              value={newWallet.alias}
              onChange={(e) => setNewWallet({ ...newWallet, alias: e.target.value })}
              fullWidth
              helperText="Unique identifier (e.g., worker_bot_01)"
            />
            <TextField
              label="Address"
              value={newWallet.address}
              onChange={(e) => setNewWallet({ ...newWallet, address: e.target.value })}
              fullWidth
              helperText="Solana public key"
            />
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={newWallet.type}
                label="Type"
                onChange={(e) => setNewWallet({ ...newWallet, type: e.target.value as 'TEST' | 'REAL' })}
              >
                <MenuItem value="TEST">TEST (Simulation)</MenuItem>
                <MenuItem value="REAL">REAL (Blockchain)</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Tag"
              value={newWallet.tag}
              onChange={(e) => setNewWallet({ ...newWallet, tag: e.target.value })}
              fullWidth
              helperText="Optional strategy tag"
            />
            {newWallet.type === 'TEST' && (
              <>
                <TextField
                  label="Initial Balance (SOL)"
                  type="number"
                  value={newWallet.virtual_sol_balance}
                  onChange={(e) =>
                    setNewWallet({ ...newWallet, virtual_sol_balance: parseFloat(e.target.value) })
                  }
                  fullWidth
                />
                <TextField
                  label="Pain Mode Loss %"
                  type="number"
                  value={newWallet.virtual_loss_percent}
                  onChange={(e) =>
                    setNewWallet({ ...newWallet, virtual_loss_percent: parseFloat(e.target.value) })
                  }
                  fullWidth
                  helperText="Additional loss % applied to simulations"
                />
              </>
            )}
            <TextField
              label="Max Consecutive Losses"
              type="number"
              value={newWallet.max_consecutive_losses}
              onChange={(e) =>
                setNewWallet({ ...newWallet, max_consecutive_losses: parseInt(e.target.value) || 3 })
              }
              fullWidth
              helperText="Stop trading after this many consecutive losses (default: 3)"
            />
            <TextField
              label="Max Daily Loss %"
              type="number"
              value={newWallet.max_daily_loss_pct}
              onChange={(e) =>
                setNewWallet({ ...newWallet, max_daily_loss_pct: parseFloat(e.target.value) || 15 })
              }
              fullWidth
              helperText="Stop trading after this % daily loss (default: 15%)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateWallet} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* ------------------------------------------------------------------- */}
      {/* Edit Wallet Dialog                                                   */}
      {/* ------------------------------------------------------------------- */}
      <Dialog
        open={!!editDialog}
        onClose={() => setEditDialog(null)}
        maxWidth="sm"
        fullWidth
        fullScreen={isSmall}
      >
        <DialogTitle>Edit Wallet: {editDialog}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Tag"
              value={editWallet.tag}
              onChange={(e) => setEditWallet({ ...editWallet, tag: e.target.value })}
              fullWidth
              helperText="Strategy tag"
            />
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={editWallet.status}
                label="Status"
                onChange={(e) => setEditWallet({ ...editWallet, status: e.target.value as WalletStatus })}
              >
                <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                <MenuItem value="PAUSED">PAUSED</MenuItem>
                <MenuItem value="DRAINED">DRAINED</MenuItem>
                <MenuItem value="FROZEN">FROZEN</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Pain Mode Loss %"
              type="number"
              value={editWallet.virtual_loss_percent}
              onChange={(e) =>
                setEditWallet({ ...editWallet, virtual_loss_percent: parseFloat(e.target.value) || 1 })
              }
              fullWidth
              helperText="Additional loss % applied to simulations"
            />
            <TextField
              label="Max Consecutive Losses"
              type="number"
              value={editWallet.max_consecutive_losses}
              onChange={(e) =>
                setEditWallet({ ...editWallet, max_consecutive_losses: parseInt(e.target.value) || 3 })
              }
              fullWidth
              helperText="Stop trading after this many consecutive losses"
            />
            <TextField
              label="Max Daily Loss %"
              type="number"
              value={editWallet.max_daily_loss_pct}
              onChange={(e) =>
                setEditWallet({ ...editWallet, max_daily_loss_pct: parseFloat(e.target.value) || 15 })
              }
              fullWidth
              helperText="Stop trading after this % daily loss"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(null)}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* ------------------------------------------------------------------- */}
      {/* Add Balance Dialog                                                   */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={!!addBalanceDialog} onClose={() => setAddBalanceDialog(null)} fullScreen={isSmall}>
        <DialogTitle>Add Virtual Balance</DialogTitle>
        <DialogContent>
          <TextField
            label="Amount (SOL)"
            type="number"
            value={addAmount}
            onChange={(e) => setAddAmount(e.target.value)}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddBalanceDialog(null)}>Cancel</Button>
          <Button onClick={handleAddBalance} variant="contained">
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* ------------------------------------------------------------------- */}
      {/* Delete Wallet Dialog                                                 */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)}>
        <DialogTitle>Delete Wallet</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Permanently delete wallet <strong>'{deleteDialog}'</strong> and all associated trades, positions, and
            transfers?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>Cancel</Button>
          <Button onClick={handleDeleteWallet} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
