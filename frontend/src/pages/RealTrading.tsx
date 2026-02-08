import TradingShell from './trading/TradingShell';

export default function RealTrading() {
  return (
    <TradingShell
      walletType="REAL"
      basePath="/real-trading"
      accentColor="76, 175, 80"
      label="Real Trading"
    />
  );
}
