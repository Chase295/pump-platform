/**
 * CoinDetails Page
 * Coin analysis page showing price history chart, recent predictions, evaluation results.
 * URL params: modelId, coinId.
 * Uses serverApi.getCoinDetails().
 */
import React, { useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  TrendingUp as UpIcon,
  TrendingDown as DownIcon,
  CheckCircle as SuccessIcon,
  Cancel as FailedIcon,
  HourglassEmpty as PendingIcon,
  ShowChart as ChartIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts';

import { serverApi } from '../../services/api';
import type { CoinDetailsResponse, PriceDataPoint, PredictionMarker, EvaluationMarker } from '../../types/server';

const CoinDetails: React.FC = () => {
  const { modelId, coinId } = useParams<{ modelId: string; coinId: string }>();
  const navigate = useNavigate();
  const numericModelId = Number(modelId);

  // Load coin details
  const { data: coinResponse, isLoading, error } = useQuery({
    queryKey: ['server', 'coin-details', numericModelId, coinId],
    queryFn: () => serverApi.getCoinDetails(numericModelId, coinId!),
    enabled: !!numericModelId && !!coinId,
    refetchInterval: 30000,
  });

  const coinData: CoinDetailsResponse | undefined = coinResponse?.data;

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!coinData?.price_history) return [];
    return coinData.price_history.map((p: PriceDataPoint) => ({
      time: new Date(p.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      timestamp: p.timestamp,
      price: p.price_close,
      volume: p.volume_sol,
      marketCap: p.market_cap_close,
    }));
  }, [coinData]);

  // Prediction markers on chart
  const predictionDots = useMemo(() => {
    if (!coinData?.predictions || !chartData.length) return [];
    return coinData.predictions.map((pred: PredictionMarker) => {
      const predTime = new Date(pred.timestamp || pred.prediction_timestamp || '').getTime();
      const closest = chartData.reduce((prev, curr) => {
        const prevDiff = Math.abs(new Date(prev.timestamp).getTime() - predTime);
        const currDiff = Math.abs(new Date(curr.timestamp).getTime() - predTime);
        return currDiff < prevDiff ? curr : prev;
      });
      return {
        ...pred,
        chartTime: closest.time,
        chartPrice: closest.price,
      };
    });
  }, [coinData, chartData]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <SuccessIcon sx={{ fontSize: 16, color: 'success.main' }} />;
      case 'failed':
        return <FailedIcon sx={{ fontSize: 16, color: 'error.main' }} />;
      case 'pending':
      case 'expired':
        return <PendingIcon sx={{ fontSize: 16, color: 'warning.main' }} />;
      default:
        return null;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateString;
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

  return (
    <Box>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 3 }}>
        <MuiLink component="button" variant="body2" onClick={() => navigate('/predictions')} sx={{ cursor: 'pointer' }}>
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', sm: '1.8rem' } }}>
            Coin Analysis
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ wordBreak: 'break-all', maxWidth: 600 }}
          >
            {coinId}
          </Typography>
        </Box>
        <Button startIcon={<BackIcon />} onClick={() => navigate(-1)} variant="outlined" size="small">
          Back
        </Button>
      </Box>

      {/* Price Chart */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <ChartIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Price History
            </Typography>
            <Chip
              label={`${chartData.length} data points`}
              size="small"
              variant="outlined"
              sx={{ ml: 'auto' }}
            />
          </Box>

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                <XAxis
                  dataKey="time"
                  stroke="rgba(255, 255, 255, 0.5)"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
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
                  }}
                  formatter={(value: number) => [value?.toExponential(4), 'Price']}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#00d4ff"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#00d4ff' }}
                />
                {/* Prediction markers */}
                {predictionDots.map((pred, idx) => (
                  <ReferenceDot
                    key={idx}
                    x={pred.chartTime}
                    y={pred.chartPrice}
                    r={6}
                    fill={pred.is_alert ? '#ff9800' : pred.prediction === 1 ? '#4caf50' : '#f44336'}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                ))}
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

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 3 }}>
        {/* Predictions Table */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Predictions ({coinData.predictions?.length || 0})
            </Typography>

            {coinData.predictions && coinData.predictions.length > 0 ? (
              <TableContainer
                component={Paper}
                sx={{ bgcolor: 'transparent', maxHeight: 400, overflow: 'auto' }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.3)' }}>Time</TableCell>
                      <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.3)' }}>Prediction</TableCell>
                      <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.3)' }}>Probability</TableCell>
                      <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.3)' }}>Alert</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {coinData.predictions.map((pred: PredictionMarker) => (
                      <TableRow key={pred.id}>
                        <TableCell>
                          <Typography variant="caption">
                            {formatDate(pred.timestamp || pred.prediction_timestamp)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {pred.prediction === 1 ? (
                            <Chip
                              icon={<UpIcon />}
                              label="Positive"
                              size="small"
                              color="success"
                              variant="outlined"
                              sx={{ height: 22, fontSize: '0.7rem' }}
                            />
                          ) : (
                            <Chip
                              icon={<DownIcon />}
                              label="Negative"
                              size="small"
                              color="error"
                              variant="outlined"
                              sx={{ height: 22, fontSize: '0.7rem' }}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              color: pred.probability >= 0.7 ? 'success.main' : 'text.primary',
                            }}
                          >
                            {(pred.probability * 100).toFixed(1)}%
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {pred.is_alert ? (
                            <Chip label="Alert" size="small" color="warning" sx={{ height: 20, fontSize: '0.65rem' }} />
                          ) : (
                            <Typography variant="caption" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No predictions for this coin.
              </Typography>
            )}
          </CardContent>
        </Card>

        {/* Evaluations Table */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Evaluations ({coinData.evaluations?.length || 0})
            </Typography>

            {coinData.evaluations && coinData.evaluations.length > 0 ? (
              <TableContainer
                component={Paper}
                sx={{ bgcolor: 'transparent', maxHeight: 400, overflow: 'auto' }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.3)' }}>Time</TableCell>
                      <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.3)' }}>Status</TableCell>
                      <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.3)' }}>Actual Change</TableCell>
                      <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.3)' }}>Probability</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {coinData.evaluations.map((ev: EvaluationMarker) => (
                      <TableRow key={ev.id}>
                        <TableCell>
                          <Typography variant="caption">
                            {formatDate(ev.prediction_timestamp)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {getStatusIcon(ev.status)}
                            <Chip
                              label={ev.status}
                              size="small"
                              color={
                                ev.status === 'success'
                                  ? 'success'
                                  : ev.status === 'failed'
                                    ? 'error'
                                    : 'warning'
                              }
                              variant="outlined"
                              sx={{ height: 22, fontSize: '0.7rem' }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell>
                          {ev.actual_price_change !== undefined ? (
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 600,
                                color: (ev.actual_price_change || 0) >= 0 ? 'success.main' : 'error.main',
                              }}
                            >
                              {(ev.actual_price_change || 0) >= 0 ? '+' : ''}
                              {ev.actual_price_change?.toFixed(2)}%
                            </Typography>
                          ) : (
                            <Typography variant="caption" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {ev.probability !== undefined ? `${(ev.probability * 100).toFixed(1)}%` : '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
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
