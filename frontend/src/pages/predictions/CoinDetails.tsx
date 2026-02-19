/**
 * CoinDetails Page
 * Coin analysis with interactive alert selection on the price chart.
 * Uses a NUMERIC X-axis (timestampMs) so that Recharts ReferenceLine,
 * ReferenceArea, and ReferenceDot work natively.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Alert,
  Button,
  Chip,
  Breadcrumbs,
  Link as MuiLink,
  CircularProgress,
  Checkbox,
  Grid,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  TrendingUp as UpIcon,
  TrendingDown as DownIcon,
  CheckCircle as SuccessIcon,
  Cancel as FailedIcon,
  HourglassEmpty as PendingIcon,
  ShowChart as ChartIcon,
  Block as ExpiredIcon,
  SelectAll as SelectAllIcon,
  Deselect as DeselectIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
} from 'recharts';

import { serverApi } from '../../services/api';
import type { CoinDetailsResponse, PredictionMarker, EvaluationMarker } from '../../types/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ChartDataPoint {
  timestampMs: number;   // X-axis: milliseconds
  timestamp: string;     // Original ISO string
  price: number | undefined;
}

interface AlertPair {
  id: number;
  pred: PredictionMarker;
  alertMs: number;                 // Alert timestamp in ms
  alertPrice: number | undefined;
  evalMs: number | null;           // Eval timestamp in ms (null = pending)
  evalPrice: number | undefined;
  resultColor: string;             // #4caf50 / #f44336 / #ffb300
}

// Time formatter shared by XAxis + Tooltip
const fmtTimeMs = (ms: number) =>
  new Date(ms).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const CoinDetails: React.FC = () => {
  const { modelId, coinId } = useParams<{ modelId: string; coinId: string }>();
  const navigate = useNavigate();
  const numericModelId = Number(modelId);

  // Selection state: set of prediction IDs that are active on the chart
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: coinResponse, isLoading, error } = useQuery({
    queryKey: ['server', 'coin-details', numericModelId, coinId],
    queryFn: () => serverApi.getCoinDetails(numericModelId, coinId!),
    enabled: !!numericModelId && !!coinId,
    refetchInterval: 30000,
  });

  const coinData: CoinDetailsResponse | undefined = coinResponse?.data;

  // Chart data: merge price_history + synthetic points at alert/eval timestamps
  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!coinData?.price_history) return [];

    const pointMap = new Map<number, { timestamp: string; price: number | undefined }>();
    for (const p of coinData.price_history) {
      const ms = new Date(p.timestamp).getTime();
      if (!isNaN(ms)) pointMap.set(ms, { timestamp: p.timestamp, price: p.price_close });
    }

    // Inject synthetic points at prediction & evaluation timestamps
    if (coinData.predictions) {
      for (const pred of coinData.predictions) {
        const predTs = pred.prediction_timestamp || pred.timestamp;
        if (predTs && pred.price_close_at_prediction != null) {
          const ms = new Date(predTs).getTime();
          if (!isNaN(ms) && !pointMap.has(ms)) {
            pointMap.set(ms, { timestamp: predTs, price: pred.price_close_at_prediction });
          }
        }
        const evalTs = pred.evaluation_timestamp;
        if (evalTs && pred.price_close_at_evaluation != null) {
          const ms = new Date(evalTs).getTime();
          if (!isNaN(ms) && !pointMap.has(ms)) {
            pointMap.set(ms, { timestamp: evalTs, price: pred.price_close_at_evaluation });
          }
        }
      }
    }

    return Array.from(pointMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ms, val]) => ({
        timestampMs: ms,
        timestamp: val.timestamp,
        price: val.price,
      }));
  }, [coinData]);

  // All alert pairs — directly using ms timestamps
  const alertPairs: AlertPair[] = useMemo(() => {
    if (!coinData?.predictions || !chartData.length) return [];
    return coinData.predictions
      .filter((p: PredictionMarker) => p.is_alert)
      .map((pred: PredictionMarker) => {
        const predTs = pred.prediction_timestamp || pred.timestamp || '';
        const evalTs = pred.evaluation_timestamp || '';
        const alertMs = new Date(predTs).getTime();
        const evalMs = evalTs ? new Date(evalTs).getTime() : null;

        const alertPrice =
          pred.price_close_at_prediction ??
          chartData.find((p) => p.timestampMs === alertMs)?.price;
        const evalPrice =
          pred.price_close_at_evaluation ??
          (evalMs ? chartData.find((p) => p.timestampMs === evalMs)?.price : undefined);

        let resultColor = '#ffb300';
        if (pred.evaluation_result === 'success') resultColor = '#4caf50';
        else if (pred.evaluation_result === 'failed') resultColor = '#f44336';
        else if (pred.evaluation_result === 'not_applicable') resultColor = 'rgba(255,255,255,0.3)';

        return { id: pred.id, pred, alertMs, alertPrice, evalMs, evalPrice, resultColor };
      })
      .filter((p) => !isNaN(p.alertMs));
  }, [coinData, chartData]);

  // Visible (selected) pairs for chart rendering
  const visiblePairs = useMemo(
    () => (selectedIds.size === 0 ? [] : alertPairs.filter((p) => selectedIds.has(p.id))),
    [alertPairs, selectedIds],
  );

  // Selection handlers
  const toggleAlert = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(alertPairs.map((p) => p.id)));
  }, [alertPairs]);

  const selectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Stats computed from chart data and predictions
  const stats = useMemo(() => {
    if (!coinData?.predictions || !chartData.length) return null;

    const startPrice = chartData[0]?.price;
    const endPrice = chartData[chartData.length - 1]?.price;
    const priceChangePct =
      startPrice && endPrice ? ((endPrice - startPrice) / startPrice) * 100 : null;

    const total = coinData.predictions.length;
    const alerts = coinData.predictions.filter((p) => p.is_alert).length;
    const nonAlerts = total - alerts;

    const evaluated = coinData.predictions.filter((p) => p.evaluation_result);
    const success = evaluated.filter((p) => p.evaluation_result === 'success').length;
    const failed = evaluated.filter((p) => p.evaluation_result === 'failed').length;
    const pending = coinData.predictions.filter(
      (p) => p.is_alert && !p.evaluation_result,
    ).length;

    return { startPrice, endPrice, priceChangePct, total, alerts, nonAlerts, success, failed, pending };
  }, [coinData, chartData]);

  // Helpers
  const formatDate = (s?: string) => {
    if (!s) return '-';
    try {
      return new Date(s).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return s;
    }
  };

  const fmtPct = (v?: number) => {
    if (v == null) return '-';
    return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
  };

  const getStatusIcon = (s: string) => {
    switch (s) {
      case 'success':
        return <SuccessIcon sx={{ fontSize: 16, color: 'success.main' }} />;
      case 'failed':
        return <FailedIcon sx={{ fontSize: 16, color: 'error.main' }} />;
      case 'not_applicable':
        return <ExpiredIcon sx={{ fontSize: 16, color: 'text.secondary' }} />;
      default:
        return <PendingIcon sx={{ fontSize: 16, color: 'warning.main' }} />;
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !coinData) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 3 }}>
          Error loading coin details: {(error as Error)?.message || 'Data not found'}
        </Alert>
        <Button startIcon={<BackIcon />} onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </Box>
    );
  }

  const shortCoinId = coinId ? `${coinId.slice(0, 6)}...${coinId.slice(-4)}` : '';
  const alertCount = alertPairs.length;
  const selectedCount = selectedIds.size;

  return (
    <Box>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 3 }}>
        <MuiLink
          component="button"
          variant="body2"
          onClick={() => navigate('/predictions')}
          sx={{ cursor: 'pointer' }}
        >
          Models
        </MuiLink>
        <MuiLink
          component="button"
          variant="body2"
          onClick={() => navigate(`/predictions/models/${numericModelId}`)}
          sx={{ cursor: 'pointer' }}
        >
          Model #{numericModelId}
        </MuiLink>
        <Typography color="text.primary">{shortCoinId}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', sm: '1.8rem' } }}>
            Coin Analysis
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all', maxWidth: 600 }}>
            {coinId}
          </Typography>
        </Box>
        <Button startIcon={<BackIcon />} onClick={() => navigate(-1)} variant="outlined" size="small">
          Back
        </Button>
      </Box>

      {/* ================================================================ */}
      {/* STATS CARDS                                                       */}
      {/* ================================================================ */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {/* Price Development */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card sx={{ border: '1px solid rgba(255,255,255,0.08)', height: '100%' }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Price Development
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  {stats.priceChangePct != null ? (
                    <>
                      {stats.priceChangePct >= 0 ? (
                        <UpIcon sx={{ fontSize: 20, color: '#4caf50' }} />
                      ) : (
                        <DownIcon sx={{ fontSize: 20, color: '#f44336' }} />
                      )}
                      <Typography
                        variant="h6"
                        sx={{
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          color: stats.priceChangePct >= 0 ? '#4caf50' : '#f44336',
                        }}
                      >
                        {fmtPct(stats.priceChangePct)}
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No data</Typography>
                  )}
                </Box>
                {stats.startPrice != null && stats.endPrice != null && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontFamily: 'monospace' }}>
                    {stats.startPrice.toExponential(2)} → {stats.endPrice.toExponential(2)}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Predictions Overview */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card sx={{ border: '1px solid rgba(255,255,255,0.08)', height: '100%' }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Predictions
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {stats.total}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                  <Chip
                    label={`${stats.alerts} Alerts`}
                    size="small"
                    sx={{ height: 20, fontSize: '0.65rem', bgcolor: 'rgba(255,152,0,0.15)', color: '#ffb300' }}
                  />
                  <Chip
                    label={`${stats.nonAlerts} Non-Alert`}
                    size="small"
                    sx={{ height: 20, fontSize: '0.65rem', bgcolor: 'rgba(255,255,255,0.06)', color: 'text.secondary' }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Evaluations Overview */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card sx={{ border: '1px solid rgba(255,255,255,0.08)', height: '100%' }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Evaluations
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    label={`${stats.success} Success`}
                    size="small"
                    sx={{ height: 22, fontSize: '0.65rem', bgcolor: 'rgba(76,175,80,0.15)', color: '#4caf50', fontWeight: 600 }}
                  />
                  <Chip
                    label={`${stats.failed} Failed`}
                    size="small"
                    sx={{ height: 22, fontSize: '0.65rem', bgcolor: 'rgba(244,67,54,0.15)', color: '#f44336', fontWeight: 600 }}
                  />
                  <Chip
                    label={`${stats.pending} Pending`}
                    size="small"
                    sx={{ height: 22, fontSize: '0.65rem', bgcolor: 'rgba(255,193,7,0.12)', color: '#ffb300', fontWeight: 600 }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ================================================================ */}
      {/* PRICE CHART                                                      */}
      {/* ================================================================ */}
      <Card sx={{ mb: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <ChartIcon sx={{ color: '#00d4ff' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Price History
            </Typography>
            <Box sx={{ ml: 'auto', display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip label={`${chartData.length} points`} size="small" variant="outlined" />
              {selectedCount > 0 && (
                <Chip
                  label={`${selectedCount} alert${selectedCount > 1 ? 's' : ''} shown`}
                  size="small"
                  sx={{ bgcolor: 'rgba(255, 152, 0, 0.15)', color: '#ffb300', fontWeight: 600 }}
                />
              )}
            </Box>
          </Box>

          {/* Legend */}
          <Box sx={{ display: 'flex', gap: 2.5, mb: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ff9800', border: '2px solid #fff' }} />
              <Typography variant="caption" color="text.secondary">
                Alert (Buy)
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: '#4caf50', border: '2px solid #fff' }} />
              <Typography variant="caption" color="text.secondary">
                Eval: Success
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: '#f44336', border: '2px solid #fff' }} />
              <Typography variant="caption" color="text.secondary">
                Eval: Failed
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: '#ffb300', border: '2px solid #fff' }} />
              <Typography variant="caption" color="text.secondary">
                Eval: Pending
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 24, height: 0, borderTop: '2.5px dashed rgba(255,255,255,0.5)' }} />
              <Typography variant="caption" color="text.secondary">
                Buy → Eval
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 16,
                  height: 10,
                  bgcolor: 'rgba(255, 152, 0, 0.15)',
                  border: '1px dashed rgba(255,152,0,0.4)',
                  borderRadius: 0.5,
                }}
              />
              <Typography variant="caption" color="text.secondary">
                Alert Timespan
              </Typography>
            </Box>
          </Box>

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" />
                <XAxis
                  dataKey="timestampMs"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  stroke="rgba(255, 255, 255, 0.5)"
                  tick={{ fontSize: 10 }}
                  tickFormatter={fmtTimeMs}
                />
                <YAxis
                  stroke="rgba(255, 255, 255, 0.5)"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.toExponential(2)}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 15, 35, 0.95)',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 12,
                  }}
                  labelFormatter={(ms) => `Zeit: ${fmtTimeMs(ms as number)}`}
                  formatter={(value: number | undefined) => [
                    value !== undefined ? value.toExponential(4) : '0',
                    'Price',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#00d4ff"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#00d4ff' }}
                  isAnimationActive={false}
                />

                {/* === Native Recharts overlays (numeric X-axis makes these work) === */}

                {/* Shaded areas: alert → eval timespan */}
                {visiblePairs.map((pair) =>
                  pair.evalMs != null ? (
                    <ReferenceArea
                      key={`area-${pair.id}`}
                      x1={pair.alertMs}
                      x2={pair.evalMs}
                      fill={pair.resultColor}
                      fillOpacity={0.1}
                      stroke={pair.resultColor}
                      strokeDasharray="4 3"
                      strokeOpacity={0.25}
                    />
                  ) : null,
                )}

                {/* Vertical dashed lines at alert timestamps (orange) */}
                {visiblePairs.map((pair) => (
                  <ReferenceLine
                    key={`vline-alert-${pair.id}`}
                    x={pair.alertMs}
                    stroke="#ff9800"
                    strokeDasharray="5 4"
                    strokeWidth={1.5}
                    strokeOpacity={0.6}
                  />
                ))}

                {/* Vertical dashed lines at eval timestamps (result color) */}
                {visiblePairs.map((pair) =>
                  pair.evalMs != null ? (
                    <ReferenceLine
                      key={`vline-eval-${pair.id}`}
                      x={pair.evalMs}
                      stroke={pair.resultColor}
                      strokeDasharray="5 4"
                      strokeWidth={1.5}
                      strokeOpacity={0.6}
                    />
                  ) : null,
                )}

                {/* Alert dots (orange circles) — all alerts, dimmed when unselected */}
                {alertPairs.map((pair) => {
                  const sel = selectedIds.has(pair.id);
                  return pair.alertPrice != null ? (
                    <ReferenceDot
                      key={`adot-${pair.id}`}
                      x={pair.alertMs}
                      y={pair.alertPrice}
                      r={sel ? 8 : 5}
                      fill="#ff9800"
                      fillOpacity={sel ? 1 : 0.3}
                      stroke={sel ? '#fff' : 'none'}
                      strokeWidth={2}
                    />
                  ) : null;
                })}

                {/* Eval dots (result-colored circles) — only for selected alerts */}
                {visiblePairs.map((pair) =>
                  pair.evalMs != null && pair.evalPrice != null ? (
                    <ReferenceDot
                      key={`edot-${pair.id}`}
                      x={pair.evalMs}
                      y={pair.evalPrice}
                      r={8}
                      fill={pair.resultColor}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ) : null,
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                No price data available
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* ALERT TIMELINE (selectable cards)                                */}
      {/* ================================================================ */}
      {alertCount > 0 && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
              Alert Timeline ({alertCount})
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button
                size="small"
                startIcon={<SelectAllIcon sx={{ fontSize: 16 }} />}
                onClick={selectAll}
                sx={{
                  fontSize: '0.72rem',
                  textTransform: 'none',
                  color: '#00d4ff',
                  bgcolor: selectedCount === alertCount ? 'rgba(0, 212, 255, 0.08)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.12)' },
                }}
              >
                All
              </Button>
              <Button
                size="small"
                startIcon={<DeselectIcon sx={{ fontSize: 16 }} />}
                onClick={selectNone}
                sx={{
                  fontSize: '0.72rem',
                  textTransform: 'none',
                  color: 'text.secondary',
                  bgcolor: selectedCount === 0 ? 'rgba(255,255,255,0.04)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                None
              </Button>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {alertPairs.map((pair, pairIdx) => {
              const p = pair.pred;
              const isSelected = selectedIds.has(pair.id);
              return (
                <Card
                  key={pair.id}
                  onClick={() => toggleAlert(pair.id)}
                  sx={{
                    cursor: 'pointer',
                    border: `1px solid ${isSelected ? pair.resultColor : 'rgba(255,255,255,0.08)'}`,
                    bgcolor: isSelected ? `${pair.resultColor}10` : 'transparent',
                    opacity: isSelected ? 1 : 0.6,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      opacity: 1,
                      bgcolor: `${pair.resultColor}12`,
                      borderColor: pair.resultColor,
                    },
                  }}
                >
                  <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <Checkbox
                        checked={isSelected}
                        size="small"
                        sx={{
                          p: 0,
                          color: 'rgba(255,255,255,0.3)',
                          '&.Mui-checked': { color: pair.resultColor },
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleAlert(pair.id)}
                      />

                      <Chip
                        label={`#${pairIdx + 1}`}
                        size="small"
                        sx={{
                          height: 22,
                          minWidth: 36,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          bgcolor: isSelected ? `${pair.resultColor}25` : 'rgba(255,255,255,0.06)',
                          color: isSelected ? pair.resultColor : 'text.secondary',
                        }}
                      />

                      <Box sx={{ minWidth: 100 }}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}
                        >
                          Alert (Buy)
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                          {formatDate(p.prediction_timestamp || p.timestamp)}
                        </Typography>
                      </Box>

                      <Typography
                        sx={{
                          color: isSelected ? pair.resultColor : 'rgba(255,255,255,0.2)',
                          fontSize: '1.1rem',
                          fontWeight: 700,
                        }}
                      >
                        →
                      </Typography>

                      <Box sx={{ minWidth: 100 }}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}
                        >
                          Eval (Sell)
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                          {p.evaluation_timestamp ? formatDate(p.evaluation_timestamp) : 'pending...'}
                        </Typography>
                      </Box>

                      <Box sx={{ minWidth: 50 }}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block' }}
                        >
                          Prob
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            fontFamily: 'monospace',
                            color: p.probability >= 0.7 ? '#4caf50' : '#ffb300',
                          }}
                        >
                          {(p.probability * 100).toFixed(1)}%
                        </Typography>
                      </Box>

                      <Box>
                        {p.evaluation_result === 'success' && (
                          <Chip label="Success" size="small" color="success" sx={{ height: 22, fontSize: '0.68rem', fontWeight: 600 }} />
                        )}
                        {p.evaluation_result === 'failed' && (
                          <Chip label="Failed" size="small" color="error" sx={{ height: 22, fontSize: '0.68rem', fontWeight: 600 }} />
                        )}
                        {p.evaluation_result === 'not_applicable' && (
                          <Chip label="Expired" size="small" sx={{ height: 22, fontSize: '0.68rem', bgcolor: 'rgba(255,255,255,0.08)' }} />
                        )}
                        {!p.evaluation_result && (
                          <Chip
                            label="Pending"
                            size="small"
                            sx={{ height: 22, fontSize: '0.68rem', bgcolor: 'rgba(255, 193, 7, 0.12)', color: '#ffb300' }}
                          />
                        )}
                      </Box>

                      {p.actual_price_change_pct != null && (
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            fontFamily: 'monospace',
                            color: p.actual_price_change_pct >= 0 ? '#4caf50' : '#f44336',
                          }}
                        >
                          {fmtPct(p.actual_price_change_pct)}
                        </Typography>
                      )}

                      {p.ath_highest_pct != null && (
                        <Chip
                          icon={<UpIcon sx={{ fontSize: 12, color: '#4caf50' }} />}
                          label={fmtPct(p.ath_highest_pct)}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            fontFamily: 'monospace',
                            bgcolor: 'rgba(76, 175, 80, 0.1)',
                            color: '#4caf50',
                          }}
                        />
                      )}
                      {p.ath_lowest_pct != null && (
                        <Chip
                          icon={<DownIcon sx={{ fontSize: 12, color: '#f44336' }} />}
                          label={fmtPct(p.ath_lowest_pct)}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            fontFamily: 'monospace',
                            bgcolor: 'rgba(244, 67, 54, 0.1)',
                            color: '#f44336',
                          }}
                        />
                      )}
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        </Box>
      )}

      {/* ================================================================ */}
      {/* PREDICTIONS & EVALUATIONS (card lists)                           */}
      {/* ================================================================ */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 3 }}>
        {/* Predictions List */}
        <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, fontSize: '1rem' }}>
              Predictions ({coinData.predictions?.length || 0})
            </Typography>
            {coinData.predictions && coinData.predictions.length > 0 ? (
              <Box sx={{ maxHeight: 400, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {coinData.predictions.map((pred: PredictionMarker) => (
                  <Box
                    key={pred.id}
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    {/* Row 1: Tag + Prob + Result */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        {pred.is_alert ? (
                          <Chip label="Alert" size="small" color="warning" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }} />
                        ) : pred.prediction === 1 ? (
                          <Chip icon={<UpIcon sx={{ fontSize: 12 }} />} label="Pos" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                        ) : (
                          <Chip icon={<DownIcon sx={{ fontSize: 12 }} />} label="Neg" size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                        )}
                        {pred.evaluation_result === 'success' && (
                          <Chip icon={<SuccessIcon sx={{ fontSize: 12 }} />} label="OK" size="small" color="success" sx={{ height: 20, fontSize: '0.65rem' }} />
                        )}
                        {pred.evaluation_result === 'failed' && (
                          <Chip icon={<FailedIcon sx={{ fontSize: 12 }} />} label="Fail" size="small" color="error" sx={{ height: 20, fontSize: '0.65rem' }} />
                        )}
                        {pred.evaluation_result === 'not_applicable' && (
                          <Chip label="Exp" size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: 'rgba(255,255,255,0.08)' }} />
                        )}
                        {!pred.evaluation_result && (
                          <Chip icon={<PendingIcon sx={{ fontSize: 12 }} />} label="Wait" size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: 'rgba(255, 193, 7, 0.12)', color: '#ffb300' }} />
                        )}
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          fontFamily: 'monospace',
                          color: pred.probability >= 0.7 ? '#4caf50' : pred.probability >= 0.5 ? '#ffb300' : '#f44336',
                        }}
                      >
                        {(pred.probability * 100).toFixed(1)}%
                      </Typography>
                    </Box>
                    {/* Row 2: Time + Actual */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                        {formatDate(pred.timestamp || pred.prediction_timestamp)}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: pred.actual_price_change_pct == null ? 'text.secondary' : pred.actual_price_change_pct >= 0 ? '#4caf50' : '#f44336',
                        }}
                      >
                        {fmtPct(pred.actual_price_change_pct)}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No predictions for this coin.
              </Typography>
            )}
          </CardContent>
        </Card>

        {/* Evaluations List */}
        <Card sx={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, fontSize: '1rem' }}>
              Evaluations ({coinData.evaluations?.length || 0})
            </Typography>
            {coinData.evaluations && coinData.evaluations.length > 0 ? (
              <Box sx={{ maxHeight: 400, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {coinData.evaluations.map((ev: EvaluationMarker) => (
                  <Box
                    key={ev.id}
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    {/* Row 1: Status + Prob */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {getStatusIcon(ev.status)}
                        <Chip
                          label={ev.status}
                          size="small"
                          color={ev.status === 'success' ? 'success' : ev.status === 'failed' ? 'error' : 'warning'}
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.7rem' }}
                        />
                      </Box>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {ev.probability !== undefined ? `${(ev.probability * 100).toFixed(1)}%` : '-'}
                      </Typography>
                    </Box>
                    {/* Row 2: Time + Actual */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                        {formatDate(ev.prediction_timestamp)}
                      </Typography>
                      {ev.actual_price_change != null ? (
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            fontFamily: 'monospace',
                            fontSize: '0.78rem',
                            color: (ev.actual_price_change || 0) >= 0 ? 'success.main' : 'error.main',
                          }}
                        >
                          {fmtPct(ev.actual_price_change)}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary">-</Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No evaluations yet.
              </Typography>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};

export default CoinDetails;
