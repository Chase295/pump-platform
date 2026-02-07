import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography,
  Box,
  TextField,
  Button,
  Alert,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  useMediaQuery,
  useTheme,
  Grid,
  Divider,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Timer as TimerIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { findApi } from '../../services/api';
import type { Phase, PhaseUpdateRequest, PhaseCreateRequest } from '../../types/find';

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

const Phases: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [phases, setPhases] = useState<EditingPhase[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Dialog States
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [phaseToDelete, setPhaseToDelete] = useState<EditingPhase | null>(null);
  const [newPhase, setNewPhase] = useState<NewPhaseForm>({
    name: '',
    interval_seconds: 15,
    min_age_minutes: 0,
    max_age_minutes: 60,
  });

  const fetchPhases = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await findApi.getPhases();
      const data: Phase[] = res.data.phases || [];
      setPhases(data.map((p: Phase) => ({
        ...p,
        isEditing: false,
        originalData: { ...p },
      })));
    } catch (err) {
      setError('Failed to load phases');
      console.error('Error fetching phases:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhases();
  }, [fetchPhases]);

  const handleEdit = (phaseId: number) => {
    setPhases(prev => prev.map(p =>
      p.id === phaseId ? { ...p, isEditing: true } : p
    ));
  };

  const handleCancel = (phaseId: number) => {
    setPhases(prev => prev.map(p =>
      p.id === phaseId ? { ...p.originalData, isEditing: false, originalData: p.originalData } : p
    ));
  };

  const handleFieldChange = (phaseId: number, field: keyof Phase, value: string | number) => {
    setPhases(prev => prev.map(p =>
      p.id === phaseId ? { ...p, [field]: value } : p
    ));
  };

  const handleSave = async (phase: EditingPhase) => {
    setIsLoading(true);
    setError(null);

    if (phase.interval_seconds < 1) {
      setError('Interval must be at least 1 second');
      setIsLoading(false);
      return;
    }

    if (phase.max_age_minutes <= phase.min_age_minutes) {
      setError('Max Age must be greater than Min Age');
      setIsLoading(false);
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
        setPhases(prev => prev.map(p =>
          p.id === phase.id ? { ...p, isEditing: false } : p
        ));
        setIsLoading(false);
        return;
      }

      const res = await findApi.updatePhase(phase.id, updateData as Record<string, unknown>);
      const result = res.data;

      setSuccessMessage(`Phase "${result.phase.name}" updated. ${result.updated_streams} streams adjusted.`);
      setTimeout(() => setSuccessMessage(''), 5000);

      await fetchPhases();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      const errorMessage = axiosErr.response?.data?.detail || 'Failed to save phase';
      setError(errorMessage);
      console.error('Error updating phase:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAddDialog = () => {
    const regularPhases = phases.filter(p => p.id < 99);
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
    setIsLoading(true);
    setError(null);

    if (!newPhase.name.trim()) {
      setError('Name must not be empty');
      setIsLoading(false);
      return;
    }

    if (newPhase.interval_seconds < 1) {
      setError('Interval must be at least 1 second');
      setIsLoading(false);
      return;
    }

    if (newPhase.max_age_minutes <= newPhase.min_age_minutes) {
      setError('Max Age must be greater than Min Age');
      setIsLoading(false);
      return;
    }

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
      await fetchPhases();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      const errorMessage = axiosErr.response?.data?.detail || 'Failed to create phase';
      setError(errorMessage);
      console.error('Error creating phase:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDeleteDialog = (phase: EditingPhase) => {
    setPhaseToDelete(phase);
    setDeleteDialogOpen(true);
  };

  const handleDeletePhase = async () => {
    if (!phaseToDelete) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await findApi.deletePhase(phaseToDelete.id);
      const result = res.data;

      setSuccessMessage(result.message);
      setTimeout(() => setSuccessMessage(''), 5000);

      setDeleteDialogOpen(false);
      setPhaseToDelete(null);
      await fetchPhases();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      const errorMessage = axiosErr.response?.data?.detail || 'Failed to delete phase';
      setError(errorMessage);
      console.error('Error deleting phase:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const isSystemPhase = (phaseId: number) => phaseId >= 99;

  const getPhaseColor = (phaseId: number): 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'default' => {
    if (phaseId === 99) return 'error';
    if (phaseId === 100) return 'secondary';
    if (phaseId === 1) return 'info';
    if (phaseId === 2) return 'warning';
    if (phaseId === 3) return 'success';
    return 'primary';
  };

  const regularPhaseCount = phases.filter(p => p.id < 99).length;
  const canDeletePhases = regularPhaseCount > 1;

  const PhaseCard = ({ phase }: { phase: EditingPhase }) => {
    const isSystem = isSystemPhase(phase.id);

    return (
      <Card
        sx={{
          mb: 2,
          opacity: isSystem ? 0.7 : 1,
          border: phase.isEditing ? '2px solid' : '1px solid',
          borderColor: phase.isEditing ? 'primary.main' : 'divider',
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 3 }, '&:last-child': { pb: { xs: 2, sm: 3 } } }}>
          {/* Header with ID and Actions */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={`ID ${phase.id}`}
                size="small"
                color={getPhaseColor(phase.id)}
              />
              {isSystem && (
                <Chip label="System" size="small" variant="outlined" />
              )}
            </Box>
            {isSystem ? (
              <Tooltip title="System phase (read-only)">
                <WarningIcon fontSize="small" color="disabled" />
              </Tooltip>
            ) : phase.isEditing ? (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => handleSave(phase)}
                  disabled={isLoading}
                >
                  <SaveIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleCancel(phase.id)}
                  disabled={isLoading}
                >
                  <CancelIcon fontSize="small" />
                </IconButton>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <IconButton size="small" onClick={() => handleEdit(phase.id)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleOpenDeleteDialog(phase)}
                  disabled={!canDeletePhases || isLoading}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
          </Box>

          {/* Name */}
          {phase.isEditing ? (
            <TextField
              size="small"
              label="Name"
              value={phase.name}
              onChange={(e) => handleFieldChange(phase.id, 'name', e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
          ) : (
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 'medium', fontSize: { xs: '1rem', sm: '1.25rem' } }}>
              {phase.name}
            </Typography>
          )}

          <Divider sx={{ mb: 2 }} />

          {/* Stats Grid */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 4 }}>
              <Box sx={{ textAlign: 'center' }}>
                <TimerIcon fontSize="small" color="action" sx={{ mb: 0.5 }} />
                <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                  Interval
                </Typography>
                {phase.isEditing ? (
                  <TextField
                    size="small"
                    type="number"
                    value={phase.interval_seconds}
                    onChange={(e) => handleFieldChange(phase.id, 'interval_seconds', parseInt(e.target.value) || 1)}
                    inputProps={{ min: 1, max: 300, style: { textAlign: 'center', padding: '4px' } }}
                    sx={{ width: '100%', mt: 0.5, '& input': { fontSize: { xs: '0.8rem', sm: '1rem' } } }}
                  />
                ) : (
                  <Typography variant="body1" fontWeight="bold" fontFamily="monospace" sx={{ fontSize: { xs: '0.9rem', sm: '1rem' } }}>
                    {phase.interval_seconds}s
                  </Typography>
                )}
              </Box>
            </Grid>
            <Grid size={{ xs: 4 }}>
              <Box sx={{ textAlign: 'center' }}>
                <ScheduleIcon fontSize="small" color="action" sx={{ mb: 0.5 }} />
                <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                  Min Age
                </Typography>
                {phase.isEditing ? (
                  <TextField
                    size="small"
                    type="number"
                    value={phase.min_age_minutes}
                    onChange={(e) => handleFieldChange(phase.id, 'min_age_minutes', parseInt(e.target.value) || 0)}
                    inputProps={{ min: 0, style: { textAlign: 'center', padding: '4px' } }}
                    sx={{ width: '100%', mt: 0.5, '& input': { fontSize: { xs: '0.8rem', sm: '1rem' } } }}
                  />
                ) : (
                  <Typography variant="body1" fontWeight="bold" fontFamily="monospace" sx={{ fontSize: { xs: '0.9rem', sm: '1rem' } }}>
                    {phase.min_age_minutes}m
                  </Typography>
                )}
              </Box>
            </Grid>
            <Grid size={{ xs: 4 }}>
              <Box sx={{ textAlign: 'center' }}>
                <ScheduleIcon fontSize="small" color="action" sx={{ mb: 0.5 }} />
                <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                  Max Age
                </Typography>
                {phase.isEditing ? (
                  <TextField
                    size="small"
                    type="number"
                    value={phase.max_age_minutes}
                    onChange={(e) => handleFieldChange(phase.id, 'max_age_minutes', parseInt(e.target.value) || 1)}
                    inputProps={{ min: 1, style: { textAlign: 'center', padding: '4px' } }}
                    sx={{ width: '100%', mt: 0.5, '& input': { fontSize: { xs: '0.8rem', sm: '1rem' } } }}
                  />
                ) : (
                  <Typography variant="body1" fontWeight="bold" fontFamily="monospace" sx={{ fontSize: { xs: '0.9rem', sm: '1rem' } }}>
                    {phase.max_age_minutes === 999999 ? '\u221e' : `${phase.max_age_minutes}m`}
                  </Typography>
                )}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', sm: 'center' },
        mb: 3,
        gap: 2
      }}>
        <Typography variant={isMobile ? 'h5' : 'h4'}>
          Tracking Phases
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
          <Button
            variant="contained"
            color="success"
            startIcon={<AddIcon />}
            onClick={handleOpenAddDialog}
            disabled={isLoading}
            size={isMobile ? 'small' : 'medium'}
          >
            New Phase
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchPhases}
            disabled={isLoading}
            size={isMobile ? 'small' : 'medium'}
          >
            Refresh
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

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
          <strong>Note:</strong> Changes take effect immediately on active streams.
          System phases (99, 100) are protected.
        </Typography>
      </Alert>

      {/* Phase Count Summary */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {regularPhaseCount} regular phases + 2 system phases
        </Typography>
      </Box>

      {isLoading && phases.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box>
          {/* Regular Phases */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 2 }}>
            Regular Phases
          </Typography>
          {phases.filter(p => !isSystemPhase(p.id)).map((phase) => (
            <PhaseCard key={phase.id} phase={phase} />
          ))}

          {/* System Phases */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 3 }}>
            System Phases
          </Typography>
          {phases.filter(p => isSystemPhase(p.id)).map((phase) => (
            <PhaseCard key={phase.id} phase={phase} />
          ))}
        </Box>
      )}

      {/* Explanation Card */}
      <Card sx={{ mt: 3 }}>
        <CardHeader
          title="Phase Explanation"
          titleTypographyProps={{ variant: isMobile ? 'subtitle1' : 'h6' }}
        />
        <CardContent sx={{ pt: 0 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
            Coins progress through phases automatically based on their age.
            Each phase has its own tracking interval.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label="99" color="error" size="small" />
              <Typography variant="body2" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                <strong>Finished:</strong> Tracking ended
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label="100" color="secondary" size="small" />
              <Typography variant="body2" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                <strong>Graduated:</strong> Bonding curve completed
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Add Phase Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>Create New Phase</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Name"
              value={newPhase.name}
              onChange={(e) => setNewPhase(prev => ({ ...prev, name: e.target.value }))}
              fullWidth
              autoFocus
            />
            <TextField
              label="Interval (seconds)"
              type="number"
              value={newPhase.interval_seconds}
              onChange={(e) => setNewPhase(prev => ({ ...prev, interval_seconds: parseInt(e.target.value) || 1 }))}
              inputProps={{ min: 1, max: 300 }}
              helperText="How often metrics are saved (1-300s)"
              fullWidth
            />
            <TextField
              label="Min Age (minutes)"
              type="number"
              value={newPhase.min_age_minutes}
              onChange={(e) => setNewPhase(prev => ({ ...prev, min_age_minutes: parseInt(e.target.value) || 0 }))}
              inputProps={{ min: 0 }}
              helperText="At what age coins enter this phase"
              fullWidth
            />
            <TextField
              label="Max Age (minutes)"
              type="number"
              value={newPhase.max_age_minutes}
              onChange={(e) => setNewPhase(prev => ({ ...prev, max_age_minutes: parseInt(e.target.value) || 1 }))}
              inputProps={{ min: 1 }}
              helperText="At what age coins leave this phase"
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
          <Button onClick={() => setAddDialogOpen(false)} fullWidth={isMobile}>
            Cancel
          </Button>
          <Button
            onClick={handleAddPhase}
            variant="contained"
            color="success"
            disabled={isLoading}
            fullWidth={isMobile}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Phase Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} fullScreen={isMobile}>
        <DialogTitle>Delete Phase?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Do you want to delete <strong>"{phaseToDelete?.name}"</strong> (ID: {phaseToDelete?.id})?
            <br /><br />
            Active streams will be moved to the next phase.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2, flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} fullWidth={isMobile}>
            Cancel
          </Button>
          <Button
            onClick={handleDeletePhase}
            variant="contained"
            color="error"
            disabled={isLoading}
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
