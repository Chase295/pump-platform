import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Button,
  Chip,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  TextField,
  Tooltip,
  IconButton,
  Slider,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Download as DownloadIcon,
  ContentCopy as CopyIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Assessment as AssessmentIcon,
  PlayArrow as PlayArrowIcon,
  Delete as DeleteIcon,
  Code as CodeIcon,
  Tune as TuneIcon,
  Insights as ShapIcon,
  Warning as WarningIcon,
  StopCircle as StopIcon,
} from '@mui/icons-material';
import { trainingApi } from '../../services/api';
import StatusChip from '../../components/training/StatusChip';
import ThresholdSweepTable from '../../components/training/ThresholdSweepTable';
import type { ModelResponse } from '../../types/training';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const ModelDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [model, setModel] = useState<ModelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  // Test model state
  const [testStart, setTestStart] = useState('');
  const [testEnd, setTestEnd] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Tune dialog
  const [tuneDialogOpen, setTuneDialogOpen] = useState(false);
  const [tuneIterations, setTuneIterations] = useState(20);
  const [isTuning, setIsTuning] = useState(false);

  useEffect(() => {
    if (id) {
      fetchModel(parseInt(id));
    }
  }, [id]);

  const fetchModel = async (modelId: number) => {
    try {
      setLoading(true);
      setError(null);
      const resp = await trainingApi.getModel(modelId);
      setModel(resp.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load model');
    } finally {
      setLoading(false);
    }
  };

  const handleTestModel = async () => {
    if (!model || !testStart || !testEnd) {
      setError('Please select a test period');
      return;
    }
    try {
      setIsTesting(true);
      setError(null);
      const resp = await trainingApi.testModel(model.id, {
        test_start: testStart,
        test_end: testEnd,
      });
      setTestSuccess(`Test job created! Job ID: ${resp.data.job_id}. Check the Jobs tab for progress.`);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!model) return;
    try {
      await trainingApi.deleteModel(model.id);
      navigate('/training');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Delete failed');
    }
    setDeleteDialogOpen(false);
  };

  const handleDownload = async () => {
    if (!model) return;
    try {
      const resp = await trainingApi.downloadModel(model.id);
      const blob = new Blob([resp.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `model_${model.id}.pkl`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Download failed');
    }
  };

  const handleExportJson = () => {
    if (!model) return;
    const dataStr = JSON.stringify(model, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = `model_${model.id}_${model.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    a.click();
  };

  const handleTuneModel = async () => {
    if (!model) return;
    try {
      setIsTuning(true);
      setError(null);
      const resp = await trainingApi.tuneModel(model.id, {
        strategy: 'random',
        n_iterations: tuneIterations,
      });
      setTestSuccess(`Tune job created! Job ID: ${resp.data.job_id}. Check Jobs tab for progress.`);
      setTuneDialogOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Tune failed');
    } finally {
      setIsTuning(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const formatDuration = (start: string, end: string) => {
    try {
      const diffMs = new Date(end).getTime() - new Date(start).getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      if (diffDays > 0) return `${diffDays}d ${diffHours}h`;
      return `${diffHours}h`;
    } catch {
      return 'N/A';
    }
  };

  const formatPct = (val?: number) => {
    if (val === undefined || val === null) return 'N/A';
    return `${(val * 100).toFixed(2)}%`;
  };

  const getPredictionInfo = (m: ModelResponse) => {
    if (m.params?._time_based?.enabled) {
      const { future_minutes, min_percent_change, direction } = m.params._time_based;
      return {
        type: 'Time-based',
        description: `Price ${direction === 'up' ? 'rises' : 'falls'} by >=${min_percent_change}% in ${future_minutes} min`,
        icon: direction === 'up' ? <TrendingUpIcon /> : <TrendingDownIcon />,
      };
    }
    return {
      type: 'Rule-based',
      description: `${m.target_variable} ${m.target_operator || ''} ${m.target_value || ''}`,
      icon: <AssessmentIcon />,
    };
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error && !model) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/training')} variant="outlined">
          Back to Models
        </Button>
      </Box>
    );
  }

  if (!model) return null;

  const predInfo = getPredictionInfo(model);

  // Feature importance sorted
  const sortedFeatureImportance = model.feature_importance
    ? Object.entries(model.feature_importance).sort(([, a], [, b]) => b - a)
    : [];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/training')}
          variant="outlined"
          sx={{ mb: 2 }}
        >
          Back to Models
        </Button>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ color: '#00d4ff', fontWeight: 'bold', mb: 1 }}>
              {model.name}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <StatusChip status={model.status} />
              <Chip label={model.model_type} size="small" variant="outlined" />
              <Chip label={`${model.features?.length || 0} Features`} size="small" variant="outlined" />
              <Typography variant="body2" color="text.secondary">
                ID: {model.id} | Created: {formatDate(model.created_at)}
              </Typography>
            </Box>
            {model.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {model.description}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Tooltip title="Copy JSON">
              <IconButton onClick={() => copyToClipboard(JSON.stringify(model, null, 2))}>
                <CopyIcon />
              </IconButton>
            </Tooltip>
            {model.status === 'READY' && (
              <Button variant="contained" startIcon={<TuneIcon />} onClick={() => setTuneDialogOpen(true)} size="small" sx={{ bgcolor: '#ff9800', '&:hover': { bgcolor: '#f57c00' } }}>
                Tune
              </Button>
            )}
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownload} size="small">
              Download .pkl
            </Button>
            <Button variant="outlined" startIcon={<CodeIcon />} onClick={handleExportJson} size="small">
              Export JSON
            </Button>
            <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteDialogOpen(true)} size="small">
              Delete
            </Button>
          </Box>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {testSuccess && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setTestSuccess(null)}>{testSuccess}</Alert>}

      {/* Prediction Info Banner */}
      <Box sx={{ p: 2, mb: 3, bgcolor: 'rgba(0, 212, 255, 0.05)', border: '1px solid rgba(0, 212, 255, 0.2)', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        {predInfo.icon}
        <Box>
          <Typography variant="subtitle1" sx={{ color: '#00d4ff', fontWeight: 600 }}>
            {predInfo.type} Prediction
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {predInfo.description}
          </Typography>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 500 },
            '& .Mui-selected': { color: '#00d4ff' },
            '& .MuiTabs-indicator': { backgroundColor: '#00d4ff' },
          }}
        >
          <Tab label="Overview" />
          <Tab label="Performance" />
          <Tab label="Features" />
          <Tab label="Explainability" icon={<ShapIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
          <Tab label="Testing" />
          <Tab label="Raw Data" />
        </Tabs>
      </Box>

      {/* Tab 0: Overview */}
      <TabPanel value={activeTab} index={0}>
        <Grid container spacing={3}>
          {/* Key metrics cards */}
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ textAlign: 'center', bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#00d4ff' }}>{formatPct(model.training_accuracy)}</Typography>
                <Typography variant="body2" color="text.secondary">Accuracy</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ textAlign: 'center', bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#00d4ff' }}>{formatPct(model.training_f1)}</Typography>
                <Typography variant="body2" color="text.secondary">F1 Score</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ textAlign: 'center', bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#00d4ff' }}>{formatPct(model.training_precision)}</Typography>
                <Typography variant="body2" color="text.secondary">Precision</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ textAlign: 'center', bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#00d4ff' }}>{formatPct(model.training_recall)}</Typography>
                <Typography variant="body2" color="text.secondary">Recall</Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Additional metrics */}
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ textAlign: 'center', bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#00d4ff' }}>{formatPct(model.roc_auc)}</Typography>
                <Typography variant="body2" color="text.secondary">ROC-AUC</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ textAlign: 'center', bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#00d4ff' }}>
                  {model.mcc !== undefined && model.mcc !== null ? model.mcc.toFixed(3) : 'N/A'}
                </Typography>
                <Typography variant="body2" color="text.secondary">MCC</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ textAlign: 'center', bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: model.simulated_profit_pct && model.simulated_profit_pct > 0 ? '#4caf50' : '#f44336' }}>
                  {model.simulated_profit_pct !== undefined && model.simulated_profit_pct !== null ? `${model.simulated_profit_pct.toFixed(2)}%` : 'N/A'}
                </Typography>
                <Typography variant="body2" color="text.secondary">Simulated Profit</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ textAlign: 'center', bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#00d4ff' }}>
                  {formatDuration(model.train_start, model.train_end)}
                </Typography>
                <Typography variant="body2" color="text.secondary">Training Period</Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Confusion Matrix */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>Confusion Matrix</Typography>
                <Grid container spacing={2}>
                  <Grid size={6}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'rgba(76, 175, 80, 0.15)', borderRadius: 2 }}>
                      <Typography variant="h4" sx={{ color: '#4caf50' }}>{model.tp ?? 0}</Typography>
                      <Typography variant="body2" color="text.secondary">True Positive</Typography>
                    </Box>
                  </Grid>
                  <Grid size={6}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'rgba(244, 67, 54, 0.15)', borderRadius: 2 }}>
                      <Typography variant="h4" sx={{ color: '#f44336' }}>{model.fp ?? 0}</Typography>
                      <Typography variant="body2" color="text.secondary">False Positive</Typography>
                    </Box>
                  </Grid>
                  <Grid size={6}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'rgba(244, 67, 54, 0.15)', borderRadius: 2 }}>
                      <Typography variant="h4" sx={{ color: '#f44336' }}>{model.fn ?? 0}</Typography>
                      <Typography variant="body2" color="text.secondary">False Negative</Typography>
                    </Box>
                  </Grid>
                  <Grid size={6}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'rgba(76, 175, 80, 0.15)', borderRadius: 2 }}>
                      <Typography variant="h4" sx={{ color: '#4caf50' }}>{model.tn ?? 0}</Typography>
                      <Typography variant="body2" color="text.secondary">True Negative</Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Training Config */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>Training Configuration</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Training Start</Typography>
                    <Typography variant="body2">{formatDate(model.train_start)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Training End</Typography>
                    <Typography variant="body2">{formatDate(model.train_end)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Model Type</Typography>
                    <Typography variant="body2">{model.model_type}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Features</Typography>
                    <Typography variant="body2">{model.features?.length || 0}</Typography>
                  </Box>
                  {model.phases && model.phases.length > 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Phases</Typography>
                      <Typography variant="body2">{model.phases.join(', ')}</Typography>
                    </Box>
                  )}
                  {model.params?.use_engineered_features && (
                    <Chip label="Engineering Features" size="small" color="info" variant="outlined" />
                  )}
                  {model.params?.use_smote && (
                    <Chip label="SMOTE" size="small" color="warning" variant="outlined" />
                  )}
                  {model.params?.scale_pos_weight && (
                    <Chip label={`scale_pos_weight: ${model.params.scale_pos_weight}`} size="small" variant="outlined" />
                  )}
                  {(model.early_stopping_rounds ?? 0) > 0 && (
                    <Box sx={{ mt: 1, p: 1.5, bgcolor: 'rgba(255,152,0,0.1)', borderRadius: 1, border: '1px solid rgba(255,152,0,0.2)' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <StopIcon sx={{ color: '#ff9800', fontSize: 18 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#ff9800' }}>Early Stopping</Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {model.best_iteration
                          ? `Stopped at iteration ${model.best_iteration} / ${model.params?.n_estimators || '?'} (best score: ${model.best_score?.toFixed(4) || 'N/A'})`
                          : `Patience: ${model.early_stopping_rounds} rounds`}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Tab 1: Performance */}
      <TabPanel value={activeTab} index={1}>
        <Grid container spacing={3}>
          {/* All metrics table */}
          <Grid size={12}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>All Metrics</Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Metric</TableCell>
                        <TableCell align="right">Value</TableCell>
                        <TableCell>Description</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[
                        { name: 'Accuracy', value: model.training_accuracy, desc: 'Overall correctness of predictions' },
                        { name: 'F1 Score', value: model.training_f1, desc: 'Balance between precision and recall' },
                        { name: 'Precision', value: model.training_precision, desc: 'Ratio of correct positive predictions' },
                        { name: 'Recall', value: model.training_recall, desc: 'Ratio of actual positives found' },
                        { name: 'ROC-AUC', value: model.roc_auc, desc: 'Discrimination ability (>0.5 = better than random)' },
                        { name: 'MCC', value: model.mcc, desc: 'Matthews Correlation Coefficient (-1 to +1)' },
                        { name: 'FPR', value: model.fpr, desc: 'False Positive Rate' },
                        { name: 'FNR', value: model.fnr, desc: 'False Negative Rate' },
                      ].map((metric) => (
                        <TableRow key={metric.name}>
                          <TableCell sx={{ fontWeight: 500 }}>{metric.name}</TableCell>
                          <TableCell align="right">
                            {metric.name === 'MCC'
                              ? (metric.value !== undefined && metric.value !== null ? metric.value.toFixed(4) : 'N/A')
                              : formatPct(metric.value)}
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">{metric.desc}</Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell sx={{ fontWeight: 500 }}>Simulated Profit</TableCell>
                        <TableCell align="right" sx={{ color: model.simulated_profit_pct && model.simulated_profit_pct > 0 ? '#4caf50' : '#f44336' }}>
                          {model.simulated_profit_pct !== undefined && model.simulated_profit_pct !== null ? `${model.simulated_profit_pct.toFixed(4)}%` : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">Simulated trading performance</Typography>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* Threshold Sweep */}
          {model.threshold_sweep && model.threshold_sweep.length > 0 && (
            <Grid size={12}>
              <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>Threshold Sweep</Typography>
                  <ThresholdSweepTable data={model.threshold_sweep} />
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* F1 progress bar */}
          {model.training_f1 !== undefined && model.training_f1 !== null && (
            <Grid size={12}>
              <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                <CardContent>
                  <Typography variant="subtitle2" gutterBottom>F1 Score Progress</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(model.training_f1 * 100, 100)}
                    sx={{
                      height: 10,
                      borderRadius: 5,
                      bgcolor: 'rgba(255,255,255,0.1)',
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 5,
                        bgcolor: model.training_f1 > 0.6 ? '#4caf50' : model.training_f1 > 0.3 ? '#ff9800' : '#f44336',
                      },
                    }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {(model.training_f1 * 100).toFixed(2)}% - {model.training_f1 > 0.6 ? 'Excellent' : model.training_f1 > 0.3 ? 'Good' : 'Needs improvement'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* Cross-validation */}
          {model.cv_scores && (
            <Grid size={12}>
              <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>Cross-Validation Results</Typography>
                  <Box sx={{ bgcolor: 'rgba(0,0,0,0.2)', p: 2, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.875rem', whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>
                    {JSON.stringify(model.cv_scores, null, 2)}
                  </Box>
                  {model.cv_overfitting_gap !== undefined && model.cv_overfitting_gap !== null && (
                    <Alert severity={model.cv_overfitting_gap > 0.1 ? 'warning' : 'success'} sx={{ mt: 2 }}>
                      Overfitting Gap: {(model.cv_overfitting_gap * 100).toFixed(2)}%
                      {model.cv_overfitting_gap > 0.1 ? ' - Potential overfitting detected' : ' - Model generalizes well'}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      </TabPanel>

      {/* Tab 2: Features */}
      <TabPanel value={activeTab} index={2}>
        <Grid container spacing={3}>
          {/* Feature list */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>
                  Features Used ({model.features?.length || 0})
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxHeight: 400, overflow: 'auto' }}>
                  {(model.features || []).map((f) => (
                    <Chip
                      key={f}
                      label={f}
                      size="small"
                      sx={{
                        bgcolor: f.endsWith('_has_data') ? 'rgba(156, 39, 176, 0.2)' : 'rgba(0, 212, 255, 0.15)',
                        color: f.endsWith('_has_data') ? '#ce93d8' : '#00d4ff',
                        border: `1px solid ${f.endsWith('_has_data') ? 'rgba(156, 39, 176, 0.3)' : 'rgba(0, 212, 255, 0.3)'}`,
                      }}
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Feature importance */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>
                  Feature Importance {sortedFeatureImportance.length > 0 ? `(Top ${Math.min(sortedFeatureImportance.length, 20)})` : ''}
                </Typography>
                {sortedFeatureImportance.length > 0 ? (
                  <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                    {sortedFeatureImportance.slice(0, 20).map(([feature, importance]) => {
                      const isLowImportance = importance < 0.005;
                      return (
                        <Box key={feature} sx={{ mb: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="caption" sx={{ color: isLowImportance ? '#f44336' : 'inherit' }}>
                              {feature} {isLowImportance && <WarningIcon sx={{ fontSize: 12, verticalAlign: 'middle', color: '#f44336' }} />}
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 600, color: isLowImportance ? '#f44336' : 'inherit' }}>{(importance * 100).toFixed(2)}%</Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(importance * 100 / (sortedFeatureImportance[0]?.[1] || 1) * 100, 100)}
                            sx={{
                              height: 6,
                              borderRadius: 3,
                              bgcolor: 'rgba(255,255,255,0.05)',
                              '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: isLowImportance ? '#f44336' : '#00d4ff' },
                            }}
                          />
                        </Box>
                      );
                    })}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No feature importance data available
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Low importance warning */}
          {model.low_importance_features && model.low_importance_features.length > 0 && (
            <Grid size={12}>
              <Alert severity="warning" icon={<WarningIcon />}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                  {model.low_importance_features.length} features have less than 0.5% importance
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Consider training a new model without these features for a leaner, potentially better model:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {model.low_importance_features.map((f: string) => (
                    <Chip key={f} label={f} size="small" color="warning" variant="outlined" />
                  ))}
                </Box>
              </Alert>
            </Grid>
          )}
        </Grid>
      </TabPanel>

      {/* Tab 3: Explainability (SHAP) */}
      <TabPanel value={activeTab} index={3}>
        {model.shap_values ? (
          <Grid container spacing={3}>
            <Grid size={12}>
              <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ color: '#9c27b0' }}>
                    <ShapIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    SHAP Feature Impact (Top 20)
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    SHAP values show <strong>how much</strong> each feature pushes the prediction up or down.
                    Unlike feature importance (which shows how often a feature is used), SHAP reveals the <strong>direction and magnitude</strong> of each feature&apos;s contribution.
                  </Typography>
                  <Box sx={{ maxHeight: 600, overflow: 'auto' }}>
                    {Object.entries(model.shap_values as Record<string, number>)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 20)
                      .map(([feature, shapValue]) => {
                        const maxShap = Math.max(...Object.values(model.shap_values as Record<string, number>));
                        const barPct = maxShap > 0 ? (shapValue / maxShap) * 100 : 0;
                        return (
                          <Box key={feature} sx={{ mb: 1.5 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="body2">{feature}</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: '#9c27b0' }}>
                                {shapValue.toFixed(4)}
                              </Typography>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(barPct, 100)}
                              sx={{
                                height: 10,
                                borderRadius: 5,
                                bgcolor: 'rgba(255,255,255,0.05)',
                                '& .MuiLinearProgress-bar': { borderRadius: 5, bgcolor: '#9c27b0' },
                              }}
                            />
                          </Box>
                        );
                      })}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        ) : (
          <Alert severity="info">
            No SHAP values available. Enable &quot;SHAP Explainability&quot; when creating a model to see feature impact analysis.
          </Alert>
        )}
      </TabPanel>

      {/* Tab 4: Testing */}
      <TabPanel value={activeTab} index={4}>
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>
              <PlayArrowIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Test Model on New Data
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Run backtesting on a new time period to evaluate model performance on unseen data.
            </Typography>
            <Grid container spacing={2} alignItems="flex-end">
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Test Start"
                  type="datetime-local"
                  value={testStart}
                  onChange={(e) => setTestStart(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Test End"
                  type="datetime-local"
                  value={testEnd}
                  onChange={(e) => setTestEnd(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={isTesting ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  onClick={handleTestModel}
                  disabled={isTesting || !testStart || !testEnd}
                  sx={{ bgcolor: '#00d4ff', height: 56 }}
                >
                  {isTesting ? 'Testing...' : 'Run Test'}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab 5: Raw Data */}
      <TabPanel value={activeTab} index={5}>
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ color: '#00d4ff' }}>Raw Model Data (JSON)</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" startIcon={<CopyIcon />} onClick={() => copyToClipboard(JSON.stringify(model, null, 2))}>
                  Copy
                </Button>
                <Button size="small" startIcon={<DownloadIcon />} onClick={handleExportJson}>
                  Download
                </Button>
              </Box>
            </Box>
            <Box sx={{
              bgcolor: 'rgba(0, 0, 0, 0.3)',
              p: 2,
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              maxHeight: 600,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
            }}>
              {JSON.stringify(model, null, 2)}
            </Box>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Model</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete model &quot;{model.name}&quot;? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Tune dialog */}
      <Dialog open={tuneDialogOpen} onClose={() => setTuneDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TuneIcon sx={{ color: '#ff9800' }} /> Hyperparameter Tuning
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Creates a new optimized model by searching for the best hyperparameters using random search.
            The original model configuration (features, time range, target) is kept.
          </Typography>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Iterations: {tuneIterations}</Typography>
          <Slider
            value={tuneIterations}
            onChange={(_, v) => setTuneIterations(v as number)}
            min={10}
            max={100}
            step={10}
            marks={[{ value: 10, label: '10' }, { value: 20, label: '20' }, { value: 50, label: '50' }, { value: 100, label: '100' }]}
            valueLabelDisplay="auto"
          />
          <Typography variant="caption" color="text.secondary">
            More iterations = better results but longer training time.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTuneDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleTuneModel}
            variant="contained"
            disabled={isTuning}
            startIcon={isTuning ? <CircularProgress size={16} /> : <TuneIcon />}
            sx={{ bgcolor: '#ff9800', '&:hover': { bgcolor: '#f57c00' } }}
          >
            {isTuning ? 'Creating...' : 'Start Tuning'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ModelDetails;
