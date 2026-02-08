import React from 'react';
import { Box, Card, CardContent, Typography, Skeleton } from '@mui/material';

interface DiscoveryStatCardProps {
  label: string;
  value: React.ReactNode;
  sublabel?: string;
  icon?: React.ReactNode;
  accentColor: string; // RGB triplet e.g. "0, 212, 255"
  loading?: boolean;
}

const DiscoveryStatCard: React.FC<DiscoveryStatCardProps> = ({
  label,
  value,
  sublabel,
  icon,
  accentColor,
  loading,
}) => (
  <Card
    sx={{
      bgcolor: `rgba(${accentColor}, 0.06)`,
      border: `1px solid rgba(${accentColor}, 0.25)`,
      backdropFilter: 'blur(10px)',
      height: '100%',
    }}
  >
    <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography
          variant="body2"
          sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          {label}
        </Typography>
        {icon && (
          <Box sx={{ color: `rgba(${accentColor}, 0.8)`, display: 'flex', fontSize: 20 }}>
            {icon}
          </Box>
        )}
      </Box>
      {loading ? (
        <Skeleton variant="text" width="60%" sx={{ bgcolor: 'rgba(255,255,255,0.08)', fontSize: '1.8rem' }} />
      ) : (
        <Typography
          variant="h4"
          sx={{
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: { xs: '1.4rem', sm: '1.8rem' },
            color: `rgb(${accentColor})`,
            lineHeight: 1.2,
          }}
        >
          {value}
        </Typography>
      )}
      {sublabel && (
        <Typography
          variant="caption"
          sx={{ color: 'rgba(255,255,255,0.4)', mt: 0.5, display: 'block', fontSize: '0.7rem' }}
        >
          {sublabel}
        </Typography>
      )}
    </CardContent>
  </Card>
);

export default DiscoveryStatCard;
