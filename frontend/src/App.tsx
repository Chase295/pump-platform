import React, { useEffect } from 'react';
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
  CircularProgress,
  Button,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Search as SearchIcon,
  ModelTraining as ModelTrainingIcon,
  Analytics as AnalyticsIcon,
  Science as ScienceIcon,
  AccountBalance as RealTradingIcon,
  AccountTree as AccountTreeIcon,
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';

// Pages
import Dashboard from './pages/Dashboard';
import Discovery from './pages/Discovery';
import Training from './pages/Training';
import Predictions from './pages/Predictions';
import TestTrading from './pages/TestTrading';
import RealTrading from './pages/RealTrading';
import N8nWorkflows from './pages/N8nWorkflows';
import Login from './pages/Login';

// Auth
import useAuthStore from './stores/useAuthStore';

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
  { path: '/test-trading', label: 'Test Trading', icon: <ScienceIcon /> },
  { path: '/real-trading', label: 'Real Trading', icon: <RealTradingIcon /> },
  { path: '/workflows', label: 'Workflows', icon: <AccountTreeIcon /> },
];

const DRAWER_WIDTH = 256;
const DRAWER_COLLAPSED_WIDTH = 64;

// Layout Component
const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const authRequired = useAuthStore((s) => s.authRequired);
  const logout = useAuthStore((s) => s.logout);

  const currentDrawerWidth = collapsed ? DRAWER_COLLAPSED_WIDTH : DRAWER_WIDTH;

  const drawerContent = (
    <Box sx={{ pt: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: collapsed ? 0 : 2, pb: 1, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between' }}>
        {!collapsed && (
          <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#00d4ff' }}>
            Pump Platform
          </Typography>
        )}
        {!isMobile && (
          <IconButton
            onClick={() => setCollapsed(!collapsed)}
            size="small"
            sx={{ color: 'rgba(255,255,255,0.5)', '&:hover': { color: '#00d4ff' } }}
          >
            <ChevronLeftIcon sx={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </IconButton>
        )}
      </Box>
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
              onClick={() => isMobile && setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              sx={{
                borderRadius: 2,
                mx: 1,
                minHeight: 44,
                py: 1,
                justifyContent: collapsed ? 'center' : 'initial',
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
              <ListItemIcon sx={{ minWidth: collapsed ? 0 : 40, color: 'inherit', justifyContent: 'center' }}>
                {item.icon}
              </ListItemIcon>
              {!collapsed && <ListItemText primary={item.label} />}
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
      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
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
        <Drawer
          variant="permanent"
          sx={{
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: currentDrawerWidth,
              background:
                'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              borderRight: '1px solid rgba(255, 255, 255, 0.1)',
              overflowX: 'hidden',
              transition: 'width 0.2s ease-in-out',
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
          width: { xs: '100%', md: `calc(100% - ${currentDrawerWidth}px)` },
          ml: { xs: 0, md: `${currentDrawerWidth}px` },
          transition: 'margin-left 0.2s ease-in-out, width 0.2s ease-in-out',
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
                onClick={() => setMobileOpen(true)}
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
            <Typography variant="body2" sx={{ opacity: 0.7, mr: authRequired ? 2 : 0 }}>
              v1.0.0
            </Typography>
            {authRequired && (
              <Button
                size="small"
                onClick={logout}
                startIcon={<LogoutIcon />}
                sx={{
                  color: 'rgba(255,255,255,0.7)',
                  textTransform: 'none',
                  '&:hover': { color: '#ff4081' },
                }}
              >
                Logout
              </Button>
            )}
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

// Loading Spinner (shown while checking auth status)
const LoadingScreen: React.FC = () => (
  <Box
    sx={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <CircularProgress sx={{ color: '#00d4ff' }} />
  </Box>
);

// Main App Component
function App() {
  const { token, authRequired, checkAuthStatus, logout } = useAuthStore();

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Listen for 401 logout events from API interceptor
  useEffect(() => {
    const handleLogout = () => {
      logout();
    };
    window.addEventListener('auth-logout', handleLogout);
    return () => window.removeEventListener('auth-logout', handleLogout);
  }, [logout]);

  // Still checking auth status
  if (authRequired === null) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoadingScreen />
      </ThemeProvider>
    );
  }

  // Auth required but no token -> show login
  if (authRequired && !token) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Login />
      </ThemeProvider>
    );
  }

  // Authenticated or no auth required -> normal app
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/discovery" element={<Discovery />} />
            <Route path="/training/*" element={<Training />} />
            <Route path="/predictions/*" element={<Predictions />} />
            <Route path="/test-trading/*" element={<TestTrading />} />
            <Route path="/real-trading/*" element={<RealTrading />} />
            <Route path="/workflows" element={<N8nWorkflows />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}

export default App;
