/**
 * CoinTradeDetail Page
 * Shows price chart with buy/sell markers for a specific coin.
 * Uses a NUMERIC X-axis (timestampMs) so Recharts ReferenceLine,
 * ReferenceArea, and ReferenceDot work natively.
 */
import { useMemo } from 'react';
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
  CircularProgress,
  Grid,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  TrendingUp as UpIcon,
  TrendingDown as DownIcon,
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
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
} from 'recharts';

import { buyApi } from '../../services/api';
import {
  useExchangeRate,
  fmtEur,
  fmtSol,
  fmtRelativeTime,
  CARD_SX,
  TOOLTIP_STYLE,
} from './tradingUtils';
import type { CoinTradeDetailResponse, CoinTradeDetailTrade } from '../../types/buy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ChartDataPoint {
  timestampMs: number;
  price: number | undefined;
}

interface TradePair {
  buy: CoinTradeDetailTrade;
  sell: CoinTradeDetailTrade | null;
}

// Formatters
const fmtTimeMs = (ms: number) =>
  new Date(ms).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const POS = '#4caf50';
const NEG = '#f44336';
const MUTED = 'rgba(255,255,255,0.4)';
const profitColor = (v: number) => (v >= 0 ? POS : NEG);
const signed = (v: number, s: string) => (v >= 0 ? `+${s}` : s);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const CoinTradeDetail: React.FC = () => {
  const { mint } = useParams<{ mint: string }>();
  const navigate = useNavigate();
  const { data: exchangeRate } = useExchangeRate();
  const solEur = exchangeRate?.sol_price_eur ?? 0;
  const solToEur = (sol: number) => sol * solEur;

  const { data: response, isLoading, error } = useQuery<CoinTradeDetailResponse>({
    queryKey: ['buy', 'coinTradeDetail', mint],
    queryFn: async () => (await buyApi.getCoinTradeDetail(mint!)).data,
    enabled: !!mint,
    refetchInterval: 30_000,
  });

  const coinData = response;

  // Build chart data with numeric X-axis
  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!coinData?.price_history) return [];

    const pointMap = new Map<number, number | undefined>();
    for (const p of coinData.price_history) {
      const ms = new Date(p.timestamp).getTime();
      if (!isNaN(ms)) pointMap.set(ms, p.price_close ?? undefined);
    }

    // Inject trade timestamps as synthetic chart points
    for (const t of coinData.trades) {
      const ms = new Date(t.created_at).getTime();
      if (!isNaN(ms) && !pointMap.has(ms) && t.price_at_trade > 0) {
        pointMap.set(ms, t.price_at_trade);
      }
    }

    return Array.from(pointMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ms, price]) => ({ timestampMs: ms, price }));
  }, [coinData]);

  // Trades split by action
  const buys = useMemo(
    () => (coinData?.trades ?? []).filter((t) => t.action === 'BUY'),
    [coinData],
  );
  const sells = useMemo(
    () => (coinData?.trades ?? []).filter((t) => t.action === 'SELL'),
    [coinData],
  );

  // Pair buys with next sell for ReferenceArea
  const tradePairs: TradePair[] = useMemo(() => {
    if (!coinData?.trades) return [];
    const pairs: TradePair[] = [];
    const allTrades = [...coinData.trades].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    let currentBuy: CoinTradeDetailTrade | null = null;
    for (const t of allTrades) {
      if (t.action === 'BUY') {
        if (currentBuy) pairs.push({ buy: currentBuy, sell: null });
        currentBuy = t;
      } else if (t.action === 'SELL' && currentBuy) {
        pairs.push({ buy: currentBuy, sell: t });
        currentBuy = null;
      }
    }
    if (currentBuy) pairs.push({ buy: currentBuy, sell: null });
    return pairs;
  }, [coinData]);

  // Stats
  const stats = useMemo(() => {
    if (!chartData.length || !coinData) return null;

    const startPrice = chartData[0]?.price;
    const endPrice = chartData[chartData.length - 1]?.price;
    const priceChangePct =
      startPrice && endPrice ? ((endPrice - startPrice) / startPrice) * 100 : null;

    const totalPnlSol = sells.reduce((sum, s) => sum + s.pnl_sol, 0);

    return {
      startPrice,
      endPrice,
      priceChangePct,
      buyCount: buys.length,
      sellCount: sells.length,
      totalPnlSol,
    };
  }, [chartData, coinData, buys, sells]);

  // Find price at a trade's timestamp from chart data
  const findPriceAtMs = (ms: number): number | undefined => {
    const point = chartData.find((p) => p.timestampMs === ms);
    return point?.price;
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
          Fehler beim Laden: {(error as Error)?.message || 'Keine Daten gefunden'}
        </Alert>
        <Button startIcon={<BackIcon />} onClick={() => navigate(-1)}>
          Zur\u00FCck
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Coin Trade Detail
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ wordBreak: 'break-all', maxWidth: 600, fontFamily: 'monospace', fontSize: '0.75rem' }}
          >
            {mint}
          </Typography>
        </Box>
        <Button startIcon={<BackIcon />} onClick={() => navigate(-1)} variant="outlined" size="small">
          Zur\u00FCck
        </Button>
      </Box>

      {/* ================================================================ */}
      {/* STATS CARDS                                                       */}
      {/* ================================================================ */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {/* Price Development */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card sx={{ ...CARD_SX, height: '100%' }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                >
                  Preisentwicklung
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  {stats.priceChangePct != null ? (
                    <>
                      {stats.priceChangePct >= 0 ? (
                        <UpIcon sx={{ fontSize: 20, color: POS }} />
                      ) : (
                        <DownIcon sx={{ fontSize: 20, color: NEG }} />
                      )}
                      <Typography
                        variant="h6"
                        sx={{
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          color: stats.priceChangePct >= 0 ? POS : NEG,
                        }}
                      >
                        {stats.priceChangePct >= 0 ? '+' : ''}
                        {stats.priceChangePct.toFixed(2)}%
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Keine Daten
                    </Typography>
                  )}
                </Box>
                {stats.startPrice != null && stats.endPrice != null && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: '0.7rem', fontFamily: 'monospace' }}
                  >
                    {stats.startPrice.toExponential(2)} \u2192 {stats.endPrice.toExponential(2)}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Trade Counts */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card sx={{ ...CARD_SX, height: '100%' }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                >
                  Trades
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {stats.buyCount + stats.sellCount}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                  <Chip
                    label={`${stats.buyCount} K\u00E4ufe`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      bgcolor: 'rgba(76,175,80,0.15)',
                      color: POS,
                    }}
                  />
                  <Chip
                    label={`${stats.sellCount} Verk\u00E4ufe`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      bgcolor: 'rgba(244,67,54,0.15)',
                      color: NEG,
                    }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Total P&L */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card sx={{ ...CARD_SX, height: '100%' }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                >
                  Gesamt-P&L
                </Typography>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    color: profitColor(stats.totalPnlSol),
                    mt: 0.5,
                  }}
                >
                  {signed(stats.totalPnlSol, fmtEur(solToEur(stats.totalPnlSol)))}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: 'monospace', color: MUTED, fontSize: '0.7rem' }}
                >
                  {signed(stats.totalPnlSol, fmtSol(stats.totalPnlSol))}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ================================================================ */}
      {/* PRICE CHART                                                      */}
      {/* ================================================================ */}
      <Card sx={{ mb: 3, ...CARD_SX }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
            <ChartIcon sx={{ color: '#00d4ff' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Preisverlauf
            </Typography>
            <Box sx={{ ml: 'auto' }}>
              <Chip label={`${chartData.length} Punkte`} size="small" variant="outlined" />
            </Box>
          </Box>

          {/* Legend */}
          <Box sx={{ display: 'flex', gap: 2.5, mb: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: POS, border: '2px solid #fff' }}
              />
              <Typography variant="caption" color="text.secondary">
                Kauf
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: NEG, border: '2px solid #fff' }}
              />
              <Typography variant="caption" color="text.secondary">
                Verkauf
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 16,
                  height: 10,
                  bgcolor: 'rgba(76,175,80,0.15)',
                  border: '1px dashed rgba(76,175,80,0.4)',
                  borderRadius: 0.5,
                }}
              />
              <Typography variant="caption" color="text.secondary">
                Haltezeit
              </Typography>
            </Box>
          </Box>

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
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
                    ...TOOLTIP_STYLE,
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

                {/* Holding period areas: Buy -> Sell */}
                {tradePairs.map((pair, i) => {
                  if (!pair.sell) return null;
                  const buyMs = new Date(pair.buy.created_at).getTime();
                  const sellMs = new Date(pair.sell.created_at).getTime();
                  const pnl = pair.sell.pnl_sol;
                  const color = pnl >= 0 ? POS : NEG;
                  return (
                    <ReferenceArea
                      key={`area-${i}`}
                      x1={buyMs}
                      x2={sellMs}
                      fill={color}
                      fillOpacity={0.08}
                      stroke={color}
                      strokeDasharray="4 3"
                      strokeOpacity={0.25}
                    />
                  );
                })}

                {/* Vertical dashed lines at each trade */}
                {(coinData?.trades ?? []).map((t) => {
                  const ms = new Date(t.created_at).getTime();
                  const color = t.action === 'BUY' ? POS : NEG;
                  return (
                    <ReferenceLine
                      key={`vline-${t.id}`}
                      x={ms}
                      stroke={color}
                      strokeDasharray="5 4"
                      strokeWidth={1}
                      strokeOpacity={0.4}
                    />
                  );
                })}

                {/* BUY dots (green) */}
                {buys.map((t) => {
                  const ms = new Date(t.created_at).getTime();
                  const price = t.price_at_trade || findPriceAtMs(ms);
                  if (!price) return null;
                  return (
                    <ReferenceDot
                      key={`buy-${t.id}`}
                      x={ms}
                      y={price}
                      r={7}
                      fill={POS}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  );
                })}

                {/* SELL dots (red) */}
                {sells.map((t) => {
                  const ms = new Date(t.created_at).getTime();
                  const price = t.price_at_trade || findPriceAtMs(ms);
                  if (!price) return null;
                  return (
                    <ReferenceDot
                      key={`sell-${t.id}`}
                      x={ms}
                      y={price}
                      r={7}
                      fill={NEG}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                Keine Preisdaten verf\u00FCgbar
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* TRADE LIST                                                       */}
      {/* ================================================================ */}
      <Card sx={{ ...CARD_SX, p: 2 }}>
        <Typography variant="subtitle2" sx={{ color: '#b8c5d6', mb: 1.5 }}>
          Alle Trades ({coinData.trades.length})
        </Typography>
        {coinData.trades.length === 0 ? (
          <Typography variant="body2" sx={{ color: MUTED, textAlign: 'center', py: 3 }}>
            Keine Trades f\u00FCr diesen Coin
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {coinData.trades.map((t) => (
              <Box
                key={t.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: { xs: 1, sm: 2 },
                  py: 1.2,
                  px: 1.5,
                  bgcolor: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 1.5,
                  flexWrap: 'wrap',
                }}
              >
                {/* Action chip */}
                <Chip
                  label={t.action === 'BUY' ? 'KAUF' : 'VERKAUF'}
                  size="small"
                  sx={{
                    bgcolor: t.action === 'BUY' ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)',
                    color: t.action === 'BUY' ? POS : NEG,
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    minWidth: 70,
                  }}
                />

                {/* Wallet */}
                <Box sx={{ minWidth: 70 }}>
                  <Typography variant="caption" sx={{ color: MUTED, fontSize: '0.55rem', textTransform: 'uppercase' }}>
                    Wallet
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {t.wallet_alias}
                  </Typography>
                </Box>

                {/* SOL amount */}
                <Box sx={{ minWidth: 70, textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: MUTED, fontSize: '0.55rem', textTransform: 'uppercase' }}>
                    SOL
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {fmtSol(t.amount_sol)}
                  </Typography>
                </Box>

                {/* EUR amount */}
                <Box sx={{ minWidth: 70, textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: MUTED, fontSize: '0.55rem', textTransform: 'uppercase' }}>
                    EUR
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {fmtEur(solToEur(t.amount_sol))}
                  </Typography>
                </Box>

                {/* P&L for SELL trades */}
                {t.action === 'SELL' && (
                  <>
                    <Chip
                      label={`${t.pnl_percent >= 0 ? '+' : ''}${t.pnl_percent.toFixed(1)}%`}
                      size="small"
                      sx={{
                        bgcolor: `rgba(${t.pnl_sol >= 0 ? '76,175,80' : '244,67,54'}, 0.15)`,
                        color: profitColor(t.pnl_sol),
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        fontSize: '0.72rem',
                        minWidth: 60,
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        color: profitColor(t.pnl_sol),
                      }}
                    >
                      {signed(t.pnl_sol, fmtEur(solToEur(t.pnl_sol)))}
                    </Typography>
                  </>
                )}

                {/* Spacer */}
                <Box sx={{ flex: 1 }} />

                {/* Time */}
                <Typography
                  variant="caption"
                  sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', textAlign: 'right' }}
                >
                  {fmtRelativeTime(t.created_at)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Card>
    </Box>
  );
};

export default CoinTradeDetail;
