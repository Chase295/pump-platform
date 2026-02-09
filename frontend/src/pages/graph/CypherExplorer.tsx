import React, { useState, useCallback } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Stack,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  PlayArrow as RunIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import api from '../../services/api';

const PRESET_QUERIES = [
  {
    label: 'Creator Rug-Check',
    color: '#4caf50',
    query: `MATCH (c:Creator)-[:CREATED]->(t:Token)
WITH c, count(t) AS cnt, collect(t.symbol) AS symbols
WHERE cnt > 1
RETURN c.address, cnt, symbols
ORDER BY cnt DESC`,
  },
  {
    label: 'Wallet Trades',
    color: '#ff9800',
    query: `MATCH (w:Wallet)-[r:BOUGHT|SOLD]->(t:Token)
RETURN w.alias, type(r) AS action, t.symbol, t.address, r.amount_sol
ORDER BY r.timestamp DESC`,
  },
  {
    label: 'Alert -> Trade',
    color: '#2196f3',
    query: `MATCH (m:Model)-[:PREDICTED]->(t:Token)<-[:BOUGHT]-(w:Wallet)
RETURN m.name, t.symbol, t.address, w.alias`,
  },
  {
    label: 'Graph Stats',
    color: '#9c27b0',
    query: `MATCH (n)
RETURN labels(n)[0] AS label, count(n) AS count
ORDER BY count DESC`,
  },
  {
    label: 'Token Creator Map',
    color: '#00d4ff',
    query: `MATCH (c:Creator)-[:CREATED]->(t:Token)
WHERE c.address <> ''
RETURN c.address AS creator, t.symbol, t.name, t.address`,
  },
  {
    label: 'Fund Flow',
    color: '#f44336',
    query: `MATCH (w:Wallet)-[r:TRANSFERRED_TO]->(target)
RETURN w.alias, r.amount_sol, target.address, r.timestamp
ORDER BY r.timestamp DESC`,
  },
];

const CypherExplorer: React.FC = () => {
  const [query, setQuery] = useState('MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY count DESC');
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rowCount, setRowCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const runQuery = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    const t0 = performance.now();
    try {
      const res = await api.get('/graph/query', { params: { q: query, limit: 200 } });
      setElapsed(Math.round(performance.now() - t0));
      setResults(res.data.rows);
      setRowCount(res.data.count);
    } catch (e: any) {
      setElapsed(Math.round(performance.now() - t0));
      const detail = e.response?.data?.detail || e.message || 'Query failed';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  };

  const columns = results && results.length > 0 ? Object.keys(results[0]) : [];

  const formatCell = (val: unknown): string => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'number') return Number.isInteger(val) ? String(val) : val.toFixed(6);
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  return (
    <Box>
      {/* Preset query chips */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        {PRESET_QUERIES.map((pq) => (
          <Chip
            key={pq.label}
            label={pq.label}
            size="small"
            onClick={() => setQuery(pq.query)}
            sx={{
              cursor: 'pointer',
              bgcolor: `${pq.color}22`,
              border: `1px solid ${pq.color}44`,
              color: pq.color,
              '&:hover': { bgcolor: `${pq.color}33` },
            }}
          />
        ))}
      </Stack>

      {/* Query input */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
        <TextField
          multiline
          minRows={3}
          maxRows={10}
          fullWidth
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="MATCH (n) RETURN n LIMIT 25"
          sx={{
            '& .MuiOutlinedInput-root': {
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              bgcolor: 'rgba(0,0,0,0.3)',
              '& fieldset': { borderColor: 'rgba(0, 212, 255, 0.3)' },
              '&:hover fieldset': { borderColor: 'rgba(0, 212, 255, 0.5)' },
              '&.Mui-focused fieldset': { borderColor: '#00d4ff' },
            },
          }}
        />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Button
            variant="contained"
            onClick={runQuery}
            disabled={loading || !query.trim()}
            startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
            sx={{
              bgcolor: '#00d4ff',
              color: '#0f0f23',
              fontWeight: 'bold',
              '&:hover': { bgcolor: '#00b8d4' },
              minWidth: 100,
              height: 42,
            }}
          >
            Run
          </Button>
          <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', fontSize: '0.65rem' }}>
            Ctrl+Enter
          </Typography>
        </Box>
      </Box>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, bgcolor: 'rgba(244,67,54,0.1)' }}>
          {error}
        </Alert>
      )}

      {/* Results */}
      {results !== null && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {rowCount} row{rowCount !== 1 ? 's' : ''} in {elapsed}ms
            </Typography>
            {results.length > 0 && (
              <Tooltip title="Copy as JSON">
                <IconButton
                  size="small"
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(results, null, 2))}
                  sx={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {results.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
              Query returned no results
            </Typography>
          ) : (
            <TableContainer
              component={Paper}
              sx={{
                bgcolor: 'rgba(0,0,0,0.2)',
                maxHeight: 'calc(100vh - 400px)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {columns.map((col) => (
                      <TableCell
                        key={col}
                        sx={{
                          bgcolor: 'rgba(0, 212, 255, 0.1)',
                          color: '#00d4ff',
                          fontWeight: 'bold',
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          borderBottom: '1px solid rgba(0, 212, 255, 0.3)',
                        }}
                      >
                        {col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.map((row, i) => (
                    <TableRow
                      key={i}
                      sx={{
                        '&:nth-of-type(odd)': { bgcolor: 'rgba(255,255,255,0.02)' },
                        '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)' },
                      }}
                    >
                      {columns.map((col) => (
                        <TableCell
                          key={col}
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            color: 'rgba(255,255,255,0.85)',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            maxWidth: 300,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatCell(row[col])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}
    </Box>
  );
};

export default CypherExplorer;
