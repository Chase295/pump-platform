import { useQuery } from '@tanstack/react-query';
import { buyApi } from '../../services/api';
import type { ExchangeRate } from '../../types/buy';

// ---------------------------------------------------------------------------
// Exchange Rate Hook
// ---------------------------------------------------------------------------
export function useExchangeRate() {
  return useQuery<ExchangeRate>({
    queryKey: ['buy', 'exchangeRate'],
    queryFn: async () => (await buyApi.getExchangeRate()).data,
    refetchInterval: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
export const fmtEur = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export const fmtSol = (n: number) => `${n.toFixed(4)} SOL`;

export const truncateMint = (mint: string) =>
  mint ? `${mint.slice(0, 4)}...${mint.slice(-4)}` : '';

export const truncateAddress = (addr: string) =>
  addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
export const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: 'rgba(76, 175, 80, 0.2)', color: '#4caf50' },
  PAUSED: { bg: 'rgba(255, 152, 0, 0.2)', color: '#ff9800' },
  DRAINED: { bg: 'rgba(244, 67, 54, 0.2)', color: '#f44336' },
  FROZEN: { bg: 'rgba(33, 150, 243, 0.2)', color: '#2196f3' },
};

export const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  BUY: { bg: 'rgba(76, 175, 80, 0.2)', color: '#4caf50' },
  SELL: { bg: 'rgba(244, 67, 54, 0.2)', color: '#f44336' },
};

export const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  TEST: { bg: 'rgba(0, 212, 255, 0.2)', color: '#00d4ff' },
  REAL: { bg: 'rgba(76, 175, 80, 0.2)', color: '#4caf50' },
};

// Card style constants
export const CARD_SX = {
  bgcolor: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(10px)',
} as const;

export const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(15,15,35,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
} as const;
