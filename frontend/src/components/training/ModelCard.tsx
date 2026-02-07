import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Button,
  Tooltip,
  LinearProgress,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Science as TestIcon,
  Visibility as DetailsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AutoAwesome as EngineeringIcon,
  Balance as BalanceIcon,
  Timer as TimerIcon,
  Storage as FeaturesIcon,
} from '@mui/icons-material';
import type { ModelResponse } from '../../types/training';
import StatusChip from './StatusChip';

interface ModelCardProps {
  model: ModelResponse;
  onDetails: (modelId: number) => void;
  onDelete: (modelId: number) => void;
  onDownload: (modelId: number) => void;
  onTest?: (modelId: number) => void;
}

const ModelCard: React.FC<ModelCardProps> = ({
  model,
  onDetails,
  onDelete,
  onDownload,
  onTest,
}) => {
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
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
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return diffHours > 0 ? `${diffHours}h ${diffMinutes}min` : `${diffMinutes}min`;
    } catch {
      return 'N/A';
    }
  };

  const getTimePrediction = () => {
    if (model.params?._time_based?.enabled || model.params?._time_based?.future_minutes) {
      return {
        enabled: true,
        minutes: model.params._time_based.future_minutes || 5,
        percent: model.params._time_based.min_percent_change || 2,
        direction: model.params._time_based.direction || 'up',
      };
    }
    return null;
  };

  const getF1Color = (f1: number) => {
    if (f1 >= 0.3) return '#4caf50';
    if (f1 >= 0.15) return '#ff9800';
    if (f1 > 0) return '#f44336';
    return '#666';
  };

  const featureCount = model.features?.length || 0;
  const hasEngineering = model.params?.use_engineered_features === true;
  const scaleWeight = model.params?.scale_pos_weight;
  const hasSmote = model.params?.use_smote === true;
  const timePred = getTimePrediction();

  return (
    <Card
      sx={{
        border: '1px solid rgba(255, 255, 255, 0.2)',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        color: 'white',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          boxShadow: '0 8px 32px rgba(0, 212, 255, 0.3)',
          transform: 'translateY(-4px)',
        },
      }}
    >
      <CardContent sx={{ p: 3 }}>
        {/* Header */}
        <Box display="flex" alignItems="flex-start" mb={2}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 'bold',
                color: '#00d4ff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={model.name}
            >
              {model.name}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              ID: {model.id} -- {formatDate(model.created_at)}
            </Typography>
          </Box>
        </Box>

        {/* Status and Type */}
        <Box display="flex" alignItems="center" gap={1} mb={2} flexWrap="wrap">
          <StatusChip status={model.status} size="small" />
          <Chip
            label={`${model.model_type.toUpperCase()}`}
            size="small"
            variant="outlined"
            sx={{ borderColor: 'rgba(255, 255, 255, 0.3)' }}
          />
          <Tooltip title={`${featureCount} Features`}>
            <Chip
              icon={<FeaturesIcon sx={{ fontSize: 14 }} />}
              label={`${featureCount} Features`}
              size="small"
              variant="outlined"
              sx={{ borderColor: featureCount > 50 ? '#4caf50' : 'rgba(255, 255, 255, 0.3)' }}
            />
          </Tooltip>
        </Box>

        {/* Training Config Badges */}
        <Box display="flex" gap={1} mb={2} flexWrap="wrap">
          {hasEngineering && (
            <Chip
              icon={<EngineeringIcon sx={{ fontSize: 14 }} />}
              label="Engineering"
              size="small"
              sx={{ bgcolor: 'rgba(156, 39, 176, 0.3)', borderColor: '#9c27b0', border: '1px solid' }}
            />
          )}
          {scaleWeight && (
            <Chip
              icon={<BalanceIcon sx={{ fontSize: 14 }} />}
              label={`Weight: ${scaleWeight}`}
              size="small"
              sx={{ bgcolor: 'rgba(255, 152, 0, 0.3)', borderColor: '#ff9800', border: '1px solid' }}
            />
          )}
          {hasSmote && (
            <Chip
              label="SMOTE"
              size="small"
              sx={{ bgcolor: 'rgba(0, 188, 212, 0.3)', borderColor: '#00bcd4', border: '1px solid' }}
            />
          )}
          {model.phases && model.phases.length > 0 && (
            <Chip
              label={`Phase ${model.phases.join(',')}`}
              size="small"
              sx={{ bgcolor: 'rgba(0, 212, 255, 0.3)', borderColor: '#00d4ff', border: '1px solid' }}
            />
          )}
        </Box>

        {/* Time Prediction Info */}
        {timePred && (
          <Box
            sx={{
              mb: 2,
              p: 1.5,
              bgcolor: 'rgba(0, 212, 255, 0.1)',
              borderRadius: 1,
              border: '1px solid rgba(0, 212, 255, 0.3)',
            }}
          >
            <Box display="flex" alignItems="center" gap={1}>
              <TimerIcon sx={{ color: '#00d4ff', fontSize: 20 }} />
              {timePred.direction === 'up' ? (
                <TrendingUpIcon sx={{ color: '#4caf50', fontSize: 20 }} />
              ) : (
                <TrendingDownIcon sx={{ color: '#f44336', fontSize: 20 }} />
              )}
              <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#00d4ff' }}>
                {timePred.percent}% in {timePred.minutes} Min
                <Typography
                  component="span"
                  sx={{ ml: 0.5, color: timePred.direction === 'up' ? '#4caf50' : '#f44336' }}
                >
                  ({timePred.direction === 'up' ? 'PUMP' : 'RUG'})
                </Typography>
              </Typography>
            </Box>
          </Box>
        )}

        {/* Metrics Grid */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
              <Typography variant="h6" sx={{ color: '#4caf50', fontWeight: 'bold' }}>
                {((model.training_accuracy || 0) * 100).toFixed(1)}%
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                Accuracy
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
              <Typography variant="h6" sx={{ color: getF1Color(model.training_f1 || 0), fontWeight: 'bold' }}>
                {((model.training_f1 || 0) * 100).toFixed(2)}%
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                F1-Score
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
              <Typography variant="h6" sx={{ color: '#00d4ff', fontWeight: 'bold' }}>
                {((model.training_precision || 0) * 100).toFixed(1)}%
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                Precision
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
              <Typography variant="h6" sx={{ color: '#ff9800', fontWeight: 'bold' }}>
                {((model.training_recall || 0) * 100).toFixed(1)}%
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                Recall
              </Typography>
            </Box>
          </Box>

          {/* F1 Progress Bar */}
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              F1-Score Quality
            </Typography>
            <LinearProgress
              variant="determinate"
              value={Math.min((model.training_f1 || 0) * 1000, 100)}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: 'rgba(255,255,255,0.1)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: getF1Color(model.training_f1 || 0),
                  borderRadius: 3,
                },
              }}
            />
          </Box>
        </Box>

        {/* Confusion Matrix Mini */}
        {model.tp !== undefined && model.fp !== undefined && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.5, mb: 2 }}>
            <Tooltip title="True Positive">
              <Box sx={{ p: 0.5, bgcolor: 'rgba(76, 175, 80, 0.2)', borderRadius: 0.5, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: '#4caf50' }}>TP: {model.tp}</Typography>
              </Box>
            </Tooltip>
            <Tooltip title="False Positive">
              <Box sx={{ p: 0.5, bgcolor: 'rgba(244, 67, 54, 0.2)', borderRadius: 0.5, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: '#f44336' }}>FP: {model.fp}</Typography>
              </Box>
            </Tooltip>
            <Tooltip title="False Negative">
              <Box sx={{ p: 0.5, bgcolor: 'rgba(255, 152, 0, 0.2)', borderRadius: 0.5, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: '#ff9800' }}>FN: {model.fn}</Typography>
              </Box>
            </Tooltip>
            <Tooltip title="True Negative">
              <Box sx={{ p: 0.5, bgcolor: 'rgba(33, 150, 243, 0.2)', borderRadius: 0.5, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: '#2196f3' }}>TN: {model.tn}</Typography>
              </Box>
            </Tooltip>
          </Box>
        )}

        {/* Training Period */}
        <Box sx={{ mb: 2, p: 1, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1 }}>
          <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)', display: 'block' }}>
            Training period: <strong>{formatDuration(model.train_start, model.train_end)}</strong>
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.4)' }}>
            {formatDate(model.train_start)} - {formatDate(model.train_end)}
          </Typography>
        </Box>

        {/* Actions */}
        <Box display="flex" gap={1} flexWrap="wrap">
          <Button
            size="small"
            variant="contained"
            startIcon={<DetailsIcon />}
            onClick={() => onDetails(model.id)}
            sx={{ bgcolor: '#00d4ff', '&:hover': { bgcolor: '#00b8d4' } }}
          >
            Details
          </Button>
          {onTest && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<TestIcon />}
              onClick={() => onTest(model.id)}
              disabled={model.status !== 'READY' && model.status !== 'TRAINED'}
            >
              Test
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => onDownload(model.id)}
            disabled={model.status !== 'READY'}
          >
            Download
          </Button>
          <Button
            size="small"
            color="error"
            variant="outlined"
            startIcon={<DeleteIcon />}
            onClick={() => onDelete(model.id)}
          >
            Delete
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ModelCard;
