import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Chip,
  Skeleton,
  Alert,
  LinearProgress,
  Grid,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Search as SearchIcon,
  ModelTraining as ModelTrainingIcon,
  Analytics as AnalyticsIcon,
  SwapHoriz as SwapHorizIcon,
  Storage as StorageIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { findApi, trainingApi, serverApi, buyApi } from '../services/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a number with locale grouping (e.g. 1,234) */
function fmt(n: number | undefined | null): string {
  if (n == null) return '--';
  return n.toLocaleString('en-US');
}

/** Format SOL amount to 4 decimal places */
function fmtSol(n: number | undefined | null): string {
  if (n == null) return '--';
  return n.toFixed(4);
}

/** Format uptime seconds to a human-readable string */
function fmtUptime(seconds: number | undefined | null): string {
  if (seconds == null) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ---------------------------------------------------------------------------
// Shared query options
// ---------------------------------------------------------------------------

const QUERY_OPTS = { retry: 1, refetchInterval: 10_000 } as const;

// ---------------------------------------------------------------------------
// Stat line inside a module card
// ---------------------------------------------------------------------------

interface StatLineProps {
  label: string;
  value: React.ReactNode;
  color?: string;
}

function StatLine({ label, value, color }: StatLineProps) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
      <Typography variant="body2" sx={{ color: '#b8c5d6' }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, fontFamily: 'monospace', color: color || 'inherit' }}
      >
        {value}
      </Typography>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Module Card wrapper
// ---------------------------------------------------------------------------

interface ModuleCardProps {
  title: string;
  icon: React.ReactNode;
  accentColor: string; // rgb triplet e.g. "0, 212, 255"
  linkTo: string;
  isLoading: boolean;
  isError: boolean;
  children: React.ReactNode;
}

