import React from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Chip,
  Paper,
  Alert,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { findApi } from '../../services/api';
import type { Stream, StreamStats } from '../../types/find';

const Streams: React.FC = () => {
  const {
    data: streamStats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery<StreamStats>({
    queryKey: ['find', 'streamStats'],
    queryFn: async () => {
      const res = await findApi.getStreamStats();
      return res.data;
    },
    refetchInterval: 10000,
  });

  const {
    data: streams,
    isLoading: streamsLoading,
    error: streamsError,
    refetch: refetchStreams,
  } = useQuery<Stream[]>({
    queryKey: ['find', 'streams'],
    queryFn: async () => {
      const res = await findApi.getStreams(50);
      return res.data;
    },
    refetchInterval: 10000,
  });

  const isLoading = statsLoading || streamsLoading;
  const error = statsError || streamsError;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const truncateAddress = (addr: string) => {
    if (!addr || addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', sm: 'center' },
        mb: 3,
        gap: 2,
      }}>
        <Typography variant="h5">
          Active Streams
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => refetchStreams()}
          disabled={isLoading}
          size="small"
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error instanceof Error ? error.message : 'Failed to load streams'}
        </Alert>
      )}

      {/* Stats Summary */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 2, md: 3 }, mb: 3 }}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Active Streams
            </Typography>
            <Typography variant="h4" sx={{ color: '#4caf50', fontSize: { xs: '1.5rem', md: '2.125rem' } }}>
              {streamStats?.active_streams ?? 0}
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Total Streams
            </Typography>
            <Typography variant="h4" sx={{ color: '#2196f3', fontSize: { xs: '1.5rem', md: '2.125rem' } }}>
              {streamStats?.total_streams ?? 0}
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography color="textSecondary" gutterBottom>
              Phase Distribution
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
              {streamStats?.streams_by_phase &&
                Object.entries(streamStats.streams_by_phase).map(([phaseId, count]) => (
                  <Chip
                    key={phaseId}
                    label={`P${phaseId}: ${count}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.75rem' }}
                  />
                ))}
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Streams Table */}
      {isLoading && !streams ? (
        <LinearProgress />
      ) : (
        <Paper sx={{ overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: { xs: '60vh', md: '70vh' } }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Token Address</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Phase</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Active</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Graduated</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Started At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {streams && streams.length > 0 ? (
                  streams.map((stream, index) => (
                    <TableRow
                      key={stream.token_address || index}
                      sx={{
                        '&:nth-of-type(odd)': { backgroundColor: 'rgba(255, 255, 255, 0.02)' },
                        opacity: stream.is_active ? 1 : 0.5,
                      }}
                    >
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: { xs: '0.75rem', md: '0.8rem' },
                          }}
                          title={stream.token_address}
                        >
                          {truncateAddress(stream.token_address)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={stream.current_phase_id}
                          size="small"
                          color={
                            stream.current_phase_id === 99 ? 'error' :
                            stream.current_phase_id === 100 ? 'secondary' :
                            stream.current_phase_id === 1 ? 'info' :
                            stream.current_phase_id === 2 ? 'warning' :
                            stream.current_phase_id === 3 ? 'success' :
                            'primary'
                          }
                          sx={{ minWidth: 40 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={stream.is_active ? 'Yes' : 'No'}
                          size="small"
                          color={stream.is_active ? 'success' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={stream.is_graduated ? 'Yes' : 'No'}
                          size="small"
                          color={stream.is_graduated ? 'secondary' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' } }}>
                          {formatDate(stream.started_at)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography color="textSecondary">
                        No streams found
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
        Showing up to 50 streams (auto-refresh every 10s)
      </Typography>
    </Box>
  );
};

export default Streams;
