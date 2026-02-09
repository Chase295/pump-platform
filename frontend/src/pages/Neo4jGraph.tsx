import React, { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import {
  Hub as GraphIcon,
  Terminal as ExplorerIcon,
  MenuBook as GuideIcon,
} from '@mui/icons-material';
import CypherExplorer from './graph/CypherExplorer';
import GraphGuide from './graph/GraphGuide';

const Neo4jGraph: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const isSecure = window.location.protocol === 'https:';
  const boltScheme = isSecure ? 'bolt+s' : 'bolt';
  const boltHost = window.location.hostname;
  const boltPort = window.location.port || (isSecure ? '443' : '80');
  const boltUrl = `${boltScheme}://${boltHost}:${boltPort}`;
  const neo4jBrowserSrc = `/neo4j/browser/?dbms=${encodeURIComponent(boltUrl)}&preselectAuthType=NO_AUTH&discoveryURL=/neo4j/`;

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
          <Tab icon={<GraphIcon />} iconPosition="start" label="Neo4j Browser" />
          <Tab icon={<ExplorerIcon />} iconPosition="start" label="Cypher Explorer" />
          <Tab icon={<GuideIcon />} iconPosition="start" label="Guide" />
        </Tabs>
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
