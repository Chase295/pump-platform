import React, { useState } from 'react';
import {
  Typography,
  Box,
  TextField,
  Button,
  Card,
  CardContent,
  Chip,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  LinearProgress,
  Grid,
} from '@mui/material';
import {
  Search as SearchIcon,
  ContentCopy as CopyIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { embeddingsApi, findApi } from '../../services/api';
import type { SimilarityResult, SimilaritySearchResponse } from '../../types/embeddings';
import type { Phase } from '../../types/find';
import { formatDistanceToNow } from 'date-fns';

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
  const [minSimilarity, setMinSimilarity] = useState(0.70);
  const [phaseFilter, setPhaseFilter] = useState<string>('');
  const [labelFilter, setLabelFilter] = useState<string>('');
  const { data: phases } = useQuery<Phase[]>({
    queryKey: ['find', 'phases'],
    queryFn: async () => {
      const res = await findApi.getPhases();
      return res.data.phases ?? res.data;
    },
    staleTime: 60000,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SimilaritySearchResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!mint.trim()) {
      setError('Please enter a mint address');
      return;
    }
    setLoading(true);
    setError(null);
    setHasSearched(true);
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
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const copyMint = (value: string) => {
    navigator.clipboard.writeText(value);
  };

  const getSimilarityColor = (similarity: number): string => {
    if (similarity >= 0.9) return '#4caf50';
    if (similarity >= 0.7) return '#ff9800';
    return '#f44336';
  };

  const avgSimilarity = results?.results.length
    ? results.results.reduce((sum, r) => sum + r.similarity, 0) / results.results.length
    : 0;

  return (
    <Box>
      {/* Initial Helper Card */}
      {!hasSearched && (
        <Card
          sx={{
            mb: 3,
            bgcolor: 'rgba(0, 212, 255, 0.03)',
            border: '1px solid rgba(0, 212, 255, 0.15)',
          }}
        >
          <CardContent>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <InfoIcon sx={{ color: '#00d4ff', fontSize: '1.2rem', mt: 0.3 }} />
              <Box>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)', mb: 1 }}>
                  <strong>Similarity Search</strong> uses 128-dimensional embeddings to find coins with similar trading patterns.
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 1 }}>
                  <strong>Use cases:</strong>
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'rgba(255,255,255,0.6)' }}>
                  <li>
                    <Typography variant="body2">Find tokens with comparable price action for pattern analysis</Typography>
                  </li>
                  <li>
                    <Typography variant="body2">Identify potential rug patterns by comparing to known rugs</Typography>
                  </li>
                  <li>
                    <Typography variant="body2">Discover organic growth candidates similar to successful launches</Typography>
                  </li>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Search Controls */}
      <Card
        sx={{
          mb: 3,
          bgcolor: 'rgba(0, 212, 255, 0.03)',
          border: '1px solid rgba(0, 212, 255, 0.15)',
        }}
      >
        <CardContent>
          {/* Mint Input - Prominent */}
          <TextField
            fullWidth
            label="Token Mint Address"
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            placeholder="Enter token mint address to find similar patterns..."
            size="medium"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            sx={{ mb: 2.5 }}
            InputProps={{
              sx: { fontFamily: 'monospace' },
            }}
          />

          {/* Compact Controls Row */}
          <Grid container spacing={1.5} alignItems="flex-end">
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <TextField
                fullWidth
                type="number"
                label="Results"
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
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Phase</InputLabel>
                <Select
                  value={phaseFilter}
                  label="Phase"
                  onChange={(e) => setPhaseFilter(e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  {phases?.filter((p) => p.id < 99).map((p) => (
                    <MenuItem key={p.id} value={String(p.id)}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <TextField
                fullWidth
                type="number"
                label="Min Similarity"
                value={minSimilarity}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setMinSimilarity(Math.max(0, Math.min(1, val)));
                }}
                size="small"
                inputProps={{ min: 0, max: 1, step: 0.05 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 12, md: 4 }}>
              <Button
                fullWidth
                variant="contained"
                onClick={handleSearch}
                disabled={loading || !mint.trim()}
                startIcon={loading ? <CircularProgress size={18} /> : <SearchIcon />}
                sx={{
                  bgcolor: '#00d4ff',
                  color: '#000',
                  fontWeight: 600,
                  '&:hover': { bgcolor: '#00b8d4' },
                  '&:disabled': { bgcolor: 'rgba(0, 212, 255, 0.3)' },
                }}
              >
                {loading ? 'Searching...' : 'Search Similar Patterns'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Results Meta Bar */}
      {results && results.total_results > 0 && (
        <Box
          sx={{
            mb: 1.5,
            p: 1.5,
            bgcolor: 'rgba(0, 212, 255, 0.05)',
            border: '1px solid rgba(0, 212, 255, 0.1)',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
            <strong>{results.total_results}</strong> similar patterns found in{' '}
            <strong>{results.search_time_ms}ms</strong>
          </Typography>
          <Chip
            label={`Query: ${results.query_mint?.slice(0, 8)}...${results.query_mint?.slice(-6)}`}
            size="small"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              bgcolor: 'rgba(255,255,255,0.1)',
              color: '#00d4ff',
            }}
          />
          {avgSimilarity > 0 && (
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
              Avg similarity: <strong style={{ color: getSimilarityColor(avgSimilarity) }}>
                {(avgSimilarity * 100).toFixed(1)}%
              </strong>
            </Typography>
          )}
        </Box>
      )}

      {/* Results Table */}
      {results && (
        <Card
          sx={{
            bgcolor: 'rgba(0, 212, 255, 0.03)',
            border: '1px solid rgba(0, 212, 255, 0.15)',
          }}
        >
          <Box
            sx={{
              p: 1.5,
              borderBottom: '1px solid rgba(0, 212, 255, 0.1)',
            }}
          >
            <Typography
              sx={{
                textTransform: 'uppercase',
                fontSize: '0.7rem',
                letterSpacing: 1,
                color: 'rgba(255,255,255,0.5)',
                fontWeight: 600,
              }}
            >
              Similar Patterns
            </Typography>
          </Box>
          <CardContent sx={{ p: 0 }}>
            {results.results.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 0.5 }}>
                  No similar patterns found matching your criteria
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                  Try adjusting the minimum similarity threshold or removing filters
                </Typography>
              </Box>
            ) : (
              <TableContainer sx={{ maxHeight: 600 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell
                        sx={{
                          bgcolor: '#1a1a2e',
                          fontSize: '0.7rem',
                          color: 'rgba(255,255,255,0.5)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          width: 60,
                        }}
                      >
                        #
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: '#1a1a2e',
                          fontSize: '0.7rem',
                          color: 'rgba(255,255,255,0.5)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        Mint
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: '#1a1a2e',
                          fontSize: '0.7rem',
                          color: 'rgba(255,255,255,0.5)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          width: 200,
                        }}
                      >
                        Similarity
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: '#1a1a2e',
                          fontSize: '0.7rem',
                          color: 'rgba(255,255,255,0.5)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        Label
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: '#1a1a2e',
                          fontSize: '0.7rem',
                          color: 'rgba(255,255,255,0.5)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        Phase
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: '#1a1a2e',
                          fontSize: '0.7rem',
                          color: 'rgba(255,255,255,0.5)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        Window
                      </TableCell>
                      <TableCell
                        sx={{
                          bgcolor: '#1a1a2e',
                          fontSize: '0.7rem',
                          color: 'rgba(255,255,255,0.5)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        Created
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {results.results.map((row: SimilarityResult, index: number) => (
                      <TableRow
                        key={row.id}
                        sx={{
                          '&:nth-of-type(odd)': { bgcolor: 'rgba(255,255,255,0.02)' },
                          '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)' },
                        }}
                      >
                        <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography
                              variant="body2"
                              sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                            >
                              {row.mint.slice(0, 8)}...{row.mint.slice(-4)}
                            </Typography>
                            <Tooltip title="Copy mint address">
                              <IconButton
                                size="small"
                                onClick={() => copyMint(row.mint)}
                                sx={{
                                  opacity: 0.4,
                                  '&:hover': { opacity: 1 },
                                }}
                              >
                                <CopyIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ flex: 1, minWidth: 80 }}>
                              <LinearProgress
                                variant="determinate"
                                value={row.similarity * 100}
                                sx={{
                                  height: 8,
                                  borderRadius: 1,
                                  bgcolor: 'rgba(255,255,255,0.1)',
                                  '& .MuiLinearProgress-bar': {
                                    bgcolor: getSimilarityColor(row.similarity),
                                    borderRadius: 1,
                                  },
                                }}
                              />
                            </Box>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 600,
                                color: getSimilarityColor(row.similarity),
                                fontFamily: 'monospace',
                                fontSize: '0.75rem',
                                minWidth: 50,
                                textAlign: 'right',
                              }}
                            >
                              {(row.similarity * 100).toFixed(1)}%
                            </Typography>
                          </Box>
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
                                height: 22,
                              }}
                            />
                          ) : (
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                              -
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.phase_id ? (
                            <Chip
                              label={`P${row.phase_id}`}
                              size="small"
                              variant="outlined"
                              sx={{
                                fontSize: '0.7rem',
                                height: 22,
                                borderColor: 'rgba(0, 212, 255, 0.3)',
                                color: '#00d4ff',
                              }}
                            />
                          ) : (
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                              -
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}
                          >
                            {new Date(row.window_start).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {' - '}
                            {new Date(row.window_end).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}
                          >
                            {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty State - After Search but No Results */}
      {hasSearched && !loading && !results && !error && (
        <Card
          sx={{
            bgcolor: 'rgba(0, 212, 255, 0.03)',
            border: '1px solid rgba(0, 212, 255, 0.15)',
          }}
        >
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1 }}>
              Enter a mint address to find similar patterns
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
              Use the search controls above to query the embeddings database
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default SimilaritySearch;
