/**
 * ModelLogs Page
 * Professional prediction logs with evaluation data, statistics,
 * advanced filtering, pagination, and reset functionality.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Alert,
  Button,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Breadcrumbs,
  Link as MuiLink,
  Tooltip,
  IconButton,
  TextField,
  Pagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Collapse,
  Switch,
  FormControlLabel,
  InputAdornment,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  List as ListIcon,
  ContentCopy as CopyIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  DeleteForever as DeleteIcon,
  CheckCircle as SuccessIcon,
  Cancel as FailedIcon,
  HourglassEmpty as WaitIcon,
  Block as ExpiredIcon,
  Speed as SpeedIcon,
  Notifications as NotificationsIcon,
  NotificationsOff as NonAlertsIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  HighlightOff as HighlightOffIcon,
  HourglassTop as HourglassTopIcon,
  ShowChart as ShowChartIcon,
  AttachMoney as ProfitIcon,
  TuneRounded as FilterIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Search as SearchIcon,
} from '@mui/icons-material';

import { serverApi } from '../../services/api';
import type { ServerModel } from '../../types/server';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------
interface ModelPrediction {
  id: number;
  active_model_id: number;
  coin_id: string;
  prediction: number;
  probability: number;
  tag: string;
  status: string;
  evaluation_result?: string;
  actual_price_change_pct?: number;
  ath_highest_pct?: number;
  ath_lowest_pct?: number;
  price_change_percent?: number;
  target_direction?: string;
  created_at: string;
  prediction_timestamp?: string;
  evaluated_at?: string;
}

const ITEMS_PER_PAGE = 50;
type Operator = '>' | '<' | '>=' | '<=' | '=';
const OPERATORS: Operator[] = ['>', '<', '>=', '<=', '='];

const applyOp = (v: number | undefined | null, op: Operator, t: number): boolean => {
  if (v == null) return false;
  switch (op) {
    case '>': return v > t;
    case '<': return v < t;
    case '>=': return v >= t;
    case '<=': return v <= t;
    case '=': return Math.abs(v - t) < 0.01;
    default: return true;
  }
};

// ---------------------------------------------------------------------------
// Shared style tokens (matching ModelCard design language)
// ---------------------------------------------------------------------------
const panelSx = (color: string, borderColor: string) => ({
  p: 2,
  background: `linear-gradient(135deg, ${alpha(color, 0.08)} 0%, ${alpha(color, 0.03)} 100%)`,
  borderRadius: 2,
  border: `1px solid ${alpha(borderColor, 0.2)}`,
});

const sectionLabel = (color: string) => ({
  mb: 1.5,
  display: 'block',
  fontWeight: 700,
  fontSize: '0.75rem',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  color,
});

const iconBox = (bg: string) => ({
  width: 32,
  height: 32,
  borderRadius: 1.5,
  bgcolor: bg,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

const cardSx = {
  bgcolor: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(20px)',
  borderRadius: 3,
};

// ---------------------------------------------------------------------------
// Mini stat item (used inside panels)
// ---------------------------------------------------------------------------
const StatItem: React.FC<{
  icon: React.ReactNode;
  value: string | number;
  label: string;
  color: string;
}> = ({ icon, value, label, color }) => (
  <Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Box sx={iconBox(alpha(color, 0.15))}>{icon}</Box>
      <Typography variant="h6" sx={{ fontWeight: 700, color, lineHeight: 1.2 }}>
        {value}
      </Typography>
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', ml: 5.5 }}>
      {label}
    </Typography>
  </Box>
);

// ---------------------------------------------------------------------------
// Operator filter input (compact)
// ---------------------------------------------------------------------------
const OpFilter: React.FC<{
  label: string;
  op: Operator;
  val: string;
  onOpChange: (o: Operator) => void;
  onValChange: (v: string) => void;
}> = ({ label, op, val, onOpChange, onValChange }) => (
  <Box sx={{ display: 'flex', alignItems: 'center' }}>
    <FormControl
      size="small"
      sx={{
        width: 56,
        '& .MuiOutlinedInput-root': {
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
          bgcolor: 'rgba(0, 212, 255, 0.06)',
        },
      }}
    >
      <Select value={op} onChange={(e) => onOpChange(e.target.value as Operator)} sx={{ fontSize: '0.8rem' }}>
        {OPERATORS.map((o) => <MenuItem key={o} value={o} sx={{ fontSize: '0.8rem' }}>{o}</MenuItem>)}
      </Select>
    </FormControl>
    <TextField
      size="small"
      placeholder={label}
      value={val}
      onChange={(e) => onValChange(e.target.value)}
      type="number"
      sx={{
        width: 120,
        '& .MuiOutlinedInput-root': {
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          marginLeft: '-1px',
        },
      }}
      slotProps={{
        input: {
          endAdornment: <InputAdornment position="end"><Typography variant="caption" color="text.secondary">%</Typography></InputAdornment>,
        },
      }}
    />
  </Box>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const ModelLogs: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const modelId = Number(id);

  // Filters
  const [coinIdFilter, setCoinIdFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [evalFilter, setEvalFilter] = useState<string[]>([]);
  const [probOp, setProbOp] = useState<Operator>('>');
  const [probVal, setProbVal] = useState('');
  const [actualOp, setActualOp] = useState<Operator>('>');
  const [actualVal, setActualVal] = useState('');
  const [athHighOp, setAthHighOp] = useState<Operator>('>');
  const [athHighVal, setAthHighVal] = useState('');
  const [athLowOp, setAthLowOp] = useState<Operator>('<');
  const [athLowVal, setAthLowVal] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  // Reset dialog
  const [resetOpen, setResetOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ---- Data queries ----
  const { data: modelResponse } = useQuery({
    queryKey: ['server', 'model', modelId],
    queryFn: () => serverApi.getModelDetails(modelId),
    enabled: !!modelId,
  });
  const model: ServerModel | undefined = modelResponse?.data;
  const modelName = model?.custom_name || model?.name || `Model #${modelId}`;

  const { data: predResponse, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['server', 'model-predictions', modelId],
    queryFn: () => serverApi.getModelPredictions({ active_model_id: modelId, limit: 10000 }),
    enabled: !!modelId,
    refetchInterval: 15000,
  });

  const allPredictions: ModelPrediction[] = predResponse?.data?.predictions || predResponse?.data || [];

  // ---- Filtering ----
  const filteredPredictions = useMemo(() => {
    let r = allPredictions;
    if (coinIdFilter) { const l = coinIdFilter.toLowerCase(); r = r.filter((p) => p.coin_id.toLowerCase().includes(l)); }
    if (tagFilter.length) r = r.filter((p) => tagFilter.includes(p.tag));
    if (evalFilter.length) r = r.filter((p) => {
      if (!p.evaluation_result && evalFilter.includes('wait')) return true;
      return p.evaluation_result ? evalFilter.includes(p.evaluation_result) : false;
    });
    if (probVal) { const t = parseFloat(probVal) / 100; if (!isNaN(t)) r = r.filter((p) => applyOp(p.probability, probOp, t)); }
    if (actualVal) { const t = parseFloat(actualVal); if (!isNaN(t)) r = r.filter((p) => applyOp(p.actual_price_change_pct, actualOp, t)); }
    if (athHighVal) { const t = parseFloat(athHighVal); if (!isNaN(t)) r = r.filter((p) => applyOp(p.ath_highest_pct, athHighOp, t)); }
    if (athLowVal) { const t = parseFloat(athLowVal); if (!isNaN(t)) r = r.filter((p) => applyOp(p.ath_lowest_pct, athLowOp, t)); }
    return r;
  }, [allPredictions, coinIdFilter, tagFilter, evalFilter, probOp, probVal, actualOp, actualVal, athHighOp, athHighVal, athLowOp, athLowVal]);

  const totalPages = Math.ceil(filteredPredictions.length / ITEMS_PER_PAGE);
  const rows = showAll ? filteredPredictions : filteredPredictions.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const activeFilterCount = [coinIdFilter, tagFilter.length, evalFilter.length, probVal, actualVal, athHighVal, athLowVal].filter(Boolean).length;

  // ---- Compute stats from filtered predictions (reactive to filters) ----
  const filteredStats = useMemo(() => {
    const total = filteredPredictions.length;
    const alerts = filteredPredictions.filter((p) => p.tag === 'alert');
    const nonAlerts = filteredPredictions.filter((p) => p.tag !== 'alert');
    const alertsSuccess = alerts.filter((p) => p.evaluation_result === 'success').length;
    const alertsFailed = alerts.filter((p) => p.evaluation_result === 'failed').length;
    const alertsPending = alerts.filter((p) => !p.evaluation_result || p.status === 'aktiv').length;
    const alertsExpired = alerts.filter((p) => p.evaluation_result === 'not_applicable').length;
    const alertsEval = alertsSuccess + alertsFailed;
    const successRate = alertsEval > 0 ? (alertsSuccess / alertsEval) * 100 : 0;

    let profitSum = 0;
    let lossSum = 0;
    for (const p of alerts) {
      if (p.actual_price_change_pct != null && (p.evaluation_result === 'success' || p.evaluation_result === 'failed')) {
        if (p.actual_price_change_pct > 0) profitSum += p.actual_price_change_pct;
        else lossSum += p.actual_price_change_pct;
      }
    }
    const totalPerf = profitSum + lossSum;

    return {
      total,
      alertsCount: alerts.length,
      nonAlertsCount: nonAlerts.length,
      alertsSuccess,
      alertsFailed,
      alertsPending,
      alertsExpired,
      alertsEvaluated: alertsEval,
      successRate,
      totalPerf,
      profitSum,
      lossSum,
    };
  }, [filteredPredictions]);

  const clearFilters = useCallback(() => {
    setCoinIdFilter(''); setTagFilter([]); setEvalFilter([]);
    setProbVal(''); setActualVal(''); setAthHighVal(''); setAthLowVal('');
    setPage(1);
  }, []);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await serverApi.deleteModelPredictions(modelId);
      setResetOpen(false);
      queryClient.invalidateQueries({ queryKey: ['server', 'model-predictions', modelId] });
      queryClient.invalidateQueries({ queryKey: ['server', 'alert-statistics', modelId] });
    } catch (err) { console.error('Delete failed:', err); }
    finally { setIsDeleting(false); }
  };

  // ---- Helpers ----
  const fmtDate = (s?: string) => {
    if (!s) return '-';
    try { return new Date(s).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return s; }
  };
  const fmtPct = (v?: number) => { if (v == null) return '-'; return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`; };
  const pctCol = (v?: number) => v == null ? 'text.secondary' : v >= 0 ? 'success.main' : 'error.main';
  const tagColor = (t: string): 'error' | 'success' | 'warning' | 'default' => ({ negativ: 'error' as const, positiv: 'success' as const, alert: 'warning' as const })[t] || 'default';

  const evalChip = (r?: string) => {
    const sx = { height: 22, fontSize: '0.7rem', fontWeight: 600 };
    switch (r) {
      case 'success': return <Chip icon={<SuccessIcon sx={{ fontSize: 13 }} />} label="Success" size="small" color="success" sx={sx} />;
      case 'failed': return <Chip icon={<FailedIcon sx={{ fontSize: 13 }} />} label="Failed" size="small" color="error" sx={sx} />;
      case 'not_applicable': return <Chip icon={<ExpiredIcon sx={{ fontSize: 13 }} />} label="Expired" size="small" sx={{ ...sx, bgcolor: 'rgba(255,255,255,0.08)' }} />;
      default: return <Chip icon={<WaitIcon sx={{ fontSize: 13 }} />} label="Pending" size="small" sx={{ ...sx, bgcolor: 'rgba(255, 193, 7, 0.12)', color: 'warning.main' }} />;
    }
  };

  // ---- Loading ----
  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <MuiLink component="button" variant="body2" onClick={() => navigate('/predictions')} sx={{ cursor: 'pointer' }}>Models</MuiLink>
        <MuiLink component="button" variant="body2" onClick={() => navigate(`/predictions/models/${modelId}`)} sx={{ cursor: 'pointer' }}>{modelName}</MuiLink>
        <Typography color="text.primary">Logs</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', sm: '1.75rem' }, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ListIcon sx={{ color: '#00d4ff' }} /> Prediction Logs
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {modelName} &middot; {filteredPredictions.length.toLocaleString()} of {allPredictions.length.toLocaleString()} entries
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isRefetching} size="small" sx={{ borderColor: 'rgba(0, 212, 255, 0.3)', color: '#00d4ff' }}>
            {isRefetching ? 'Loading...' : 'Refresh'}
          </Button>
          <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setResetOpen(true)} size="small">
            Reset
          </Button>
          <Button startIcon={<BackIcon />} onClick={() => navigate(`/predictions/models/${modelId}`)} variant="outlined" size="small">
            Back
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>Error: {(error as Error).message}</Alert>}

      {/* ================================================================ */}
      {/* STATISTICS PANEL (computed from filtered predictions)            */}
      {/* ================================================================ */}
      {allPredictions.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>

          {/* Overview panel */}
          <Box sx={panelSx('#00d4ff', '#00d4ff')}>
            <Typography variant="caption" sx={sectionLabel('#00d4ff')}>Overview</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
              <StatItem
                icon={<SpeedIcon fontSize="small" sx={{ color: '#00d4ff' }} />}
                value={filteredStats.total.toLocaleString()}
                label="Total Predictions"
                color="#00d4ff"
              />
              <StatItem
                icon={<NotificationsIcon fontSize="small" sx={{ color: '#ffb300' }} />}
                value={filteredStats.alertsCount.toLocaleString()}
                label="Alerts"
                color="#ffb300"
              />
              <StatItem
                icon={<NonAlertsIcon fontSize="small" sx={{ color: 'rgba(255,255,255,0.5)' }} />}
                value={filteredStats.nonAlertsCount.toLocaleString()}
                label="Non-Alerts"
                color="rgba(255,255,255,0.5)"
              />
              <StatItem
                icon={<ShowChartIcon fontSize="small" sx={{ color: filteredStats.alertsEvaluated > 0 ? '#00d4ff' : 'rgba(255,255,255,0.3)' }} />}
                value={filteredStats.alertsEvaluated > 0 ? `${filteredStats.successRate.toFixed(0)}%` : '-'}
                label="Alert Success Rate"
                color={filteredStats.alertsEvaluated > 0 ? (filteredStats.successRate >= 50 ? '#4caf50' : '#f44336') : 'rgba(255,255,255,0.5)'}
              />
            </Box>
          </Box>

          {/* Alert Evaluation panel */}
          <Box sx={panelSx('#ffb300', '#ffb300')}>
            <Typography variant="caption" sx={sectionLabel('#ffb300')}>Alert Evaluation</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
              <StatItem
                icon={<CheckCircleOutlineIcon fontSize="small" sx={{ color: '#4caf50' }} />}
                value={filteredStats.alertsSuccess}
                label="Success"
                color="#4caf50"
              />
              <StatItem
                icon={<HighlightOffIcon fontSize="small" sx={{ color: '#f44336' }} />}
                value={filteredStats.alertsFailed}
                label="Failed"
                color="#f44336"
              />
              <StatItem
                icon={<HourglassTopIcon fontSize="small" sx={{ color: 'rgba(255,255,255,0.5)' }} />}
                value={filteredStats.alertsPending}
                label="Pending"
                color="rgba(255,255,255,0.5)"
              />
              <StatItem
                icon={<ExpiredIcon fontSize="small" sx={{ color: 'rgba(255,255,255,0.35)' }} />}
                value={filteredStats.alertsExpired}
                label="Expired"
                color="rgba(255,255,255,0.5)"
              />
            </Box>
          </Box>

          {/* Performance panel */}
          <Box sx={panelSx(filteredStats.totalPerf >= 0 ? '#4caf50' : '#f44336', filteredStats.totalPerf >= 0 ? '#4caf50' : '#f44336')}>
            <Typography variant="caption" sx={sectionLabel(filteredStats.totalPerf >= 0 ? '#4caf50' : '#f44336')}>Performance</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
              <StatItem
                icon={<ShowChartIcon fontSize="small" sx={{ color: filteredStats.totalPerf >= 0 ? '#4caf50' : '#f44336' }} />}
                value={`${filteredStats.totalPerf >= 0 ? '+' : ''}${filteredStats.totalPerf.toFixed(1)}%`}
                label="Total"
                color={filteredStats.totalPerf >= 0 ? '#4caf50' : '#f44336'}
              />
              <StatItem
                icon={<ProfitIcon fontSize="small" sx={{ color: '#4caf50' }} />}
                value={`+${filteredStats.profitSum.toFixed(1)}%`}
                label="Profit Sum"
                color="#4caf50"
              />
              <StatItem
                icon={<TrendingDownIcon fontSize="small" sx={{ color: '#f44336' }} />}
                value={`${filteredStats.lossSum.toFixed(1)}%`}
                label="Loss Sum"
                color="#f44336"
              />
              <StatItem
                icon={<NotificationsIcon fontSize="small" sx={{ color: 'rgba(255,255,255,0.5)' }} />}
                value={filteredStats.alertsEvaluated}
                label="Evaluated"
                color="rgba(255,255,255,0.5)"
              />
            </Box>
          </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* FILTERS                                                          */}
      {/* ================================================================ */}
      <Box
        sx={{
          mb: 3,
          borderRadius: 2,
          border: '1px solid rgba(255,255,255,0.08)',
          bgcolor: 'rgba(255,255,255,0.02)',
          overflow: 'hidden',
        }}
      >
        {/* Filter header (always visible) */}
        <Box
          onClick={() => setFiltersOpen(!filtersOpen)}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 2,
            py: 1.25,
            cursor: 'pointer',
            '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.04)' },
            transition: 'background 0.2s',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterIcon sx={{ fontSize: 18, color: '#00d4ff' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
              Filters
            </Typography>
            {activeFilterCount > 0 && (
              <Chip
                label={activeFilterCount}
                size="small"
                sx={{ height: 20, minWidth: 20, fontSize: '0.7rem', fontWeight: 700, bgcolor: 'rgba(0, 212, 255, 0.15)', color: '#00d4ff' }}
              />
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {activeFilterCount > 0 && (
              <Button
                size="small"
                onClick={(e) => { e.stopPropagation(); clearFilters(); }}
                sx={{ fontSize: '0.7rem', textTransform: 'none', color: '#ffb300', minWidth: 'auto', px: 1 }}
              >
                Clear all
              </Button>
            )}
            {filtersOpen ? <ExpandLessIcon sx={{ fontSize: 18, color: 'text.secondary' }} /> : <ExpandMoreIcon sx={{ fontSize: 18, color: 'text.secondary' }} />}
          </Box>
        </Box>

        {/* Filter body (collapsible) */}
        <Collapse in={filtersOpen}>
          <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
            {/* Row 1 */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="Search Coin ID..."
                value={coinIdFilter}
                onChange={(e) => { setCoinIdFilter(e.target.value); setPage(1); }}
                sx={{ width: 200 }}
                slotProps={{
                  input: {
                    startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></InputAdornment>,
                  },
                }}
              />
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel sx={{ fontSize: '0.85rem' }}>Tag</InputLabel>
                <Select
                  multiple
                  value={tagFilter}
                  onChange={(e) => { setTagFilter(e.target.value as string[]); setPage(1); }}
                  label="Tag"
                  renderValue={(sel) => (sel as string[]).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')}
                  sx={{ fontSize: '0.85rem' }}
                >
                  <MenuItem value="alert">Alert</MenuItem>
                  <MenuItem value="positiv">Positive</MenuItem>
                  <MenuItem value="negativ">Negative</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel sx={{ fontSize: '0.85rem' }}>Evaluation</InputLabel>
                <Select
                  multiple
                  value={evalFilter}
                  onChange={(e) => { setEvalFilter(e.target.value as string[]); setPage(1); }}
                  label="Evaluation"
                  renderValue={(sel) => (sel as string[]).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')}
                  sx={{ fontSize: '0.85rem' }}
                >
                  <MenuItem value="success">Success</MenuItem>
                  <MenuItem value="failed">Failed</MenuItem>
                  <MenuItem value="wait">Pending</MenuItem>
                  <MenuItem value="not_applicable">Expired</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Row 2 */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <OpFilter label="Prob" op={probOp} val={probVal} onOpChange={setProbOp} onValChange={(v) => { setProbVal(v); setPage(1); }} />
              <OpFilter label="Actual" op={actualOp} val={actualVal} onOpChange={setActualOp} onValChange={(v) => { setActualVal(v); setPage(1); }} />
              <OpFilter label="ATH Hi" op={athHighOp} val={athHighVal} onOpChange={setAthHighOp} onValChange={(v) => { setAthHighVal(v); setPage(1); }} />
              <OpFilter label="ATH Lo" op={athLowOp} val={athLowVal} onOpChange={setAthLowOp} onValChange={(v) => { setAthLowVal(v); setPage(1); }} />
            </Box>
          </Box>
        </Collapse>
      </Box>

      {/* ================================================================ */}
      {/* PAGINATION BAR                                                   */}
      {/* ================================================================ */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
          {filteredPredictions.length.toLocaleString()} results
          {!showAll && totalPages > 1 && <> &middot; Page {page}/{totalPages}</>}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FormControlLabel
            control={<Switch size="small" checked={showAll} onChange={(e) => { setShowAll(e.target.checked); setPage(1); }} />}
            label={<Typography variant="caption" sx={{ fontSize: '0.75rem' }}>All</Typography>}
            sx={{ mr: 0 }}
          />
          {!showAll && totalPages > 1 && (
            <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} size="small" color="primary" siblingCount={1} />
          )}
        </Box>
      </Box>

      {/* ================================================================ */}
      {/* TABLE                                                            */}
      {/* ================================================================ */}
      {rows.length === 0 ? (
        <Card sx={{ ...cardSx, textAlign: 'center', py: 6 }}>
          <CardContent>
            <ListIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1.5, opacity: 0.5 }} />
            <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 600 }}>
              {activeFilterCount ? 'No matching logs' : 'No prediction logs yet'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {activeFilterCount ? 'Try adjusting your filters.' : 'Logs will appear as the model makes predictions.'}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {rows.map((pred) => {
            const targetPct = pred.price_change_percent ?? model?.price_change_percent;
            const targetDir = pred.target_direction || model?.target_direction;
            return (
              <Card
                key={pred.id}
                sx={{ ...cardSx, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.06)' }, transition: 'background 0.15s' }}
                onClick={() => navigate(`/predictions/coin/${modelId}/${encodeURIComponent(pred.coin_id)}`)}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  {/* Row 1: Coin ID + Chips + Probability */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Tooltip title={pred.coin_id} placement="top">
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#00d4ff' }}
                        >
                          {pred.coin_id.slice(0, 6)}..{pred.coin_id.slice(-4)}
                        </Typography>
                      </Tooltip>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(pred.coin_id); }} sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1 } }}>
                        <CopyIcon sx={{ fontSize: 13 }} />
                      </IconButton>
                      <Chip label={pred.tag} size="small" color={tagColor(pred.tag)}
                        sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, textTransform: 'capitalize' }} />
                      {evalChip(pred.evaluation_result)}
                    </Box>
                    <Typography variant="body2" sx={{
                      fontWeight: 700, fontSize: '0.85rem', fontFamily: 'monospace',
                      color: pred.probability >= 0.7 ? '#4caf50' : pred.probability >= 0.5 ? '#ffb300' : '#f44336',
                    }}>
                      {(pred.probability * 100).toFixed(1)}%
                    </Typography>
                  </Box>

                  {/* Row 2: ATH Hi / ATH Lo / Actual / Target */}
                  <Box sx={{ display: 'flex', gap: { xs: 1.5, sm: 3 }, flexWrap: 'wrap', mb: 0.75 }}>
                    <Box>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>ATH Hi</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                        {pred.ath_highest_pct != null ? (
                          <>
                            <TrendingUpIcon sx={{ fontSize: 12, color: pctCol(pred.ath_highest_pct) }} />
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 500, color: pctCol(pred.ath_highest_pct) }}>
                              {fmtPct(pred.ath_highest_pct)}
                            </Typography>
                          </>
                        ) : <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>-</Typography>}
                      </Box>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>ATH Lo</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                        {pred.ath_lowest_pct != null ? (
                          <>
                            <TrendingDownIcon sx={{ fontSize: 12, color: pctCol(pred.ath_lowest_pct) }} />
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 500, color: pctCol(pred.ath_lowest_pct) }}>
                              {fmtPct(pred.ath_lowest_pct)}
                            </Typography>
                          </>
                        ) : <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>-</Typography>}
                      </Box>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>Actual</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: pctCol(pred.actual_price_change_pct) }}>
                        {fmtPct(pred.actual_price_change_pct)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem' }}>Target</Typography>
                      {targetPct != null ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                          <Typography variant="body2" sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                            {targetPct}%
                          </Typography>
                          {targetDir === 'up'
                            ? <TrendingUpIcon sx={{ fontSize: 12, color: '#4caf50' }} />
                            : targetDir === 'down'
                              ? <TrendingDownIcon sx={{ fontSize: 12, color: '#f44336' }} />
                              : null}
                        </Box>
                      ) : <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>-</Typography>}
                    </Box>
                  </Box>

                  {/* Row 3: Alert Time + Eval Time */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>
                      {fmtDate(pred.prediction_timestamp || pred.created_at)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>
                      {pred.evaluated_at ? `Eval: ${fmtDate(pred.evaluated_at)}` : ''}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* Bottom pagination */}
      {!showAll && totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} size="small" color="primary" siblingCount={1} />
        </Box>
      )}

      {/* Footer */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2, mb: 1, opacity: 0.6 }}>
        Auto-refresh 15s &middot; {filteredPredictions.length.toLocaleString()} entries{!showAll && totalPages > 1 ? ` &middot; Page ${page}/${totalPages}` : ''}
      </Typography>

      {/* Reset Dialog */}
      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} PaperProps={{ sx: { bgcolor: '#1a1a2e', border: '1px solid rgba(244, 67, 54, 0.3)' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Reset All Logs?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete all {allPredictions.length.toLocaleString()} prediction logs for <strong>{modelName}</strong>.
            Statistics and evaluation data will be lost. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResetOpen(false)} disabled={isDeleting}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete All'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ModelLogs;
