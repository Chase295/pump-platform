import React, { useState, SyntheticEvent } from 'react';
import {
  Typography,
  Box,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

// --- Chapter component: MUI Accordion with cyan styling and emoji icon ---
interface ChapterProps {
  id: string;
  title: string;
  icon: string;
  children: React.ReactNode;
  expanded: boolean;
  onChange: (event: SyntheticEvent, isExpanded: boolean) => void;
}

export const Chapter: React.FC<ChapterProps> = ({ title, icon, children, expanded, onChange }) => (
  <Accordion
    expanded={expanded}
    onChange={onChange}
    sx={{
      mb: 2,
      '&:before': { display: 'none' },
      borderRadius: '12px !important',
      overflow: 'hidden',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(0, 212, 255, 0.2)',
      '&.Mui-expanded': {
        borderColor: 'rgba(0, 212, 255, 0.4)',
      },
    }}
  >
    <AccordionSummary
      expandIcon={<ExpandMoreIcon sx={{ color: '#00d4ff' }} />}
      sx={{
        backgroundColor: 'rgba(0, 212, 255, 0.08)',
        '&:hover': { backgroundColor: 'rgba(0, 212, 255, 0.12)' },
        minHeight: { xs: 56, sm: 64 },
        '& .MuiAccordionSummary-content': {
          my: { xs: 1, sm: 1.5 },
        },
      }}
    >
      <Typography
        variant="h6"
        sx={{
          fontWeight: 600,
          color: '#00d4ff',
          fontSize: { xs: '1rem', sm: '1.1rem', md: '1.25rem' },
        }}
      >
        {icon} {title}
      </Typography>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 3, px: { xs: 2, sm: 3 } }}>
      {children}
    </AccordionDetails>
  </Accordion>
);

// --- CodeBlock: monospace box with dark background ---
export const CodeBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      bgcolor: 'rgba(0,0,0,0.3)',
      p: { xs: 1.5, sm: 2 },
      borderRadius: 1,
      mb: 2,
      overflowX: 'auto',
      '&::-webkit-scrollbar': { height: 6 },
      '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.2)', borderRadius: 3 },
    }}
  >
    <Typography
      component="pre"
      variant="body2"
      sx={{
        fontFamily: 'monospace',
        fontSize: { xs: '0.7rem', sm: '0.8rem' },
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        m: 0,
      }}
    >
      {children}
    </Typography>
  </Box>
);

// --- EndpointRow: API endpoint with method badge + path + description ---
const methodColors: Record<string, string> = {
  GET: '#4caf50',
  POST: '#2196f3',
  PUT: '#ff9800',
  PATCH: '#ff9800',
  DELETE: '#f44336',
};

export const EndpointRow: React.FC<{
  method: string;
  path: string;
  desc: string;
}> = ({ method, path, desc }) => (
  <Box
    sx={{
      mb: 1.5,
      p: { xs: 1, sm: 1.5 },
      bgcolor: 'rgba(0,0,0,0.2)',
      borderRadius: 1,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: { xs: 0.5, sm: 1 },
    }}
  >
    <Chip
      label={method}
      size="small"
      sx={{
        bgcolor: methodColors[method] || '#757575',
        color: 'white',
        fontWeight: 'bold',
        fontSize: { xs: '0.6rem', sm: '0.7rem' },
        height: 22,
        minWidth: 52,
      }}
    />
    <Typography
      variant="body2"
      sx={{
        fontFamily: 'monospace',
        color: '#00d4ff',
        fontWeight: 'bold',
        fontSize: { xs: '0.7rem', sm: '0.8rem' },
        wordBreak: 'break-all',
      }}
    >
      {path}
    </Typography>
    <Typography
      variant="body2"
      sx={{
        color: 'text.secondary',
        fontSize: { xs: '0.7rem', sm: '0.75rem' },
        flexBasis: { xs: '100%', sm: 'auto' },
        ml: { xs: 0, sm: 'auto' },
      }}
    >
      {desc}
    </Typography>
  </Box>
);

// --- McpToolRow: MCP tool with category badge ---
export const McpToolRow: React.FC<{
  name: string;
  desc: string;
  cat?: string;
}> = ({ name, desc, cat }) => (
  <Box
    sx={{
      p: { xs: 1, sm: 1.5 },
      bgcolor: 'rgba(0,0,0,0.2)',
      borderRadius: 1,
      borderLeft: '3px solid rgba(0, 212, 255, 0.5)',
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography
        variant="body2"
        sx={{
          fontFamily: 'monospace',
          fontWeight: 'bold',
          color: '#00bcd4',
          fontSize: { xs: '0.7rem', sm: '0.8rem' },
        }}
      >
        {name}
      </Typography>
      {cat && (
        <Chip
          label={cat}
          size="small"
          sx={{ fontSize: { xs: '0.55rem', sm: '0.6rem' }, height: 18, bgcolor: 'rgba(0,188,212,0.2)' }}
        />
      )}
    </Box>
    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: { xs: '0.65rem', sm: '0.7rem' } }}>
      {desc}
    </Typography>
  </Box>
);

// --- InfoPageWrapper: wrapper with expand/collapse chips + state management ---
interface InfoPageWrapperProps {
  title: string;
  subtitle?: string;
  chapterIds: string[];
  children: (props: {
    expandedChapters: string[];
    handleChapterChange: (id: string) => (e: SyntheticEvent, expanded: boolean) => void;
  }) => React.ReactNode;
}

export const InfoPageWrapper: React.FC<InfoPageWrapperProps> = ({
  title,
  subtitle,
  chapterIds,
  children,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [expandedChapters, setExpandedChapters] = useState<string[]>([chapterIds[0]]);

  const handleChapterChange = (chapter: string) => (_event: SyntheticEvent, isExpanded: boolean) => {
    setExpandedChapters((prev) =>
      isExpanded ? [...prev, chapter] : prev.filter((c) => c !== chapter),
    );
  };

  const expandAll = () => setExpandedChapters([...chapterIds]);
  const collapseAll = () => setExpandedChapters([]);

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3, textAlign: 'center' }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            mb: 1,
            color: '#00d4ff',
            fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2.125rem' },
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            {subtitle}
          </Typography>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label="Alle aufklappen"
            onClick={expandAll}
            size={isMobile ? 'small' : 'medium'}
            sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.2)' } }}
          />
          <Chip
            label="Alle zuklappen"
            onClick={collapseAll}
            size={isMobile ? 'small' : 'medium'}
            sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.2)' } }}
          />
        </Box>
      </Box>

      {/* Chapters */}
      {children({ expandedChapters, handleChapterChange })}
    </Box>
  );
};

// --- ConfigItem: for configuration display ---
export const ConfigItem: React.FC<{
  name: string;
  value: string;
  range?: string;
  desc: string;
}> = ({ name, value, range, desc }) => (
  <Box
    sx={{
      mb: 1.5,
      p: { xs: 1.5, sm: 2 },
      bgcolor: 'rgba(0,0,0,0.2)',
      borderRadius: 1,
      borderLeft: '3px solid #4caf50',
    }}
  >
    <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#4caf50', mb: 0.5, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
      {name}
    </Typography>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
      <Chip label={`Default: ${value}`} size="small" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }} />
      {range && <Chip label={`Range: ${range}`} size="small" variant="outlined" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }} />}
    </Box>
    <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: { xs: '0.75rem', sm: '0.8rem' } }}>
      {desc}
    </Typography>
  </Box>
);
