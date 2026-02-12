import axios from 'axios';

const TOKEN_KEY = 'pump-auth-token';

// ------------------------------------------------------------------
// Base Axios Instance
// ------------------------------------------------------------------
const api = axios.create({
  baseURL: '/api',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - attach Bearer token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor - handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear invalid token
      localStorage.removeItem(TOKEN_KEY);
      // Force re-render by reloading auth state (store will pick up null token)
      window.dispatchEvent(new Event('auth-logout'));
    }
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  },
);

// ------------------------------------------------------------------
// Auth API  (/api/auth/...)
// ------------------------------------------------------------------
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  check: () => api.get('/auth/check'),
  status: () => api.get('/auth/status'),
};

// ------------------------------------------------------------------
// Global API (cross-module)
// ------------------------------------------------------------------
export const globalApi = {
  health: () => api.get('/health'),
  metrics: () => api.get('/metrics'),
};

// ------------------------------------------------------------------
// Find API  (/api/find/...)
// ------------------------------------------------------------------
export const findApi = {
  // Health & config
  getHealth: () => api.get('/find/health'),
  getConfig: () => api.get('/find/config'),
  updateConfig: (data: Record<string, unknown>) => api.put('/find/config', data),

  // Phases
  getPhases: () => api.get('/find/phases'),
  createPhase: (data: { name: string; interval_seconds: number; min_age_minutes: number; max_age_minutes: number }) =>
    api.post('/find/phases', data),
  updatePhase: (id: number, data: Record<string, unknown>) => api.put(`/find/phases/${id}`, data),
  deletePhase: (id: number) => api.delete(`/find/phases/${id}`),

  // Streams
  getStreams: (limit = 50) => api.get('/find/streams', { params: { limit } }),
  getStreamStats: () => api.get('/find/streams/stats'),

  // Metrics
  getRecentMetrics: (limit = 100, mint?: string) =>
    api.get('/find/metrics', { params: { limit, mint } }),
  getCoinAnalytics: (mint: string, windows = '30s,1m,3m,5m,15m,30m,1h') =>
    api.get(`/find/analytics/${mint}`, { params: { windows } }),
  getCoinDetail: (mint: string) => api.get(`/find/coins/${mint}`),
};

// ------------------------------------------------------------------
// Training API  (/api/training/...)
// ------------------------------------------------------------------
export const trainingApi = {
  // Models
  listModels: (params?: { status?: string; limit?: number }) =>
    api.get('/training/models', { params }),
  getModel: (id: number) => api.get(`/training/models/${id}`),
  createModel: (data: Record<string, unknown>) => api.post('/training/models/create/advanced', data),
  updateModel: (id: number, data: { name?: string; description?: string }) =>
    api.patch(`/training/models/${id}`, data),
  deleteModel: (id: number) => api.delete(`/training/models/${id}`),
  downloadModel: (id: number) => api.get(`/training/models/${id}/download`, { responseType: 'blob' }),

  // Jobs
  listJobs: (params?: { status?: string; job_type?: string; limit?: number }) =>
    api.get('/training/queue', { params }),
  getJob: (id: number) => api.get(`/training/queue/${id}`),

  // Tuning
  tuneModel: (id: number, data: { strategy?: string; n_iterations?: number }) =>
    api.post(`/training/models/${id}/tune`, null, { params: data }),

  // Testing & comparison
  testModel: (id: number, data: { test_start: string; test_end: string }) =>
    api.post(`/training/models/${id}/test`, data),
  compareModels: (modelIds: number[], data: { test_start: string; test_end: string }) =>
    api.post('/training/models/compare', data, { params: { model_ids: modelIds.join(',') } }),
  listTestResults: (params?: { limit?: number; offset?: number }) =>
    api.get('/training/test-results', { params }),
  getTestResult: (id: number) => api.get(`/training/test-results/${id}`),
  listComparisons: (params?: { limit?: number; offset?: number }) =>
    api.get('/training/comparisons', { params }),
  getComparison: (id: number) => api.get(`/training/comparisons/${id}`),

  // Features & data
  getFeatures: (includeFlags = true) =>
    api.get('/training/features', { params: { include_flags: includeFlags } }),
  getDataAvailability: () => api.get('/training/data-availability'),
  getPhases: () => api.get('/training/phases'),

  // Settings
  getSettings: () => api.get('/training/settings'),
  updateSettings: (updates: Record<string, unknown>) =>
    api.patch('/training/settings', updates),

  // System
  getHealth: () => api.get('/training/health'),
  getConfig: () => api.get('/training/config'),
};

