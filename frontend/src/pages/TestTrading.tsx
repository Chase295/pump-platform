import TradingShell from './trading/TradingShell';

export default function TestTrading() {
  return (
    <TradingShell
      walletType="TEST"
      basePath="/test-trading"
      accentColor="0, 212, 255"
      label="Test Trading"
    />
  );
}
