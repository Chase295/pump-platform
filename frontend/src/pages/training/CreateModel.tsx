import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  Chip,
  Checkbox,
  Slider,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Switch,
  FormControlLabel,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Collapse,
  useMediaQuery,
  useTheme,
  Autocomplete,
  IconButton,
} from '@mui/material';
import {
  RocketLaunch as RocketIcon,
  TrendingUp as PumpIcon,
  TrendingDown as RugIcon,
  Speed as SpeedIcon,
  Balance as BalanceIcon,
  Psychology as BrainIcon,
  Science as ScienceIcon,
  Warning as WarningIcon,
  Tune as TuneIcon,
  ExpandMore as ExpandMoreIcon,
  Hub as GraphIcon,
  Fingerprint as EmbeddingIcon,
  Receipt as TransactionIcon,
  Label as MetadataIcon,
  Insights as ShapIcon,
  StopCircle as StopIcon,
  Security as ShieldIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Delete as DeleteIcon,
  Public as MarketIcon,
  Timeline as WindowsIcon,
  Block as ExcludeIcon,
  Code as ParamsIcon,
} from '@mui/icons-material';

import { useCreateModelForm } from './createModel/useCreateModelForm';
import { PRESETS } from './createModel/presets';
import {
  BASE_FEATURES,
  BASE_CATEGORIES,
  ENGINEERING_CATEGORIES,
  ENGINEERING_FEATURES,
  GRAPH_FEATURES,
  EMBEDDING_FEATURES,
  TRANSACTION_FEATURES,
  METADATA_FEATURES,
  getBaseFeaturesByCategory,
  getEngFeaturesByCategory,
  getHighImportanceEngFeatures,
  getEssentialBaseFeatures,
  getRecommendedBaseFeatures,
} from './createModel/features';

// ── Preset icon resolver ──────────────────────────────────────
const PRESET_ICONS: Record<string, React.ReactElement> = {
  speed: <SpeedIcon />,
  trending_up: <PumpIcon />,
  rocket: <RocketIcon />,
  shield: <ShieldIcon />,
  tune: <TuneIcon />,
};

// ── Section wrapper ───────────────────────────────────────────
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Paper sx={{ p: { xs: 2, md: 3 }, mb: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.06)' }}>
    <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, color: '#00d4ff', fontSize: '1rem' }}>{title}</Typography>
    {children}
  </Paper>
);

