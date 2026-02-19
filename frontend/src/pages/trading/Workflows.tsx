import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Chip,
  Switch,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import api, { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import { CARD_SX, parseApiError, truncateMint } from './tradingUtils';
import type {
  TradingWorkflow,
  WorkflowExecution,
  WorkflowExecutionResult,
  WorkflowType,
  BuyAmountMode,
  BuyChain,
  SellChain,
  Wallet,
} from '../../types/buy';

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
// Constants
// ---------------------------------------------------------------------------
const buyColor = '#4caf50';
const sellColor = '#f44336';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function Workflows() {
  const ctx = useTradingContext();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);

  // Tab & form state
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [editingWorkflow, setEditingWorkflow] = useState<TradingWorkflow | null>(null);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [execPage, setExecPage] = useState(0);

  // Form fields
  const [name, setName] = useState('');
  const [walletAlias, setWalletAlias] = useState('');

  // BUY fields
  const [triggerModelId, setTriggerModelId] = useState<number | ''>('');
  const [triggerMinProb, setTriggerMinProb] = useState(70);
  const [conditions, setConditions] = useState<
    { model_id: number | ''; operator: string; threshold: number }[]
  >([]);
  const [buyAmountMode, setBuyAmountMode] = useState<BuyAmountMode>('fixed');
  const [buyAmountValue, setBuyAmountValue] = useState(0.05);

  // SELL fields
  const [stopLossEnabled, setStopLossEnabled] = useState(false);
  const [stopLossPercent, setStopLossPercent] = useState(-5);
  const [trailingStopEnabled, setTrailingStopEnabled] = useState(false);
  const [trailingStopPercent, setTrailingStopPercent] = useState(-3);
  const [takeProfitEnabled, setTakeProfitEnabled] = useState(false);
  const [takeProfitPercent, setTakeProfitPercent] = useState(20);
  const [timeoutEnabled, setTimeoutEnabled] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState(30);
  const [sellAmountPct, setSellAmountPct] = useState(100);

  // Common
  const [cooldownSeconds, setCooldownSeconds] = useState(60);
  const [maxOpenPositions, setMaxOpenPositions] = useState(5);

  const isEdit = !!editingWorkflow;
  const activeType: WorkflowType = activeTab === 'buy' ? 'BUY' : 'SELL';
  const activeColor = activeTab === 'buy' ? buyColor : sellColor;
  const accentRgb = ctx.accentColor;

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

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ['buy', 'wallets', ctx.walletType],
    queryFn: async () => (await buyApi.getWallets(ctx.walletType)).data,
  });

  const { data: models = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['training', 'models'],
    queryFn: async () => {
      const res = await api.get('/training/models');
      return res.data;
    },
  });

  // -------------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------------
  const buyWorkflows = workflows.filter((w) => w.type === 'BUY');
  const sellWorkflows = workflows.filter((w) => w.type === 'SELL');
  const filteredWorkflows = activeType === 'BUY' ? buyWorkflows : sellWorkflows;
  const execsPerPage = 10;
  const pagedExecs = recentExecs.slice(execPage * execsPerPage, (execPage + 1) * execsPerPage);
  const totalExecPages = Math.ceil(recentExecs.length / execsPerPage);

  // -------------------------------------------------------------------------
  // Form reset
  // -------------------------------------------------------------------------
  const resetForm = () => {
    setEditingWorkflow(null);
    setName('');
    setWalletAlias('');
    setTriggerModelId('');
    setTriggerMinProb(70);
    setConditions([]);
    setBuyAmountMode('fixed');
    setBuyAmountValue(0.05);
    setStopLossEnabled(false);
    setStopLossPercent(-5);
    setTrailingStopEnabled(false);
    setTrailingStopPercent(-3);
    setTakeProfitEnabled(false);
    setTakeProfitPercent(20);
    setTimeoutEnabled(false);
    setTimeoutMinutes(30);
    setSellAmountPct(100);
    setCooldownSeconds(60);
    setMaxOpenPositions(5);
  };

  // -------------------------------------------------------------------------
  // Populate form when editing
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!editingWorkflow) return;
    const wf = editingWorkflow;
    setName(wf.name);
    setWalletAlias(wf.wallet_alias ?? '');
    setActiveTab(wf.type === 'BUY' ? 'buy' : 'sell');
    setCooldownSeconds(wf.cooldown_seconds);
    setMaxOpenPositions(wf.max_open_positions);

    if (wf.type === 'BUY') {
      const chain = wf.chain as BuyChain;
      setTriggerModelId(chain.trigger.model_id);
      setTriggerMinProb(chain.trigger.min_probability * 100);
      setConditions(
        chain.conditions.map((c) => ({
          model_id: c.model_id,
          operator: c.operator,
          threshold: c.threshold * 100,
        })),
      );
      setBuyAmountMode(wf.buy_amount_mode ?? 'fixed');
      setBuyAmountValue(wf.buy_amount_value ?? 0.05);
    } else {
      const chain = wf.chain as SellChain;
      setSellAmountPct(wf.sell_amount_pct ?? 100);
      setStopLossEnabled(false);
      setTrailingStopEnabled(false);
      setTakeProfitEnabled(false);
      setTimeoutEnabled(false);
      for (const r of chain.rules) {
        if (r.type === 'stop_loss') {
          setStopLossEnabled(true);
          setStopLossPercent(r.percent ?? -5);
        } else if (r.type === 'trailing_stop') {
          setTrailingStopEnabled(true);
          setTrailingStopPercent(r.percent ?? -3);
        } else if (r.type === 'take_profit') {
          setTakeProfitEnabled(true);
          setTakeProfitPercent(r.percent ?? 20);
        } else if (r.type === 'timeout') {
          setTimeoutEnabled(true);
          setTimeoutMinutes(r.minutes ?? 30);
        }
      }
    }
  }, [editingWorkflow]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleSave = async () => {
    setSaving(true);
    setAlert(null);
    try {
      let chain: BuyChain | SellChain;

      if (activeType === 'BUY') {
        chain = {
          trigger: {
            type: 'prediction_alert',
            model_id: triggerModelId as number,
            min_probability: triggerMinProb / 100,
          },
          conditions: conditions
            .filter((c) => c.model_id !== '')
            .map((c) => ({
              type: 'on_demand_prediction' as const,
              model_id: c.model_id as number,
              operator: c.operator as 'gte' | 'lte' | 'gt' | 'lt',
              threshold: c.threshold / 100,
            })),
        };
      } else {
        const rules: SellChain['rules'] = [];
        if (stopLossEnabled) rules.push({ type: 'stop_loss', percent: stopLossPercent, from: 'entry' });
        if (trailingStopEnabled) rules.push({ type: 'trailing_stop', percent: trailingStopPercent, from: 'peak' });
        if (takeProfitEnabled) rules.push({ type: 'take_profit', percent: takeProfitPercent });
        if (timeoutEnabled) rules.push({ type: 'timeout', minutes: timeoutMinutes });
        chain = { rules };
      }

      const payload = {
        wallet_alias: walletAlias,
        name,
        type: activeType,
        chain,
        ...(activeType === 'BUY'
          ? { buy_amount_mode: buyAmountMode, buy_amount_value: buyAmountValue }
          : { sell_amount_pct: sellAmountPct }),
        cooldown_seconds: cooldownSeconds,
        max_open_positions: maxOpenPositions,
      };

      if (isEdit && editingWorkflow) {
        await buyApi.updateWorkflow(editingWorkflow.id, payload);
      } else {
        await buyApi.createWorkflow(payload);
      }

      await queryClient.invalidateQueries({ queryKey: ['buy', 'workflows'] });
      setAlert({ type: 'success', message: isEdit ? 'Workflow updated' : 'Workflow created' });
      resetForm();
    } catch (err) {
      setAlert({ type: 'error', message: parseApiError(err, 'Failed to save workflow') });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (wf: TradingWorkflow) => {
    try {
      await buyApi.toggleWorkflow(wf.id, !wf.is_active);
      await queryClient.invalidateQueries({ queryKey: ['buy', 'workflows'] });
    } catch (err) {
      console.error('Failed to toggle workflow', err);
    }
  };

  const handleDelete = async (wf: TradingWorkflow) => {
    if (deletingId !== wf.id) {
      setDeletingId(wf.id);
      return;
    }
    try {
      await buyApi.deleteWorkflow(wf.id);
      await queryClient.invalidateQueries({ queryKey: ['buy', 'workflows'] });
      setDeletingId(null);
      if (editingWorkflow?.id === wf.id) resetForm();
    } catch (err) {
      console.error('Failed to delete workflow', err);
    }
  };

  const handleEdit = (wf: TradingWorkflow) => {
    setEditingWorkflow(wf);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Condition helpers
  const addCondition = () => {
    setConditions((prev) => [...prev, { model_id: '', operator: 'gte', threshold: 60 }]);
  };
  const removeCondition = (idx: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateCondition = (
    idx: number,
    field: 'model_id' | 'operator' | 'threshold',
    value: number | string,
  ) => {
    setConditions((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };

  // Clear deletingId when clicking elsewhere
  useEffect(() => {
    if (!deletingId) return;
    const timer = setTimeout(() => setDeletingId(null), 3000);
    return () => clearTimeout(timer);
  }, [deletingId]);

  // -------------------------------------------------------------------------
  // Shared styles
  // -------------------------------------------------------------------------
  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: 'rgba(255,255,255,0.03)',
      '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
      '&:hover fieldset': { borderColor: `rgba(${accentRgb}, 0.3)` },
      '&.Mui-focused fieldset': { borderColor: activeColor },
    },
  };

  const sectionLabelSx = {
    color: 'rgba(255,255,255,0.5)',
    mb: 1,
    fontSize: '0.8rem',
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
      {alert && (
        <Alert severity={alert.type} sx={{ mb: 2 }} onClose={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* ================================================================= */}
        {/* LEFT: Workflow Form                                                */}
        {/* ================================================================= */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card
            ref={formRef}
            sx={{
              bgcolor: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            {saving && (
              <LinearProgress
                sx={{ height: 2, bgcolor: 'transparent', '& .MuiLinearProgress-bar': { bgcolor: activeColor } }}
              />
            )}

            {/* ---- Tab Toggle ---- */}
            <Box sx={{ display: 'flex', p: 0 }}>
              {(['buy', 'sell'] as const).map((tab) => {
                const isActive = activeTab === tab;
                const color = tab === 'buy' ? buyColor : sellColor;
                return (
                  <Box
                    key={tab}
                    onClick={() => {
                      if (!isEdit) setActiveTab(tab);
                    }}
                    sx={{
                      flex: 1,
                      py: 2,
                      textAlign: 'center',
                      cursor: isEdit ? 'default' : 'pointer',
                      fontWeight: 700,
                      fontSize: '1rem',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      color: isActive ? color : 'rgba(255,255,255,0.35)',
                      bgcolor: isActive ? `${color}10` : 'transparent',
                      borderBottom: isActive ? `3px solid ${color}` : '3px solid transparent',
                      transition: 'all 0.2s',
                      opacity: isEdit && !isActive ? 0.4 : 1,
                      '&:hover': isEdit
                        ? {}
                        : { bgcolor: `${color}08`, color: isActive ? color : 'rgba(255,255,255,0.6)' },
                    }}
                  >
                    {tab}
                  </Box>
                );
              })}
            </Box>

            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {/* ---- Name ---- */}
                <TextField
                  fullWidth
                  label="Workflow Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  sx={inputSx}
                />

                {/* ---- Wallet ---- */}
                <FormControl fullWidth sx={inputSx}>
                  <InputLabel>Wallet</InputLabel>
                  <Select
                    value={walletAlias}
                    label="Wallet"
                    onChange={(e) => setWalletAlias(e.target.value)}
                  >
                    {wallets.map((w) => (
                      <MenuItem key={w.alias} value={w.alias}>
                        {w.alias}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* ============================================================ */}
                {/* BUY FIELDS                                                    */}
                {/* ============================================================ */}
                {activeTab === 'buy' && (
                  <>
                    {/* -- Trigger -- */}
                    <Typography variant="body2" sx={sectionLabelSx}>
                      TRIGGER
                    </Typography>

                    <FormControl fullWidth sx={inputSx}>
                      <InputLabel>Model</InputLabel>
                      <Select
                        value={triggerModelId}
                        label="Model"
                        onChange={(e) => setTriggerModelId(e.target.value as number)}
                      >
                        {models.map((m) => (
                          <MenuItem key={m.id} value={m.id}>
                            #{m.id} - {m.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <TextField
                      fullWidth
                      label="Min. Probability (%)"
                      type="number"
                      value={triggerMinProb}
                      onChange={(e) => setTriggerMinProb(Number(e.target.value))}
                      sx={inputSx}
                      slotProps={{ htmlInput: { min: 0, max: 100 } }}
                    />

                    {/* -- Conditions -- */}
                    <Typography variant="body2" sx={sectionLabelSx}>
                      CONDITIONS
                    </Typography>

                    {conditions.map((cond, idx) => (
                      <Box key={idx} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <FormControl fullWidth sx={inputSx}>
                          <InputLabel>Model</InputLabel>
                          <Select
                            value={cond.model_id}
                            label="Model"
                            onChange={(e) => updateCondition(idx, 'model_id', e.target.value as number)}
                          >
                            {models.map((m) => (
                              <MenuItem key={m.id} value={m.id}>
                                #{m.id} - {m.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <FormControl sx={{ ...inputSx, flex: 1 }}>
                            <InputLabel>Operator</InputLabel>
                            <Select
                              value={cond.operator}
                              label="Operator"
                              onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                            >
                              <MenuItem value="gte">&gt;=</MenuItem>
                              <MenuItem value="gt">&gt;</MenuItem>
                              <MenuItem value="lte">&lt;=</MenuItem>
                              <MenuItem value="lt">&lt;</MenuItem>
                            </Select>
                          </FormControl>

                          <TextField
                            label="%"
                            type="number"
                            value={cond.threshold}
                            onChange={(e) => updateCondition(idx, 'threshold', Number(e.target.value))}
                            sx={{ ...inputSx, flex: 1 }}
                            slotProps={{ htmlInput: { min: 0, max: 100 } }}
                          />

                          <IconButton size="small" onClick={() => removeCondition(idx)} sx={{ color: '#f44336' }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>
                    ))}

                    <Button
                      startIcon={<AddIcon />}
                      onClick={addCondition}
                      size="small"
                      sx={{ color: activeColor, alignSelf: 'flex-start' }}
                    >
                      Add Condition
                    </Button>

                    {/* -- Amount -- */}
                    <Typography variant="body2" sx={sectionLabelSx}>
                      AMOUNT
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1 }}>
                      {(['fixed', 'percent'] as const).map((mode) => (
                        <Button
                          key={mode}
                          onClick={() => setBuyAmountMode(mode)}
                          sx={{
                            flex: 1,
                            py: 1.2,
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            color: buyAmountMode === mode ? '#fff' : activeColor,
                            bgcolor: buyAmountMode === mode ? activeColor : `${activeColor}12`,
                            border: `1px solid ${buyAmountMode === mode ? activeColor : `${activeColor}30`}`,
                            borderRadius: 2,
                            '&:hover': {
                              bgcolor: buyAmountMode === mode ? activeColor : `${activeColor}25`,
                            },
                          }}
                        >
                          {mode === 'fixed' ? 'Fixed (SOL)' : 'Percent (%)'}
                        </Button>
                      ))}
                    </Box>

                    <TextField
                      fullWidth
                      label={buyAmountMode === 'fixed' ? 'Amount (SOL)' : 'Amount (%)'}
                      type="number"
                      value={buyAmountValue}
                      onChange={(e) => setBuyAmountValue(Number(e.target.value))}
                      sx={inputSx}
                      slotProps={{ htmlInput: { min: 0, step: buyAmountMode === 'fixed' ? 0.01 : 1 } }}
                    />
                  </>
                )}

                {/* ============================================================ */}
                {/* SELL FIELDS                                                   */}
                {/* ============================================================ */}
                {activeTab === 'sell' && (
                  <>
                    <Typography variant="body2" sx={sectionLabelSx}>
                      SELL RULES (OR)
                    </Typography>

                    {/* Stop-Loss */}
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, alignItems: { sm: 'center' } }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={stopLossEnabled}
                            onChange={(e) => setStopLossEnabled(e.target.checked)}
                            sx={{ color: '#b8c5d6', '&.Mui-checked': { color: activeColor } }}
                          />
                        }
                        label="Stop-Loss"
                        sx={{ minWidth: 160, '& .MuiFormControlLabel-label': { color: '#b8c5d6' } }}
                      />
                      <TextField
                        label="% from Entry"
                        type="number"
                        value={stopLossPercent}
                        onChange={(e) => setStopLossPercent(Number(e.target.value))}
                        disabled={!stopLossEnabled}
                        fullWidth
                        sx={inputSx}
                        slotProps={{ htmlInput: { max: 0 } }}
                      />
                    </Box>

                    {/* Trailing Stop */}
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, alignItems: { sm: 'center' } }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={trailingStopEnabled}
                            onChange={(e) => setTrailingStopEnabled(e.target.checked)}
                            sx={{ color: '#b8c5d6', '&.Mui-checked': { color: activeColor } }}
                          />
                        }
                        label="Trailing-Stop"
                        sx={{ minWidth: 160, '& .MuiFormControlLabel-label': { color: '#b8c5d6' } }}
                      />
                      <TextField
                        label="% from Peak"
                        type="number"
                        value={trailingStopPercent}
                        onChange={(e) => setTrailingStopPercent(Number(e.target.value))}
                        disabled={!trailingStopEnabled}
                        fullWidth
                        sx={inputSx}
                        slotProps={{ htmlInput: { max: 0 } }}
                      />
                    </Box>

                    {/* Take-Profit */}
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, alignItems: { sm: 'center' } }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={takeProfitEnabled}
                            onChange={(e) => setTakeProfitEnabled(e.target.checked)}
                            sx={{ color: '#b8c5d6', '&.Mui-checked': { color: activeColor } }}
                          />
                        }
                        label="Take-Profit"
                        sx={{ minWidth: 160, '& .MuiFormControlLabel-label': { color: '#b8c5d6' } }}
                      />
                      <TextField
                        label="+ %"
                        type="number"
                        value={takeProfitPercent}
                        onChange={(e) => setTakeProfitPercent(Number(e.target.value))}
                        disabled={!takeProfitEnabled}
                        fullWidth
                        sx={inputSx}
                        slotProps={{ htmlInput: { min: 0 } }}
                      />
                    </Box>

                    {/* Timeout */}
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, alignItems: { sm: 'center' } }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={timeoutEnabled}
                            onChange={(e) => setTimeoutEnabled(e.target.checked)}
                            sx={{ color: '#b8c5d6', '&.Mui-checked': { color: activeColor } }}
                          />
                        }
                        label="Timeout"
                        sx={{ minWidth: 160, '& .MuiFormControlLabel-label': { color: '#b8c5d6' } }}
                      />
                      <TextField
                        label="Minutes"
                        type="number"
                        value={timeoutMinutes}
                        onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
                        disabled={!timeoutEnabled}
                        fullWidth
                        sx={inputSx}
                        slotProps={{ htmlInput: { min: 1 } }}
                      />
                    </Box>

                    {/* Sell Amount */}
                    <Typography variant="body2" sx={sectionLabelSx}>
                      SELL AMOUNT
                    </Typography>

                    <TextField
                      fullWidth
                      label="Sell (%)"
                      type="number"
                      value={sellAmountPct}
                      onChange={(e) => setSellAmountPct(Number(e.target.value))}
                      sx={inputSx}
                      slotProps={{ htmlInput: { min: 1, max: 100 } }}
                    />
                  </>
                )}

                {/* ============================================================ */}
                {/* SETTINGS (shared)                                             */}
                {/* ============================================================ */}
                <Typography variant="body2" sx={sectionLabelSx}>
                  SETTINGS
                </Typography>

                <TextField
                  fullWidth
                  label="Cooldown (seconds)"
                  type="number"
                  value={cooldownSeconds}
                  onChange={(e) => setCooldownSeconds(Number(e.target.value))}
                  sx={inputSx}
                  slotProps={{ htmlInput: { min: 0 } }}
                />

                <TextField
                  fullWidth
                  label="Max Open Positions"
                  type="number"
                  value={maxOpenPositions}
                  onChange={(e) => setMaxOpenPositions(Number(e.target.value))}
                  sx={inputSx}
                  slotProps={{ htmlInput: { min: 1 } }}
                />

                {/* ---- Action Buttons ---- */}
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving || !name || !walletAlias}
                  fullWidth
                  size="large"
                  sx={{
                    mt: 1,
                    py: 1.8,
                    bgcolor: activeColor,
                    '&:hover': { bgcolor: activeTab === 'buy' ? '#388e3c' : '#c62828' },
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    letterSpacing: 0.5,
                    borderRadius: 2,
                    boxShadow: `0 4px 20px ${activeColor}40`,
                  }}
                >
                  {saving ? 'Saving...' : isEdit ? 'Save Changes' : `Create ${activeType} Workflow`}
                </Button>

                {isEdit && (
                  <Button
                    variant="outlined"
                    onClick={resetForm}
                    fullWidth
                    sx={{
                      py: 1.5,
                      color: 'rgba(255,255,255,0.6)',
                      borderColor: 'rgba(255,255,255,0.15)',
                      fontWeight: 600,
                      borderRadius: 2,
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.3)' },
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* ================================================================= */}
        {/* RIGHT: Workflows List + Executions                                 */}
        {/* ================================================================= */}
        <Grid size={{ xs: 12, md: 5 }}>
          {/* ---- Workflows List ---- */}
          <Card sx={{ ...CARD_SX, borderRadius: 3, mb: 2 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                  {activeType === 'BUY' ? 'Buy' : 'Sell'} Workflows
                </Typography>
                <Chip
                  label={filteredWorkflows.length}
                  size="small"
                  sx={{
                    bgcolor: `${activeColor}25`,
                    color: activeColor,
                    fontWeight: 700,
                    minWidth: 28,
                  }}
                />
              </Box>

              {filteredWorkflows.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                    No {activeType.toLowerCase()} workflows yet
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {filteredWorkflows.map((wf) => (
                    <Box
                      key={wf.id}
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'rgba(255,255,255,0.02)',
                        border: editingWorkflow?.id === wf.id
                          ? `1px solid ${activeColor}`
                          : '1px solid rgba(255,255,255,0.05)',
                        '&:hover': { border: `1px solid rgba(${accentRgb}, 0.2)` },
                        transition: 'border 0.2s',
                      }}
                    >
                      {/* Header: name + toggle */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
                          {wf.name}
                        </Typography>
                        <Switch
                          checked={wf.is_active}
                          onChange={() => handleToggle(wf)}
                          size="small"
                          sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': { color: activeColor },
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                              backgroundColor: activeColor,
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
                          fontSize: '0.7rem',
                          mb: 1,
                          bgcolor: 'rgba(255,255,255,0.04)',
                          p: 1,
                          borderRadius: 1,
                          wordBreak: 'break-word',
                        }}
                      >
                        {wf.type === 'BUY'
                          ? summarizeBuyChain(wf.chain as BuyChain, wf.buy_amount_mode, wf.buy_amount_value)
                          : summarizeSellChain(wf.chain as SellChain)}
                      </Typography>

                      {/* Settings chips */}
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                        <Chip
                          label={wf.wallet_alias}
                          size="small"
                          sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: '#b8c5d6', fontSize: '0.65rem', height: 22 }}
                        />
                        <Chip
                          label={`${wf.cooldown_seconds}s`}
                          size="small"
                          sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: '#b8c5d6', fontSize: '0.65rem', height: 22 }}
                        />
                        <Chip
                          label={`Max ${wf.max_open_positions}`}
                          size="small"
                          sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: '#b8c5d6', fontSize: '0.65rem', height: 22 }}
                        />
                      </Box>

                      {/* Actions */}
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button
                          size="small"
                          startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                          onClick={() => handleEdit(wf)}
                          sx={{
                            color: '#b8c5d6',
                            fontSize: '0.75rem',
                            py: 0.5,
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          startIcon={<DeleteIcon sx={{ fontSize: 14 }} />}
                          onClick={() => handleDelete(wf)}
                          sx={{
                            color: deletingId === wf.id ? '#f44336' : '#b8c5d6',
                            fontSize: '0.75rem',
                            py: 0.5,
                            fontWeight: deletingId === wf.id ? 700 : 400,
                            '&:hover': { bgcolor: deletingId === wf.id ? 'rgba(244,67,54,0.1)' : 'rgba(255,255,255,0.05)' },
                          }}
                        >
                          {deletingId === wf.id ? 'Sure?' : 'Delete'}
                        </Button>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* ---- Recent Executions ---- */}
          <Card sx={{ ...CARD_SX, borderRadius: 3 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                  Recent Executions
                </Typography>
                <Chip
                  label={recentExecs.length}
                  size="small"
                  sx={{
                    bgcolor: `rgba(${accentRgb}, 0.15)`,
                    color: `rgb(${accentRgb})`,
                    fontWeight: 700,
                    minWidth: 28,
                  }}
                />
              </Box>

              {recentExecs.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                    No executions yet
                  </Typography>
                </Box>
              ) : (
                <>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {pagedExecs.map((exec) => {
                      const rc = RESULT_COLORS[exec.result] ?? RESULT_COLORS.ERROR;
                      return (
                        <Box
                          key={exec.id}
                          sx={{
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.05)',
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                              {exec.workflow_name ?? exec.workflow_id.slice(0, 8)}
                            </Typography>
                            <Chip
                              label={exec.result}
                              size="small"
                              sx={{
                                bgcolor: rc.bg,
                                color: rc.color,
                                fontWeight: 600,
                                fontSize: '0.65rem',
                                height: 20,
                              }}
                            />
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography
                              variant="caption"
                              sx={{ fontFamily: 'monospace', color: `rgb(${accentRgb})`, fontSize: '0.7rem' }}
                            >
                              {truncateMint(exec.mint)}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>
                              {format(new Date(exec.created_at), 'dd.MM HH:mm')}
                            </Typography>
                          </Box>
                          {exec.error_message && (
                            <Typography
                              variant="caption"
                              sx={{
                                color: '#f44336',
                                fontSize: '0.65rem',
                                display: 'block',
                                mt: 0.5,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {exec.error_message}
                            </Typography>
                          )}
                        </Box>
                      );
                    })}
                  </Box>

                  {/* Pagination */}
                  {totalExecPages > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 2 }}>
                      <Button
                        size="small"
                        disabled={execPage === 0}
                        onClick={() => setExecPage((p) => p - 1)}
                        sx={{ color: '#b8c5d6', minWidth: 0 }}
                      >
                        Prev
                      </Button>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                        {execPage + 1} / {totalExecPages}
                      </Typography>
                      <Button
                        size="small"
                        disabled={execPage >= totalExecPages - 1}
                        onClick={() => setExecPage((p) => p + 1)}
                        sx={{ color: '#b8c5d6', minWidth: 0 }}
                      >
                        Next
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