// ------------------------------------------------------------------
// Server (Predictions) API  (/api/server/...)
// ------------------------------------------------------------------
export const serverApi = {
  // Models
  listActiveModels: (includeInactive = false) =>
    api.get('/server/models/active', { params: { include_inactive: includeInactive } }),
  listAvailableModels: () => api.get('/server/models/available'),
  importModel: (modelId: number) => api.post('/server/models/import', { model_id: modelId }),
  getModelDetails: (id: number) => api.get(`/server/models/${id}`),
  activateModel: (id: number) => api.post(`/server/models/${id}/activate`),
  deactivateModel: (id: number) => api.post(`/server/models/${id}/deactivate`),
  renameModel: (id: number, name: string) => api.patch(`/server/models/${id}/rename`, { new_name: name }),
  deleteModel: (id: number) => api.delete(`/server/models/${id}`),

  // Predictions
  predict: (coinId: string, modelIds?: number[]) =>
    api.post('/server/predict', { coin_id: coinId, model_ids: modelIds }),
  getPredictions: (params?: Record<string, unknown>) =>
    api.get('/server/predictions', { params }),
  getLatestPrediction: (coinId: string, modelId?: number) =>
    api.get(`/server/predictions/latest/${coinId}`, { params: { model_id: modelId } }),
  getModelPredictions: (params?: Record<string, unknown>) =>
    api.get('/server/model-predictions', { params }),

  // Alerts
  getAlerts: (params?: Record<string, unknown>) =>
    api.get('/server/alerts', { params }),
  getAlertDetails: (id: number) => api.get(`/server/alerts/${id}`),
  getAlertStatistics: (params?: Record<string, unknown>) =>
    api.get('/server/alerts/statistics', { params }),
  updateAlertConfig: (id: number, data: Record<string, unknown>) =>
    api.patch(`/server/models/${id}/alert-config`, data),

  // Model settings
  getModelStatistics: (id: number) => api.get(`/server/models/${id}/statistics`),
  getIgnoreSettings: (id: number) => api.get(`/server/models/${id}/ignore-settings`),
  updateIgnoreSettings: (id: number, data: Record<string, unknown>) =>
    api.patch(`/server/models/${id}/ignore-settings`, data),

  // System
  getHealth: () => api.get('/server/health'),
  getStats: () => api.get('/server/stats'),
  getCoinDetails: (modelId: number, coinId: string) =>
    api.get(`/server/models/${modelId}/coin/${coinId}`),
};

// ------------------------------------------------------------------
// Buy (Trading) API  (/api/buy/...)
// ------------------------------------------------------------------
export const buyApi = {
  // Health & dashboard
  getHealth: () => api.get('/buy/health'),
  getDashboardStats: () => api.get('/buy/dashboard/stats'),
  getWalletPerformance: () => api.get('/buy/dashboard/performance'),

  // Wallets
  getWallets: (type?: string) => api.get('/buy/wallets', { params: { type } }),
  getWallet: (alias: string) => api.get(`/buy/wallets/${alias}`),
  createWallet: (data: Record<string, unknown>) => api.post('/buy/wallets', data),
  updateWallet: (alias: string, data: Record<string, unknown>) => api.patch(`/buy/wallets/${alias}`, data),
  deleteWallet: (alias: string) => api.delete(`/buy/wallets/${alias}`),
  toggleTrading: (alias: string, enabled: boolean) =>
    api.patch(`/buy/wallets/${alias}/toggle-trading`, null, { params: { enabled } }),
  toggleTransfer: (alias: string, enabled: boolean) =>
    api.patch(`/buy/wallets/${alias}/toggle-transfer`, null, { params: { enabled } }),
  addBalance: (alias: string, amount: number) =>
    api.patch(`/buy/wallets/${alias}/add-balance`, null, { params: { amount } }),

  // Trading
  executeBuy: (data: { wallet_alias: string; mint: string; amount_sol: number; slippage_bps?: number; use_jito?: boolean; jito_tip_lamports?: number }) =>
    api.post('/buy/execute-buy', data),
  executeSell: (data: { wallet_alias: string; mint: string; amount_pct?: number; slippage_bps?: number; use_jito?: boolean; jito_tip_lamports?: number }) =>
    api.post('/buy/execute-sell', data),
  sellAll: (data: { wallet_alias: string; slippage_bps?: number; use_jito?: boolean; jito_tip_lamports?: number }) =>
    api.post('/buy/sell-all', data),

  // Transfers
  executeTransfer: (data: { wallet_alias: string; to_address: string; amount_sol?: number; force_sweep?: boolean }) =>
    api.post('/buy/transfer', data),

  // Positions
  getPositions: (walletAlias?: string, status?: string) =>
    api.get('/buy/positions', { params: { wallet_alias: walletAlias, status } }),
  getPosition: (walletAlias: string, mint: string) =>
    api.get(`/buy/positions/${walletAlias}/${mint}`),

  // Logs
  getTradeLogs: (walletAlias?: string, action?: string, limit = 100) =>
    api.get('/buy/trades', { params: { wallet_alias: walletAlias, action, limit } }),
  getTransferLogs: (walletAlias?: string, limit = 100) =>
    api.get('/buy/transfers', { params: { wallet_alias: walletAlias, limit } }),
};