const CreateModel: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const {
    form,
    updateField,
    applyPreset,
    toggleBaseFeature,
    toggleEngFeature,
    toggleEngCategory,
    toggleBaseCategoryFeatures,
    toggleExtraFeature,
    toggleAllExtraFeatures,
    togglePhase,
    setTimeQuickRange,
    validation,
    totalFeatures,
    trainingDurationHours,
    availablePhases,
    phasesLoading,
    isSubmitting,
    result,
    handleSubmit,
  } = useCreateModelForm();

  // Expanded category tracking for inline feature display
  const [expandedBaseCat, setExpandedBaseCat] = useState<string | null>(null);
  const [expandedEngCat, setExpandedEngCat] = useState<string | null>(null);
  const [expandedExtraSource, setExpandedExtraSource] = useState<string | null>(null);

  // ── Summary content (shared between sidebar and mobile bar) ─
  const SummaryContent = () => {
    const startMs = new Date(form.trainStart).getTime();
    const endMs = new Date(form.trainEnd).getTime();
    const durationValid = !isNaN(startMs) && !isNaN(endMs) && endMs > startMs;

    return (
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: '#00d4ff', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
          Live Summary
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
          <Row label="Name" value={form.name || '—'} />
          <Row label="Type" value={form.modelType.toUpperCase()} />
          <Row label="Target" value={`${form.direction === 'up' ? '+' : '-'}${form.minPercentChange}% in ${form.futureMinutes}min`} color={form.direction === 'up' ? '#4caf50' : '#f44336'} />
          <Row label="Base" value={`${form.selectedBaseFeatures.length} features`} />
          <Row label="Engineered" value={form.selectedEngFeatures.length > 0 ? `+${form.selectedEngFeatures.length}` : 'Off'} />
          {form.selectedGraphFeatures.length > 0 && <Row label="Graph" value={`+${form.selectedGraphFeatures.length}`} />}
          {form.selectedEmbeddingFeatures.length > 0 && <Row label="Embedding" value={`+${form.selectedEmbeddingFeatures.length}`} />}
          {form.selectedTransactionFeatures.length > 0 && <Row label="Transaction" value={`+${form.selectedTransactionFeatures.length}`} />}
          {form.selectedMetadataFeatures.length > 0 && <Row label="Metadata" value={`+${form.selectedMetadataFeatures.length}`} />}
          <Row label="Total Features" value={String(totalFeatures)} bold />
          <Row label="Balance" value={form.balanceMethod === 'scale_pos_weight' ? `SPW ${form.scaleWeight}x` : form.balanceMethod === 'smote' ? 'SMOTE' : 'None'} />
          {durationValid && <Row label="Period" value={`${trainingDurationHours}h`} />}
        </Box>

        {/* Validation */}
        {validation.errors.length > 0 && (
          <Box sx={{ mt: 2 }}>
            {validation.errors.map((e) => (
              <Alert key={e} severity="error" sx={{ py: 0, mb: 0.5, fontSize: '0.75rem' }} icon={<ErrorIcon sx={{ fontSize: 16 }} />}>{e}</Alert>
            ))}
          </Box>
        )}
        {validation.warnings.length > 0 && (
          <Box sx={{ mt: 1 }}>
            {validation.warnings.map((w) => (
              <Alert key={w} severity="warning" sx={{ py: 0, mb: 0.5, fontSize: '0.75rem' }} icon={<WarningIcon sx={{ fontSize: 16 }} />}>{w}</Alert>
            ))}
          </Box>
        )}

        {/* Result */}
        {result && (
          <Alert
            severity={result.success ? 'success' : 'error'}
            sx={{ mt: 2, fontSize: '0.8rem' }}
            action={result.success ? <Button color="inherit" size="small" onClick={() => navigate('/training/jobs')}>View Jobs</Button> : undefined}
          >
            {result.message}
            {result.jobId && <><br />Job ID: {result.jobId}</>}
          </Alert>
        )}

        {/* Submit button */}
        {!isMobile && (
          <Button
            fullWidth
            variant="contained"
            onClick={handleSubmit}
            disabled={!validation.isValid || isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : <RocketIcon />}
            sx={{
              mt: 2,
              py: 1.5,
              bgcolor: '#4caf50',
              fontWeight: 700,
              fontSize: '0.95rem',
              '&:hover': { bgcolor: '#45a049' },
              '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}
          >
            {isSubmitting ? 'Training...' : 'TRAIN MODEL'}
          </Button>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ color: '#00d4ff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <BrainIcon /> Create ML Model
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Select a preset or customize every parameter
        </Typography>
      </Box>

      {/* ── Preset Bar ─────────────────────────────────────────── */}
      <Paper sx={{ p: 1.5, mb: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.06)' }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {PRESETS.map((preset) => {
            const isActive = form.activePreset === preset.id;
            return (
              <Chip
                key={preset.id}
                icon={PRESET_ICONS[preset.icon]}
                label={<><strong>{preset.name}</strong> <span style={{ opacity: 0.7 }}>{preset.subtitle}</span></>}
                onClick={() => applyPreset(preset.id)}
                variant={isActive ? 'filled' : 'outlined'}
                sx={{
                  borderColor: isActive ? preset.color : 'rgba(255,255,255,0.2)',
                  bgcolor: isActive ? `${preset.color}25` : 'transparent',
                  color: isActive ? preset.color : 'inherit',
                  fontWeight: isActive ? 700 : 400,
                  '& .MuiChip-icon': { color: isActive ? preset.color : 'inherit' },
                  '&:hover': { bgcolor: `${preset.color}15`, borderColor: preset.color },
                  px: 0.5,
                  height: 36,
                }}
              />
            );
          })}
        </Box>
      </Paper>

      {/* ── Main Content: Left Form + Right Summary ────────────── */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        {/* LEFT COLUMN */}
        <Box sx={{ flex: 1, minWidth: 0 }}>

          {/* Section 1: Model Identity */}
          <Section title="Model Identity">
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                label="Model Name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                size="small"
                sx={{ flex: '2 1 200px' }}
                helperText={form.name.length < 3 ? 'Min. 3 characters' : ''}
              />
              <ToggleButtonGroup
                value={form.modelType}
                exclusive
                onChange={(_, v) => v && updateField('modelType', v)}
                size="small"
                sx={{ flex: '1 1 160px' }}
              >
                <ToggleButton value="xgboost" sx={{ flex: 1, textTransform: 'none', fontWeight: form.modelType === 'xgboost' ? 700 : 400 }}>
                  <BrainIcon sx={{ mr: 0.5, fontSize: 18 }} /> XGBoost
                </ToggleButton>
                <ToggleButton value="lightgbm" sx={{ flex: 1, textTransform: 'none', fontWeight: form.modelType === 'lightgbm' ? 700 : 400 }}>
                  <ScienceIcon sx={{ mr: 0.5, fontSize: 18 }} /> LightGBM
                </ToggleButton>
              </ToggleButtonGroup>
              <ToggleButtonGroup
                value={form.direction}
                exclusive
                onChange={(_, v) => v && updateField('direction', v)}
                size="small"
                sx={{ flex: '1 1 120px' }}
              >
                <ToggleButton value="up" sx={{ flex: 1, textTransform: 'none', color: form.direction === 'up' ? '#4caf50' : undefined, fontWeight: form.direction === 'up' ? 700 : 400 }}>
                  <PumpIcon sx={{ mr: 0.5, fontSize: 18 }} /> PUMP
                </ToggleButton>
                <ToggleButton value="down" sx={{ flex: 1, textTransform: 'none', color: form.direction === 'down' ? '#f44336' : undefined, fontWeight: form.direction === 'down' ? 700 : 400 }}>
                  <RugIcon sx={{ mr: 0.5, fontSize: 18 }} /> RUG
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Section>

          {/* Section 2: Prediction Target */}
          <Section title="Prediction Target">
            <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 200px' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Min Price Change: <strong>{form.minPercentChange}%</strong></Typography>
                <Slider
                  value={form.minPercentChange}
                  onChange={(_, v) => updateField('minPercentChange', v as number)}
                  min={1} max={50}
                  marks={[{ value: 5, label: '5%' }, { value: 10, label: '10%' }, { value: 25, label: '25%' }, { value: 50, label: '50%' }]}
                  valueLabelDisplay="auto"
                />
              </Box>
              <Box sx={{ flex: '1 1 200px' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Time Window: <strong>{form.futureMinutes} min</strong></Typography>
                <Slider
                  value={form.futureMinutes}
                  onChange={(_, v) => updateField('futureMinutes', v as number)}
                  min={1} max={60}
                  marks={[{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 15, label: '15' }, { value: 30, label: '30' }, { value: 60, label: '60' }]}
                  valueLabelDisplay="auto"
                />
              </Box>
            </Box>
            <Alert severity={form.direction === 'up' ? 'success' : 'error'} sx={{ mt: 1 }} icon={form.direction === 'up' ? <PumpIcon /> : <RugIcon />}>
              Price {form.direction === 'up' ? 'increases' : 'decreases'} by <strong>&ge;{form.minPercentChange}%</strong> within <strong>{form.futureMinutes} minutes</strong>
            </Alert>
          </Section>

          {/* Section 3: Features */}
          <Section title="Features">
            {/* Base Features */}
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
              Base Features ({form.selectedBaseFeatures.length}/{BASE_FEATURES.length})
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5, flexWrap: 'wrap' }}>
              <Button size="small" variant="outlined" onClick={() => updateField('selectedBaseFeatures', getEssentialBaseFeatures())}>Essential</Button>
              <Button size="small" variant="outlined" onClick={() => updateField('selectedBaseFeatures', getRecommendedBaseFeatures())}>+ Recommended</Button>
              <Button size="small" variant="outlined" onClick={() => updateField('selectedBaseFeatures', BASE_FEATURES.map((f) => f.id))}>All</Button>
              <Button size="small" variant="outlined" color="error" onClick={() => updateField('selectedBaseFeatures', [])}>None</Button>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
              {BASE_CATEGORIES.map((cat) => {
                const catFeatures = getBaseFeaturesByCategory(cat.id);
                const selectedCount = catFeatures.filter((f) => form.selectedBaseFeatures.includes(f.id)).length;
                const allSelected = selectedCount === catFeatures.length;
                const isExpanded = expandedBaseCat === cat.id;
                return (
                  <Tooltip key={cat.id} title={cat.desc}>
                    <Chip
                      label={`${cat.name} ${selectedCount}/${catFeatures.length}`}
                      size="small"
                      variant={selectedCount > 0 ? 'filled' : 'outlined'}
                      color={allSelected ? 'primary' : selectedCount > 0 ? 'default' : 'default'}
                      onClick={() => setExpandedBaseCat(isExpanded ? null : cat.id)}
                      onDelete={() => toggleBaseCategoryFeatures(catFeatures.map((f) => f.id))}
                      deleteIcon={allSelected ? <CheckIcon sx={{ fontSize: 16 }} /> : undefined}
                      sx={{
                        bgcolor: allSelected ? 'rgba(0,212,255,0.2)' : selectedCount > 0 ? 'rgba(255,255,255,0.08)' : 'transparent',
                        borderColor: isExpanded ? '#00d4ff' : undefined,
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>
            <Collapse in={expandedBaseCat !== null}>
              {expandedBaseCat && (
                <Paper sx={{ p: 1.5, mb: 1.5, bgcolor: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {getBaseFeaturesByCategory(expandedBaseCat).map((f) => (
                      <Tooltip key={f.id} title={f.desc}>
                        <Chip
                          label={f.name}
                          size="small"
                          icon={<Checkbox checked={form.selectedBaseFeatures.includes(f.id)} sx={{ p: 0, '& .MuiSvgIcon-root': { fontSize: 16 } }} />}
                          onClick={() => toggleBaseFeature(f.id)}
                          variant={form.selectedBaseFeatures.includes(f.id) ? 'filled' : 'outlined'}
                          sx={{ bgcolor: form.selectedBaseFeatures.includes(f.id) ? 'rgba(0,212,255,0.15)' : 'transparent' }}
                        />
                      </Tooltip>
                    ))}
                  </Box>
                </Paper>
              )}
            </Collapse>

            {/* Engineering Features */}
            <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, fontWeight: 700 }}>
              Engineered Features ({form.selectedEngFeatures.length}/{ENGINEERING_FEATURES.length})
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5, flexWrap: 'wrap' }}>
              <Button size="small" variant="outlined" onClick={() => updateField('selectedEngFeatures', getHighImportanceEngFeatures())}>High Importance</Button>
              <Button size="small" variant="outlined" onClick={() => updateField('selectedEngFeatures', ENGINEERING_FEATURES.map((f) => f.id))}>All</Button>
              <Button size="small" variant="outlined" color="error" onClick={() => updateField('selectedEngFeatures', [])}>None</Button>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
              {ENGINEERING_CATEGORIES.map((cat) => {
                const catFeatures = getEngFeaturesByCategory(cat.id);
                if (catFeatures.length === 0) return null;
                const selectedCount = catFeatures.filter((f) => form.selectedEngFeatures.includes(f.id)).length;
                const allSelected = selectedCount === catFeatures.length;
                const isExpanded = expandedEngCat === cat.id;
                return (
                  <Tooltip key={cat.id} title={cat.desc}>
                    <Chip
                      label={`${cat.name} ${selectedCount}/${catFeatures.length}`}
                      size="small"
                      variant={selectedCount > 0 ? 'filled' : 'outlined'}
                      color={allSelected ? 'secondary' : 'default'}
                      onClick={() => setExpandedEngCat(isExpanded ? null : cat.id)}
                      onDelete={() => toggleEngCategory(catFeatures.map((f) => f.id))}
                      deleteIcon={allSelected ? <CheckIcon sx={{ fontSize: 16 }} /> : undefined}
                      sx={{
                        bgcolor: allSelected ? 'rgba(156,39,176,0.2)' : selectedCount > 0 ? 'rgba(255,255,255,0.08)' : 'transparent',
                        borderColor: isExpanded ? '#9c27b0' : undefined,
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>
            <Collapse in={expandedEngCat !== null}>
              {expandedEngCat && (
                <Paper sx={{ p: 1.5, mb: 1.5, bgcolor: 'rgba(156,39,176,0.05)', border: '1px solid rgba(156,39,176,0.2)', borderRadius: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {getEngFeaturesByCategory(expandedEngCat).map((f) => (
                      <Chip
                        key={f.id}
                        label={f.id}
                        size="small"
                        icon={<Checkbox checked={form.selectedEngFeatures.includes(f.id)} sx={{ p: 0, '& .MuiSvgIcon-root': { fontSize: 16 } }} />}
                        onClick={() => toggleEngFeature(f.id)}
                        variant={form.selectedEngFeatures.includes(f.id) ? 'filled' : 'outlined'}
                        sx={{ bgcolor: form.selectedEngFeatures.includes(f.id) ? 'rgba(156,39,176,0.15)' : 'transparent' }}
                      />
                    ))}
                  </Box>
                </Paper>
              )}
            </Collapse>

            {/* Extra Feature Sources */}
            <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, fontWeight: 700 }}>Extra Sources</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5, flexWrap: 'wrap' }}>
              <Button size="small" variant="outlined" onClick={() => { toggleAllExtraFeatures('selectedGraphFeatures', GRAPH_FEATURES.map((f) => f.id)); toggleAllExtraFeatures('selectedEmbeddingFeatures', EMBEDDING_FEATURES.map((f) => f.id)); toggleAllExtraFeatures('selectedTransactionFeatures', TRANSACTION_FEATURES.map((f) => f.id)); toggleAllExtraFeatures('selectedMetadataFeatures', METADATA_FEATURES.map((f) => f.id)); }}>All Sources</Button>
              <Button size="small" variant="outlined" color="error" onClick={() => { updateField('selectedGraphFeatures', []); updateField('selectedEmbeddingFeatures', []); updateField('selectedTransactionFeatures', []); updateField('selectedMetadataFeatures', []); }}>None</Button>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
              {([
                { key: 'selectedGraphFeatures' as const, features: GRAPH_FEATURES, label: 'Graph', icon: <GraphIcon sx={{ fontSize: 18 }} />, color: '#00d4ff' },
                { key: 'selectedEmbeddingFeatures' as const, features: EMBEDDING_FEATURES, label: 'Embedding', icon: <EmbeddingIcon sx={{ fontSize: 18 }} />, color: '#9c27b0' },
                { key: 'selectedTransactionFeatures' as const, features: TRANSACTION_FEATURES, label: 'Transaction', icon: <TransactionIcon sx={{ fontSize: 18 }} />, color: '#00bcd4' },
                { key: 'selectedMetadataFeatures' as const, features: METADATA_FEATURES, label: 'Metadata', icon: <MetadataIcon sx={{ fontSize: 18 }} />, color: '#ff9800' },
              ]).map((source) => {
                const selectedCount = form[source.key].length;
                const totalCount = source.features.length;
                const allSelected = selectedCount === totalCount;
                const isExpanded = expandedExtraSource === source.key;
                return (
                  <Tooltip key={source.key} title={`${source.label} features (${selectedCount}/${totalCount})`}>
                    <Chip
                      icon={source.icon}
                      label={`${source.label} ${selectedCount}/${totalCount}`}
                      size="small"
                      variant={selectedCount > 0 ? 'filled' : 'outlined'}
                      onClick={() => setExpandedExtraSource(isExpanded ? null : source.key)}
                      onDelete={() => toggleAllExtraFeatures(source.key, source.features.map((f) => f.id))}
                      deleteIcon={allSelected ? <CheckIcon sx={{ fontSize: 16 }} /> : undefined}
                      sx={{
                        bgcolor: allSelected ? `${source.color}33` : selectedCount > 0 ? 'rgba(255,255,255,0.08)' : 'transparent',
                        borderColor: isExpanded ? source.color : selectedCount > 0 ? `${source.color}80` : undefined,
                        '& .MuiChip-icon': { color: selectedCount > 0 ? source.color : undefined },
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>
            <Collapse in={expandedExtraSource !== null}>
              {expandedExtraSource && (() => {
                const sourceMap = {
                  selectedGraphFeatures: { features: GRAPH_FEATURES, color: '#00d4ff' },
                  selectedEmbeddingFeatures: { features: EMBEDDING_FEATURES, color: '#9c27b0' },
                  selectedTransactionFeatures: { features: TRANSACTION_FEATURES, color: '#00bcd4' },
                  selectedMetadataFeatures: { features: METADATA_FEATURES, color: '#ff9800' },
                } as const;
                const source = sourceMap[expandedExtraSource as keyof typeof sourceMap];
                if (!source) return null;
                const selected = form[expandedExtraSource as keyof typeof sourceMap];
                return (
                  <Paper sx={{ p: 1.5, mb: 1.5, bgcolor: `${source.color}0a`, border: `1px solid ${source.color}33`, borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {source.features.map((f) => (
                        <Tooltip key={f.id} title={f.desc}>
                          <Chip
                            label={f.name}
                            size="small"
                            icon={<Checkbox checked={selected.includes(f.id)} sx={{ p: 0, '& .MuiSvgIcon-root': { fontSize: 16 } }} />}
                            onClick={() => toggleExtraFeature(expandedExtraSource as keyof typeof sourceMap, f.id)}
                            variant={selected.includes(f.id) ? 'filled' : 'outlined'}
                            sx={{ bgcolor: selected.includes(f.id) ? `${source.color}25` : 'transparent' }}
                          />
                        </Tooltip>
                      ))}
                    </Box>
                  </Paper>
                );
              })()}
            </Collapse>
          </Section>

          {/* Section 4: Training Data */}
          <Section title="Training Data">
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Start"
                type="datetime-local"
                value={form.trainStart}
                onChange={(e) => updateField('trainStart', e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{ flex: '1 1 200px' }}
              />
              <TextField
                label="End"
                type="datetime-local"
                value={form.trainEnd}
                onChange={(e) => updateField('trainEnd', e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{ flex: '1 1 200px' }}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
              {[6, 12, 24, 48].map((h) => (
                <Button key={h} size="small" variant="outlined" onClick={() => setTimeQuickRange(h)}>{h}h</Button>
              ))}
            </Box>

            {/* Phase Filter */}
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Phase Filter</Typography>
            {phasesLoading ? (
              <CircularProgress size={20} />
            ) : (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                <Chip
                  label="All"
                  size="small"
                  variant={form.selectedPhases.length === availablePhases.length ? 'filled' : 'outlined'}
                  color={form.selectedPhases.length === availablePhases.length ? 'primary' : 'default'}
                  onClick={() => updateField('selectedPhases', form.selectedPhases.length === availablePhases.length ? [] : availablePhases.map((p) => p.id))}
                />
                {availablePhases.map((phase) => (
                  <Chip
                    key={phase.id}
                    label={phase.name}
                    size="small"
                    variant={form.selectedPhases.includes(phase.id) ? 'filled' : 'outlined'}
                    color={form.selectedPhases.includes(phase.id) ? 'primary' : 'default'}
                    onClick={() => togglePhase(phase.id)}
                    sx={{ bgcolor: form.selectedPhases.includes(phase.id) ? 'rgba(0,212,255,0.15)' : 'transparent' }}
                  />
                ))}
              </Box>
            )}
          </Section>

          {/* Section 5: Advanced Options (collapsed) */}
          <Accordion sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px !important', mb: 2, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#ff9800', fontSize: '1rem' }}>Advanced Options</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {/* Balance Method */}
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Balance Method</Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {([
                  { id: 'scale_pos_weight' as const, label: 'SPW', desc: 'Recommended', color: '#ff9800', icon: <BalanceIcon sx={{ fontSize: 18 }} /> },
                  { id: 'smote' as const, label: 'SMOTE', desc: 'Synthetic oversampling', color: '#00bcd4', icon: <ScienceIcon sx={{ fontSize: 18 }} /> },
                  { id: 'none' as const, label: 'None', desc: 'Not recommended', color: '#666', icon: <WarningIcon sx={{ fontSize: 18 }} /> },
                ]).map((b) => (
                  <Chip
                    key={b.id}
                    icon={b.icon}
                    label={b.label}
                    onClick={() => updateField('balanceMethod', b.id)}
                    variant={form.balanceMethod === b.id ? 'filled' : 'outlined'}
                    sx={{
                      borderColor: form.balanceMethod === b.id ? b.color : undefined,
                      bgcolor: form.balanceMethod === b.id ? `${b.color}25` : 'transparent',
                      color: form.balanceMethod === b.id ? b.color : undefined,
                      '& .MuiChip-icon': { color: form.balanceMethod === b.id ? b.color : undefined },
                    }}
                  />
                ))}
              </Box>
              {form.balanceMethod === 'scale_pos_weight' && (
                <Box sx={{ mb: 2, px: 1 }}>
                  <Typography variant="body2" color="text.secondary">Weight: <strong>{form.scaleWeight}x</strong></Typography>
                  <Slider
                    value={form.scaleWeight}
                    onChange={(_, v) => updateField('scaleWeight', v as number)}
                    min={10} max={300}
                    marks={[{ value: 50, label: '50' }, { value: 100, label: '100' }, { value: 200, label: '200' }]}
                    valueLabelDisplay="auto"
                  />
                </Box>
              )}

              {/* Flag Features */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <FormControlLabel
                  control={<Switch checked={form.useFlagFeatures} onChange={(e) => updateField('useFlagFeatures', e.target.checked)} size="small" />}
                  label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Flag Features</Typography>}
                />
                <Typography variant="caption" color="text.secondary">Shows model whether eng features have enough data</Typography>
              </Box>

              {/* Early Stopping */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <StopIcon sx={{ fontSize: 20, color: form.earlyStoppingRounds > 0 ? '#ff9800' : '#666' }} />
                <FormControlLabel
                  control={<Switch checked={form.earlyStoppingRounds > 0} onChange={(e) => updateField('earlyStoppingRounds', e.target.checked ? 10 : 0)} size="small" />}
                  label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Early Stopping</Typography>}
                />
                <Typography variant="caption" color="text.secondary">Prevents overfitting</Typography>
              </Box>
              {form.earlyStoppingRounds > 0 && (
                <Box sx={{ mb: 2, px: 3 }}>
                  <Typography variant="body2" color="text.secondary">Patience: {form.earlyStoppingRounds} rounds</Typography>
                  <Slider value={form.earlyStoppingRounds} onChange={(_, v) => updateField('earlyStoppingRounds', v as number)} min={5} max={50} step={5} valueLabelDisplay="auto" />
                </Box>
              )}

              {/* SHAP */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <ShapIcon sx={{ fontSize: 20, color: form.enableShap ? '#9c27b0' : '#666' }} />
                <FormControlLabel
                  control={<Switch checked={form.enableShap} onChange={(e) => updateField('enableShap', e.target.checked)} size="small" />}
                  label={<Typography variant="body2" sx={{ fontWeight: 600 }}>SHAP Explainability</Typography>}
                />
                <Typography variant="caption" color="text.secondary">Feature importance (slower training)</Typography>
              </Box>

              {/* Description */}
              <Typography variant="subtitle2" sx={{ mb: 1, mt: 1, fontWeight: 700 }}>Description</Typography>
              <TextField
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                size="small"
                fullWidth
                multiline
                minRows={2}
                maxRows={4}
                placeholder="Optional model description..."
                sx={{ mb: 2 }}
              />

              {/* CV Splits */}
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Cross-Validation Splits</Typography>
              <Box sx={{ mb: 2, px: 1 }}>
                <Typography variant="body2" color="text.secondary">Splits: <strong>{form.cvSplits}</strong></Typography>
                <Slider
                  value={form.cvSplits}
                  onChange={(_, v) => updateField('cvSplits', v as number)}
                  min={2} max={10} step={1}
                  marks={[{ value: 2, label: '2' }, { value: 5, label: '5' }, { value: 10, label: '10' }]}
                  valueLabelDisplay="auto"
                />
              </Box>

              {/* TimeSeriesSplit */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <FormControlLabel
                  control={<Switch checked={form.useTimeseriesSplit} onChange={(e) => updateField('useTimeseriesSplit', e.target.checked)} size="small" />}
                  label={<Typography variant="body2" sx={{ fontWeight: 600 }}>TimeSeriesSplit</Typography>}
                />
                <Typography variant="caption" color="text.secondary">Preserves temporal order in CV (recommended for time-series data)</Typography>
              </Box>

              {/* Tuning */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TuneIcon sx={{ fontSize: 20, color: form.enableTuning ? '#00d4ff' : '#666' }} />
                <FormControlLabel
                  control={<Switch checked={form.enableTuning} onChange={(e) => updateField('enableTuning', e.target.checked)} size="small" />}
                  label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Hyperparameter Tuning</Typography>}
                />
                <Typography variant="caption" color="text.secondary">Auto-optimize after training</Typography>
              </Box>
              {form.enableTuning && (
                <Box sx={{ mb: 1, px: 3 }}>
                  <Typography variant="body2" color="text.secondary">Iterations: {form.tuningIterations}</Typography>
                  <Slider value={form.tuningIterations} onChange={(_, v) => updateField('tuningIterations', v as number)} min={10} max={100} step={10} valueLabelDisplay="auto" />
                </Box>
              )}

              {/* Market Context */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, mt: 1 }}>
                <MarketIcon sx={{ fontSize: 20, color: form.useMarketContext ? '#4caf50' : '#666' }} />
                <FormControlLabel
                  control={<Switch checked={form.useMarketContext} onChange={(e) => updateField('useMarketContext', e.target.checked)} size="small" />}
                  label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Market Context</Typography>}
                />
                <Typography variant="caption" color="text.secondary">Include SOL price & macro context as features</Typography>
              </Box>

              {/* Feature Engineering Windows */}
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <WindowsIcon sx={{ fontSize: 18 }} /> Feature Engineering Windows
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Window sizes for rolling feature calculations (only used with engineered features)
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                {[5, 10, 15, 20, 30, 60].map((w) => {
                  const active = form.featureWindows.includes(w);
                  return (
                    <Chip
                      key={w}
                      label={`${w}`}
                      size="small"
                      variant={active ? 'filled' : 'outlined'}
                      onClick={() => {
                        const next = active
                          ? form.featureWindows.filter((v) => v !== w)
                          : [...form.featureWindows, w].sort((a, b) => a - b);
                        updateField('featureWindows', next);
                      }}
                      sx={{
                        bgcolor: active ? 'rgba(0,212,255,0.2)' : 'transparent',
                        borderColor: active ? '#00d4ff' : undefined,
                        color: active ? '#00d4ff' : undefined,
                        fontWeight: active ? 700 : 400,
                      }}
                    />
                  );
                })}
              </Box>

              {/* Feature Exclusion */}
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ExcludeIcon sx={{ fontSize: 18 }} /> Exclude Features
              </Typography>
              <Autocomplete
                multiple
                size="small"
                options={[
                  ...BASE_FEATURES.map((f) => f.id),
                  ...ENGINEERING_FEATURES.map((f) => f.id),
                  ...GRAPH_FEATURES.map((f) => f.id),
                  ...EMBEDDING_FEATURES.map((f) => f.id),
                  ...TRANSACTION_FEATURES.map((f) => f.id),
                  ...METADATA_FEATURES.map((f) => f.id),
                ]}
                value={form.excludeFeatures}
                onChange={(_, val) => updateField('excludeFeatures', val)}
                renderInput={(params) => <TextField {...params} placeholder="Select features to exclude..." />}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => {
                    const { key, ...rest } = getTagProps({ index });
                    return <Chip key={key} label={option} size="small" color="error" variant="outlined" {...rest} />;
                  })
                }
                sx={{ mb: 2 }}
              />

              {/* Custom Hyperparameters */}
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ParamsIcon sx={{ fontSize: 18 }} /> Custom Hyperparameters
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Override model hyperparameters (e.g. max_depth, learning_rate, n_estimators)
              </Typography>
              {Object.entries(form.customParams).map(([key, val]) => (
                <Box key={key} sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'center' }}>
                  <TextField size="small" value={key} disabled sx={{ flex: 1 }} />
                  <TextField
                    size="small"
                    value={val}
                    onChange={(e) => {
                      const next = { ...form.customParams, [key]: e.target.value };
                      updateField('customParams', next);
                    }}
                    sx={{ flex: 1 }}
                    placeholder="Value"
                  />
                  <IconButton
                    size="small"
                    onClick={() => {
                      const next = { ...form.customParams };
                      delete next[key];
                      updateField('customParams', next);
                    }}
                    sx={{ color: '#f44336' }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              <Autocomplete
                freeSolo
                size="small"
                options={['max_depth', 'learning_rate', 'n_estimators', 'subsample', 'colsample_bytree', 'num_leaves', 'min_child_weight', 'reg_alpha', 'reg_lambda'].filter(
                  (o) => !(o in form.customParams)
                )}
                renderInput={(params) => <TextField {...params} placeholder="Add parameter..." />}
                onChange={(_, val) => {
                  if (val && typeof val === 'string' && val.trim()) {
                    updateField('customParams', { ...form.customParams, [val.trim()]: '' });
                  }
                }}
                value={null}
                blurOnSelect
                sx={{ mb: 2 }}
              />
            </AccordionDetails>
          </Accordion>
        </Box>

        {/* RIGHT COLUMN: Sticky Summary (desktop only) */}
        {!isMobile && (
          <Paper
            sx={{
              width: 280,
              flexShrink: 0,
              p: 2,
              position: 'sticky',
              top: 80,
              bgcolor: 'rgba(255,255,255,0.03)',
              borderRadius: 2,
              border: '1px solid rgba(255,255,255,0.08)',
              maxHeight: 'calc(100vh - 100px)',
              overflowY: 'auto',
            }}
          >
            <SummaryContent />
          </Paper>
        )}
      </Box>

      {/* ── Mobile Bottom Bar ──────────────────────────────────── */}
      {isMobile && (
        <Paper
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            p: 2,
            bgcolor: '#1a1a2e',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap>
              {form.name || 'Unnamed'} &middot; {totalFeatures} features &middot; {form.direction === 'up' ? '+' : '-'}{form.minPercentChange}% / {form.futureMinutes}m
            </Typography>
            {validation.errors.length > 0 && (
              <Typography variant="caption" color="error">{validation.errors[0]}</Typography>
            )}
          </Box>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!validation.isValid || isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : <RocketIcon />}
            sx={{ bgcolor: '#4caf50', fontWeight: 700, flexShrink: 0, '&:hover': { bgcolor: '#45a049' } }}
          >
            {isSubmitting ? '...' : 'TRAIN'}
          </Button>
        </Paper>
      )}

      {/* Mobile spacer so content isn't hidden behind bottom bar */}
      {isMobile && <Box sx={{ height: 80 }} />}
    </Box>
  );
};

// ── Helper component ──────────────────────────────────────────
const Row: React.FC<{ label: string; value: string; color?: string; bold?: boolean }> = ({ label, value, color, bold }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="caption" sx={{ fontWeight: bold ? 700 : 500, color: color || 'text.primary' }}>{value}</Typography>
  </Box>
);

export default CreateModel;