function ModuleCard({ title, icon, accentColor, linkTo, isLoading, isError, children }: ModuleCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      sx={{
        bgcolor: `rgba(${accentColor}, 0.06)`,
        border: `1px solid rgba(${accentColor}, 0.25)`,
        backdropFilter: 'blur(10px)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardActionArea
        onClick={() => navigate(linkTo)}
        sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
      >
        <CardContent sx={{ flexGrow: 1 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  bgcolor: `rgba(${accentColor}, 0.2)`,
                  borderRadius: 2,
                  p: 1,
                  display: 'flex',
                }}
              >
                {icon}
              </Box>
              <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 600 }}>
                {title}
              </Typography>
            </Box>
            <ArrowForwardIcon sx={{ color: `rgba(${accentColor}, 0.6)`, fontSize: 20 }} />
          </Box>

          {/* Body */}
          {isLoading ? (
            <Box>
              <Skeleton variant="text" width="80%" sx={{ bgcolor: 'rgba(255,255,255,0.08)' }} />
              <Skeleton variant="text" width="60%" sx={{ bgcolor: 'rgba(255,255,255,0.08)' }} />
              <Skeleton variant="text" width="70%" sx={{ bgcolor: 'rgba(255,255,255,0.08)' }} />
            </Box>
          ) : isError ? (
            <Alert
              severity="warning"
              sx={{
                bgcolor: 'rgba(255, 152, 0, 0.1)',
                color: '#ff9800',
                border: '1px solid rgba(255, 152, 0, 0.2)',
                '& .MuiAlert-icon': { color: '#ff9800' },
              }}
            >
              Service unavailable
            </Alert>
          ) : (
            children
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  // ----- System health (global) -----
  const {
    data: findHealth,
    isLoading: findHealthLoading,
    isError: findHealthError,
  } = useQuery({
    queryKey: ['dashboard', 'find', 'health'],
    queryFn: async () => {
      const res = await findApi.getHealth();
      return res.data;
    },
    ...QUERY_OPTS,
  });

  const {
    data: trainingHealth,
    isLoading: trainingHealthLoading,
    isError: trainingHealthError,
  } = useQuery({
    queryKey: ['dashboard', 'training', 'health'],
    queryFn: async () => {
      const res = await trainingApi.getHealth();
      return res.data;
    },
    ...QUERY_OPTS,
  });

  const {
    data: serverHealth,
    isLoading: serverHealthLoading,
    isError: serverHealthError,
  } = useQuery({
    queryKey: ['dashboard', 'server', 'health'],
    queryFn: async () => {
      const res = await serverApi.getHealth();
      return res.data;
    },
    ...QUERY_OPTS,
  });

  const {
    data: buyHealth,
    isLoading: buyHealthLoading,
    isError: buyHealthError,
  } = useQuery({
    queryKey: ['dashboard', 'buy', 'health'],
    queryFn: async () => {
      const res = await buyApi.getHealth();
      return res.data;
    },
    ...QUERY_OPTS,
  });

  // ----- Find: stream stats -----
  const {
    data: streamStats,
    isLoading: streamStatsLoading,
    isError: streamStatsError,
  } = useQuery({
    queryKey: ['dashboard', 'find', 'streamStats'],
    queryFn: async () => {
      const res = await findApi.getStreamStats();
      return res.data;
    },
    ...QUERY_OPTS,
  });

  // ----- Training: models + jobs -----
  const {
    data: trainingModels,
    isLoading: trainingModelsLoading,
    isError: trainingModelsError,
  } = useQuery({
    queryKey: ['dashboard', 'training', 'models'],
    queryFn: async () => {
      const res = await trainingApi.listModels({ limit: 500 });
      return res.data;
    },
    ...QUERY_OPTS,
  });

  const {
    data: trainingJobs,
    isLoading: trainingJobsLoading,
    isError: trainingJobsError,
  } = useQuery({
    queryKey: ['dashboard', 'training', 'jobs'],
    queryFn: async () => {
      const res = await trainingApi.listJobs({ limit: 500 });
      return res.data;
    },
    ...QUERY_OPTS,
  });

  // ----- Server: active models + stats -----
  const {
    data: serverModels,
    isLoading: serverModelsLoading,
    isError: serverModelsError,
  } = useQuery({
    queryKey: ['dashboard', 'server', 'models'],
    queryFn: async () => {
      const res = await serverApi.listActiveModels();
      return res.data;
    },
    ...QUERY_OPTS,
  });

  const {
    data: serverStats,
    isLoading: serverStatsLoading,
    isError: serverStatsError,
  } = useQuery({
    queryKey: ['dashboard', 'server', 'stats'],
    queryFn: async () => {
      const res = await serverApi.getStats();
      return res.data;
    },
    ...QUERY_OPTS,
  });

  const {
    data: alertStats,
    isLoading: alertStatsLoading,
    isError: alertStatsError,
  } = useQuery({
    queryKey: ['dashboard', 'server', 'alertStats'],
    queryFn: async () => {
      const res = await serverApi.getAlertStatistics();
      return res.data;
    },
    ...QUERY_OPTS,
  });

  // ----- Buy: dashboard stats + performance -----
  const {
    data: buyStats,
    isLoading: buyStatsLoading,
    isError: buyStatsError,
  } = useQuery({
    queryKey: ['dashboard', 'buy', 'stats'],
    queryFn: async () => {
      const res = await buyApi.getDashboardStats();
      return res.data;
    },
    ...QUERY_OPTS,
  });

  const {
    data: buyPerformance,
    isLoading: buyPerfLoading,
    isError: buyPerfError,
  } = useQuery({
    queryKey: ['dashboard', 'buy', 'performance'],
    queryFn: async () => {
      const res = await buyApi.getWalletPerformance();
      return res.data;
    },
    ...QUERY_OPTS,
  });

  // ----- Derived values -----

  // Overall system health
  const healthServices = [
    { name: 'Find', ok: !findHealthError && findHealth?.status === 'healthy', loading: findHealthLoading },
    { name: 'Training', ok: !trainingHealthError && trainingHealth?.status === 'healthy', loading: trainingHealthLoading },
    { name: 'Server', ok: !serverHealthError && serverHealth?.status === 'healthy', loading: serverHealthLoading },
    { name: 'Buy', ok: !buyHealthError && buyHealth?.status === 'healthy', loading: buyHealthLoading },
  ];

  const servicesUp = healthServices.filter((s) => s.ok).length;
  const servicesLoading = healthServices.some((s) => s.loading);
  const overallStatus: 'green' | 'yellow' | 'red' =
    servicesUp === 4 ? 'green' : servicesUp >= 2 ? 'yellow' : 'red';

  const statusColorMap = { green: '#4caf50', yellow: '#ff9800', red: '#f44336' };
  const statusLabelMap = { green: 'All Systems Operational', yellow: 'Partial Degradation', red: 'Major Outage' };
  const statusIconMap = {
    green: <CheckCircleIcon sx={{ color: '#4caf50', fontSize: 28 }} />,
    yellow: <WarningIcon sx={{ color: '#ff9800', fontSize: 28 }} />,
    red: <ErrorIcon sx={{ color: '#f44336', fontSize: 28 }} />,
  };

  // Training derived
  const modelsList = Array.isArray(trainingModels) ? trainingModels : [];
  const readyModels = modelsList.filter((m: any) => m.status === 'READY').length;
  const activeJobs = Array.isArray(trainingJobs)
    ? trainingJobs.filter((j: any) => j.status === 'RUNNING' || j.status === 'PENDING').length
    : 0;

  // Server derived
  const activeServerModels = Array.isArray(serverModels)
    ? serverModels.filter((m: any) => m.is_active).length
    : 0;
  const totalPredictions = serverStats?.total_predictions ?? serverStats?.predictions?.total ?? 0;
  const totalAlerts = alertStats?.total_alerts ?? 0;
  const alertSuccessRate = alertStats?.success_rate ?? alertStats?.alerts_success_rate;

  // Buy derived
  const netProfitToday = Array.isArray(buyPerformance)
    ? buyPerformance.reduce((sum: number, p: any) => sum + (p.profit_24h ?? 0), 0)
    : 0;

  // Find: phase chips
  const phaseEntries = streamStats?.streams_by_phase
    ? Object.entries(streamStats.streams_by_phase as Record<string, number>)
    : [];

  // DB connected status (use find health as primary indicator)
  const dbConnected = findHealth?.db_connected ?? trainingHealth?.db_connected ?? serverHealth?.database === 'connected';

  // Best uptime across services
  const maxUptime = Math.max(
    findHealth?.uptime_seconds ?? 0,
    trainingHealth?.uptime_seconds ?? 0,
    serverHealth?.uptime ?? 0,
  );

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', md: '2.125rem' } }}>
        Dashboard
      </Typography>

      {/* ================================================================= */}
      {/* System Health Bar                                                  */}
      {/* ================================================================= */}
      <Card
        sx={{
          mb: 3,
          bgcolor: 'rgba(255, 255, 255, 0.03)',
          border: `1px solid ${statusColorMap[overallStatus]}33`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {servicesLoading && (
          <LinearProgress
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              '& .MuiLinearProgress-bar': { bgcolor: '#00d4ff' },
              bgcolor: 'rgba(0,212,255,0.1)',
            }}
          />
        )}
        <CardContent sx={{ py: 2 }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: { xs: 'flex-start', md: 'center' },
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            {/* Status indicator */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {statusIconMap[overallStatus]}
              <Box>
                <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
                  {statusLabelMap[overallStatus]}
                </Typography>
                <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
                  {servicesUp}/4 services online
                </Typography>
              </Box>
            </Box>

            {/* Service chips */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {healthServices.map((svc) => (
                <Chip
                  key={svc.name}
                  label={svc.name}
                  size="small"
                  sx={{
                    bgcolor: svc.loading
                      ? 'rgba(255, 255, 255, 0.1)'
                      : svc.ok
                        ? 'rgba(76, 175, 80, 0.15)'
                        : 'rgba(244, 67, 54, 0.15)',
                    color: svc.loading ? '#b8c5d6' : svc.ok ? '#4caf50' : '#f44336',
                    border: `1px solid ${
                      svc.loading
                        ? 'rgba(255, 255, 255, 0.15)'
                        : svc.ok
                          ? 'rgba(76, 175, 80, 0.3)'
                          : 'rgba(244, 67, 54, 0.3)'
                    }`,
                    fontWeight: 600,
                    fontSize: '0.75rem',
                  }}
                />
              ))}
            </Box>

            {/* Database & uptime */}
            <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <StorageIcon sx={{ fontSize: 16, color: dbConnected ? '#4caf50' : '#f44336' }} />
                <Typography variant="caption" sx={{ color: dbConnected ? '#4caf50' : '#f44336' }}>
                  {dbConnected ? 'DB Connected' : 'DB Error'}
                </Typography>
              </Box>
              {maxUptime > 0 && (
                <Typography variant="caption" sx={{ color: '#b8c5d6' }}>
                  Uptime: {fmtUptime(maxUptime)}
                </Typography>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* Module Cards Grid (2x2)                                            */}
      {/* ================================================================= */}
      <Grid container spacing={3}>
        {/* -------------------------------------------------------------- */}
        {/* Card 1: Token Discovery (Find)                                   */}
        {/* -------------------------------------------------------------- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <ModuleCard
            title="Token Discovery"
            icon={<SearchIcon sx={{ color: '#00d4ff', fontSize: 24 }} />}
            accentColor="0, 212, 255"
            linkTo="/discovery"
            isLoading={streamStatsLoading && findHealthLoading}
            isError={streamStatsError && findHealthError}
          >
            <StatLine
              label="Active Streams"
              value={fmt(streamStats?.active_streams)}
            />
            <StatLine
              label="Total Streams"
              value={fmt(streamStats?.total_streams)}
            />
            <StatLine
              label="WebSocket"
              value={
                <Chip
                  label={findHealth?.ws_connected ? 'Connected' : 'Disconnected'}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.7rem',
                    bgcolor: findHealth?.ws_connected
                      ? 'rgba(76, 175, 80, 0.2)'
                      : 'rgba(244, 67, 54, 0.2)',
                    color: findHealth?.ws_connected ? '#4caf50' : '#f44336',
                  }}
                />
              }
            />
            {/* Phase distribution chips */}
            {phaseEntries.length > 0 && (
              <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {phaseEntries.map(([phaseId, count]) => (
                  <Chip
                    key={phaseId}
                    label={`P${phaseId}: ${fmt(count as number)}`}
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: '0.7rem',
                      bgcolor: 'rgba(0, 212, 255, 0.12)',
                      color: '#00d4ff',
                      border: '1px solid rgba(0, 212, 255, 0.2)',
                    }}
                  />
                ))}
              </Box>
            )}
          </ModuleCard>
        </Grid>

        {/* -------------------------------------------------------------- */}
        {/* Card 2: ML Training                                              */}
        {/* -------------------------------------------------------------- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <ModuleCard
            title="ML Training"
            icon={<ModelTrainingIcon sx={{ color: '#9c27b0', fontSize: 24 }} />}
            accentColor="156, 39, 176"
            linkTo="/training"
            isLoading={trainingModelsLoading && trainingJobsLoading}
            isError={trainingModelsError && trainingJobsError}
          >
            <StatLine label="Total Models" value={fmt(modelsList.length)} />
            <StatLine
              label="Ready Models"
              value={fmt(readyModels)}
              color="#4caf50"
            />
            <StatLine
              label="Active Jobs"
              value={
                activeJobs > 0 ? (
                  <Chip
                    label={`${activeJobs} running`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.7rem',
                      bgcolor: 'rgba(255, 152, 0, 0.2)',
                      color: '#ff9800',
                      animation: 'pulse 2s infinite',
                      '@keyframes pulse': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0.6 },
                      },
                    }}
                  />
                ) : (
                  '0'
                )
              }
            />
            {trainingHealth?.db_connected != null && (
              <StatLine
                label="DB Status"
                value={
                  <Chip
                    label={trainingHealth.db_connected ? 'Connected' : 'Disconnected'}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.7rem',
                      bgcolor: trainingHealth.db_connected
                        ? 'rgba(76, 175, 80, 0.2)'
                        : 'rgba(244, 67, 54, 0.2)',
                      color: trainingHealth.db_connected ? '#4caf50' : '#f44336',
                    }}
                  />
                }
              />
            )}
          </ModuleCard>
        </Grid>

        {/* -------------------------------------------------------------- */}
        {/* Card 3: Predictions (Server)                                     */}
        {/* -------------------------------------------------------------- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <ModuleCard
            title="Predictions"
            icon={<AnalyticsIcon sx={{ color: '#2196f3', fontSize: 24 }} />}
            accentColor="33, 150, 243"
            linkTo="/predictions"
            isLoading={serverModelsLoading && serverStatsLoading && alertStatsLoading}
            isError={serverModelsError && serverStatsError && alertStatsError}
          >
            <StatLine
              label="Active Models"
              value={fmt(activeServerModels)}
              color="#4caf50"
            />
            <StatLine label="Total Predictions" value={fmt(totalPredictions)} />
            <StatLine label="Total Alerts" value={fmt(totalAlerts)} />
            {alertSuccessRate != null && (
              <StatLine
                label="Alert Success Rate"
                value={`${(alertSuccessRate * 100).toFixed(1)}%`}
                color={alertSuccessRate >= 0.5 ? '#4caf50' : '#ff9800'}
              />
            )}
          </ModuleCard>
        </Grid>

        {/* -------------------------------------------------------------- */}
        {/* Card 4: Trading (Buy)                                            */}
        {/* -------------------------------------------------------------- */}
        <Grid size={{ xs: 12, md: 6 }}>
          <ModuleCard
            title="Trading"
            icon={<SwapHorizIcon sx={{ color: '#ff9800', fontSize: 24 }} />}
            accentColor="255, 152, 0"
            linkTo="/trading"
            isLoading={buyStatsLoading && buyPerfLoading}
            isError={buyStatsError && buyPerfError}
          >
            <StatLine
              label="Active Wallets"
              value={fmt(buyStats?.active_wallets)}
            />
            <StatLine
              label="Open Positions"
              value={fmt(buyStats?.open_positions)}
            />
            <StatLine
              label="Volume Today"
              value={
                buyStats?.total_volume_today != null
                  ? `${fmtSol(buyStats.total_volume_today)} SOL`
                  : '--'
              }
            />
            <StatLine
              label="P&L Today"
              value={
                buyPerformance
                  ? `${netProfitToday >= 0 ? '+' : ''}${fmtSol(netProfitToday)} SOL`
                  : '--'
              }
              color={netProfitToday >= 0 ? '#4caf50' : '#f44336'}
            />
          </ModuleCard>
        </Grid>
      </Grid>

      {/* ================================================================= */}
      {/* Footer: last updated                                               */}
      {/* ================================================================= */}
      <Typography variant="body2" sx={{ color: '#b8c5d6', mt: 3, textAlign: 'center', opacity: 0.6 }}>
        Auto-refresh every 10s &middot; Last update: {new Date().toLocaleTimeString()}
      </Typography>
    </Box>
  );
}
