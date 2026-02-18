import { useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Chip,
  Switch,
  IconButton,
  Button,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TablePagination,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ShoppingCart as BuyIcon,
  Sell as SellIcon,
  PlayArrow as ExecIcon,
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import { CARD_SX, truncateMint } from './tradingUtils';
import type {
  TradingWorkflow,
  WorkflowExecution,
  BuyChain,
  SellChain,
  WorkflowExecutionResult,
} from '../../types/buy';
import WorkflowDialog from './WorkflowDialog';

// ---------------------------------------------------------------------------
// Chain summary helpers
// ---------------------------------------------------------------------------
function summarizeBuyChain(chain: BuyChain, mode?: string, value?: number): string {
  const parts: string[] = [];
  parts.push(
    `Model #${chain.trigger.model_id} \u2265 ${(chain.trigger.min_probability * 100).toFixed(0)}%`,
  );
  for (const c of chain.conditions) {
    const op =
      c.operator === 'gte'
        ? '\u2265'
        : c.operator === 'lte'
          ? '\u2264'
          : c.operator === 'gt'
            ? '>'
            : '<';
    parts.push(`Model #${c.model_id} ${op} ${(c.threshold * 100).toFixed(0)}%`);
  }
  const amount = mode === 'percent' ? `${value}%` : `${value} SOL`;
  parts.push(`Buy ${amount}`);
  return parts.join(' \u2192 ');
}

function summarizeSellChain(chain: SellChain): string {
  return chain.rules
    .map((r) => {
      if (r.type === 'stop_loss') return `SL ${r.percent}%`;
      if (r.type === 'trailing_stop') return `TS ${r.percent}%`;
      if (r.type === 'take_profit') return `TP +${r.percent}%`;
      if (r.type === 'timeout') return `${r.minutes}min`;
      return r.type;
    })
    .join(' | ');
}

// ---------------------------------------------------------------------------
// Result chip colors
// ---------------------------------------------------------------------------
const RESULT_COLORS: Record<WorkflowExecutionResult, { bg: string; color: string }> = {
  EXECUTED: { bg: 'rgba(76, 175, 80, 0.2)', color: '#4caf50' },
  REJECTED: { bg: 'rgba(255, 152, 0, 0.2)', color: '#ff9800' },
  ERROR: { bg: 'rgba(244, 67, 54, 0.2)', color: '#f44336' },
};

// ---------------------------------------------------------------------------
// Stat Card (same pattern as TradingDashboard)
// ---------------------------------------------------------------------------
interface StatCardProps {
  title: string;
  mainValue: string;
  subValue: string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ title, mainValue, subValue, icon, color }: StatCardProps) {
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
export default function Workflows() {
  const ctx = useTradingContext();
  const queryClient = useQueryClient();

  const [tabValue, setTabValue] = useState(0); // 0 = BUY, 1 = SELL
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<TradingWorkflow | null>(null);
  const [execPage, setExecPage] = useState(0);

  const accent = `rgb(${ctx.accentColor})`;
  const activeType = tabValue === 0 ? 'BUY' : 'SELL';

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------
  const { data: workflows = [], isLoading } = useQuery<TradingWorkflow[]>({
    queryKey: ['buy', 'workflows', ctx.walletType],
    queryFn: async () => {
      const res = await buyApi.getWorkflows(undefined, undefined);
      return res.data;
    },
    refetchInterval: 10_000,
  });

  const { data: recentExecs = [] } = useQuery<WorkflowExecution[]>({
    queryKey: ['buy', 'workflows', 'executions'],
    queryFn: async () => (await buyApi.getRecentExecutions(100)).data,
    refetchInterval: 10_000,
  });

  // -------------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------------
  const buyWorkflows = workflows.filter((w) => w.type === 'BUY');
  const sellWorkflows = workflows.filter((w) => w.type === 'SELL');
  const activeBuy = buyWorkflows.filter((w) => w.is_active).length;
  const activeSell = sellWorkflows.filter((w) => w.is_active).length;

  const today = new Date().toISOString().slice(0, 10);
  const todayExecs = recentExecs.filter((e) => e.created_at.startsWith(today));
  const execCount = todayExecs.length;
  const execExecuted = todayExecs.filter((e) => e.result === 'EXECUTED').length;
  const execRejected = todayExecs.filter((e) => e.result === 'REJECTED').length;
  const execError = todayExecs.filter((e) => e.result === 'ERROR').length;

  const filteredWorkflows = activeType === 'BUY' ? buyWorkflows : sellWorkflows;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleToggle = async (wf: TradingWorkflow) => {
    try {
      await buyApi.toggleWorkflow(wf.id, !wf.is_active);
      await queryClient.invalidateQueries({ queryKey: ['buy', 'workflows'] });
    } catch (err) {
      console.error('Failed to toggle workflow', err);
    }
  };

  const handleDelete = async (wf: TradingWorkflow) => {
    if (!window.confirm(`Workflow "${wf.name}" wirklich loeschen?`)) return;
    try {
      await buyApi.deleteWorkflow(wf.id);
      await queryClient.invalidateQueries({ queryKey: ['buy', 'workflows'] });
    } catch (err) {
      console.error('Failed to delete workflow', err);
    }
  };

  const handleEdit = (wf: TradingWorkflow) => {
    setEditingWorkflow(wf);
    setDialogOpen(true);
  };

  const handleNewWorkflow = () => {
    setEditingWorkflow(null);
    setDialogOpen(true);
  };

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress sx={{ color: '#00d4ff' }} />
      </Box>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <Box>
      {/* Header */}
      <Typography variant="h5" sx={{ mb: 3 }}>
        Workflows
      </Typography>

      {/* Stat Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Active Buy Workflows"
            mainValue={`${activeBuy}`}
            subValue={`${buyWorkflows.length} total`}
            icon={<BuyIcon sx={{ color: '#4caf50', fontSize: 20 }} />}
            color="76, 175, 80"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Active Sell Workflows"
            mainValue={`${activeSell}`}
            subValue={`${sellWorkflows.length} total`}
            icon={<SellIcon sx={{ color: '#f44336', fontSize: 20 }} />}
            color="244, 67, 54"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Executions Today"
            mainValue={`${execCount}`}
            subValue={`${execExecuted} Exec / ${execRejected} Rej / ${execError} Err`}
            icon={<ExecIcon sx={{ color: accent, fontSize: 20 }} />}
            color={ctx.accentColor}
          />
        </Grid>
      </Grid>

      {/* Tabs + New button */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          sx={{
            '& .MuiTab-root': {
              color: 'rgba(255, 255, 255, 0.6)',
              textTransform: 'none',
              fontWeight: 500,
              '&.Mui-selected': { color: accent },
            },
            '& .MuiTabs-indicator': { backgroundColor: accent },
          }}
        >
          <Tab label={`Buy Workflows (${buyWorkflows.length})`} />
          <Tab label={`Sell Workflows (${sellWorkflows.length})`} />
        </Tabs>

        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleNewWorkflow}
          sx={{
            color: accent,
            borderColor: `rgba(${ctx.accentColor}, 0.5)`,
            '&:hover': { borderColor: accent, bgcolor: `rgba(${ctx.accentColor}, 0.1)` },
          }}
        >
          New Workflow
        </Button>
      </Box>

      {/* Workflow Cards Grid */}
      {filteredWorkflows.length === 0 ? (
        <Card sx={{ ...CARD_SX, p: 4, textAlign: 'center', mb: 4 }}>
          <Typography variant="body2" sx={{ color: '#8892a4' }}>
            Keine {activeType === 'BUY' ? 'Buy' : 'Sell'} Workflows vorhanden
          </Typography>
        </Card>
      ) : (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {filteredWorkflows.map((wf) => (
            <Grid key={wf.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <Card
                sx={{
                  ...CARD_SX,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <CardContent sx={{ flex: 1, p: 2, '&:last-child': { pb: 2 } }}>
                  {/* Header: name + toggle */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                        {wf.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#8892a4' }}>
                        {wf.wallet_alias}
                      </Typography>
                    </Box>
                    <Switch
                      checked={wf.is_active}
                      onChange={() => handleToggle(wf)}
                      size="small"
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: accent },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: accent,
                        },
                      }}
                    />
                  </Box>

                  {/* Chain summary */}
                  <Typography
                    variant="body2"
                    sx={{
                      color: '#b8c5d6',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      mb: 1.5,
                      bgcolor: 'rgba(255,255,255,0.04)',
                      p: 1,
                      borderRadius: 1,
                      wordBreak: 'break-word',
                    }}
                  >
                    {wf.type === 'BUY'
                      ? summarizeBuyChain(
                          wf.chain as BuyChain,
                          wf.buy_amount_mode,
                          wf.buy_amount_value,
                        )
                      : summarizeSellChain(wf.chain as SellChain)}
                  </Typography>

                  {/* Settings */}
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                    <Chip
                      label={`Cooldown: ${wf.cooldown_seconds}s`}
                      size="small"
                      sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: '#b8c5d6', fontSize: '0.7rem' }}
                    />
                    <Chip
                      label={`Max Pos: ${wf.max_open_positions}`}
                      size="small"
                      sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: '#b8c5d6', fontSize: '0.7rem' }}
                    />
                  </Box>

                  {/* Created */}
                  <Typography variant="caption" sx={{ color: '#666' }}>
                    Erstellt: {format(new Date(wf.created_at), 'dd.MM.yyyy HH:mm')}
                  </Typography>

                  {/* Footer actions */}
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1, gap: 0.5 }}>
                    <IconButton size="small" onClick={() => handleEdit(wf)} sx={{ color: '#b8c5d6' }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(wf)} sx={{ color: '#f44336' }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Recent Executions Table */}
      <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
        Letzte Ausfuehrungen
      </Typography>
      <TableContainer
        component={Paper}
        sx={{ bgcolor: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)' }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#b8c5d6', borderColor: 'rgba(255,255,255,0.08)' }}>
                Zeit
              </TableCell>
              <TableCell sx={{ color: '#b8c5d6', borderColor: 'rgba(255,255,255,0.08)' }}>
                Workflow
              </TableCell>
              <TableCell sx={{ color: '#b8c5d6', borderColor: 'rgba(255,255,255,0.08)' }}>
                Mint
              </TableCell>
              <TableCell sx={{ color: '#b8c5d6', borderColor: 'rgba(255,255,255,0.08)' }}>
                Result
              </TableCell>
              <TableCell sx={{ color: '#b8c5d6', borderColor: 'rgba(255,255,255,0.08)' }}>
                Error
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recentExecs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} sx={{ borderColor: 'rgba(255,255,255,0.05)', textAlign: 'center' }}>
                  <Typography variant="body2" sx={{ color: '#8892a4', py: 2 }}>
                    Keine Ausfuehrungen vorhanden
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              recentExecs
                .slice(execPage * 10, execPage * 10 + 10)
                .map((exec) => {
                  const rc = RESULT_COLORS[exec.result] ?? RESULT_COLORS.ERROR;
                  return (
                    <TableRow key={exec.id}>
                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {format(new Date(exec.created_at), 'dd.MM HH:mm:ss')}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Typography variant="body2">{exec.workflow_name ?? exec.workflow_id.slice(0, 8)}</Typography>
                      </TableCell>
                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {truncateMint(exec.mint)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Chip
                          label={exec.result}
                          size="small"
                          sx={{
                            bgcolor: rc.bg,
                            color: rc.color,
                            fontWeight: 600,
                            fontSize: '0.7rem',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <Typography
                          variant="body2"
                          sx={{ color: '#f44336', fontSize: '0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {exec.error_message ?? '-'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })
            )}
          </TableBody>
        </Table>
        {recentExecs.length > 10 && (
          <TablePagination
            component="div"
            count={recentExecs.length}
            rowsPerPage={10}
            page={execPage}
            onPageChange={(_, p) => setExecPage(p)}
            rowsPerPageOptions={[10]}
            sx={{
              color: '#b8c5d6',
              '& .MuiTablePagination-actions button': { color: '#b8c5d6' },
            }}
          />
        )}
      </TableContainer>

      {/* Dialog */}
      <WorkflowDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        workflow={editingWorkflow}
      />
    </Box>
  );
}
