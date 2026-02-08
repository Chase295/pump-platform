import { createContext, useContext } from 'react';
import type { WalletType } from '../../types/buy';

interface TradingContextValue {
  walletType: WalletType;
  basePath: string;
  accentColor: string;
  label: string;
}

export const TradingContext = createContext<TradingContextValue>({
  walletType: 'TEST',
  basePath: '/test-trading',
  accentColor: '0, 212, 255',
  label: 'Test Trading',
});

export function useTradingContext() {
  return useContext(TradingContext);
}
