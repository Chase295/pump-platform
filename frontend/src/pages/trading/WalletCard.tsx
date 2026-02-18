import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  IconButton,
  LinearProgress,
  Switch,
  Typography,
  Grid,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTradingContext } from './TradingContext';
import { CARD_SX, STATUS_COLORS, fmtEur, fmtSol } from './tradingUtils';
import type { Wallet } from '../../types/buy';

interface WalletCardProps {
  wallet: Wallet;
  solEur: number;
  onToggleTrading: (alias: string, current: boolean) => void;
  onToggleTransfer: (alias: string, current: boolean) => void;
  onEdit: (wallet: Wallet) => void;
  onDelete: (alias: string) => void;
  onAddBalance: (alias: string) => void;
}

export default function WalletCard({
  wallet,
  solEur,
  onToggleTrading,
  onToggleTransfer,
  onEdit,
  onDelete,
  onAddBalance: _onAddBalance,
}: WalletCardProps) {
  const ctx = useTradingContext();
  const navigate = useNavigate();

  const balance = wallet.type === 'TEST' ? wallet.virtual_sol_balance : wallet.real_sol_balance;
  const balanceEur = balance * solEur;
  const lossRatio =
    wallet.max_consecutive_losses > 0
      ? (wallet.consecutive_losses / wallet.max_consecutive_losses) * 100
      : 0;
  const dailyUsed =
    wallet.start_balance_day > 0
      ? Math.abs(((wallet.start_balance_day - balance) / wallet.start_balance_day) * 100)
      : 0;

  return (
    <Card
      sx={{
        ...CARD_SX,
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 4px 20px rgba(${ctx.accentColor}, 0.15)`,
        },
      }}
    >
      <CardActionArea onClick={() => navigate(`${ctx.basePath}/wallets/${wallet.alias}`)}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <WalletIcon sx={{ color: `rgb(${ctx.accentColor})`, fontSize: 20, flexShrink: 0 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {wallet.alias}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: '#8892a4', fontFamily: 'monospace', fontSize: '0.65rem' }}
                >
                  {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                </Typography>
              </Box>
            </Box>
            <Chip
              label={wallet.status}
              size="small"
              sx={{
                bgcolor: STATUS_COLORS[wallet.status]?.bg ?? 'rgba(255,255,255,0.1)',
                color: STATUS_COLORS[wallet.status]?.color ?? '#fff',
                fontSize: '0.65rem',
                height: 22,
                flexShrink: 0,
              }}
            />
          </Box>

          <Box sx={{ mb: 1.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.2 }}>
              {fmtEur(balanceEur)}
            </Typography>
            <Typography variant="caption" sx={{ color: '#8892a4', fontFamily: 'monospace' }}>
              {fmtSol(balance)}
            </Typography>
          </Box>

          <Grid container spacing={1}>
            <Grid size={12}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
                <Typography variant="caption" sx={{ color: '#b8c5d6', fontSize: '0.65rem' }}>
                  Losses {wallet.consecutive_losses}/{wallet.max_consecutive_losses}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                    color: lossRatio >= 100 ? '#f44336' : lossRatio >= 66 ? '#ff9800' : '#4caf50',
                  }}
                >
                  {Math.min(lossRatio, 100).toFixed(0)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(lossRatio, 100)}
                sx={{
                  height: 4,
                  borderRadius: 2,
                  bgcolor: 'rgba(255,255,255,0.08)',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: lossRatio >= 100 ? '#f44336' : lossRatio >= 66 ? '#ff9800' : '#4caf50',
                  },
                }}
              />
            </Grid>
            <Grid size={6}>
              <Typography variant="caption" sx={{ color: '#b8c5d6', fontSize: '0.65rem' }}>
                Pain Mode
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem' }}>
                {wallet.virtual_loss_percent}%
              </Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="caption" sx={{ color: '#b8c5d6', fontSize: '0.65rem' }}>
                Daily Limit
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem' }}>
                {dailyUsed.toFixed(1)}% / {wallet.max_daily_loss_pct}%
              </Typography>
            </Grid>
          </Grid>

          {wallet.tag && (
            <Box sx={{ mt: 1.5 }}>
              <Chip
                label={wallet.tag}
                size="small"
                sx={{
                  bgcolor: `rgba(${ctx.accentColor}, 0.12)`,
                  color: `rgb(${ctx.accentColor})`,
                  fontSize: '0.65rem',
                  height: 20,
                }}
              />
            </Box>
          )}
        </CardContent>
      </CardActionArea>

      <Box
        sx={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          px: 2,
          py: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: '#b8c5d6', fontSize: '0.65rem', mr: 0.5 }}>
              Trade
            </Typography>
            <Switch
              checked={wallet.trading_enabled}
              onChange={(e) => {
                e.stopPropagation();
                onToggleTrading(wallet.alias, wallet.trading_enabled);
              }}
              onClick={(e) => e.stopPropagation()}
              color="primary"
              size="small"
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: '#b8c5d6', fontSize: '0.65rem', mr: 0.5 }}>
              Transfer
            </Typography>
            <Switch
              checked={wallet.transfer_enabled}
              onChange={(e) => {
                e.stopPropagation();
                onToggleTransfer(wallet.alias, wallet.transfer_enabled);
              }}
              onClick={(e) => e.stopPropagation()}
              color="primary"
              size="small"
            />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(wallet);
            }}
            title="Edit wallet"
          >
            <EditIcon sx={{ fontSize: 16 }} />
          </IconButton>
          {wallet.type === 'TEST' && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(wallet.alias);
              }}
              title="Delete wallet"
              sx={{ color: '#f44336' }}
            >
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Box>
      </Box>
    </Card>
  );
}
