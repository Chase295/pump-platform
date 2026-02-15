import React, { useState } from 'react';
import {
  Typography,
  Box,
  TextField,
  Button,
  Alert,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  useMediaQuery,
  useTheme,
  Grid,
  LinearProgress,
} from '@mui/material';
import {
  Save as SaveIcon,
  Edit as EditIcon,
  Cancel as CancelIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Layers as LayersIcon,
  Stream as StreamIcon,
  Star as StarIcon,
  Hub as HubIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { findApi } from '../../services/api';
import type { Phase, PhaseUpdateRequest, PhaseCreateRequest, StreamStats } from '../../types/find';
import DiscoveryStatCard from '../../components/discovery/DiscoveryStatCard';
import PhaseDistributionChart from '../../components/discovery/PhaseDistributionChart';
import { getPhaseColor } from '../../utils/phaseColors';

interface EditingPhase extends Phase {
  isEditing: boolean;
  originalData: Phase;
}

interface NewPhaseForm {
  name: string;
  interval_seconds: number;
  min_age_minutes: number;
  max_age_minutes: number;
}

const darkTextFieldSx = {
  '& .MuiOutlinedInput-root': {
    color: '#fff',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
    '&:hover fieldset': { borderColor: 'rgba(0,212,255,0.5)' },
    '&.Mui-focused fieldset': { borderColor: '#00d4ff' },
  },
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#00d4ff' },
  '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.4)' },
};

