import { useState } from 'react';
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Grid,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  AccountBalanceWallet as WalletIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import { useExchangeRate, fmtEur, fmtSol, parseApiError, CARD_SX } from './tradingUtils';
import type { Wallet, WalletStatus } from '../../types/buy';
import WalletCard from './WalletCard';

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------
function StatCard({
  title,
  mainValue,
  subValue,
  icon,
  color,
}: {
  title: string;
  mainValue: string;
  subValue: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card
      sx={{
        bgcolor: `rgba(${color}, 0.06)`,
        border: `1px solid rgba(${color}, 0.25)`,
        backdropFilter: 'blur(10px)',
        height: '100%',
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Typography
            variant="caption"
            sx={{ color: '#b8c5d6', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: 1 }}
          >
            {title}
          </Typography>
          {icon}
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.2 }}>
          {mainValue}
        </Typography>
        <Typography variant="caption" sx={{ color: '#8892a4', fontFamily: 'monospace' }}>
          {subValue}
        </Typography>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function Wallets() {
  const ctx = useTradingContext();

  // Data fetching via react-query
  const { data: wallets = [], refetch: refetchWallets } = useQuery<Wallet[]>({
    queryKey: ['buy', 'wallets', ctx.walletType],
    queryFn: async () => (await buyApi.getWallets(ctx.walletType)).data,
    refetchInterval: 10_000,
  });

  const { data: exchangeRate } = useExchangeRate();

  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newWallet, setNewWallet] = useState({
    alias: '',
    address: '',
    type: ctx.walletType as 'TEST' | 'REAL',
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
  // Helpers
  // ---------------------------------------------------------------------------
  const solEur = exchangeRate?.sol_price_eur ?? 0;
  const solToEur = (sol: number) => sol * solEur;

  // Computed values for stat cards
  const totalBalance = wallets.reduce(
    (s, w) => s + (w.type === 'TEST' ? w.virtual_sol_balance : w.real_sol_balance),
    0,
  );
  const activeCount = wallets.filter((w) => w.status === 'ACTIVE').length;
  const avgBalance = wallets.length > 0 ? totalBalance / wallets.length : 0;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleCreateWallet = async () => {
    try {
      const payload = { ...newWallet, address: newWallet.address || undefined };
      await buyApi.createWallet(payload);
      setDialogOpen(false);
      setNewWallet({
        alias: '',
        address: '',
        type: ctx.walletType,
        tag: '',
        virtual_sol_balance: 10,
        virtual_loss_percent: 1,
        max_consecutive_losses: 3,
        max_daily_loss_pct: 15,
      });
      refetchWallets();
      setAlert({ type: 'success', message: 'Wallet created successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: parseApiError(error, 'Failed to create wallet') });
    }
  };

  const handleToggleTrading = async (alias: string, current: boolean) => {
    try {
      await buyApi.toggleTrading(alias, !current);
      refetchWallets();
    } catch {
      setAlert({ type: 'error', message: 'Failed to toggle trading' });
    }
  };

  const handleToggleTransfer = async (alias: string, current: boolean) => {
    try {
      await buyApi.toggleTransfer(alias, !current);
      refetchWallets();
    } catch {
      setAlert({ type: 'error', message: 'Failed to toggle transfer' });
    }
  };

  const handleAddBalance = async () => {
    if (!addBalanceDialog) return;
    try {
      await buyApi.addBalance(addBalanceDialog, parseFloat(addAmount));
      setAddBalanceDialog(null);
      refetchWallets();
      setAlert({ type: 'success', message: 'Balance added successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: parseApiError(error, 'Failed to add balance') });
    }
  };

  const handleDeleteWallet = async () => {
    if (!deleteDialog) return;
    try {
      await buyApi.deleteWallet(deleteDialog);
      setDeleteDialog(null);
      refetchWallets();
      setAlert({ type: 'success', message: `Wallet '${deleteDialog}' deleted successfully!` });
    } catch (error: any) {
      setAlert({ type: 'error', message: parseApiError(error, 'Failed to delete wallet') });
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
      refetchWallets();
      setAlert({ type: 'success', message: 'Wallet updated successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: parseApiError(error, 'Failed to update wallet') });
    }
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
        <Typography variant="h5">{ctx.label} - Wallets</Typography>
        <Box sx={{ display: 'flex', gap: 2, width: { xs: '100%', sm: 'auto' } }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => refetchWallets()}
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

      {/* Stat Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Total Balance"
            mainValue={fmtEur(solToEur(totalBalance))}
            subValue={fmtSol(totalBalance)}
            icon={<WalletIcon sx={{ color: `rgb(${ctx.accentColor})`, fontSize: 20 }} />}
            color="0, 212, 255"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <StatCard
            title="Active Wallets"
            mainValue={`${activeCount}/${wallets.length}`}
            subValue="Wallets"
            icon={<TrendingUpIcon sx={{ color: '#4caf50', fontSize: 20 }} />}
            color="76, 175, 80"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <StatCard
            title="Avg Balance"
            mainValue={fmtEur(solToEur(avgBalance))}
            subValue={fmtSol(avgBalance)}
            icon={<WalletIcon sx={{ color: '#ff9800', fontSize: 20 }} />}
            color="255, 152, 0"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        {wallets.map((wallet) => (
          <Grid key={wallet.id} size={{ xs: 12, sm: 6, lg: 4 }}>
            <WalletCard
              wallet={wallet}
              solEur={solEur}
              onToggleTrading={handleToggleTrading}
              onToggleTransfer={handleToggleTransfer}
              onEdit={handleOpenEdit}
              onDelete={(alias) => setDeleteDialog(alias)}
              onAddBalance={(alias) => setAddBalanceDialog(alias)}
            />
          </Grid>
        ))}
        {wallets.length === 0 && (
          <Grid size={12}>
            <Box sx={{ p: 4, textAlign: 'center', ...CARD_SX, borderRadius: 1 }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.4)' }}>No wallets found</Typography>
            </Box>
          </Grid>
        )}
      </Grid>

      {/* ------------------------------------------------------------------- */}
      {/* Create Wallet Dialog                                                 */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
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
            {ctx.walletType === 'REAL' ? (
              <TextField
                label="Address"
                value={newWallet.address}
                onChange={(e) => setNewWallet({ ...newWallet, address: e.target.value })}
                fullWidth
                helperText="Solana public key (required for REAL wallets)"
              />
            ) : (
              <TextField
                label="Address (optional)"
                value={newWallet.address}
                onChange={(e) => setNewWallet({ ...newWallet, address: e.target.value })}
                fullWidth
                helperText="Leave empty to auto-generate a test address"
              />
            )}
            <TextField
              label="Tag"
              value={newWallet.tag}
              onChange={(e) => setNewWallet({ ...newWallet, tag: e.target.value })}
              fullWidth
              helperText="Optional strategy tag"
            />
            {ctx.walletType === 'TEST' && (
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
      <Dialog open={!!addBalanceDialog} onClose={() => setAddBalanceDialog(null)}>
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
