import React from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from '@mui/material';
import type { ThresholdSweepEntry } from '../../types/training';

interface ThresholdSweepTableProps {
  data: ThresholdSweepEntry[];
}

const getF1Color = (f1: number): string => {
  if (f1 >= 0.5) return '#4caf50';
  if (f1 >= 0.2) return '#ff9800';
  return '#f44336';
};

const getPrecisionColor = (prec: number): string => {
  if (prec >= 0.7) return '#4caf50';
  if (prec >= 0.4) return '#ff9800';
  return '#f44336';
};

const getProfitColor = (pct: number): string => {
  if (pct > 0) return '#4caf50';
  if (pct === 0) return '#888';
  return '#f44336';
};

const formatPct = (val: number): string => `${(val * 100).toFixed(1)}%`;

const ThresholdSweepTable: React.FC<ThresholdSweepTableProps> = ({ data }) => {
  if (!data || data.length === 0) return null;

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
        Zeigt wie sich Precision, Recall und F1 bei verschiedenen Schwellwerten verhalten.
        Hohe Thresholds = weniger aber sicherere Predictions.
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, color: '#00d4ff' }}>Threshold</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: '#00d4ff' }}>Precision</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: '#00d4ff' }}>Recall</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: '#00d4ff' }}>F1</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: '#00d4ff' }}>
                <Tooltip title="True Positive / False Positive">
                  <span>TP / FP</span>
                </Tooltip>
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, color: '#00d4ff' }}>Profit</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row) => {
              const isDeadZone = row.tp === 0 && row.fp === 0;
              return (
                <TableRow
                  key={row.threshold}
                  sx={{
                    bgcolor: row.threshold === 0.5
                      ? 'rgba(0, 212, 255, 0.06)'
                      : isDeadZone
                        ? 'rgba(244, 67, 54, 0.04)'
                        : 'transparent',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                  }}
                >
                  <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                    {row.threshold.toFixed(1)}
                    {row.threshold === 0.5 && (
                      <Typography component="span" variant="caption" sx={{ ml: 1, color: '#00d4ff' }}>
                        default
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ color: getPrecisionColor(row.precision), fontFamily: 'monospace' }}>
                    {formatPct(row.precision)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                    {formatPct(row.recall)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: getF1Color(row.f1), fontWeight: 600, fontFamily: 'monospace' }}>
                    {formatPct(row.f1)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                    <Typography component="span" sx={{ color: '#4caf50' }}>{row.tp}</Typography>
                    {' / '}
                    <Typography component="span" sx={{ color: '#f44336' }}>{row.fp}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ color: getProfitColor(row.simulated_profit_pct), fontFamily: 'monospace' }}>
                    {row.simulated_profit_pct.toFixed(4)}%
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {data.every((r) => r.tp === 0) && (
        <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'rgba(244, 67, 54, 0.1)', borderRadius: 1, border: '1px solid rgba(244, 67, 54, 0.3)' }}>
          <Typography variant="body2" sx={{ color: '#f44336', fontWeight: 600 }}>
            TP = 0 bei allen Thresholds — das Modell produziert keine brauchbaren Predictions.
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ThresholdSweepTable;
