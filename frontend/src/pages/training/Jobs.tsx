/**
 * Jobs Page
 * Job queue viewer showing TRAIN/TEST/COMPARE jobs with status, progress, timestamps.
 * Auto-refreshes running jobs every 5s.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  LinearProgress,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  Work as JobsIcon,
  Refresh as RefreshIcon,
  OpenInNew as OpenIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { trainingApi } from '../../services/api';
import StatusChip from '../../components/training/StatusChip';
import type { JobResponse } from '../../types/training';

const Jobs: React.FC = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);

  const fetchJobs = async () => {
    try {
      setError(null);
      const params: Record<string, unknown> = { limit: 100 };
      if (typeFilter !== 'ALL') params.job_type = typeFilter;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      const resp = await trainingApi.listJobs(params as any);
      const data = resp.data;
      setJobs(Array.isArray(data) ? data : data?.jobs || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch jobs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [typeFilter, statusFilter]);

  // Auto-refresh when there are running jobs
  const hasRunningJobs = useMemo(
    () => jobs.some((j) => j.status === 'RUNNING' || j.status === 'PENDING'),
    [jobs],
  );

  useEffect(() => {
    if (!hasRunningJobs) return;
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [hasRunningJobs, typeFilter, statusFilter]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const formatDuration = (start?: string, end?: string) => {
    if (!start) return '-';
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const diffMs = endTime - startTime;
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}m ${secs}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getJobTypeColor = (type: string) => {
    switch (type) {
      case 'TRAIN':
        return '#00d4ff';
      case 'TEST':
        return '#ff9800';
      case 'COMPARE':
        return '#9c27b0';
      default:
        return '#666';
    }
  };

  const getResultLink = (job: JobResponse) => {
    if (job.job_type === 'TRAIN' && job.result_model_id) {
      return { label: `Model #${job.result_model_id}`, path: `/training/models/${job.result_model_id}` };
    }
    if (job.job_type === 'TEST' && job.result_test_id) {
      return { label: `Test #${job.result_test_id}`, path: `/training/test-results/${job.result_test_id}` };
    }
    if (job.job_type === 'COMPARE' && job.result_comparison_id) {
      return { label: `Compare #${job.result_comparison_id}`, path: `/training/comparisons/${job.result_comparison_id}` };
    }
    return null;
  };

  const stats = useMemo(() => ({
    total: jobs.length,
    running: jobs.filter((j) => j.status === 'RUNNING').length,
    pending: jobs.filter((j) => j.status === 'PENDING').length,
    completed: jobs.filter((j) => j.status === 'COMPLETED').length,
    failed: jobs.filter((j) => j.status === 'FAILED').length,
  }), [jobs]);

  if (isLoading && jobs.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 2,
          mb: 3,
        }}
      >
        <Typography
          variant="h5"
          sx={{
            color: '#00d4ff',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <JobsIcon /> Job Queue
          {hasRunningJobs && (
            <Chip
              label="Auto-refreshing"
              size="small"
              color="info"
              variant="outlined"
              sx={{ ml: 1, animation: 'pulse 2s ease-in-out infinite' }}
            />
          )}
        </Typography>
        <Button
          startIcon={<RefreshIcon />}
          onClick={fetchJobs}
          variant="outlined"
          disabled={isLoading}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Stats */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(5, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        {[
          { label: 'Total', value: stats.total, color: '#00d4ff', bg: 'rgba(0, 212, 255, 0.1)', border: 'rgba(0, 212, 255, 0.3)' },
          { label: 'Running', value: stats.running, color: '#2196f3', bg: 'rgba(33, 150, 243, 0.1)', border: 'rgba(33, 150, 243, 0.3)' },
          { label: 'Pending', value: stats.pending, color: '#9e9e9e', bg: 'rgba(158, 158, 158, 0.1)', border: 'rgba(158, 158, 158, 0.3)' },
          { label: 'Completed', value: stats.completed, color: '#4caf50', bg: 'rgba(76, 175, 80, 0.1)', border: 'rgba(76, 175, 80, 0.3)' },
          { label: 'Failed', value: stats.failed, color: '#f44336', bg: 'rgba(244, 67, 54, 0.1)', border: 'rgba(244, 67, 54, 0.3)' },
        ].map((s) => (
          <Box
            key={s.label}
            sx={{
              p: 2,
              bgcolor: s.bg,
              border: `1px solid ${s.border}`,
              borderRadius: 1,
              textAlign: 'center',
            }}
          >
            <Typography variant="h4" sx={{ color: s.color }}>
              {s.value}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {s.label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Job Type</InputLabel>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} label="Job Type">
            <MenuItem value="ALL">All Types</MenuItem>
            <MenuItem value="TRAIN">Train</MenuItem>
            <MenuItem value="TEST">Test</MenuItem>
            <MenuItem value="COMPARE">Compare</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} label="Status">
            <MenuItem value="ALL">All Status</MenuItem>
            <MenuItem value="RUNNING">Running</MenuItem>
            <MenuItem value="PENDING">Pending</MenuItem>
            <MenuItem value="COMPLETED">Completed</MenuItem>
            <MenuItem value="FAILED">Failed</MenuItem>
            <MenuItem value="CANCELLED">Cancelled</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Jobs List */}
      {jobs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <JobsIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="textSecondary">
            No jobs found
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Jobs appear here when you train, test, or compare models.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {jobs.map((job) => {
            const resultLink = getResultLink(job);
            const isExpanded = expandedJobId === job.id;
            const isRunning = job.status === 'RUNNING';

            return (
              <Card
                key={job.id}
                sx={{
                  border: `1px solid ${isRunning ? 'rgba(33, 150, 243, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                  bgcolor: isRunning ? 'rgba(33, 150, 243, 0.05)' : 'rgba(255, 255, 255, 0.03)',
                }}
              >
                <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: 2 } }}>
                  {/* Job Header Row */}
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      justifyContent: 'space-between',
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      gap: 1,
                      mb: isRunning ? 1.5 : 0,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        #{job.id}
                      </Typography>
                      <Chip
                        label={job.job_type}
                        size="small"
                        sx={{
                          fontWeight: 600,
                          bgcolor: `${getJobTypeColor(job.job_type)}20`,
                          color: getJobTypeColor(job.job_type),
                          border: `1px solid ${getJobTypeColor(job.job_type)}50`,
                        }}
                      />
                      <StatusChip status={job.status} size="small" />
                      {job.priority > 0 && (
                        <Chip
                          label={`Priority: ${job.priority}`}
                          size="small"
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.7rem' }}
                        />
                      )}
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(job.created_at)}
                      </Typography>
                      {job.started_at && (
                        <Tooltip title="Duration">
                          <Chip
                            label={formatDuration(job.started_at, job.completed_at)}
                            size="small"
                            variant="outlined"
                            sx={{ height: 22, fontSize: '0.7rem' }}
                          />
                        </Tooltip>
                      )}
                      {resultLink && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<OpenIcon />}
                          onClick={() => navigate(resultLink.path)}
                          sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                        >
                          {resultLink.label}
                        </Button>
                      )}
                      <IconButton
                        size="small"
                        onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                      >
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Box>
                  </Box>

                  {/* Progress Bar for running jobs */}
                  {isRunning && (
                    <Box sx={{ mb: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {job.progress_msg || 'Processing...'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {job.progress}%
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={job.progress}
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          bgcolor: 'rgba(255,255,255,0.08)',
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 3,
                            bgcolor: '#2196f3',
                          },
                        }}
                      />
                    </Box>
                  )}

                  {/* Error message */}
                  {job.error_msg && (
                    <Alert severity="error" sx={{ mt: 1, py: 0 }} variant="outlined">
                      <Typography variant="caption">{job.error_msg}</Typography>
                    </Alert>
                  )}

                  {/* Expanded Details */}
                  {isExpanded && (
                    <Box
                      sx={{
                        mt: 2,
                        pt: 2,
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                        gap: 2,
                      }}
                    >
                      <Box>
                        <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                          Timestamps
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">Created:</Typography>
                          <Typography variant="caption">{formatDate(job.created_at)}</Typography>
                          <Typography variant="caption" color="text.secondary">Started:</Typography>
                          <Typography variant="caption">{formatDate(job.started_at)}</Typography>
                          <Typography variant="caption" color="text.secondary">Completed:</Typography>
                          <Typography variant="caption">{formatDate(job.completed_at)}</Typography>
                        </Box>
                      </Box>

                      <Box>
                        <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                          Job Configuration
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                          {job.job_type === 'TRAIN' && (
                            <>
                              <Typography variant="caption" color="text.secondary">Model Type:</Typography>
                              <Typography variant="caption">{job.train_model_type || '-'}</Typography>
                              <Typography variant="caption" color="text.secondary">Target:</Typography>
                              <Typography variant="caption">
                                {job.train_target_var || '-'} {job.train_operator} {job.train_value}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">Period:</Typography>
                              <Typography variant="caption">
                                {job.train_start ? new Date(job.train_start).toLocaleDateString() : '-'} -{' '}
                                {job.train_end ? new Date(job.train_end).toLocaleDateString() : '-'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">Features:</Typography>
                              <Typography variant="caption">
                                {job.train_features?.length || 0} features
                              </Typography>
                            </>
                          )}
                          {job.job_type === 'TEST' && (
                            <>
                              <Typography variant="caption" color="text.secondary">Model ID:</Typography>
                              <Typography variant="caption">{job.test_model_id || '-'}</Typography>
                              <Typography variant="caption" color="text.secondary">Period:</Typography>
                              <Typography variant="caption">
                                {job.test_start ? new Date(job.test_start).toLocaleDateString() : '-'} -{' '}
                                {job.test_end ? new Date(job.test_end).toLocaleDateString() : '-'}
                              </Typography>
                            </>
                          )}
                          {job.job_type === 'COMPARE' && (
                            <>
                              <Typography variant="caption" color="text.secondary">Model A:</Typography>
                              <Typography variant="caption">{job.compare_model_a_id || '-'}</Typography>
                              <Typography variant="caption" color="text.secondary">Model B:</Typography>
                              <Typography variant="caption">{job.compare_model_b_id || '-'}</Typography>
                              <Typography variant="caption" color="text.secondary">Period:</Typography>
                              <Typography variant="caption">
                                {job.compare_start ? new Date(job.compare_start).toLocaleDateString() : '-'} -{' '}
                                {job.compare_end ? new Date(job.compare_end).toLocaleDateString() : '-'}
                              </Typography>
                            </>
                          )}
                          {job.worker_id && (
                            <>
                              <Typography variant="caption" color="text.secondary">Worker:</Typography>
                              <Typography variant="caption">{job.worker_id}</Typography>
                            </>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      <style>{`@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }`}</style>
    </Box>
  );
};

export default Jobs;
