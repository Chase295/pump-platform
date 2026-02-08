import React from 'react';
import { Box, Typography, Card } from '@mui/material';

interface PipelineStage {
  label: string;
  value: React.ReactNode;
  sublabel: string;
  color: string; // RGB triplet
  active: boolean;
}

interface PipelineVisualizationProps {
  wsConnected: boolean;
  totalDiscovered: number;
  cacheTotal: number;
  cacheActivated: number;
  activeStreams: number;
  metricsSaved: number;
  totalTrades: number;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

const PipelineVisualization: React.FC<PipelineVisualizationProps> = ({
  wsConnected,
  totalDiscovered,
  cacheTotal,
  cacheActivated,
  activeStreams,
  metricsSaved,
  totalTrades,
}) => {
  const stages: PipelineStage[] = [
    { label: 'WebSocket', value: wsConnected ? 'ON' : 'OFF', sublabel: 'pumpportal.fun', color: wsConnected ? '76, 175, 80' : '244, 67, 54', active: wsConnected },
    { label: 'Discovered', value: fmt(totalDiscovered), sublabel: 'coins found', color: '0, 212, 255', active: totalDiscovered > 0 },
    { label: 'Cache', value: `${cacheActivated}/${cacheTotal}`, sublabel: 'activated/total', color: '255, 152, 0', active: cacheTotal > 0 },
    { label: 'Streams', value: fmt(activeStreams), sublabel: 'active tracking', color: '0, 212, 255', active: activeStreams > 0 },
    { label: 'Metrics', value: fmt(metricsSaved), sublabel: 'rows saved', color: '33, 150, 243', active: metricsSaved > 0 },
    { label: 'Trades', value: fmt(totalTrades), sublabel: 'recorded', color: '156, 39, 176', active: totalTrades > 0 },
  ];

  return (
    <Card sx={{ bgcolor: 'rgba(0, 212, 255, 0.03)', border: '1px solid rgba(0, 212, 255, 0.15)', p: { xs: 1.5, sm: 2 } }}>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1.5, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1 }}>
        Data Pipeline
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
          gap: { xs: 1, sm: 1.5 },
          position: 'relative',
        }}
      >
        {stages.map((stage, i) => (
          <Box key={stage.label} sx={{ position: 'relative' }}>
            <Box
              sx={{
                bgcolor: `rgba(${stage.color}, 0.08)`,
                border: `1px solid rgba(${stage.color}, ${stage.active ? 0.4 : 0.15})`,
                borderRadius: 2,
                p: { xs: 1, sm: 1.5 },
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
                transition: 'border-color 0.3s',
              }}
            >
              {/* Pulsing dot for active stages */}
              {stage.active && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: `rgb(${stage.color})`,
                    animation: 'pulse 2s infinite',
                    '@keyframes pulse': {
                      '0%': { opacity: 1, transform: 'scale(1)' },
                      '50%': { opacity: 0.4, transform: 'scale(1.3)' },
                      '100%': { opacity: 1, transform: 'scale(1)' },
                    },
                  }}
                />
              )}
              <Typography
                variant="caption"
                sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {stage.label}
              </Typography>
              <Typography
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: { xs: '1rem', sm: '1.2rem' },
                  color: stage.active ? `rgb(${stage.color})` : 'rgba(255,255,255,0.3)',
                  lineHeight: 1.3,
                }}
              >
                {stage.value}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem' }}>
                {stage.sublabel}
              </Typography>
            </Box>
            {/* Arrow connector (hidden on xs, visible on md+) */}
            {i < stages.length - 1 && (
              <Box
                sx={{
                  display: { xs: 'none', md: 'block' },
                  position: 'absolute',
                  right: -12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: stage.active ? `rgba(${stage.color}, 0.5)` : 'rgba(255,255,255,0.1)',
                  fontSize: '1rem',
                  zIndex: 1,
                  animation: stage.active ? 'flowArrow 1.5s infinite' : 'none',
                  '@keyframes flowArrow': {
                    '0%': { opacity: 0.3 },
                    '50%': { opacity: 1 },
                    '100%': { opacity: 0.3 },
                  },
                }}
              >
                &rarr;
              </Box>
            )}
          </Box>
        ))}
      </Box>
    </Card>
  );
};

export default PipelineVisualization;
