import React, { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import {
  Hub as GraphIcon,
  Terminal as ExplorerIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import CypherExplorer from './graph/CypherExplorer';
import GraphGuide from './graph/GraphGuide';
import FullscreenToggle from '../components/shared/FullscreenToggle';
import useFullscreenStore from '../stores/useFullscreenStore';

const Neo4jGraph: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const isFullscreen = useFullscreenStore((s) => s.isFullscreen);
  const isSecure = window.location.protocol === 'https:';
  const boltScheme = isSecure ? 'bolt+s' : 'bolt';
  const boltHost = window.location.hostname;
  const boltPort = window.location.port || (isSecure ? '443' : '80');
  const boltUrl = `${boltScheme}://${boltHost}:${boltPort}`;
  const neo4jBrowserSrc = `/neo4j/browser/?dbms=${encodeURIComponent(boltUrl)}&preselectAuthType=NO_AUTH&discoveryURL=/neo4j/`;

  if (isFullscreen && tabValue === 0) {
    return (
      <Box sx={{ width: '100%', height: '100vh' }}>
        <iframe
          src={neo4jBrowserSrc}
          title="Neo4j Browser"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      </Box>
    );
  }

  return (
    <Box>
      {/* Tab navigation */}
      <Box
        sx={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          mb: 3,
          bgcolor: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '8px 8px 0 0',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Tabs
          value={tabValue}
          onChange={(_e, v) => setTabValue(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            flex: 1,
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
          <Tab icon={<GraphIcon />} iconPosition="start" label="Neo4j Browser" />
          <Tab icon={<ExplorerIcon />} iconPosition="start" label="Cypher Explorer" />
          <Tab icon={<InfoIcon />} iconPosition="start" label="Info" />
        </Tabs>
        {tabValue === 0 && <FullscreenToggle title="Neo4j Browser" />}
      </Box>

      {/* Tab 0: Neo4j Browser iframe */}
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
            src={neo4jBrowserSrc}
            title="Neo4j Browser"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
            }}
          />
        </Box>
      )}

      {/* Tab 1: Cypher Explorer (REST API) */}
      {tabValue === 1 && <CypherExplorer />}

      {/* Tab 2: Guide */}
      {tabValue === 2 && <GraphGuide />}
    </Box>
  );
};

export default Neo4jGraph;
