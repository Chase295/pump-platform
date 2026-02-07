import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Card,
  CardContent,
  Chip,
  Checkbox,
  Slider,
  TextField,
  Divider,
  Avatar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
} from '@mui/material';
import {
  RocketLaunch as RocketIcon,
  AutoAwesome as MagicIcon,
  TrendingUp as PumpIcon,
  TrendingDown as RugIcon,
  Speed as SpeedIcon,
  Balance as BalanceIcon,
  Psychology as BrainIcon,
  Science as ScienceIcon,
  Warning as WarningIcon,
  NavigateNext as NextIcon,
  NavigateBefore as BackIcon,
  Refresh as RefreshIcon,
  Tune as TuneIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { trainingApi } from '../../services/api';

// ============================================================
// Feature definitions
// ============================================================
const BASE_FEATURES = [
  { id: 'price_close', name: 'Price Close', desc: 'Closing price', importance: 'essential', category: 'price' },
  { id: 'volume_sol', name: 'Volume SOL', desc: 'Trading volume in SOL', importance: 'essential', category: 'volume' },
  { id: 'buy_pressure_ratio', name: 'Buy Pressure', desc: 'Buys vs Sells ratio', importance: 'essential', category: 'momentum' },
  { id: 'dev_sold_amount', name: 'Dev Sold', desc: 'Developer sell amount (RUG indicator)', importance: 'recommended', category: 'safety' },
  { id: 'whale_buy_volume_sol', name: 'Whale Buys', desc: 'Whale buy volume', importance: 'recommended', category: 'whale' },
  { id: 'whale_sell_volume_sol', name: 'Whale Sells', desc: 'Whale sell volume', importance: 'recommended', category: 'whale' },
  { id: 'unique_signer_ratio', name: 'Community', desc: 'Unique buyer ratio', importance: 'recommended', category: 'community' },
  { id: 'volatility_pct', name: 'Volatility', desc: 'Risk indicator', importance: 'recommended', category: 'risk' },
  { id: 'market_cap_close', name: 'Market Cap', desc: 'Market capitalization', importance: 'recommended', category: 'market' },
  { id: 'price_open', name: 'Price Open', desc: 'Opening price', importance: 'optional', category: 'price' },
  { id: 'price_high', name: 'Price High', desc: 'Highest price', importance: 'optional', category: 'price' },
  { id: 'price_low', name: 'Price Low', desc: 'Lowest price', importance: 'optional', category: 'price' },
  { id: 'buy_volume_sol', name: 'Buy Volume', desc: 'Buy-only volume', importance: 'optional', category: 'volume' },
  { id: 'sell_volume_sol', name: 'Sell Volume', desc: 'Sell-only volume', importance: 'optional', category: 'volume' },
  { id: 'net_volume_sol', name: 'Net Volume', desc: 'Buys minus sells', importance: 'optional', category: 'volume' },
  { id: 'bonding_curve_pct', name: 'Bonding Curve', desc: 'Curve progress', importance: 'optional', category: 'market' },
  { id: 'num_buys', name: 'Num Buys', desc: 'Number of buys', importance: 'optional', category: 'activity' },
  { id: 'num_sells', name: 'Num Sells', desc: 'Number of sells', importance: 'optional', category: 'activity' },
  { id: 'avg_trade_size_sol', name: 'Avg Trade', desc: 'Average trade size', importance: 'optional', category: 'activity' },
  { id: 'unique_wallets', name: 'Unique Wallets', desc: 'Unique wallets count', importance: 'optional', category: 'community' },
];

const ENGINEERING_CATEGORIES = [
  { id: 'dev', name: 'Dev Activity', desc: 'Developer sell detection' },
  { id: 'momentum', name: 'Momentum', desc: 'Buy pressure trends' },
  { id: 'whale', name: 'Whale Tracking', desc: 'Large investor behavior' },
  { id: 'risk', name: 'Risk Analysis', desc: 'Volatility indicators' },
  { id: 'safety', name: 'Safety', desc: 'Wash trading detection' },
  { id: 'volume', name: 'Volume Patterns', desc: 'Volume trends and flips' },
  { id: 'price', name: 'Price Momentum', desc: 'Price changes over time' },
  { id: 'market', name: 'Market Velocity', desc: 'Market cap speed' },
  { id: 'ath', name: 'ATH Analysis', desc: 'All-time-high tracking' },
  { id: 'power', name: 'Power Features', desc: 'Combined signals' },
];

// Simplified engineering features list
const ENGINEERING_FEATURES = [
  { id: 'dev_sold_flag', category: 'dev', importance: 'high' },
  { id: 'dev_sold_cumsum', category: 'dev', importance: 'high' },
  { id: 'dev_sold_spike_5', category: 'dev', importance: 'high' },
  { id: 'buy_pressure_ma_5', category: 'momentum', importance: 'high' },
  { id: 'buy_pressure_trend_5', category: 'momentum', importance: 'high' },
  { id: 'buy_pressure_ma_10', category: 'momentum', importance: 'medium' },
  { id: 'whale_net_volume', category: 'whale', importance: 'high' },
  { id: 'whale_activity_5', category: 'whale', importance: 'high' },
  { id: 'whale_activity_10', category: 'whale', importance: 'medium' },
  { id: 'volatility_ma_5', category: 'risk', importance: 'high' },
  { id: 'volatility_spike_5', category: 'risk', importance: 'high' },
  { id: 'wash_trading_flag_5', category: 'safety', importance: 'high' },
  { id: 'wash_trading_flag_10', category: 'safety', importance: 'medium' },
  { id: 'net_volume_ma_5', category: 'volume', importance: 'high' },
  { id: 'volume_flip_5', category: 'volume', importance: 'high' },
  { id: 'price_change_5', category: 'price', importance: 'high' },
  { id: 'price_change_10', category: 'price', importance: 'high' },
  { id: 'price_roc_5', category: 'price', importance: 'high' },
  { id: 'mcap_velocity_5', category: 'market', importance: 'high' },
  { id: 'rolling_ath', category: 'ath', importance: 'high' },
  { id: 'price_vs_ath_pct', category: 'ath', importance: 'high' },
  { id: 'ath_breakout', category: 'ath', importance: 'high' },
  { id: 'ath_distance_trend_5', category: 'ath', importance: 'high' },
  { id: 'ath_approach_5', category: 'ath', importance: 'high' },
  { id: 'buy_sell_ratio', category: 'power', importance: 'high' },
  { id: 'whale_dominance', category: 'power', importance: 'high' },
  { id: 'price_acceleration_5', category: 'power', importance: 'high' },
  { id: 'volume_spike_5', category: 'power', importance: 'high' },
];

// Presets
const PRESETS = [
  {
    id: 'fast', name: 'Fast Pump', desc: '5% in 5 min', color: '#00d4ff', icon: <SpeedIcon />,
    futureMinutes: 5, minPercent: 5,
    baseFeatures: ['price_close', 'volume_sol', 'buy_pressure_ratio', 'whale_buy_volume_sol'],
    engFeatures: [], scaleWeight: 100, direction: 'up',
  },
  {
    id: 'standard', name: 'Standard', desc: '10% in 10 min', color: '#4caf50', icon: <PumpIcon />,
    futureMinutes: 10, minPercent: 10,
    baseFeatures: ['price_close', 'volume_sol', 'buy_pressure_ratio', 'whale_buy_volume_sol', 'dev_sold_amount', 'unique_signer_ratio'],
    engFeatures: ENGINEERING_FEATURES.filter((f) => f.importance === 'high').map((f) => f.id),
    scaleWeight: 100, direction: 'up',
  },
  {
    id: 'moonshot', name: 'Moonshot', desc: '25% in 15 min', color: '#9c27b0', icon: <RocketIcon />,
    futureMinutes: 15, minPercent: 25,
    baseFeatures: BASE_FEATURES.filter((f) => f.importance !== 'optional').map((f) => f.id),
    engFeatures: ENGINEERING_FEATURES.filter((f) => f.importance === 'high' || f.importance === 'medium').map((f) => f.id),
    scaleWeight: 200, direction: 'up',
  },
  {
    id: 'rug', name: 'Rug Shield', desc: '-20% in 10 min', color: '#f44336', icon: <RugIcon />,
    futureMinutes: 10, minPercent: 20,
    baseFeatures: ['price_close', 'dev_sold_amount', 'whale_sell_volume_sol', 'buy_pressure_ratio', 'volatility_pct'],
    engFeatures: ENGINEERING_FEATURES.filter((f) => f.category === 'dev' || f.category === 'safety').map((f) => f.id),
    scaleWeight: 50, direction: 'down',
  },
  {
    id: 'custom', name: 'Custom', desc: 'Choose everything', color: '#ff9800', icon: <TuneIcon />,
    futureMinutes: 10, minPercent: 10,
    baseFeatures: ['price_close', 'volume_sol', 'buy_pressure_ratio'],
    engFeatures: [], scaleWeight: 100, direction: 'up',
  },
];

const steps = ['Preset', 'Prediction', 'Base Features', 'Engineering', 'Balance', 'Submit'];

interface CoinPhase {
  id: number;
  name: string;
  interval_seconds: number;
  max_age_minutes: number;
}

const CreateModel: React.FC = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; jobId?: number } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [direction, setDirection] = useState('up');
  const [futureMinutes, setFutureMinutes] = useState(10);
  const [minPercent, setMinPercent] = useState(10);
  const [selectedBaseFeatures, setSelectedBaseFeatures] = useState<string[]>(['price_close', 'volume_sol', 'buy_pressure_ratio']);
  const [selectedEngFeatures, setSelectedEngFeatures] = useState<string[]>([]);
  const [useFlagFeatures, setUseFlagFeatures] = useState(true);
  const [balanceMethod, setBalanceMethod] = useState('scale_pos_weight');
  const [scaleWeight, setScaleWeight] = useState(100);
  const [selectedPhases, setSelectedPhases] = useState<number[]>([]);
  const [availablePhases, setAvailablePhases] = useState<CoinPhase[]>([]);
  const [phasesLoading, setPhasesLoading] = useState(true);

  // Time range
  const now = new Date();
  const defaultEnd = new Date(now.getTime() - 60 * 60 * 1000);
  const defaultStart = new Date(now.getTime() - 13 * 60 * 60 * 1000);
  const [trainStart, setTrainStart] = useState(defaultStart.toISOString().slice(0, 16));
  const [trainEnd, setTrainEnd] = useState(defaultEnd.toISOString().slice(0, 16));

  // Load phases
  useEffect(() => {
    const loadPhases = async () => {
      try {
        setPhasesLoading(true);
        const resp = await trainingApi.getPhases();
        const phases = resp.data?.phases || resp.data || [];
        const relevant = phases.filter((p: CoinPhase) => p.id < 10);
        setAvailablePhases(relevant);
        setSelectedPhases(relevant.map((p: CoinPhase) => p.id));
      } catch {
        setAvailablePhases([
          { id: 1, name: 'Baby Zone', interval_seconds: 5, max_age_minutes: 10 },
          { id: 2, name: 'Survival Zone', interval_seconds: 15, max_age_minutes: 120 },
          { id: 3, name: 'Mature Zone', interval_seconds: 15, max_age_minutes: 240 },
        ]);
        setSelectedPhases([1, 2, 3]);
      } finally {
        setPhasesLoading(false);
      }
    };
    loadPhases();
  }, []);

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setFutureMinutes(preset.futureMinutes);
      setMinPercent(preset.minPercent);
      setSelectedBaseFeatures(preset.baseFeatures);
      setSelectedEngFeatures(preset.engFeatures);
      setScaleWeight(preset.scaleWeight);
      setDirection(preset.direction);
      setName(`${preset.id}_${new Date().toISOString().slice(0, 10)}`);
    }
    setSelectedPreset(presetId);
    if (presetId !== 'custom') {
      setActiveStep(5);
    } else {
      setActiveStep(1);
    }
  };

  const toggleBaseFeature = (id: string) => {
    setSelectedBaseFeatures((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  };

  const toggleEngFeature = (id: string) => {
    setSelectedEngFeatures((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  };

  const selectEngCategory = (categoryId: string) => {
    const catFeatures = ENGINEERING_FEATURES.filter((f) => f.category === categoryId).map((f) => f.id);
    const allSelected = catFeatures.every((f) => selectedEngFeatures.includes(f));
    if (allSelected) {
      setSelectedEngFeatures((prev) => prev.filter((f) => !catFeatures.includes(f)));
    } else {
      setSelectedEngFeatures((prev) => [...new Set([...prev, ...catFeatures])]);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setResult(null);
    try {
      const allFeatures = [...selectedBaseFeatures, ...selectedEngFeatures];
      const data: Record<string, unknown> = {
        name,
        model_type: 'xgboost',
        features: allFeatures,
        train_start: new Date(trainStart).toISOString(),
        train_end: new Date(trainEnd).toISOString(),
        future_minutes: futureMinutes,
        min_percent_change: minPercent,
        direction,
        use_engineered_features: selectedEngFeatures.length > 0,
        use_flag_features: useFlagFeatures,
      };
      if (balanceMethod === 'scale_pos_weight') {
        data.scale_pos_weight = scaleWeight;
      } else if (balanceMethod === 'smote') {
        data.use_smote = true;
      }
      if (selectedPhases.length > 0 && selectedPhases.length < availablePhases.length) {
        data.phases = selectedPhases;
      }

      const resp = await trainingApi.createModel(data);
      setResult({
        success: true,
        message: `Model "${name}" training started!`,
        jobId: resp.data?.job_id,
      });
    } catch (err: any) {
      setResult({
        success: false,
        message: `Error: ${err.response?.data?.detail || err.message || 'Unknown error'}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalFeatures = selectedBaseFeatures.length + selectedEngFeatures.length;

  const FeatureCard = ({ feature, selected, onToggle }: { feature: any; selected: boolean; onToggle: () => void }) => (
    <Card
      onClick={onToggle}
      sx={{
        cursor: 'pointer',
        border: `1px solid ${selected ? '#00d4ff' : 'rgba(255,255,255,0.1)'}`,
        bgcolor: selected ? 'rgba(0,212,255,0.15)' : 'transparent',
        transition: 'all 0.2s',
        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
      }}
    >
      <CardContent sx={{ py: 1, px: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Checkbox checked={selected} size="small" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '0.85rem' }} noWrap>
            {feature.name || feature.id}
          </Typography>
          {feature.desc && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {feature.desc}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#00d4ff', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <BrainIcon sx={{ fontSize: 40 }} /> Create ML Model
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Create a pump-detection model with individually selectable features
        </Typography>
      </Box>

      {/* Stepper */}
      <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Paper sx={{ p: { xs: 2, md: 4 }, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
        {/* Step 0: Preset */}
        {activeStep === 0 && (
          <Box>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 'bold' }}>
              Choose a preset or start custom
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(5, 1fr)' }, gap: 2 }}>
              {PRESETS.map((preset) => (
                <Card
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  sx={{
                    cursor: 'pointer',
                    border: `2px solid ${selectedPreset === preset.id ? preset.color : 'rgba(255,255,255,0.1)'}`,
                    bgcolor: selectedPreset === preset.id ? `${preset.color}20` : 'rgba(255,255,255,0.05)',
                    transition: 'all 0.3s',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: `0 8px 24px ${preset.color}40`, borderColor: preset.color },
                  }}
                >
                  <CardContent sx={{ textAlign: 'center', py: 2 }}>
                    <Avatar sx={{ bgcolor: preset.color, width: 48, height: 48, mx: 'auto', mb: 1 }}>{preset.icon}</Avatar>
                    <Typography variant="subtitle1" sx={{ color: preset.color, fontWeight: 'bold' }}>{preset.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{preset.desc}</Typography>
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                      {preset.baseFeatures.length}+{preset.engFeatures.length} features
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Box>
        )}

        {/* Step 1: Prediction */}
        {activeStep === 1 && (
          <Box>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 'bold' }}>What to predict?</Typography>
            <TextField fullWidth label="Model Name" value={name} onChange={(e) => setName(e.target.value)} sx={{ mb: 3 }} helperText="Min. 3 characters" />

            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>Prediction Type:</Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
              <Card onClick={() => setDirection('up')} sx={{ cursor: 'pointer', flex: 1, border: `2px solid ${direction === 'up' ? '#4caf50' : 'rgba(255,255,255,0.1)'}`, bgcolor: direction === 'up' ? 'rgba(76,175,80,0.2)' : 'transparent' }}>
                <CardContent sx={{ textAlign: 'center' }}>
                  <PumpIcon sx={{ fontSize: 48, color: '#4caf50' }} />
                  <Typography variant="h6" sx={{ color: '#4caf50' }}>PUMP</Typography>
                </CardContent>
              </Card>
              <Card onClick={() => setDirection('down')} sx={{ cursor: 'pointer', flex: 1, border: `2px solid ${direction === 'down' ? '#f44336' : 'rgba(255,255,255,0.1)'}`, bgcolor: direction === 'down' ? 'rgba(244,67,54,0.2)' : 'transparent' }}>
                <CardContent sx={{ textAlign: 'center' }}>
                  <RugIcon sx={{ fontSize: 48, color: '#f44336' }} />
                  <Typography variant="h6" sx={{ color: '#f44336' }}>RUG</Typography>
                </CardContent>
              </Card>
            </Box>

            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>In {futureMinutes} minutes:</Typography>
            <Slider value={futureMinutes} onChange={(_, v) => setFutureMinutes(v as number)} min={1} max={60} marks={[{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 15, label: '15' }, { value: 30, label: '30' }]} valueLabelDisplay="on" sx={{ mb: 3 }} />

            {/* Phase filter */}
            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>Coin Phase Filter</Typography>
            {phasesLoading ? (
              <CircularProgress size={24} />
            ) : (
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
                {availablePhases.map((phase) => (
                  <Card
                    key={phase.id}
                    onClick={() => setSelectedPhases((prev) => prev.includes(phase.id) ? prev.filter((p) => p !== phase.id) : [...prev, phase.id])}
                    sx={{ cursor: 'pointer', minWidth: 130, border: `2px solid ${selectedPhases.includes(phase.id) ? '#00d4ff' : 'rgba(255,255,255,0.1)'}`, bgcolor: selectedPhases.includes(phase.id) ? 'rgba(0,212,255,0.15)' : 'transparent' }}
                  >
                    <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                      <Checkbox checked={selectedPhases.includes(phase.id)} />
                      <Typography variant="subtitle2" sx={{ color: '#00d4ff', fontWeight: 'bold' }}>{phase.name}</Typography>
                      <Typography variant="caption" color="text.secondary">0-{phase.max_age_minutes >= 60 ? `${Math.floor(phase.max_age_minutes / 60)}h` : `${phase.max_age_minutes}m`}</Typography>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}

            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>Min change: {minPercent}%</Typography>
            <Slider value={minPercent} onChange={(_, v) => setMinPercent(v as number)} min={1} max={50} marks={[{ value: 5, label: '5%' }, { value: 10, label: '10%' }, { value: 25, label: '25%' }]} valueLabelDisplay="on" sx={{ mb: 3 }} />

            <Alert severity="success">
              <strong>Your model:</strong> &quot;{minPercent}% {direction === 'up' ? 'increase' : 'decrease'} in {futureMinutes} minutes&quot;
            </Alert>

            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
              <Button variant="outlined" onClick={() => setActiveStep(0)} startIcon={<BackIcon />}>Back</Button>
              <Button variant="contained" onClick={() => setActiveStep(2)} disabled={name.length < 3} endIcon={<NextIcon />} sx={{ bgcolor: '#00d4ff' }}>Next</Button>
            </Box>
          </Box>
        )}

        {/* Step 2: Base Features */}
        {activeStep === 2 && (
          <Box>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 'bold' }}>Base Features</Typography>
            <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(0,212,255,0.1)', border: '1px solid #00d4ff' }}>
              <Typography variant="h6" sx={{ color: '#00d4ff' }}>Selected: {selectedBaseFeatures.length} / {BASE_FEATURES.length}</Typography>
            </Paper>
            <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
              <Button variant="outlined" size="small" onClick={() => setSelectedBaseFeatures(BASE_FEATURES.filter((f) => f.importance === 'essential').map((f) => f.id))}>Essential</Button>
              <Button variant="outlined" size="small" onClick={() => setSelectedBaseFeatures(BASE_FEATURES.filter((f) => f.importance !== 'optional').map((f) => f.id))}>+ Recommended</Button>
              <Button variant="outlined" size="small" onClick={() => setSelectedBaseFeatures(BASE_FEATURES.map((f) => f.id))}>All</Button>
              <Button variant="outlined" size="small" color="error" onClick={() => setSelectedBaseFeatures([])}>None</Button>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 1 }}>
              {BASE_FEATURES.map((f) => (
                <FeatureCard key={f.id} feature={f} selected={selectedBaseFeatures.includes(f.id)} onToggle={() => toggleBaseFeature(f.id)} />
              ))}
            </Box>
            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
              <Button variant="outlined" onClick={() => setActiveStep(1)} startIcon={<BackIcon />}>Back</Button>
              <Button variant="contained" onClick={() => setActiveStep(3)} disabled={selectedBaseFeatures.length < 2} endIcon={<NextIcon />} sx={{ bgcolor: '#00d4ff' }}>Next</Button>
            </Box>
          </Box>
        )}

        {/* Step 3: Engineering Features */}
        {activeStep === 3 && (
          <Box>
            <Typography variant="h5" sx={{ mb: 3, color: '#9c27b0', fontWeight: 'bold' }}>
              <MagicIcon sx={{ mr: 1 }} /> Engineering Features
            </Typography>
            <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(156,39,176,0.1)', border: '1px solid #9c27b0' }}>
              <Typography variant="h6" sx={{ color: '#9c27b0' }}>
                Selected: {selectedEngFeatures.length} / {ENGINEERING_FEATURES.length}
              </Typography>
            </Paper>
            <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
              <Button variant="outlined" size="small" onClick={() => setSelectedEngFeatures(ENGINEERING_FEATURES.filter((f) => f.importance === 'high').map((f) => f.id))}>High Importance</Button>
              <Button variant="outlined" size="small" onClick={() => setSelectedEngFeatures(ENGINEERING_FEATURES.map((f) => f.id))}>All ({ENGINEERING_FEATURES.length})</Button>
              <Button variant="outlined" size="small" color="error" onClick={() => setSelectedEngFeatures([])}>None</Button>
            </Box>
            {ENGINEERING_CATEGORIES.map((cat) => {
              const catFeatures = ENGINEERING_FEATURES.filter((f) => f.category === cat.id);
              if (catFeatures.length === 0) return null;
              const selectedInCat = catFeatures.filter((f) => selectedEngFeatures.includes(f.id)).length;
              return (
                <Accordion key={cat.id} sx={{ bgcolor: 'rgba(255,255,255,0.05)', mb: 1 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{cat.name}</Typography>
                      <Chip label={`${selectedInCat}/${catFeatures.length}`} size="small" color={selectedInCat === catFeatures.length ? 'success' : selectedInCat > 0 ? 'warning' : 'default'} />
                      <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{cat.desc}</Typography>
                      <Button size="small" variant="outlined" onClick={(e) => { e.stopPropagation(); selectEngCategory(cat.id); }}>
                        {selectedInCat === catFeatures.length ? 'Deselect' : 'All'}
                      </Button>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1 }}>
                      {catFeatures.map((f) => (
                        <FeatureCard key={f.id} feature={{ ...f, name: f.id }} selected={selectedEngFeatures.includes(f.id)} onToggle={() => toggleEngFeature(f.id)} />
                      ))}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              );
            })}
            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
              <Button variant="outlined" onClick={() => setActiveStep(2)} startIcon={<BackIcon />}>Back</Button>
              <Button variant="contained" onClick={() => setActiveStep(4)} endIcon={<NextIcon />} sx={{ bgcolor: '#9c27b0' }}>Next</Button>
            </Box>
          </Box>
        )}

        {/* Step 4: Balance & Time Range */}
        {activeStep === 4 && (
          <Box>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 'bold' }}>Balance & Time Range</Typography>
            <Alert severity="warning" sx={{ mb: 3 }}>
              <strong>Imbalanced data:</strong> Pumps are rare (1-5%). Without balancing, F1 = 0!
            </Alert>
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              {[
                { id: 'scale_pos_weight', icon: <BalanceIcon />, name: 'scale_pos_weight', color: '#ff9800', label: 'Recommended' },
                { id: 'smote', icon: <ScienceIcon />, name: 'SMOTE', color: '#00bcd4', label: 'Advanced' },
                { id: 'none', icon: <WarningIcon />, name: 'None', color: '#666', label: 'Not recommended' },
              ].map((b) => (
                <Card key={b.id} onClick={() => setBalanceMethod(b.id)} sx={{ cursor: 'pointer', flex: '1 1 150px', border: `2px solid ${balanceMethod === b.id ? b.color : 'rgba(255,255,255,0.1)'}`, bgcolor: balanceMethod === b.id ? `${b.color}30` : 'transparent' }}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    {React.cloneElement(b.icon, { sx: { fontSize: 40, color: b.color } })}
                    <Typography variant="h6" sx={{ color: b.color }}>{b.name}</Typography>
                    <Chip label={b.label} size="small" />
                  </CardContent>
                </Card>
              ))}
            </Box>
            {balanceMethod === 'scale_pos_weight' && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>Weight: {scaleWeight}x</Typography>
                <Slider value={scaleWeight} onChange={(_, v) => setScaleWeight(v as number)} min={10} max={300} marks={[{ value: 50, label: '50' }, { value: 100, label: '100' }, { value: 200, label: '200' }]} valueLabelDisplay="on" />
              </Box>
            )}

            <Divider sx={{ my: 3 }} />
            <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(156,39,176,0.1)', border: '1px solid #9c27b0' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Checkbox checked={useFlagFeatures} onChange={(e) => setUseFlagFeatures(e.target.checked)} />
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: '#9c27b0' }}>Flag Features (recommended)</Typography>
                  <Typography variant="caption" color="text.secondary">Shows the model whether an engineering feature has enough data</Typography>
                </Box>
              </Box>
            </Paper>

            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>Training Period:</Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              <TextField label="Start" type="datetime-local" value={trainStart} onChange={(e) => setTrainStart(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
              <TextField label="End" type="datetime-local" value={trainEnd} onChange={(e) => setTrainEnd(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
            </Box>

            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
              <Button variant="outlined" onClick={() => setActiveStep(3)} startIcon={<BackIcon />}>Back</Button>
              <Button variant="contained" onClick={() => setActiveStep(5)} endIcon={<NextIcon />} sx={{ bgcolor: '#00d4ff' }}>Summary</Button>
            </Box>
          </Box>
        )}

        {/* Step 5: Summary */}
        {activeStep === 5 && (
          <Box>
            <Typography variant="h5" sx={{ mb: 3, color: '#00d4ff', fontWeight: 'bold' }}>Summary</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3, mb: 3 }}>
              <Paper sx={{ p: 3, bgcolor: 'rgba(0,212,255,0.1)', border: '1px solid #00d4ff' }}>
                <Typography variant="h6" sx={{ mb: 2, color: '#00d4ff' }}>Configuration</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Name:</Typography><Typography fontWeight="bold">{name}</Typography></Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Prediction:</Typography><Chip label={`${minPercent}% in ${futureMinutes}min`} size="small" color={direction === 'up' ? 'success' : 'error'} /></Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Direction:</Typography><Chip label={direction === 'up' ? 'PUMP' : 'RUG'} size="small" color={direction === 'up' ? 'success' : 'error'} /></Box>
                </Box>
              </Paper>

              <Paper sx={{ p: 3, bgcolor: 'rgba(156,39,176,0.1)', border: '1px solid #9c27b0' }}>
                <Typography variant="h6" sx={{ mb: 2, color: '#9c27b0' }}>Features</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Base:</Typography><Typography fontWeight="bold">{selectedBaseFeatures.length}</Typography></Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Engineering:</Typography><Chip label={selectedEngFeatures.length > 0 ? `+${selectedEngFeatures.length}` : 'Off'} size="small" color={selectedEngFeatures.length > 0 ? 'secondary' : 'default'} /></Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Total:</Typography><Typography fontWeight="bold" color="secondary">{totalFeatures}</Typography></Box>
                </Box>
              </Paper>

              <Paper sx={{ p: 3, bgcolor: 'rgba(255,152,0,0.1)', border: '1px solid #ff9800' }}>
                <Typography variant="h6" sx={{ mb: 2, color: '#ff9800' }}>Balance</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Method:</Typography><Chip label={balanceMethod === 'scale_pos_weight' ? 'scale_pos_weight' : balanceMethod === 'smote' ? 'SMOTE' : 'None'} size="small" /></Box>
                  {balanceMethod === 'scale_pos_weight' && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Weight:</Typography><Typography fontWeight="bold">{scaleWeight}x</Typography></Box>
                  )}
                </Box>
              </Paper>

              <Paper sx={{ p: 3, bgcolor: 'rgba(76,175,80,0.1)', border: '1px solid #4caf50' }}>
                <Typography variant="h6" sx={{ mb: 2, color: '#4caf50' }}>Time Range</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Start:</Typography><Typography fontWeight="bold">{new Date(trainStart).toLocaleString()}</Typography></Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">End:</Typography><Typography fontWeight="bold">{new Date(trainEnd).toLocaleString()}</Typography></Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Duration:</Typography><Chip label={`${Math.round((new Date(trainEnd).getTime() - new Date(trainStart).getTime()) / (1000 * 60 * 60))}h`} size="small" color="success" /></Box>
                </Box>
              </Paper>
            </Box>

            {result && (
              <Alert
                severity={result.success ? 'success' : 'error'}
                sx={{ mb: 3 }}
                action={
                  result.success ? (
                    <Button color="inherit" size="small" onClick={() => navigate('/training/jobs')}>
                      View Jobs
                    </Button>
                  ) : undefined
                }
              >
                {result.message}
                {result.jobId && <><br />Job ID: {result.jobId}</>}
              </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="outlined" onClick={() => setActiveStep(selectedPreset === 'custom' ? 4 : 0)} startIcon={<BackIcon />}>Back</Button>
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={isSubmitting || name.length < 3}
                startIcon={isSubmitting ? <RefreshIcon sx={{ animation: 'spin 1s linear infinite' }} /> : <RocketIcon />}
                sx={{ bgcolor: '#4caf50', px: 4, '&:hover': { bgcolor: '#45a049' } }}
              >
                {isSubmitting ? 'Training...' : 'TRAIN MODEL'}
              </Button>
            </Box>
          </Box>
        )}
      </Paper>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Box>
  );
};

export default CreateModel;
