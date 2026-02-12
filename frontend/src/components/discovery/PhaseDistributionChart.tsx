import React from 'react';
import { Box, Typography } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import type { Phase } from '../../types/find';
import { getPhaseColor } from '../../utils/phaseColors';

interface PhaseDistributionChartProps {
  streamsByPhase: Record<number, number>;
  phases: Phase[];
}

const PhaseDistributionChart: React.FC<PhaseDistributionChartProps> = ({ streamsByPhase, phases }) => {
  const phaseMap = React.useMemo(() => {
    const m: Record<number, string> = {};
    phases.forEach((p) => { m[p.id] = p.name; });
    return m;
  }, [phases]);

  const data = React.useMemo(() => {
    return Object.entries(streamsByPhase)
      .map(([id, count]) => ({
        id: Number(id),
        name: phaseMap[Number(id)] || `Phase ${id}`,
        value: count,
        color: getPhaseColor(Number(id)),
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => a.id - b.id);
  }, [streamsByPhase, phaseMap]);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (data.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 250 }}>
        <Typography color="textSecondary">No stream data</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 2 }}>
      <Box sx={{ position: 'relative', width: { xs: 200, sm: 220 }, height: 220, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((entry) => (
                <Cell key={entry.id} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip
              contentStyle={{
                backgroundColor: 'rgba(15, 15, 35, 0.95)',
                border: '1px solid rgba(0, 212, 255, 0.3)',
                borderRadius: 8,
                color: '#fff',
                fontSize: '0.8rem',
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [`${value ?? 0} streams`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.3rem', color: '#fff' }}>
            {total}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.6rem' }}>
            TOTAL
          </Typography>
        </Box>
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {data.map((entry) => (
          <Box key={entry.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: entry.color, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', minWidth: 80, fontSize: '0.8rem' }}>
              {entry.name}
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#fff', fontSize: '0.8rem' }}>
              {entry.value}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>
              ({total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0}%)
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default PhaseDistributionChart;