const Phases: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // --- react-query ---
  const { data: rawPhases, isLoading, refetch } = useQuery<Phase[]>({
    queryKey: ['find', 'phases'],
    queryFn: async () => {
      const res = await findApi.getPhases();
      return res.data.phases ?? res.data;
    },
    refetchInterval: 30000,
  });

  const { data: streamStats } = useQuery<StreamStats>({
    queryKey: ['find', 'streamStats'],
    queryFn: async () => (await findApi.getStreamStats()).data,
    refetchInterval: 10000,
  });

  // --- local state ---
  const [editingPhases, setEditingPhases] = useState<Record<number, EditingPhase>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [phaseToDelete, setPhaseToDelete] = useState<Phase | null>(null);
  const [newPhase, setNewPhase] = useState<NewPhaseForm>({
    name: '',
    interval_seconds: 15,
    min_age_minutes: 0,
    max_age_minutes: 60,
  });

  const phases = rawPhases ?? [];
  const regularPhases = phases.filter(p => p.id < 99);
  const systemPhases = phases.filter(p => p.id >= 99);
  const canDeletePhases = regularPhases.length > 1;

  // Derive stat values
  const largestPhase = React.useMemo(() => {
    if (!streamStats?.streams_by_phase) return '--';
    let maxCount = 0;
    let maxName = '--';
    for (const [id, count] of Object.entries(streamStats.streams_by_phase)) {
      if (count > maxCount) {
        maxCount = count;
        maxName = phases.find(p => p.id === Number(id))?.name ?? `Phase ${id}`;
      }
    }
    return maxName;
  }, [streamStats, phases]);

  // --- handlers ---
  const getEditingPhase = (phase: Phase): EditingPhase => {
    return editingPhases[phase.id] ?? { ...phase, isEditing: false, originalData: { ...phase } };
  };

  const handleEdit = (phase: Phase) => {
    setEditingPhases(prev => ({
      ...prev,
      [phase.id]: { ...phase, isEditing: true, originalData: { ...phase } },
    }));
  };

  const handleCancel = (phaseId: number) => {
    setEditingPhases(prev => {
      const next = { ...prev };
      delete next[phaseId];
      return next;
    });
  };

  const handleFieldChange = (phaseId: number, field: keyof Phase, value: string | number) => {
    setEditingPhases(prev => ({
      ...prev,
      [phaseId]: { ...prev[phaseId], [field]: value },
    }));
  };

  const handleSave = async (phase: EditingPhase) => {
    setSaving(true);
    setError(null);

    if (phase.interval_seconds < 1) {
      setError('Interval must be at least 1 second');
      setSaving(false);
      return;
    }
    if (phase.max_age_minutes <= phase.min_age_minutes) {
      setError('Max Age must be greater than Min Age');
      setSaving(false);
      return;
    }

    try {
      const updateData: PhaseUpdateRequest = {};
      if (phase.name !== phase.originalData.name) updateData.name = phase.name;
      if (phase.interval_seconds !== phase.originalData.interval_seconds)
        updateData.interval_seconds = phase.interval_seconds;
      if (phase.min_age_minutes !== phase.originalData.min_age_minutes)
        updateData.min_age_minutes = phase.min_age_minutes;
      if (phase.max_age_minutes !== phase.originalData.max_age_minutes)
        updateData.max_age_minutes = phase.max_age_minutes;

      if (Object.keys(updateData).length === 0) {
        setSuccessMessage('No changes detected');
        setTimeout(() => setSuccessMessage(''), 3000);
        handleCancel(phase.id);
        setSaving(false);
        return;
      }

      const res = await findApi.updatePhase(phase.id, updateData as Record<string, unknown>);
      const result = res.data;
      setSuccessMessage(`Phase "${result.phase.name}" updated. ${result.updated_streams} streams adjusted.`);
      setTimeout(() => setSuccessMessage(''), 5000);
      handleCancel(phase.id);
      refetch();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || 'Failed to save phase');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAddDialog = () => {
    const lastPhase = regularPhases[regularPhases.length - 1];
    setNewPhase({
      name: `Phase ${regularPhases.length + 1}`,
      interval_seconds: 15,
      min_age_minutes: lastPhase ? lastPhase.max_age_minutes : 0,
      max_age_minutes: lastPhase ? lastPhase.max_age_minutes + 60 : 60,
    });
    setAddDialogOpen(true);
  };

  const handleAddPhase = async () => {
    setSaving(true);
    setError(null);

    if (!newPhase.name.trim()) { setError('Name must not be empty'); setSaving(false); return; }
    if (newPhase.interval_seconds < 1) { setError('Interval must be at least 1 second'); setSaving(false); return; }
    if (newPhase.max_age_minutes <= newPhase.min_age_minutes) { setError('Max Age must be greater than Min Age'); setSaving(false); return; }

    try {
      const createData: PhaseCreateRequest = {
        name: newPhase.name.trim(),
        interval_seconds: newPhase.interval_seconds,
        min_age_minutes: newPhase.min_age_minutes,
        max_age_minutes: newPhase.max_age_minutes,
      };
      const res = await findApi.createPhase(createData);
      const result = res.data;
      setSuccessMessage(`Phase "${result.phase.name}" (ID: ${result.phase.id}) created.`);
      setTimeout(() => setSuccessMessage(''), 5000);
      setAddDialogOpen(false);
      refetch();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || 'Failed to create phase');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDeleteDialog = (phase: Phase) => {
    setPhaseToDelete(phase);
    setDeleteDialogOpen(true);
  };

  const handleDeletePhase = async () => {
    if (!phaseToDelete) return;
    setSaving(true);
    setError(null);

    try {
      const res = await findApi.deletePhase(phaseToDelete.id);
      setSuccessMessage(res.data.message);
      setTimeout(() => setSuccessMessage(''), 5000);
      setDeleteDialogOpen(false);
      setPhaseToDelete(null);
      refetch();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || 'Failed to delete phase');
    } finally {
      setSaving(false);
    }
  };

  // --- loading state ---
  if (isLoading && phases.length === 0) {
    return (
      <Box sx={{ mt: 4 }}>
        <LinearProgress sx={{ mb: 2, '& .MuiLinearProgress-bar': { bgcolor: '#00d4ff' } }} />
        <Typography variant="h6" sx={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
          Loading phases...
        </Typography>
      </Box>
    );
  }

  // --- Phase Timeline Bar ---
  const totalDuration = regularPhases.reduce((sum, p) => sum + (p.max_age_minutes - p.min_age_minutes), 0);

  return (
    <Box>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', sm: 'center' },
        mb: 3,
        gap: 2,
      }}>
        <Typography variant={isMobile ? 'h5' : 'h4'} sx={{ fontWeight: 700, color: '#fff' }}>
          Tracking Phases
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenAddDialog}
            disabled={saving}
            size={isMobile ? 'small' : 'medium'}
            sx={{
              bgcolor: '#00d4ff',
              color: '#0f0f23',
              fontWeight: 700,
              '&:hover': { bgcolor: '#00b8e6' },
            }}
          >
            New Phase
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}

      {/* A) Live Stats Row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <DiscoveryStatCard
            label="Total Phases"
            value={regularPhases.length}
            sublabel="regular phases"
            icon={<LayersIcon fontSize="small" />}
            accentColor="0, 212, 255"
            loading={isLoading}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <DiscoveryStatCard
            label="Active Streams"
            value={streamStats?.active_streams ?? '--'}
            sublabel="currently tracking"
            icon={<StreamIcon fontSize="small" />}
            accentColor="76, 175, 80"
            loading={!streamStats}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <DiscoveryStatCard
            label="Largest Phase"
            value={largestPhase}
            sublabel="most streams"
            icon={<StarIcon fontSize="small" />}
            accentColor="33, 150, 243"
            loading={!streamStats}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <DiscoveryStatCard
            label="Total Streams"
            value={streamStats?.total_streams ?? '--'}
            sublabel="all phases"
            icon={<HubIcon fontSize="small" />}
            accentColor="156, 39, 176"
            loading={!streamStats}
          />
        </Grid>
      </Grid>

      {/* B) Phase Timeline Bar */}
      {regularPhases.length > 0 && totalDuration > 0 && (
        <Card sx={{
          mb: 3,
          bgcolor: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(10px)',
        }}>
          <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.7rem', mb: 1.5 }}
            >
              Phase Timeline
            </Typography>
            <Box sx={{ display: 'flex', borderRadius: 1, overflow: 'hidden', height: { xs: 32, sm: 40 } }}>
              {regularPhases.map((p) => {
                const duration = p.max_age_minutes - p.min_age_minutes;
                const pct = (duration / totalDuration) * 100;
                const color = getPhaseColor(p.id);
                return (
                  <Tooltip key={p.id} title={`${p.name}: ${p.min_age_minutes}m – ${p.max_age_minutes}m (${duration}m)`}>
                    <Box
                      sx={{
                        width: `${pct}%`,
                        bgcolor: color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 2,
                        transition: 'opacity 0.2s',
                        '&:hover': { opacity: 0.8 },
                      }}
                    >
                      {pct > 12 && (
                        <Typography sx={{ fontSize: { xs: '0.55rem', sm: '0.7rem' }, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', whiteSpace: 'nowrap', px: 0.5 }}>
                          {p.name}
                        </Typography>
                      )}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
            {/* Age labels */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
              <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                {regularPhases[0]?.min_age_minutes}m
              </Typography>
              <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                {regularPhases[regularPhases.length - 1]?.max_age_minutes}m
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* C) Phase Distribution Chart */}
      {streamStats?.streams_by_phase && phases.length > 0 && (
        <Card sx={{
          mb: 3,
          bgcolor: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(10px)',
        }}>
          <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.7rem', mb: 2 }}
            >
              Stream Distribution
            </Typography>
            <PhaseDistributionChart
              streamsByPhase={streamStats.streams_by_phase}
              phases={phases}
            />
          </CardContent>
        </Card>
      )}

      {/* D) Phase Config Cards */}
      <Typography
        variant="body2"
        sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.7rem', mb: 2 }}
      >
        Phase Configuration
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {regularPhases.map((phase) => {
          const ep = getEditingPhase(phase);
          const phaseColor = getPhaseColor(phase.id);
          const streamCount = streamStats?.streams_by_phase?.[phase.id] ?? 0;

          return (
            <Grid key={phase.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <Card sx={{
                bgcolor: `${phaseColor}0F`,
                border: ep.isEditing ? `2px solid ${phaseColor}` : `1px solid ${phaseColor}40`,
                borderLeft: `3px solid ${phaseColor}`,
                backdropFilter: 'blur(10px)',
                height: '100%',
                transition: 'border-color 0.2s',
              }}>
                <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                  {/* Header */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                      {ep.isEditing ? (
                        <TextField
                          size="small"
                          value={ep.name}
                          onChange={(e) => handleFieldChange(phase.id, 'name', e.target.value)}
                          sx={{ ...darkTextFieldSx, '& input': { fontSize: '0.95rem', fontWeight: 600, py: 0.5 } }}
                        />
                      ) : (
                        <Typography sx={{ fontWeight: 600, color: '#fff', fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {phase.name}
                        </Typography>
                      )}
                      <Chip
                        label={`#${phase.id}`}
                        size="small"
                        sx={{ bgcolor: `${phaseColor}30`, color: phaseColor, fontWeight: 700, fontSize: '0.7rem', height: 22 }}
                      />
                      {streamCount > 0 && (
                        <Chip
                          label={`${streamCount}`}
                          size="small"
                          sx={{ bgcolor: 'rgba(76,175,80,0.15)', color: '#4caf50', fontWeight: 700, fontSize: '0.65rem', height: 20, minWidth: 28 }}
                        />
                      )}
                    </Box>
                    {ep.isEditing ? (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton size="small" onClick={() => handleSave(ep)} disabled={saving} sx={{ color: '#00d4ff' }}>
                          <SaveIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleCancel(phase.id)} disabled={saving} sx={{ color: '#f44336' }}>
                          <CancelIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton size="small" onClick={() => handleEdit(phase)} sx={{ color: 'rgba(255,255,255,0.5)', '&:hover': { color: '#00d4ff' } }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDeleteDialog(phase)}
                          disabled={!canDeletePhases || saving}
                          sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#f44336' } }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    )}
                  </Box>

                  {/* Stats 3-col */}
                  <Grid container spacing={1}>
                    <Grid size={{ xs: 4 }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Interval
                        </Typography>
                        {ep.isEditing ? (
                          <TextField
                            size="small"
                            type="number"
                            value={ep.interval_seconds}
                            onChange={(e) => handleFieldChange(phase.id, 'interval_seconds', parseInt(e.target.value) || 1)}
                            inputProps={{ min: 1, max: 300, style: { textAlign: 'center', padding: '4px' } }}
                            sx={{ ...darkTextFieldSx, width: '100%', mt: 0.5, '& input': { fontSize: '0.85rem' } }}
                          />
                        ) : (
                          <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff', fontSize: '1rem' }}>
                            {phase.interval_seconds}s
                          </Typography>
                        )}
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Age Range
                        </Typography>
                        {ep.isEditing ? (
                          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                            <TextField
                              size="small"
                              type="number"
                              value={ep.min_age_minutes}
                              onChange={(e) => handleFieldChange(phase.id, 'min_age_minutes', parseInt(e.target.value) || 0)}
                              inputProps={{ min: 0, style: { textAlign: 'center', padding: '4px' } }}
                              sx={{ ...darkTextFieldSx, '& input': { fontSize: '0.75rem' } }}
                            />
                            <TextField
                              size="small"
                              type="number"
                              value={ep.max_age_minutes}
                              onChange={(e) => handleFieldChange(phase.id, 'max_age_minutes', parseInt(e.target.value) || 1)}
                              inputProps={{ min: 1, style: { textAlign: 'center', padding: '4px' } }}
                              sx={{ ...darkTextFieldSx, '& input': { fontSize: '0.75rem' } }}
                            />
                          </Box>
                        ) : (
                          <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff', fontSize: '1rem' }}>
                            {phase.min_age_minutes}–{phase.max_age_minutes === 999999 ? '∞' : phase.max_age_minutes}m
                          </Typography>
                        )}
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Duration
                        </Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff', fontSize: '1rem' }}>
                          {phase.max_age_minutes === 999999 ? '∞' : `${phase.max_age_minutes - phase.min_age_minutes}m`}
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* System Phases */}
      {systemPhases.length > 0 && (
        <>
          <Typography
            variant="body2"
            sx={{ color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.7rem', mb: 2 }}
          >
            System Phases
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {systemPhases.map((phase) => {
              const phaseColor = getPhaseColor(phase.id);
              const streamCount = streamStats?.streams_by_phase?.[phase.id] ?? 0;

              return (
                <Grid key={phase.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                  <Card sx={{
                    bgcolor: `${phaseColor}08`,
                    border: `1px solid ${phaseColor}20`,
                    borderLeft: `3px solid ${phaseColor}40`,
                    backdropFilter: 'blur(10px)',
                    opacity: 0.5,
                    height: '100%',
                  }}>
                    <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontWeight: 600, color: '#fff', fontSize: '1rem' }}>
                            {phase.name}
                          </Typography>
                          <Chip
                            label={`#${phase.id}`}
                            size="small"
                            sx={{ bgcolor: `${phaseColor}30`, color: phaseColor, fontWeight: 700, fontSize: '0.7rem', height: 22 }}
                          />
                          <Chip
                            label="System"
                            size="small"
                            variant="outlined"
                            sx={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', height: 20 }}
                          />
                          {streamCount > 0 && (
                            <Chip
                              label={`${streamCount}`}
                              size="small"
                              sx={{ bgcolor: 'rgba(76,175,80,0.15)', color: '#4caf50', fontWeight: 700, fontSize: '0.65rem', height: 20, minWidth: 28 }}
                            />
                          )}
                        </Box>
                      </Box>
                      <Grid container spacing={1}>
                        <Grid size={{ xs: 4 }}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              Interval
                            </Typography>
                            <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff', fontSize: '1rem' }}>
                              {phase.interval_seconds}s
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              Age Range
                            </Typography>
                            <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff', fontSize: '1rem' }}>
                              {phase.min_age_minutes}–{phase.max_age_minutes === 999999 ? '∞' : phase.max_age_minutes}m
                            </Typography>
                          </Box>
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              Duration
                            </Typography>
                            <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff', fontSize: '1rem' }}>
                              {phase.max_age_minutes === 999999 ? '∞' : `${phase.max_age_minutes - phase.min_age_minutes}m`}
                            </Typography>
                          </Box>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}

      {/* E) Add Phase Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{ sx: { bgcolor: '#1a1a2e', backgroundImage: 'none', border: '1px solid rgba(0,212,255,0.2)' } }}
      >
        <DialogTitle sx={{ color: '#fff' }}>Create New Phase</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Name"
              value={newPhase.name}
              onChange={(e) => setNewPhase(prev => ({ ...prev, name: e.target.value }))}
              fullWidth
              autoFocus
              sx={darkTextFieldSx}
            />
            <TextField
              label="Interval (seconds)"
              type="number"
              value={newPhase.interval_seconds}
              onChange={(e) => setNewPhase(prev => ({ ...prev, interval_seconds: parseInt(e.target.value) || 1 }))}
              inputProps={{ min: 1, max: 300 }}
              helperText="How often metrics are saved (1-300s)"
              fullWidth
              sx={darkTextFieldSx}
            />
            <TextField
              label="Min Age (minutes)"
              type="number"
              value={newPhase.min_age_minutes}
              onChange={(e) => setNewPhase(prev => ({ ...prev, min_age_minutes: parseInt(e.target.value) || 0 }))}
              inputProps={{ min: 0 }}
              helperText="At what age coins enter this phase"
              fullWidth
              sx={darkTextFieldSx}
            />
            <TextField
              label="Max Age (minutes)"
              type="number"
              value={newPhase.max_age_minutes}
              onChange={(e) => setNewPhase(prev => ({ ...prev, max_age_minutes: parseInt(e.target.value) || 1 }))}
              inputProps={{ min: 1 }}
              helperText="At what age coins leave this phase"
              fullWidth
              sx={darkTextFieldSx}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
          <Button onClick={() => setAddDialogOpen(false)} fullWidth={isMobile} sx={{ color: 'rgba(255,255,255,0.6)' }}>
            Cancel
          </Button>
          <Button
            onClick={handleAddPhase}
            variant="contained"
            disabled={saving}
            fullWidth={isMobile}
            sx={{ bgcolor: '#00d4ff', color: '#0f0f23', fontWeight: 700, '&:hover': { bgcolor: '#00b8e6' } }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* F) Delete Phase Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        fullScreen={isMobile}
        PaperProps={{ sx: { bgcolor: '#1a1a2e', backgroundImage: 'none', border: '1px solid rgba(244,67,54,0.3)' } }}
      >
        <DialogTitle sx={{ color: '#fff' }}>Delete Phase?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'rgba(255,255,255,0.7)' }}>
            Do you want to delete <strong style={{ color: '#fff' }}>"{phaseToDelete?.name}"</strong> (ID: {phaseToDelete?.id})?
            <br /><br />
            Active streams will be moved to the next phase.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2, flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} fullWidth={isMobile} sx={{ color: 'rgba(255,255,255,0.6)' }}>
            Cancel
          </Button>
          <Button
            onClick={handleDeletePhase}
            variant="contained"
            color="error"
            disabled={saving}
            fullWidth={isMobile}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Phases;
