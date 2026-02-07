import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Assessment as TestIcon,
  Download as DownloadIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { trainingApi } from '../../services/api';
import type { TestResultResponse } from '../../types/training';

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

const TestResultDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [testResult, setTestResult] = useState<TestResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    if (id) {
      loadTestResult(parseInt(id));
    }
  }, [id]);

  const loadTestResult = async (testResultId: number) => {
    try {
      setLoading(true);
      setError(null);
      const resp = await trainingApi.getTestResult(testResultId);
      setTestResult(resp.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load test result');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const formatPct = (value?: number) => {
    if (value === undefined || value === null) return 'N/A';
    return `${(value * 100).toFixed(2)}%`;
  };

  const getPerformanceColor = (accuracy?: number) => {
    if (accuracy === undefined || accuracy === null) return '#888';
    if (accuracy >= 0.7) return '#4caf50';
    if (accuracy >= 0.5) return '#ff9800';
    return '#f44336';
  };

  const getPerformanceLevel = (accuracy?: number) => {
    if (accuracy === undefined || accuracy === null) return { level: 'Unknown', color: 'default' as const };
    if (accuracy >= 0.7) return { level: 'Excellent', color: 'success' as const };
    if (accuracy >= 0.5) return { level: 'Good', color: 'warning' as const };
    return { level: 'Needs Improvement', color: 'error' as const };
  };

  const exportResults = () => {
    if (!testResult) return;
    const dataStr = JSON.stringify(testResult, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = `test-result-${testResult.id}.json`;
    a.click();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !testResult) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>{error || 'Test result not found'}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/training/test-results')} variant="outlined">
          Back to Test Results
        </Button>
      </Box>
    );
  }

  const performance = getPerformanceLevel(testResult.accuracy);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/training/test-results')} variant="outlined">
            Back
          </Button>
          <TestIcon sx={{ color: '#00d4ff', fontSize: 32 }} />
          <Box>
            <Typography variant="h5" sx={{ color: '#00d4ff', fontWeight: 'bold' }}>
              Test Result #{testResult.id}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Model: {testResult.model_name || `ID ${testResult.model_id}`}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" startIcon={<DownloadIcon />} onClick={exportResults} variant="outlined">
            JSON Export
          </Button>
          <Button size="small" startIcon={<CopyIcon />} onClick={() => copyToClipboard(JSON.stringify(testResult, null, 2))} variant="outlined">
            Copy JSON
          </Button>
        </Box>
      </Box>

      {/* Performance Overview */}
      <Box sx={{ p: 3, mb: 3, bgcolor: 'rgba(0, 212, 255, 0.05)', border: '1px solid rgba(0, 212, 255, 0.2)', borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>
          Performance Overview
        </Typography>
        <Grid container spacing={3}>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: getPerformanceColor(testResult.accuracy) }}>
                  {formatPct(testResult.accuracy)}
                </Typography>
                <Typography variant="body2" color="text.secondary">Accuracy</Typography>
                <Chip label={performance.level} color={performance.color} size="small" sx={{ mt: 1 }} />
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#00d4ff' }}>
                  {formatPct(testResult.f1_score)}
                </Typography>
                <Typography variant="body2" color="text.secondary">F1 Score</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: testResult.simulated_profit_pct && testResult.simulated_profit_pct > 0 ? '#4caf50' : '#f44336' }}>
                  {testResult.simulated_profit_pct !== undefined && testResult.simulated_profit_pct !== null
                    ? `${testResult.simulated_profit_pct.toFixed(4)}%`
                    : 'N/A'}
                </Typography>
                <Typography variant="body2" color="text.secondary">Simulated Profit</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#00d4ff' }}>
                  {testResult.num_samples?.toLocaleString() || testResult.total_predictions?.toLocaleString() || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">Data Points</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Warnings */}
        <Box sx={{ mt: 2 }}>
          {testResult.is_overfitted && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              <strong>Overfitting detected!</strong> Accuracy degradation: {formatPct(testResult.accuracy_degradation)} - The model generalizes poorly on new data.
            </Alert>
          )}
          {testResult.has_overlap && testResult.overlap_note && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              <strong>Overlap!</strong> {testResult.overlap_note}
            </Alert>
          )}
          {!testResult.has_overlap && testResult.overlap_note && (
            <Alert severity="success" sx={{ mb: 1 }}>
              {testResult.overlap_note}
            </Alert>
          )}
        </Box>

        {/* Train vs Test Comparison */}
        {testResult.train_accuracy !== undefined && testResult.train_accuracy !== null && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ color: '#00d4ff' }}>
              Train vs. Test Comparison
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="body2" color="text.secondary">Train Accuracy</Typography>
                <Typography variant="h6">{formatPct(testResult.train_accuracy)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="body2" color="text.secondary">Test Accuracy</Typography>
                <Typography variant="h6" sx={{ color: getPerformanceColor(testResult.accuracy) }}>
                  {formatPct(testResult.accuracy)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="body2" color="text.secondary">Train F1</Typography>
                <Typography variant="h6">{formatPct(testResult.train_f1)}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="body2" color="text.secondary">Test F1</Typography>
                <Typography variant="h6">{formatPct(testResult.f1_score)}</Typography>
              </Grid>
            </Grid>
          </Box>
        )}
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          sx={{
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 500 },
            '& .Mui-selected': { color: '#00d4ff' },
            '& .MuiTabs-indicator': { backgroundColor: '#00d4ff' },
          }}
        >
          <Tab label="Overview" />
          <Tab label="Performance" />
          <Tab label="Configuration" />
          <Tab label="Raw Data" />
        </Tabs>
      </Box>

      {/* Tab 0: Overview */}
      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>Performance Analysis</Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Performance Level: <strong style={{ color: getPerformanceColor(testResult.accuracy) }}>{performance.level}</strong>
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Test Period: <strong>{formatDate(testResult.test_start)} - {formatDate(testResult.test_end)}</strong>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Tested: <strong>{formatDate(testResult.created_at)}</strong>
                  </Typography>
                  {testResult.test_duration_days && (
                    <Typography variant="body2" color="text.secondary">
                      Duration: <strong>{testResult.test_duration_days.toFixed(1)} days</strong>
                    </Typography>
                  )}
                </Box>

                {/* Profit bar */}
                {testResult.simulated_profit_pct !== undefined && testResult.simulated_profit_pct !== null && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Profitability: <strong style={{ color: testResult.simulated_profit_pct > 0 ? '#4caf50' : '#f44336' }}>
                        {testResult.simulated_profit_pct > 0 ? 'Profitable' : 'Loss'}
                      </strong>
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(Math.abs(testResult.simulated_profit_pct) * 1000, 100)}
                      sx={{
                        height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.1)',
                        '& .MuiLinearProgress-bar': { bgcolor: testResult.simulated_profit_pct > 0 ? '#4caf50' : '#f44336', borderRadius: 4 },
                      }}
                    />
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Confusion Matrix */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>Confusion Matrix</Typography>
                <Grid container spacing={1}>
                  <Grid size={6}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'rgba(76, 175, 80, 0.15)', borderRadius: 2 }}>
                      <Typography variant="h5" sx={{ color: '#4caf50' }}>{testResult.tp ?? 0}</Typography>
                      <Typography variant="caption" color="text.secondary">True Positive</Typography>
                    </Box>
                  </Grid>
                  <Grid size={6}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'rgba(244, 67, 54, 0.15)', borderRadius: 2 }}>
                      <Typography variant="h5" sx={{ color: '#f44336' }}>{testResult.fp ?? 0}</Typography>
                      <Typography variant="caption" color="text.secondary">False Positive</Typography>
                    </Box>
                  </Grid>
                  <Grid size={6}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'rgba(244, 67, 54, 0.15)', borderRadius: 2 }}>
                      <Typography variant="h5" sx={{ color: '#f44336' }}>{testResult.fn ?? 0}</Typography>
                      <Typography variant="caption" color="text.secondary">False Negative</Typography>
                    </Box>
                  </Grid>
                  <Grid size={6}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'rgba(76, 175, 80, 0.15)', borderRadius: 2 }}>
                      <Typography variant="h5" sx={{ color: '#4caf50' }}>{testResult.tn ?? 0}</Typography>
                      <Typography variant="caption" color="text.secondary">True Negative</Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Tab 1: Performance */}
      <TabPanel value={tabValue} index={1}>
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>All Metrics</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Metric</TableCell>
                    <TableCell align="right">Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[
                    { name: 'Accuracy', value: testResult.accuracy },
                    { name: 'F1 Score', value: testResult.f1_score },
                    { name: 'Precision', value: testResult.precision_score },
                    { name: 'Recall', value: testResult.recall },
                    { name: 'ROC-AUC', value: testResult.roc_auc },
                    { name: 'MCC', value: testResult.mcc, raw: true },
                    { name: 'FPR', value: testResult.fpr },
                    { name: 'FNR', value: testResult.fnr },
                  ].map((m) => (
                    <TableRow key={m.name}>
                      <TableCell sx={{ fontWeight: 500 }}>{m.name}</TableCell>
                      <TableCell align="right">
                        {m.raw
                          ? (m.value !== undefined && m.value !== null ? (m.value as number).toFixed(4) : 'N/A')
                          : formatPct(m.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell sx={{ fontWeight: 500 }}>Simulated Profit</TableCell>
                    <TableCell align="right" sx={{ color: testResult.simulated_profit_pct && testResult.simulated_profit_pct > 0 ? '#4caf50' : '#f44336' }}>
                      {testResult.simulated_profit_pct !== undefined && testResult.simulated_profit_pct !== null
                        ? `${testResult.simulated_profit_pct.toFixed(4)}%`
                        : 'N/A'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 500 }}>Data Points</TableCell>
                    <TableCell align="right">
                      {testResult.num_samples?.toLocaleString() || testResult.total_predictions?.toLocaleString() || 'N/A'}
                    </TableCell>
                  </TableRow>
                  {testResult.num_positive !== undefined && (
                    <TableRow>
                      <TableCell sx={{ fontWeight: 500 }}>Positive / Negative</TableCell>
                      <TableCell align="right">
                        {testResult.num_positive?.toLocaleString() || 0} / {testResult.num_negative?.toLocaleString() || 0}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab 2: Configuration */}
      <TabPanel value={tabValue} index={2}>
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ color: '#00d4ff' }}>Test Configuration</Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Test Result ID</Typography>
                    <Typography variant="body2">{testResult.id}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Model ID</Typography>
                    <Typography variant="body2">{testResult.model_id}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Model Name</Typography>
                    <Typography variant="body2">{testResult.model_name || 'N/A'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Test Start</Typography>
                    <Typography variant="body2">{formatDate(testResult.test_start)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Test End</Typography>
                    <Typography variant="body2">{formatDate(testResult.test_end)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Created</Typography>
                    <Typography variant="body2">{formatDate(testResult.created_at)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Has Overlap</Typography>
                    <Chip
                      label={testResult.has_overlap ? 'Yes' : 'No'}
                      color={testResult.has_overlap ? 'warning' : 'success'}
                      size="small"
                    />
                  </Box>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab 3: Raw Data */}
      <TabPanel value={tabValue} index={3}>
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ color: '#00d4ff' }}>Raw Data (JSON)</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" startIcon={<CopyIcon />} onClick={() => copyToClipboard(JSON.stringify(testResult, null, 2))}>
                  Copy
                </Button>
                <Button size="small" startIcon={<DownloadIcon />} onClick={exportResults}>
                  Download
                </Button>
              </Box>
            </Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              Raw data can be exported for detailed analysis or further processing.
            </Alert>
            <Box sx={{
              bgcolor: 'rgba(0, 0, 0, 0.3)', p: 2, borderRadius: 1,
              fontFamily: 'monospace', fontSize: '0.8rem',
              maxHeight: 600, overflow: 'auto', whiteSpace: 'pre-wrap',
            }}>
              {JSON.stringify(testResult, null, 2)}
            </Box>
          </CardContent>
        </Card>
      </TabPanel>
    </Box>
  );
};

export default TestResultDetails;