// ------------------------------------------------------------------
// Embeddings API  (/api/embeddings/...)
// ------------------------------------------------------------------
export const embeddingsApi = {
  // Health & stats
  getHealth: () => api.get('/embeddings/health'),
  getStats: () => api.get('/embeddings/stats'),

  // Configs
  getConfigs: () => api.get('/embeddings/configs'),
  getConfig: (id: number) => api.get(`/embeddings/configs/${id}`),
  createConfig: (data: Record<string, unknown>) => api.post('/embeddings/configs', data),
  updateConfig: (id: number, data: Record<string, unknown>) => api.patch(`/embeddings/configs/${id}`, data),
  deleteConfig: (id: number) => api.delete(`/embeddings/configs/${id}`),

  // Generation
  generate: (data: { start: string; end: string; config_id?: number }) =>
    api.post('/embeddings/generate', data),
  getJobs: (params?: { config_id?: number; status?: string; limit?: number }) =>
    api.get('/embeddings/jobs', { params }),
  getJob: (id: number) => api.get(`/embeddings/jobs/${id}`),

  // Browse
  browse: (params?: Record<string, unknown>) => api.get('/embeddings/browse', { params }),
  getEmbedding: (id: number) => api.get(`/embeddings/browse/${id}`),
  getEmbeddingsByMint: (mint: string, limit = 50) =>
    api.get(`/embeddings/browse/by-mint/${mint}`, { params: { limit } }),

  // Similarity search
  searchSimilar: (data: { embedding?: number[]; mint?: string; k?: number; phase_id?: number; label?: string; min_similarity?: number }) =>
    api.post('/embeddings/search/similar', data),
  searchByMint: (mint: string, params?: Record<string, unknown>) =>
    api.get(`/embeddings/search/by-mint/${mint}`, { params }),
  searchByLabel: (label: string, params?: { k?: number; strategy?: string }) =>
    api.get(`/embeddings/search/by-label/${label}`, { params }),

  // Labels
  addLabel: (data: { embedding_id: number; label: string; confidence?: number; source?: string; notes?: string }) =>
    api.post('/embeddings/labels', data),
  getLabels: () => api.get('/embeddings/labels'),
  deleteLabel: (id: number) => api.delete(`/embeddings/labels/${id}`),
  propagateLabels: (data: { source_label: string; min_similarity?: number; max_propagations?: number }) =>
    api.post('/embeddings/labels/propagate', data),

  // Analysis
  getDistribution: () => api.get('/embeddings/analysis/distribution'),
  getClusters: (params?: { k?: number; strategy?: string; limit?: number }) =>
    api.get('/embeddings/analysis/clusters', { params }),
  getOutliers: (params?: { strategy?: string; limit?: number }) =>
    api.get('/embeddings/analysis/outliers', { params }),

  // Neo4j
  triggerNeo4jSync: () => api.post('/embeddings/neo4j/sync'),
  getNeo4jStatus: () => api.get('/embeddings/neo4j/status'),
};

export default api;
