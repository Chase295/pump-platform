import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  CssBaseline,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
  IconButton,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Search as SearchIcon,
  ModelTraining as ModelTrainingIcon,
  Analytics as AnalyticsIcon,
  SwapHoriz as SwapHorizIcon,
  Menu as MenuIcon,
} from '@mui/icons-material';

// Pages
import Dashboard from './pages/Dashboard';
import Discovery from './pages/Discovery';
import Training from './pages/Training';
import Predictions from './pages/Predictions';
import Trading from './pages/Trading';

// Theme - Matching existing dark design across all services
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00d4ff',
    },
    secondary: {
      main: '#ff4081',
    },
    background: {
      default: '#0f0f23',
      paper: 'rgba(255, 255, 255, 0.05)',
    },
    success: {
      main: '#4caf50',
    },
    warning: {
      main: '#ff9800',
    },
    error: {
      main: '#f44336',
    },
  },
  typography: {
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backdropFilter: 'blur(10px)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backdropFilter: 'blur(10px)',
        },
      },
    },
  },
});

// Navigation Items
const navItems = [
  { path: '/', label: 'Dashboard', icon: <DashboardIcon /> },
  { path: '/discovery', label: 'Discovery', icon: <SearchIcon /> },
  { path: '/training', label: 'Training', icon: <ModelTrainingIcon /> },
  { path: '/predictions', label: 'Predictions', icon: <AnalyticsIcon /> },
  { path: '/trading', label: 'Trading', icon: <SwapHorizIcon /> },
];

const DRAWER_WIDTH = 256;

// Layout Component
const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const drawerContent = (
    <Box sx={{ width: DRAWER_WIDTH, pt: 2 }}>
      <Typography
        variant="h6"
        sx={{ px: 2, pb: 1, fontWeight: 'bold', color: '#00d4ff' }}
      >
        Pump Platform
      </Typography>
      <List>
        {navItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              component={NavLink}
              to={item.path}
              end={item.path === '/'}
              selected={
                item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path)
              }
              onClick={() => isMobile && setDrawerOpen(false)}
              sx={{
                borderRadius: 2,
                mx: 1,
                minHeight: { xs: 48, md: 44 },
                py: { xs: 1.5, md: 1 },
                '&.Mui-selected': {
                  backgroundColor: 'rgba(0, 212, 255, 0.2)',
                  color: '#00d4ff',
                  border: '1px solid rgba(0, 212, 255, 0.3)',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 212, 255, 0.3)',
                  },
                  '& .MuiListItemIcon-root': {
                    color: '#00d4ff',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background:
          'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
        color: 'white',
        overflow: 'auto',
      }}
    >
      {/* Mobile Drawer */}
      {isMobile ? (
        <Drawer
          variant="temporary"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              background:
                'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        /* Desktop Drawer */
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              background:
                'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          width: { xs: '100%', md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { xs: 0, md: `${DRAWER_WIDTH}px` },
        }}
      >
        {/* Top Bar */}
        <AppBar
          position="static"
          sx={{
            background: 'rgba(26, 26, 46, 0.8)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: 'none',
          }}
        >
          <Toolbar>
            {isMobile && (
              <IconButton
                color="inherit"
                edge="start"
                onClick={() => setDrawerOpen(true)}
                sx={{ mr: 2 }}
              >
                <MenuIcon />
              </IconButton>
            )}
            <Typography
              variant="h6"
              component="div"
              sx={{ flexGrow: 1, color: '#00d4ff' }}
            >
              Pump Platform
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              v1.0.0
            </Typography>
          </Toolbar>
        </AppBar>

        {/* Page Content */}
        <Box sx={{ py: { xs: 2, sm: 3, md: 4 }, px: { xs: 1, sm: 2, md: 3 } }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

// Main App Component
function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/discovery" element={<Discovery />} />
            <Route path="/training/*" element={<Training />} />
            <Route path="/predictions" element={<Predictions />} />
            <Route path="/trading/*" element={<Trading />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}

export default App;
