import { useState, useEffect } from 'react';
import {
  Dialog,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  DialogContent,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  Card,
  CardContent,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Slide,
} from '@mui/material';
import type { TransitionProps } from '@mui/material/transitions';
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { forwardRef } from 'react';
import api, { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import type {
  TradingWorkflow,
  WorkflowType,
  BuyAmountMode,
  BuyChain,
  SellChain,
  Wallet,
} from '../../types/buy';

// ---------------------------------------------------------------------------
// Slide-up transition
// ---------------------------------------------------------------------------
const Transition = forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement<unknown> },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface WorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  workflow?: TradingWorkflow | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function WorkflowDialog({ open, onClose, workflow }: WorkflowDialogProps) {
  const ctx = useTradingContext();
  const queryClient = useQueryClient();
  const isEdit = !!workflow;

  // -------------------------------------------------------------------------
  // Form state
  // -------------------------------------------------------------------------
  const [name, setName] = useState('');
  const [walletAlias, setWalletAlias] = useState('');
  const [type, setType] = useState<WorkflowType>('BUY');

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

  const [saving, setSaving] = useState(false);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------
  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ['buy', 'wallets', ctx.walletType],
    queryFn: async () => (await buyApi.getWallets(ctx.walletType)).data,
    enabled: open,
  });

  const { data: models = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['training', 'models'],
    queryFn: async () => {
      const res = await api.get('/training/models');
      return res.data;
    },
    enabled: open,
  });

  // -------------------------------------------------------------------------
  // Populate form when editing
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    if (workflow) {
      setName(workflow.name);
      setWalletAlias(workflow.wallet_alias ?? '');
      setType(workflow.type);
      setCooldownSeconds(workflow.cooldown_seconds);
      setMaxOpenPositions(workflow.max_open_positions);

      if (workflow.type === 'BUY') {
        const chain = workflow.chain as BuyChain;
        setTriggerModelId(chain.trigger.model_id);
        setTriggerMinProb(chain.trigger.min_probability * 100);
        setConditions(
          chain.conditions.map((c) => ({
            model_id: c.model_id,
            operator: c.operator,
            threshold: c.threshold * 100,
          })),
        );
        setBuyAmountMode(workflow.buy_amount_mode ?? 'fixed');
        setBuyAmountValue(workflow.buy_amount_value ?? 0.05);
      } else {
        const chain = workflow.chain as SellChain;
        setSellAmountPct(workflow.sell_amount_pct ?? 100);

        // Reset all sell rule toggles
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
    } else {
      // Reset form for create mode
      setName('');
      setWalletAlias('');
      setType('BUY');
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
    }
  }, [workflow, open]);

  // -------------------------------------------------------------------------
  // Save handler
  // -------------------------------------------------------------------------
  const handleSave = async () => {
    setSaving(true);
    try {
      let chain: BuyChain | SellChain;

      if (type === 'BUY') {
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
        if (stopLossEnabled) {
          rules.push({ type: 'stop_loss', percent: stopLossPercent, from: 'entry' });
        }
        if (trailingStopEnabled) {
          rules.push({ type: 'trailing_stop', percent: trailingStopPercent, from: 'peak' });
        }
        if (takeProfitEnabled) {
          rules.push({ type: 'take_profit', percent: takeProfitPercent });
        }
        if (timeoutEnabled) {
          rules.push({ type: 'timeout', minutes: timeoutMinutes });
        }
        chain = { rules };
      }

      const payload = {
        wallet_alias: walletAlias,
        name,
        type,
        chain,
        ...(type === 'BUY'
          ? { buy_amount_mode: buyAmountMode, buy_amount_value: buyAmountValue }
          : { sell_amount_pct: sellAmountPct }),
        cooldown_seconds: cooldownSeconds,
        max_open_positions: maxOpenPositions,
      };

      if (isEdit && workflow) {
        await buyApi.updateWorkflow(workflow.id, payload);
      } else {
        await buyApi.createWorkflow(payload);
      }

      await queryClient.invalidateQueries({ queryKey: ['buy', 'workflows'] });
      onClose();
    } catch (err) {
      console.error('Failed to save workflow', err);
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // Condition helpers
  // -------------------------------------------------------------------------
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
    setConditions((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)),
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const accent = `rgb(${ctx.accentColor})`;
  const dialogTitle = isEdit
    ? `Edit ${type === 'BUY' ? 'Buy' : 'Sell'} Workflow`
    : `New ${type === 'BUY' ? 'Buy' : 'Sell'} Workflow`;

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      TransitionComponent={Transition}
      PaperProps={{ sx: { bgcolor: '#0f0f23' } }}
    >
      <AppBar sx={{ position: 'relative', bgcolor: '#1a1a2e' }}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={onClose}>
            <CloseIcon />
          </IconButton>
          <Typography sx={{ ml: 2, flex: 1 }} variant="h6">
            {dialogTitle}
          </Typography>
          <Button
            color="inherit"
            onClick={handleSave}
            disabled={saving || !name || !walletAlias}
            sx={{ color: accent }}
          >
            {saving ? 'Speichere...' : 'Speichern'}
          </Button>
        </Toolbar>
      </AppBar>

      <DialogContent sx={{ maxWidth: 800, mx: 'auto', width: '100%', py: 3 }}>
        {/* Common fields */}
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
              Allgemein
            </Typography>

            <TextField
              fullWidth
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              size="small"
              sx={{ mb: 2 }}
            />

            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
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

            <Box>
              <Typography variant="caption" sx={{ color: '#b8c5d6', mb: 0.5, display: 'block' }}>
                Typ
              </Typography>
              <ToggleButtonGroup
                value={type}
                exclusive
                onChange={(_, v) => v && setType(v)}
                size="small"
                disabled={isEdit}
              >
                <ToggleButton
                  value="BUY"
                  sx={{
                    color: '#b8c5d6',
                    '&.Mui-selected': { color: '#4caf50', bgcolor: 'rgba(76,175,80,0.15)' },
                  }}
                >
                  BUY
                </ToggleButton>
                <ToggleButton
                  value="SELL"
                  sx={{
                    color: '#b8c5d6',
                    '&.Mui-selected': { color: '#f44336', bgcolor: 'rgba(244,67,54,0.15)' },
                  }}
                >
                  SELL
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </CardContent>
        </Card>

        {/* ----- BUY-specific fields ----- */}
        {type === 'BUY' && (
          <>
            {/* Trigger */}
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
                  Trigger
                </Typography>

                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
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
                  size="small"
                  slotProps={{ htmlInput: { min: 0, max: 100 } }}
                />
              </CardContent>
            </Card>

            {/* Conditions */}
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
                  Bedingungen
                </Typography>

                {conditions.map((cond, idx) => (
                  <Box
                    key={idx}
                    sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5 }}
                  >
                    <FormControl size="small" sx={{ minWidth: 160, flex: 1 }}>
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

                    <FormControl size="small" sx={{ minWidth: 80 }}>
                      <InputLabel>Op</InputLabel>
                      <Select
                        value={cond.operator}
                        label="Op"
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
                      size="small"
                      sx={{ width: 90 }}
                      slotProps={{ htmlInput: { min: 0, max: 100 } }}
                    />

                    <IconButton size="small" onClick={() => removeCondition(idx)} sx={{ color: '#f44336' }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}

                <Button
                  startIcon={<AddIcon />}
                  onClick={addCondition}
                  size="small"
                  sx={{ color: accent, mt: 1 }}
                >
                  Bedingung
                </Button>
              </CardContent>
            </Card>

            {/* Buy Amount */}
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
                  Kaufbetrag
                </Typography>

                <ToggleButtonGroup
                  value={buyAmountMode}
                  exclusive
                  onChange={(_, v) => v && setBuyAmountMode(v)}
                  size="small"
                  sx={{ mb: 2 }}
                >
                  <ToggleButton
                    value="fixed"
                    sx={{
                      color: '#b8c5d6',
                      '&.Mui-selected': { color: accent, bgcolor: `rgba(${ctx.accentColor}, 0.15)` },
                    }}
                  >
                    Fix (SOL)
                  </ToggleButton>
                  <ToggleButton
                    value="percent"
                    sx={{
                      color: '#b8c5d6',
                      '&.Mui-selected': { color: accent, bgcolor: `rgba(${ctx.accentColor}, 0.15)` },
                    }}
                  >
                    Prozent (%)
                  </ToggleButton>
                </ToggleButtonGroup>

                <TextField
                  fullWidth
                  label={buyAmountMode === 'fixed' ? 'Betrag (SOL)' : 'Betrag (%)'}
                  type="number"
                  value={buyAmountValue}
                  onChange={(e) => setBuyAmountValue(Number(e.target.value))}
                  size="small"
                  slotProps={{ htmlInput: { min: 0, step: buyAmountMode === 'fixed' ? 0.01 : 1 } }}
                />
              </CardContent>
            </Card>
          </>
        )}

        {/* ----- SELL-specific fields ----- */}
        {type === 'SELL' && (
          <>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
                  Verkaufs-Regeln (OR)
                </Typography>

                {/* Stop-Loss */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={stopLossEnabled}
                        onChange={(e) => setStopLossEnabled(e.target.checked)}
                        sx={{ color: '#b8c5d6', '&.Mui-checked': { color: accent } }}
                      />
                    }
                    label="Stop-Loss"
                    sx={{ minWidth: 160, '& .MuiFormControlLabel-label': { color: '#b8c5d6' } }}
                  />
                  <TextField
                    label="% vom Entry"
                    type="number"
                    value={stopLossPercent}
                    onChange={(e) => setStopLossPercent(Number(e.target.value))}
                    size="small"
                    disabled={!stopLossEnabled}
                    sx={{ width: 140 }}
                    slotProps={{ htmlInput: { max: 0 } }}
                  />
                </Box>

                {/* Trailing Stop */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={trailingStopEnabled}
                        onChange={(e) => setTrailingStopEnabled(e.target.checked)}
                        sx={{ color: '#b8c5d6', '&.Mui-checked': { color: accent } }}
                      />
                    }
                    label="Trailing-Stop"
                    sx={{ minWidth: 160, '& .MuiFormControlLabel-label': { color: '#b8c5d6' } }}
                  />
                  <TextField
                    label="% vom Peak"
                    type="number"
                    value={trailingStopPercent}
                    onChange={(e) => setTrailingStopPercent(Number(e.target.value))}
                    size="small"
                    disabled={!trailingStopEnabled}
                    sx={{ width: 140 }}
                    slotProps={{ htmlInput: { max: 0 } }}
                  />
                </Box>

                {/* Take-Profit */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={takeProfitEnabled}
                        onChange={(e) => setTakeProfitEnabled(e.target.checked)}
                        sx={{ color: '#b8c5d6', '&.Mui-checked': { color: accent } }}
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
                    size="small"
                    disabled={!takeProfitEnabled}
                    sx={{ width: 140 }}
                    slotProps={{ htmlInput: { min: 0 } }}
                  />
                </Box>

                {/* Timeout */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={timeoutEnabled}
                        onChange={(e) => setTimeoutEnabled(e.target.checked)}
                        sx={{ color: '#b8c5d6', '&.Mui-checked': { color: accent } }}
                      />
                    }
                    label="Timeout"
                    sx={{ minWidth: 160, '& .MuiFormControlLabel-label': { color: '#b8c5d6' } }}
                  />
                  <TextField
                    label="Minuten"
                    type="number"
                    value={timeoutMinutes}
                    onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
                    size="small"
                    disabled={!timeoutEnabled}
                    sx={{ width: 140 }}
                    slotProps={{ htmlInput: { min: 1 } }}
                  />
                </Box>
              </CardContent>
            </Card>

            {/* Sell Amount */}
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
                  Verkaufsmenge
                </Typography>
                <TextField
                  fullWidth
                  label="Verkauf (%)"
                  type="number"
                  value={sellAmountPct}
                  onChange={(e) => setSellAmountPct(Number(e.target.value))}
                  size="small"
                  slotProps={{ htmlInput: { min: 1, max: 100 } }}
                />
              </CardContent>
            </Card>
          </>
        )}

        {/* Settings */}
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 2 }}>
              Einstellungen
            </Typography>

            <TextField
              fullWidth
              label="Cooldown (Sekunden)"
              type="number"
              value={cooldownSeconds}
              onChange={(e) => setCooldownSeconds(Number(e.target.value))}
              size="small"
              sx={{ mb: 2 }}
              slotProps={{ htmlInput: { min: 0 } }}
            />

            <TextField
              fullWidth
              label="Max offene Positionen"
              type="number"
              value={maxOpenPositions}
              onChange={(e) => setMaxOpenPositions(Number(e.target.value))}
              size="small"
              slotProps={{ htmlInput: { min: 1 } }}
            />
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
