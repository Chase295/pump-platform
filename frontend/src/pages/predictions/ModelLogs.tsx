/**
 * ModelLogs Page
 * Prediction logs table for a specific model.
 * Columns: coin_id, prediction, probability, tag, status, timestamp.
 * Filter by tag. Uses serverApi.getModelPredictions().
 */
import React, { useState, useMemo } from 'react';
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Breadcrumbs,
  Link as MuiLink,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  List as ListIcon,
  OpenInNew as OpenIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';

import { serverApi } from '../../services/api';
import type { ServerModel } from '../../types/server';

interface ModelPrediction {
  id: number;
  active_model_id: number;
  coin_id: string;
  prediction: number;
  probability: number;
  tag: string;
  status: string;
  created_at: string;
  prediction_timestamp?: string;
  ath_highest_pct?: number;
  ath_lowest_pct?: number;
}

const ModelLogs: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const modelId = Number(id);

  const [tagFilter, setTagFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [limit, setLimit] = useState(100);

  // Load model info
  const { data: modelResponse } = useQuery({
    queryKey: ['server', 'model', modelId],
    queryFn: () => serverApi.getModelDetails(modelId),
    enabled: !!modelId,
  });

  const model: ServerModel | undefined = modelResponse?.data;
  const modelName = model?.custom_name || model?.name || `Model #${modelId}`;

  // Load predictions
  const {
    data: predictionsResponse,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['server', 'model-predictions', modelId, tagFilter, statusFilter, limit],
    queryFn: () => {
      const params: Record<string, unknown> = {
        active_model_id: modelId,
        limit,
      };
      if (tagFilter !== 'ALL') params.tag = tagFilter;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      return serverApi.getModelPredictions(params);
    },
    enabled: !!modelId,
    refetchInterval: 15000,
  });

  const predictions: ModelPrediction[] = predictionsResponse?.data?.predictions || predictionsResponse?.data || [];

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const getTagColor = (tag: string): 'error' | 'success' | 'warning' | 'default' => {
    switch (tag) {
      case 'negativ':
        return 'error';
      case 'positiv':
        return 'success';
      case 'alert':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: string): 'success' | 'default' | 'error' => {
    switch (status) {
      case 'aktiv':
        return 'success';
      case 'inaktiv':
        return 'default';
      default:
        return 'default';
    }
  };

  const handleCopyCoinId = (coinId: string) => {
    navigator.clipboard.writeText(coinId);
  };

  const stats = useMemo(() => ({
    total: predictions.length,
    positive: predictions.filter((p) => p.tag === 'positiv').length,
    negative: predictions.filter((p) => p.tag === 'negativ').length,
    alert: predictions.filter((p) => p.tag === 'alert').length,
  }), [predictions]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 3 }}>
        <MuiLink component="button" variant="body2" onClick={() => navigate('/predictions')} sx={{ cursor: 'pointer' }}>
          Models
        </MuiLink>
        <MuiLink
          component="button"
          variant="body2"
          onClick={() => navigate(`/predictions/models/${modelId}`)}
          sx={{ cursor: 'pointer' }}
        >
          {modelName}
        </MuiLink>
        <Typography color="text.primary">Logs</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              fontSize: { xs: '1.3rem', sm: '2rem' },
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <ListIcon /> Prediction Logs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {modelName} - showing last {limit} entries
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => refetch()}
            disabled={isRefetching}
            size="small"
          >
            {isRefetching ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button
            startIcon={<BackIcon />}
            onClick={() => navigate(`/predictions/models/${modelId}`)}
            variant="outlined"
            size="small"
          >
            Back
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Error loading logs: {(error as Error).message}
        </Alert>
      )}

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Chip label={`${stats.total} Total`} color="primary" variant="outlined" />
        <Chip label={`${stats.positive} Positive`} color="success" variant="filled" />
        <Chip label={`${stats.negative} Negative`} color="error" variant="outlined" />
        <Chip label={`${stats.alert} Alerts`} color="warning" variant="filled" />
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Tag</InputLabel>
          <Select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} label="Tag">
            <MenuItem value="ALL">All Tags</MenuItem>
            <MenuItem value="negativ">Negative</MenuItem>
            <MenuItem value="positiv">Positive</MenuItem>
            <MenuItem value="alert">Alert</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} label="Status">
            <MenuItem value="ALL">All Status</MenuItem>
            <MenuItem value="aktiv">Active</MenuItem>
            <MenuItem value="inaktiv">Inactive</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Limit</InputLabel>
          <Select value={limit} onChange={(e) => setLimit(e.target.value as number)} label="Limit">
            <MenuItem value={50}>50</MenuItem>
            <MenuItem value={100}>100</MenuItem>
            <MenuItem value={250}>250</MenuItem>
            <MenuItem value={500}>500</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Predictions Table */}
      {predictions.length === 0 ? (
        <Card sx={{ textAlign: 'center', py: 6 }}>
          <CardContent>
            <ListIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No prediction logs found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Logs will appear as the model makes predictions.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer
          component={Paper}
          sx={{
            bgcolor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 2,
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Coin ID</TableCell>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Prediction</TableCell>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Probability</TableCell>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Tag</TableCell>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Timestamp</TableCell>
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {predictions.map((pred) => (
                <TableRow
                  key={pred.id}
                  hover
                  sx={{
                    '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)' },
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Tooltip title={pred.coin_id}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            maxWidth: 120,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {pred.coin_id.slice(0, 6)}...{pred.coin_id.slice(-4)}
                        </Typography>
                      </Tooltip>
                      <IconButton
                        size="small"
                        onClick={() => handleCopyCoinId(pred.coin_id)}
                        sx={{ p: 0.3 }}
                      >
                        <CopyIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={pred.prediction === 1 ? 'Positive' : 'Negative'}
                      size="small"
                      color={pred.prediction === 1 ? 'success' : 'error'}
                      variant="outlined"
                      sx={{ height: 22, fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        color: pred.probability >= 0.7
                          ? 'success.main'
                          : pred.probability >= 0.5
                            ? 'warning.main'
                            : 'error.main',
                      }}
                    >
                      {(pred.probability * 100).toFixed(1)}%
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={pred.tag}
                      size="small"
                      color={getTagColor(pred.tag)}
                      sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600, textTransform: 'capitalize' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={pred.status}
                      size="small"
                      color={getStatusColor(pred.status)}
                      variant="outlined"
                      sx={{ height: 22, fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {formatDate(pred.created_at || pred.prediction_timestamp)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="View coin details">
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/predictions/coin/${modelId}/${encodeURIComponent(pred.coin_id)}`)}
                      >
                        <OpenIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Footer info */}
      <Box sx={{ mt: 3, p: 2, backgroundColor: 'background.paper', borderRadius: 2 }}>
        <Typography variant="body2" color="text.secondary" align="center">
          Auto-refreshes every 15 seconds | Showing {predictions.length} entries
        </Typography>
      </Box>
    </Box>
  );
};

export default ModelLogs;
