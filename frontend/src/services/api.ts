import axios from 'axios';

// ------------------------------------------------------------------
// Base Axios Instance
// ------------------------------------------------------------------
const api = axios.create({
  baseURL: '/api',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor
api.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error),
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  },
);

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
  getPhases: () => api.get('/find/database/phases'),
  createPhase: (data: { name: string; interval_seconds: number; min_age_minutes: number; max_age_minutes: number }) =>
    api.post('/find/database/phases', data),
  updatePhase: (id: number, data: Record<string, unknown>) => api.put(`/find/database/phases/${id}`, data),
  deletePhase: (id: number) => api.delete(`/find/database/phases/${id}`),

  // Streams
  getStreams: (limit = 50) => api.get('/find/database/streams', { params: { limit } }),
  getStreamStats: () => api.get('/find/database/streams/stats'),

  // Metrics
  getRecentMetrics: (limit = 100, mint?: string) =>
    api.get('/find/database/metrics', { params: { limit, mint } }),
  getCoinAnalytics: (mint: string, windows = '30s,1m,3m,5m,15m,30m,1h') =>
    api.get(`/find/analytics/${mint}`, { params: { windows } }),
  getCoinDetail: (mint: string) => api.get(`/find/database/coin/${mint}`),
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
    api.post('/buy/buy', data),
  executeSell: (data: { wallet_alias: string; mint: string; amount_pct?: number; slippage_bps?: number; use_jito?: boolean; jito_tip_lamports?: number }) =>
    api.post('/buy/sell', data),
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

export default api;
