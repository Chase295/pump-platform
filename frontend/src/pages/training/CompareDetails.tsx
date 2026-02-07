import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Button,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tabs,
  Tab,
  Grid,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  CompareArrows as CompareIcon,
  EmojiEvents as TrophyIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { trainingApi } from '../../services/api';
import type { ComparisonResponse, ComparisonResult } from '../../types/training';

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

const CompareDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    if (id) {
      loadComparison(parseInt(id));
    }
  }, [id]);

  const loadComparison = async (comparisonId: number) => {
    try {
      setLoading(true);
      setError(null);
      const resp = await trainingApi.getComparison(comparisonId);
      setComparison(resp.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load comparison');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string) => {
    try {
      return new Date(date).toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return date;
    }
  };

  const formatPct = (value?: number) => {
    if (value === undefined || value === null) return 'N/A';
    return `${(value * 100).toFixed(2)}%`;
  };

  const formatNumber = (value?: number) => {
    if (value === undefined || value === null) return 'N/A';
    return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const downloadJson = () => {
    if (!comparison) return;
    const dataStr = JSON.stringify(comparison, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparison-${comparison.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !comparison) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>{error || 'Comparison not found'}</Alert>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/training/comparisons')} variant="outlined">
          Back to Comparisons
        </Button>
      </Box>
    );
  }

  // Sort results by score
  const sortedResults: ComparisonResult[] = [...(comparison.results || [])].sort(
    (a, b) => (b.avg_score || 0) - (a.avg_score || 0),
  );

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button startIcon={<BackIcon />} onClick={() => navigate('/training/comparisons')} variant="outlined">
            Back
          </Button>
          <CompareIcon sx={{ color: '#00d4ff', fontSize: 32 }} />
          <Box>
            <Typography variant="h5" fontWeight="bold" sx={{ color: '#00d4ff' }}>
              Comparison #{comparison.id}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDate(comparison.created_at)}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Copy JSON">
            <IconButton onClick={() => copyToClipboard(JSON.stringify(comparison, null, 2))}>
              <CopyIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download JSON">
            <IconButton onClick={downloadJson}>
              <DownloadIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Info Box */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: 'rgba(0, 212, 255, 0.05)', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="body2" color="text.secondary">Models</Typography>
            <Typography variant="h6">
              {comparison.model_ids?.join(', ') || `${comparison.model_a_id} vs ${comparison.model_b_id}`}
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="body2" color="text.secondary">Test Period</Typography>
            <Typography variant="h6">
              {formatDate(comparison.test_start)} - {formatDate(comparison.test_end)}
            </Typography>
          </Grid>
          {comparison.winner_id && (
            <Grid item xs={12} md={4}>
              <Typography variant="body2" color="text.secondary">Winner</Typography>
              <Chip
                icon={<TrophyIcon />}
                label={`Model #${comparison.winner_id}`}
                color="success"
                sx={{ fontSize: '1rem', height: '32px' }}
              />
            </Grid>
          )}
        </Grid>
        {comparison.winner_reason && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              {comparison.winner_reason}
            </Typography>
          </Box>
        )}
      </Paper>

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
          <Tab label="Ranking" />
          <Tab label="Metrics Comparison" />
          <Tab label="Confusion Matrix" />
          <Tab label="Raw Data" />
        </Tabs>
      </Box>

      {/* Tab 0: Ranking */}
      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={3}>
          {sortedResults.map((result, idx) => {
            const medals = ['#1', '#2', '#3'];
            const medal = idx < 3 ? medals[idx] : `#${idx + 1}`;
            const isWinner = comparison.winner_id === result.model_id;

            return (
              <Grid item xs={12} md={6} key={result.model_id}>
                <Card sx={{
                  height: '100%',
                  border: isWinner ? '2px solid #4caf50' : '1px solid rgba(255,255,255,0.1)',
                  bgcolor: isWinner ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255,255,255,0.03)',
                }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                      <Box>
                        <Typography variant="h5" fontWeight="bold">
                          {medal} Model #{result.model_id}
                        </Typography>
                        {isWinner && (
                          <Chip icon={<TrophyIcon />} label="Winner" color="success" size="small" sx={{ mt: 1 }} />
                        )}
                      </Box>
                      <Typography variant="h4" color="primary">
                        {result.avg_score ? (result.avg_score * 100).toFixed(1) : 'N/A'}%
                      </Typography>
                    </Box>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Accuracy</Typography>
                        <Typography variant="h6">{formatPct(result.accuracy)}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">F1 Score</Typography>
                        <Typography variant="h6">{formatPct(result.f1_score)}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Precision</Typography>
                        <Typography variant="h6">{formatPct(result.precision_score)}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Recall</Typography>
                        <Typography variant="h6">{formatPct(result.recall)}</Typography>
                      </Grid>
                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary">Simulated Profit</Typography>
                        <Typography variant="h6" sx={{ color: (result.simulated_profit_pct ?? 0) >= 0 ? '#4caf50' : '#f44336' }}>
                          {formatNumber(result.simulated_profit_pct)}%
                        </Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </TabPanel>

      {/* Tab 1: Metrics Comparison Table */}
      <TabPanel value={tabValue} index={1}>
        <TableContainer component={Paper} sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Metric</TableCell>
                {sortedResults.map((result) => (
                  <TableCell key={result.model_id} align="right">
                    Model #{result.model_id}
                    {comparison.winner_id === result.model_id && (
                      <TrophyIcon sx={{ ml: 0.5, fontSize: 16, color: '#4caf50', verticalAlign: 'middle' }} />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {[
                { name: 'Avg Score', key: 'avg_score' },
                { name: 'Accuracy', key: 'accuracy' },
                { name: 'F1 Score', key: 'f1_score' },
                { name: 'Precision', key: 'precision_score' },
                { name: 'Recall', key: 'recall' },
                { name: 'ROC-AUC', key: 'roc_auc' },
                { name: 'MCC', key: 'mcc', isRaw: true },
                { name: 'FPR', key: 'fpr' },
                { name: 'FNR', key: 'fnr' },
                { name: 'Simulated Profit', key: 'simulated_profit_pct', isProfit: true },
                { name: 'Samples', key: 'num_samples', isCount: true },
              ].map((metric) => (
                <TableRow key={metric.name}>
                  <TableCell sx={{ fontWeight: 500 }}>{metric.name}</TableCell>
                  {sortedResults.map((result) => {
                    const val = (result as any)[metric.key];
                    let display: string;
                    if (metric.isCount) {
                      display = val?.toLocaleString() || 'N/A';
                    } else if (metric.isRaw) {
                      display = formatNumber(val);
                    } else if (metric.isProfit) {
                      display = val !== undefined && val !== null ? `${formatNumber(val)}%` : 'N/A';
                    } else {
                      display = formatPct(val);
                    }
                    return (
                      <TableCell
                        key={result.model_id}
                        align="right"
                        sx={metric.isProfit ? { color: (val ?? 0) >= 0 ? '#4caf50' : '#f44336' } : undefined}
                      >
                        {display}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Tab 2: Confusion Matrix */}
      <TabPanel value={tabValue} index={2}>
        <Grid container spacing={3}>
          {sortedResults.map((result) => (
            <Grid item xs={12} md={6} key={result.model_id}>
              <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Model #{result.model_id}
                    {comparison.winner_id === result.model_id && (
                      <TrophyIcon sx={{ ml: 1, fontSize: 20, color: '#4caf50', verticalAlign: 'middle' }} />
                    )}
                  </Typography>
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={6}>
                      <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'rgba(76, 175, 80, 0.15)', borderRadius: 2 }}>
                        <Typography variant="h4" sx={{ color: '#4caf50' }}>{result.tp ?? 0}</Typography>
                        <Typography variant="body2" color="text.secondary">True Positive</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6}>
                      <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'rgba(244, 67, 54, 0.15)', borderRadius: 2 }}>
                        <Typography variant="h4" sx={{ color: '#f44336' }}>{result.fp ?? 0}</Typography>
                        <Typography variant="body2" color="text.secondary">False Positive</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6}>
                      <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'rgba(244, 67, 54, 0.15)', borderRadius: 2 }}>
                        <Typography variant="h4" sx={{ color: '#f44336' }}>{result.fn ?? 0}</Typography>
                        <Typography variant="body2" color="text.secondary">False Negative</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6}>
                      <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'rgba(76, 175, 80, 0.15)', borderRadius: 2 }}>
                        <Typography variant="h4" sx={{ color: '#4caf50' }}>{result.tn ?? 0}</Typography>
                        <Typography variant="body2" color="text.secondary">True Negative</Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </TabPanel>

      {/* Tab 3: Raw Data */}
      <TabPanel value={tabValue} index={3}>
        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ color: '#00d4ff' }}>Raw Data (JSON)</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" startIcon={<CopyIcon />} onClick={() => copyToClipboard(JSON.stringify(comparison, null, 2))}>
                  Copy
                </Button>
                <Button size="small" startIcon={<DownloadIcon />} onClick={downloadJson}>
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
              {JSON.stringify(comparison, null, 2)}
            </Box>
          </CardContent>
        </Card>
      </TabPanel>
    </Box>
  );
};

export default CompareDetails;
