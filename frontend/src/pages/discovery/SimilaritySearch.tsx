import React, { useState } from 'react';
import {
  Typography,
  Box,
  TextField,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Slider,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { embeddingsApi } from '../../services/api';
import type { SimilarityResult, SimilaritySearchResponse } from '../../types/embeddings';

const LABEL_COLORS: Record<string, string> = {
  pump: '#4caf50',
  rug: '#f44336',
  organic_growth: '#2196f3',
  flat: '#9e9e9e',
  dump: '#ff9800',
  mixed: '#9c27b0',
};

const SimilaritySearch: React.FC = () => {
  const [mint, setMint] = useState('');
  const [k, setK] = useState(20);
  const [minSimilarity, setMinSimilarity] = useState(0.5);
  const [phaseFilter, setPhaseFilter] = useState<string>('');
  const [labelFilter, setLabelFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SimilaritySearchResponse | null>(null);

  const handleSearch = async () => {
    if (!mint.trim()) {
      setError('Please enter a mint address');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = {
        k,
        min_similarity: minSimilarity,
      };
      if (phaseFilter) params.phase_id = parseInt(phaseFilter);
      if (labelFilter) params.label = labelFilter;

      const res = await embeddingsApi.searchByMint(mint.trim(), params);
      setResults(res.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyMint = (value: string) => {
    navigator.clipboard.writeText(value);
  };

  return (
    <Box>
      {/* Search Controls */}
      <Card sx={{ mb: 3, bgcolor: '#1a1a2e' }}>
        <CardHeader
          title="Similarity Search"
          subheader="Find coins with similar trading patterns"
          sx={{ pb: 1 }}
        />
        <CardContent>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid size={{ xs: 12, md: 5 }}>
              <TextField
                fullWidth
                label="Mint Address"
                value={mint}
                onChange={(e) => setMint(e.target.value)}
                placeholder="Enter token mint address..."
                size="small"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <TextField
                fullWidth
                type="number"
                label="Results (k)"
                value={k}
                onChange={(e) => setK(Math.max(1, Math.min(200, parseInt(e.target.value) || 20)))}
                size="small"
                inputProps={{ min: 1, max: 200 }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Label</InputLabel>
                <Select
                  value={labelFilter}
                  label="Label"
                  onChange={(e) => setLabelFilter(e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="pump">Pump</MenuItem>
                  <MenuItem value="rug">Rug</MenuItem>
                  <MenuItem value="organic_growth">Organic</MenuItem>
                  <MenuItem value="flat">Flat</MenuItem>
                  <MenuItem value="dump">Dump</MenuItem>
                  <MenuItem value="mixed">Mixed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 1 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Phase</InputLabel>
                <Select
                  value={phaseFilter}
                  label="Phase"
                  onChange={(e) => setPhaseFilter(e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  {[1, 2, 3, 4, 5].map((p) => (
                    <MenuItem key={p} value={String(p)}>P{p}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <Button
                fullWidth
                variant="contained"
                onClick={handleSearch}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={18} /> : <SearchIcon />}
                sx={{ bgcolor: '#00d4ff', '&:hover': { bgcolor: '#00b8d4' } }}
              >
                Search
              </Button>
            </Grid>
          </Grid>

          <Box sx={{ mt: 2, px: 1 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Min Similarity: {minSimilarity.toFixed(2)}
            </Typography>
            <Slider
              value={minSimilarity}
              onChange={(_, v) => setMinSimilarity(v as number)}
              min={0}
              max={1}
              step={0.05}
              valueLabelDisplay="auto"
              sx={{ color: '#00d4ff' }}
            />
          </Box>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Results */}
      {results && (
        <Card sx={{ bgcolor: '#1a1a2e' }}>
          <CardHeader
            title={`Results: ${results.total_results} similar patterns`}
            subheader={`Search time: ${results.search_time_ms}ms | Query: ${results.query_mint?.slice(0, 12)}...`}
          />
          <CardContent sx={{ p: 0 }}>
            <TableContainer component={Paper} sx={{ bgcolor: 'transparent' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Mint</TableCell>
                    <TableCell align="right">Similarity</TableCell>
                    <TableCell>Label</TableCell>
                    <TableCell>Phase</TableCell>
                    <TableCell>Window</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.results.map((row: SimilarityResult) => (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {row.mint.slice(0, 8)}...{row.mint.slice(-4)}
                          </Typography>
                          <Tooltip title="Copy mint address">
                            <IconButton size="small" onClick={() => copyMint(row.mint)}>
                              <CopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 'bold',
                            color: row.similarity >= 0.9 ? '#4caf50' : row.similarity >= 0.7 ? '#ff9800' : '#f44336',
                          }}
                        >
                          {(row.similarity * 100).toFixed(1)}%
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {row.label ? (
                          <Chip
                            label={row.label}
                            size="small"
                            sx={{
                              bgcolor: LABEL_COLORS[row.label] || '#666',
                              color: '#fff',
                              fontSize: '0.7rem',
                            }}
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">-</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.phase_id ? (
                          <Chip label={`P${row.phase_id}`} size="small" variant="outlined" />
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                          {new Date(row.window_start).toLocaleTimeString()}
                          {' - '}
                          {new Date(row.window_end).toLocaleTimeString()}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  {results.results.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography color="text.secondary">No similar patterns found</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default SimilaritySearch;
