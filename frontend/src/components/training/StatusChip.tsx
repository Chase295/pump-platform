import React from 'react';
import { Chip, keyframes } from '@mui/material';
import {
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Schedule as PendingIcon,
  PlayArrow as RunningIcon,
  Stop as StoppedIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';

const pulse = keyframes`
  0% { opacity: 1; }
  50% { opacity: 0.6; }
  100% { opacity: 1; }
`;

interface StatusChipProps {
  status: string;
  size?: 'small' | 'medium';
  variant?: 'filled' | 'outlined';
  showIcon?: boolean;
}

const StatusChip: React.FC<StatusChipProps> = ({
  status,
  size = 'small',
  variant = 'filled',
  showIcon = true,
}) => {
  const getStatusConfig = (s: string) => {
    const lower = s.toLowerCase();

    switch (lower) {
      case 'ready':
      case 'completed':
      case 'success':
      case 'healthy':
        return {
          color: 'success' as const,
          icon: showIcon ? <SuccessIcon /> : undefined,
          label: s,
          sx: {},
        };

      case 'training':
      case 'running':
        return {
          color: 'info' as const,
          icon: showIcon ? <RunningIcon /> : undefined,
          label: s,
          sx: { animation: `${pulse} 1.5s ease-in-out infinite` },
        };

      case 'pending':
        return {
          color: 'default' as const,
          icon: showIcon ? <PendingIcon /> : undefined,
          label: s,
          sx: { bgcolor: 'rgba(158,158,158,0.2)', color: '#bdbdbd' },
        };

      case 'failed':
      case 'error':
      case 'unhealthy':
        return {
          color: 'error' as const,
          icon: showIcon ? <ErrorIcon /> : undefined,
          label: s,
          sx: {},
        };

      case 'stopped':
      case 'cancelled':
        return {
          color: 'default' as const,
          icon: showIcon ? <StoppedIcon /> : undefined,
          label: s,
          sx: {},
        };

      case 'degraded':
      case 'warning':
        return {
          color: 'warning' as const,
          icon: showIcon ? <WarningIcon /> : undefined,
          label: s,
          sx: {},
        };

      default:
        return {
          color: 'default' as const,
          icon: undefined,
          label: s,
          sx: {},
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
      variant={variant}
      icon={config.icon}
      sx={{
        fontWeight: 'medium',
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        ...config.sx,
      }}
    />
  );
};

export default StatusChip;
