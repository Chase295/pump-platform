import React, { useState, useCallback } from 'react';
import {
  Box,
  Tabs,
  Tab,
  TextField,
  Button,
  Typography,
  Paper,
  Stack,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Cloud as IpfsIcon,
  Search as SearchIcon,
  ContentCopy as CopyIcon,
  OpenInNew as OpenIcon,
  Image as ImageIcon,
  Link as LinkIcon,
} from '@mui/icons-material';

// ---- Metadata Lookup Tab ----
const MetadataLookup: React.FC = () => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const resolveCid = (uri: string): string => {
    // Handle ipfs:// URIs, raw CIDs, and https gateway URLs
    if (uri.startsWith('ipfs://')) return uri.replace('ipfs://', '');
    if (uri.startsWith('https://') && uri.includes('/ipfs/')) {
      return uri.split('/ipfs/')[1];
    }
    return uri.trim();
  };

  const fetchMetadata = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setMetadata(null);
    setImageUrl(null);

    const cid = resolveCid(input);

    try {
      const res = await fetch(`/ipfs/${cid}`);
      if (!res.ok) throw new Error(`IPFS fetch failed: ${res.status} ${res.statusText}`);

      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/json') || contentType.includes('text/')) {
        const data = await res.json();
        setMetadata(data);

        // Try to resolve image
        if (data.image) {
          const imgCid = resolveCid(String(data.image));
          setImageUrl(`/ipfs/${imgCid}`);
        }
      } else if (contentType.includes('image/')) {
        // Direct image CID
        setImageUrl(`/ipfs/${cid}`);
        setMetadata({ _type: 'image', content_type: contentType, cid });
      } else {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setMetadata(data);
          if (data.image) {
            const imgCid = resolveCid(String(data.image));
            setImageUrl(`/ipfs/${imgCid}`);
          }
        } catch {
          setMetadata({ _raw: text.slice(0, 2000), content_type: contentType });
        }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to fetch from IPFS');
    } finally {
      setLoading(false);
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchMetadata();
    }
  };

  return (
    <Box>
      {/* Input */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
        <TextField
          fullWidth
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="ipfs://Qm... oder CID oder https://...gateway.../ipfs/Qm..."
          size="small"
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
        <Button
          variant="contained"
          onClick={fetchMetadata}
          disabled={loading || !input.trim()}
          startIcon={loading ? <CircularProgress size={16} /> : <SearchIcon />}
          sx={{
            bgcolor: '#00d4ff',
            color: '#0f0f23',
            fontWeight: 'bold',
            '&:hover': { bgcolor: '#00b8d4' },
            minWidth: 120,
            height: 40,
          }}
        >
          Fetch
        </Button>
      </Box>

      {/* Example CIDs */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: '32px' }}>
          Formate:
        </Typography>
        <Chip
          label="ipfs://Qm..."
          size="small"
          sx={{ bgcolor: 'rgba(0,212,255,0.1)', color: '#00d4ff', fontSize: '0.7rem' }}
        />
        <Chip
          label="bafkrei..."
          size="small"
          sx={{ bgcolor: 'rgba(76,175,80,0.1)', color: '#4caf50', fontSize: '0.7rem' }}
        />
        <Chip
          label="https://...gateway.../ipfs/..."
          size="small"
          sx={{ bgcolor: 'rgba(255,152,0,0.1)', color: '#ff9800', fontSize: '0.7rem' }}
        />
      </Stack>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, bgcolor: 'rgba(244,67,54,0.1)' }}>
          {error}
        </Alert>
      )}

      {/* Results */}
      {metadata && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {/* Image Preview */}
          {imageUrl && (
            <Paper
              sx={{
                p: 1,
                bgcolor: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 2,
                width: 200,
                flexShrink: 0,
              }}
            >
              <Box
                component="img"
                src={imageUrl}
                alt="Token image"
                onError={() => setImageUrl(null)}
                sx={{
                  width: '100%',
                  height: 200,
                  objectFit: 'contain',
                  borderRadius: 1,
                  bgcolor: 'rgba(0,0,0,0.5)',
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block', textAlign: 'center' }}>
                <ImageIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                Token Image
              </Typography>
            </Paper>
          )}

          {/* Metadata JSON */}
          <Paper
            sx={{
              p: 2,
              bgcolor: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 2,
              flex: 1,
              minWidth: 300,
              position: 'relative',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ color: '#00d4ff' }}>
                Metadata
              </Typography>
              <Tooltip title="Copy JSON">
                <IconButton
                  size="small"
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(metadata, null, 2))}
                  sx={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Parsed fields */}
            <Stack spacing={1}>
              {Object.entries(metadata).map(([key, value]) => {
                if (key.startsWith('_')) return null;
                const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
                const isUrl = typeof value === 'string' && (value.startsWith('http') || value.startsWith('ipfs://'));
                return (
                  <Box key={key} sx={{ display: 'flex', gap: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{ color: 'rgba(255,255,255,0.5)', minWidth: 120, fontFamily: 'monospace', fontSize: '0.75rem' }}
                    >
                      {key}:
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: isUrl ? '#00d4ff' : 'rgba(255,255,255,0.85)',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        wordBreak: 'break-all',
                      }}
                    >
                      {strVal}
                      {isUrl && (
                        <Tooltip title="Open link">
                          <IconButton
                            size="small"
                            onClick={() => {
                              const url = typeof value === 'string' && value.startsWith('ipfs://')
                                ? `/ipfs/${resolveCid(value)}`
                                : String(value);
                              window.open(url, '_blank');
                            }}
                            sx={{ color: '#00d4ff', ml: 0.5, p: 0.25 }}
                          >
                            <OpenIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>

            {/* Social Links Quick Access */}
            {(metadata.twitter || metadata.telegram || metadata.website) && (
              <Box sx={{ mt: 2, pt: 1, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5, display: 'block' }}>
                  Social Links
                </Typography>
                <Stack direction="row" spacing={1}>
                  {metadata.twitter && (
                    <Chip
                      icon={<LinkIcon />}
                      label="Twitter"
                      size="small"
                      clickable
                      onClick={() => window.open(String(metadata.twitter), '_blank')}
                      sx={{ bgcolor: 'rgba(29,155,240,0.15)', color: '#1d9bf0' }}
                    />
                  )}
                  {metadata.telegram && (
                    <Chip
                      icon={<LinkIcon />}
                      label="Telegram"
                      size="small"
                      clickable
                      onClick={() => window.open(String(metadata.telegram), '_blank')}
                      sx={{ bgcolor: 'rgba(0,136,204,0.15)', color: '#0088cc' }}
                    />
                  )}
                  {metadata.website && (
                    <Chip
                      icon={<LinkIcon />}
                      label="Website"
                      size="small"
                      clickable
                      onClick={() => window.open(String(metadata.website), '_blank')}
                      sx={{ bgcolor: 'rgba(76,175,80,0.15)', color: '#4caf50' }}
                    />
                  )}
                </Stack>
              </Box>
            )}
          </Paper>
        </Box>
      )}
    </Box>
  );
};

// ---- Main IPFS Explorer Page ----
const IpfsExplorer: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);

  const ipfsWebUiSrc = '/ipfs-ui/';

  return (
    <Box>
      {/* Tab navigation */}
      <Box
        sx={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          mb: 3,
          bgcolor: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '8px 8px 0 0',
        }}
      >
        <Tabs
          value={tabValue}
          onChange={(_e, v) => setTabValue(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            '& .MuiTab-root': {
              color: 'rgba(255, 255, 255, 0.6)',
              textTransform: 'none',
              fontWeight: 500,
              minHeight: 48,
              '&.Mui-selected': {
                color: '#00d4ff',
              },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#00d4ff',
            },
          }}
        >
          <Tab icon={<IpfsIcon />} iconPosition="start" label="IPFS Web UI" />
          <Tab icon={<SearchIcon />} iconPosition="start" label="Metadata Lookup" />
        </Tabs>
      </Box>

      {/* Tab 0: IPFS Web UI iframe */}
      {tabValue === 0 && (
        <Box
          sx={{
            width: '100%',
            height: 'calc(100vh - 160px)',
            borderRadius: 1,
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <iframe
            src={ipfsWebUiSrc}
            title="IPFS Web UI"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
            }}
          />
        </Box>
      )}

      {/* Tab 1: Metadata Lookup */}
      {tabValue === 1 && <MetadataLookup />}
    </Box>
  );
};

export default IpfsExplorer;
