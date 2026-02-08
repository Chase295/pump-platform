import React from 'react';
import {
  Typography,
  Box,
  Alert,
  Divider,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  Chapter,
  CodeBlock,
  EndpointRow,
  McpToolRow,
  InfoPageWrapper,
} from '../../components/shared/InfoChapter';
import { useTradingContext } from './TradingContext';

const chapterIds = [
  'trade-overview',
  'trade-system',
  'trade-risk',
  'trade-wallets',
  'trade-api',
  'trade-db',
  'trade-mcp',
];

const SmallTable: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TableContainer component={Paper} sx={{ mb: 2, overflowX: 'auto', '& .MuiTable-root': { minWidth: 400 } }}>
    {children}
  </TableContainer>
);

const TradingInfo: React.FC = () => {
  const ctx = useTradingContext();

  return (
  <InfoPageWrapper
    title={`${ctx.label} - Info`}
    subtitle="Simulations- & Live-Trading mit Risk-Management"
    chapterIds={chapterIds}
  >
    {({ expandedChapters, handleChapterChange }) => (
      <>
        {ctx.walletType === 'REAL' && (
          <Alert
            severity="info"
            sx={{
              mb: 3,
              bgcolor: 'rgba(33, 150, 243, 0.1)',
              border: '1px solid rgba(33, 150, 243, 0.3)',
              '& .MuiAlert-icon': { color: '#2196f3' },
            }}
          >
            Real blockchain trading is currently <strong>not yet implemented</strong>.
            You can create and manage REAL wallets, but buy/sell operations will return a NOT_IMPLEMENTED status.
            When implemented, real trading will execute actual Solana transactions via Jupiter DEX
            and optionally use Jito bundles for MEV protection.
          </Alert>
        )}

        {ctx.walletType === 'TEST' && (
          <Alert
            severity="info"
            sx={{
              mb: 3,
              bgcolor: 'rgba(0, 212, 255, 0.1)',
              border: '1px solid rgba(0, 212, 255, 0.3)',
              '& .MuiAlert-icon': { color: '#00d4ff' },
            }}
          >
            Test trading uses virtual balances and simulates trades using real Jupiter DEX prices.
            &quot;Pain Mode&quot; applies an artificial loss percentage to simulate real-world trading friction.
          </Alert>
        )}

        {/* 1. System-Uebersicht */}
        <Chapter
          id="trade-overview"
          title="System-Uebersicht"
          icon="💰"
          expanded={expandedChapters.includes('trade-overview')}
          onChange={handleChapterChange('trade-overview')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            Das Trading-System fuehrt Buy/Sell-Orders auf der Solana-Blockchain aus. Es unterstuetzt
            zwei Modi: TEST (Simulation) und REAL (echte Transaktionen).
          </Typography>

          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Modus</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><Chip label="TEST" size="small" color="info" /></TableCell>
                  <TableCell>Simulierter Handel mit virtuellem SOL-Guthaben. Nutzt echte Jupiter-Preise.</TableCell>
                  <TableCell><Chip label="Aktiv" size="small" color="success" /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><Chip label="REAL" size="small" color="warning" /></TableCell>
                  <TableCell>Echte Blockchain-Transaktionen mit Jito-Bundles.</TableCell>
                  <TableCell><Chip label="Coming Soon" size="small" variant="outlined" /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>Pain Mode</Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            TEST-Wallets simulieren Verluste mit einem konfigurierbaren Prozentsatz (virtual_loss_percent).
            Jeder Trade verliert diesen Prozentsatz an virtuellem Guthaben, um Stress-Tests fuer Strategien
            zu ermoeglichen.
          </Typography>

          <CodeBlock>
{`Architektur:
  n8n Alert -> POST /api/buy/buy -> RiskManager Check
    -> Jupiter API (Preis-Quote)
    -> Position erstellen/aktualisieren
    -> Trade-Log schreiben
    -> Balance aktualisieren`}
          </CodeBlock>
        </Chapter>

        {/* 2. Trading-System */}
        <Chapter
          id="trade-system"
          title="Trading-System"
          icon="📊"
          expanded={expandedChapters.includes('trade-system')}
          onChange={handleChapterChange('trade-system')}
        >
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Buy-Flow (Simulation)</Typography>
          <CodeBlock>
{`1. RiskManager prueft: trading_enabled, consecutive_losses, daily_loss
2. Jupiter API: Token-Preis und Quote abrufen
3. Position erstellen oder existierende erweitern
4. virtual_sol_balance um amount_sol reduzieren
5. Pain Mode: Zusaetzlich virtual_loss_percent abziehen
6. Trade-Log mit allen Details schreiben`}
          </CodeBlock>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Sell-Flow (Simulation)</Typography>
          <CodeBlock>
{`1. RiskManager prueft: trading_enabled, wallet_status
2. Position und Token-Balance laden
3. Teilverkauf (amount_pct: 1-100%)
4. PnL berechnen (aktueller Preis vs. Entry-Preis)
5. virtual_sol_balance erhoehen
6. Position schliessen wenn 100% verkauft
7. Consecutive-Loss-Zaehler aktualisieren`}
          </CodeBlock>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Sell All</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Verkauft 100% aller offenen Positionen eines Wallets in einem Batch.
            Gibt Ergebnisse pro Position und eine Zusammenfassung zurueck.
          </Typography>
        </Chapter>

        {/* 3. Risk-Management */}
        <Chapter
          id="trade-risk"
          title="Risk-Management (Gatekeeper)"
          icon="🛡️"
          expanded={expandedChapters.includes('trade-risk')}
          onChange={handleChapterChange('trade-risk')}
        >
          <Alert severity="warning" sx={{ mb: 2 }}>
            Der RiskManager prueft JEDEN Trade vor Ausfuehrung. Fehlgeschlagene Checks blockieren den Trade.
          </Alert>

          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>#</strong></TableCell>
                  <TableCell><strong>Check</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>1</TableCell>
                  <TableCell>Master Switch</TableCell>
                  <TableCell><code>trading_enabled</code> muss true sein</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>2</TableCell>
                  <TableCell>Wallet Status</TableCell>
                  <TableCell>Wallet muss ACTIVE sein (nicht PAUSED/DRAINED/FROZEN)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>3</TableCell>
                  <TableCell>Consecutive Losses</TableCell>
                  <TableCell>Anzahl Verluste in Folge &lt; max_consecutive_losses</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>4</TableCell>
                  <TableCell>Daily Drawdown</TableCell>
                  <TableCell>Tagesverlust &lt; max_daily_loss_pct (% vom Start-Balance)</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>5</TableCell>
                  <TableCell>Balance Check</TableCell>
                  <TableCell>Genuegend SOL fuer Trade + Gebuehren</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
            Bei fehlgeschlagenem Check: Trade wird abgelehnt mit detaillierter Fehlermeldung und dem
            Namen des fehlgeschlagenen Checks.
          </Typography>
        </Chapter>

        {/* 4. Wallet-Verwaltung */}
        <Chapter
          id="trade-wallets"
          title="Wallet-Verwaltung"
          icon="👛"
          expanded={expandedChapters.includes('trade-wallets')}
          onChange={handleChapterChange('trade-wallets')}
        >
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Wallet-Lifecycle</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Chip label="ACTIVE" color="success" size="small" />
            <Typography variant="body2" sx={{ alignSelf: 'center' }}>&rarr;</Typography>
            <Chip label="PAUSED" color="warning" size="small" />
            <Typography variant="body2" sx={{ alignSelf: 'center' }}>&rarr;</Typography>
            <Chip label="DRAINED" color="error" size="small" />
            <Typography variant="body2" sx={{ alignSelf: 'center' }}>|</Typography>
            <Chip label="FROZEN" size="small" sx={{ bgcolor: '#9c27b0', color: 'white' }} />
          </Box>

          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Bedeutung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>ACTIVE</TableCell><TableCell>Normaler Betrieb, Trading erlaubt</TableCell></TableRow>
                <TableRow><TableCell>PAUSED</TableCell><TableCell>Manuell pausiert, kein Trading</TableCell></TableRow>
                <TableRow><TableCell>DRAINED</TableCell><TableCell>Balance aufgebraucht</TableCell></TableRow>
                <TableRow><TableCell>FROZEN</TableCell><TableCell>Gesperrt (z.B. nach zu vielen Verlusten)</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>Wallet-Einstellungen</Typography>
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Feld</strong></TableCell>
                  <TableCell><strong>Beschreibung</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow><TableCell>virtual_sol_balance</TableCell><TableCell>Virtuelles SOL-Guthaben (TEST-Modus)</TableCell></TableRow>
                <TableRow><TableCell>real_sol_balance</TableCell><TableCell>Echtes SOL-Guthaben (REAL-Modus)</TableCell></TableRow>
                <TableRow><TableCell>max_consecutive_losses</TableCell><TableCell>Max. Verluste in Folge vor Block (Default: 3)</TableCell></TableRow>
                <TableRow><TableCell>max_daily_loss_pct</TableCell><TableCell>Max. Tagesverlust in % (Default: 15)</TableCell></TableRow>
                <TableRow><TableCell>virtual_loss_percent</TableCell><TableCell>Pain Mode Verlust-% pro Trade (Default: 1)</TableCell></TableRow>
                <TableRow><TableCell>trading_enabled</TableCell><TableCell>Master Switch fuer Trading</TableCell></TableRow>
                <TableRow><TableCell>transfer_enabled</TableCell><TableCell>SOL-Transfers erlaubt</TableCell></TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>

        {/* 5. API-Endpunkte */}
        <Chapter
          id="trade-api"
          title="API-Endpunkte"
          icon="🔌"
          expanded={expandedChapters.includes('trade-api')}
          onChange={handleChapterChange('trade-api')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Trading</Typography>
          <EndpointRow method="POST" path="/api/buy/buy" desc="Buy-Order ausfuehren" />
          <EndpointRow method="POST" path="/api/buy/sell" desc="Sell-Order ausfuehren" />
          <EndpointRow method="POST" path="/api/buy/sell-all" desc="Alle Positionen verkaufen" />
          <EndpointRow method="POST" path="/api/buy/transfer" desc="SOL-Transfer" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Wallet-Verwaltung</Typography>
          <EndpointRow method="GET" path="/api/buy/wallets" desc="Alle Wallets" />
          <EndpointRow method="POST" path="/api/buy/wallets" desc="Neues Wallet erstellen" />
          <EndpointRow method="GET" path="/api/buy/wallets/{alias}" desc="Wallet-Details" />
          <EndpointRow method="PATCH" path="/api/buy/wallets/{alias}" desc="Wallet aktualisieren" />
          <EndpointRow method="DELETE" path="/api/buy/wallets/{alias}" desc="Wallet loeschen" />
          <EndpointRow method="PATCH" path="/api/buy/wallets/{alias}/toggle-trading" desc="Trading ein/aus" />
          <EndpointRow method="PATCH" path="/api/buy/wallets/{alias}/toggle-transfer" desc="Transfer ein/aus" />
          <EndpointRow method="PATCH" path="/api/buy/wallets/{alias}/add-balance" desc="Virtuelles Guthaben aufladen" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Positionen & Logs</Typography>
          <EndpointRow method="GET" path="/api/buy/positions" desc="Alle Positionen (OPEN/CLOSED)" />
          <EndpointRow method="GET" path="/api/buy/positions/{alias}/{mint}" desc="Position-Details" />
          <EndpointRow method="GET" path="/api/buy/trades" desc="Trade-Log" />
          <EndpointRow method="GET" path="/api/buy/transfers" desc="Transfer-Log" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Dashboard</Typography>
          <EndpointRow method="GET" path="/api/buy/dashboard/stats" desc="Dashboard-Statistiken" />
          <EndpointRow method="GET" path="/api/buy/dashboard/performance" desc="Wallet-Performance" />
          <EndpointRow method="GET" path="/api/buy/health" desc="Health Check" />
        </Chapter>

        {/* 6. Datenbank-Tabellen */}
        <Chapter
          id="trade-db"
          title="Datenbank-Tabellen"
          icon="🗄️"
          expanded={expandedChapters.includes('trade-db')}
          onChange={handleChapterChange('trade-db')}
        >
          <SmallTable>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Tabelle</strong></TableCell>
                  <TableCell><strong>Zweck</strong></TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><strong>Key Fields</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell><code>wallets</code></TableCell>
                  <TableCell>Wallet-Konfiguration und Status</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>alias, type, status, virtual_sol_balance</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>positions</code></TableCell>
                  <TableCell>Offene und geschlossene Token-Positionen</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>wallet_id, mint, status, tokens_held, entry_price</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>trade_logs</code></TableCell>
                  <TableCell>Alle Buy/Sell-Transaktionen</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>action, mint, amount_sol, amount_tokens, is_simulation</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><code>transfer_logs</code></TableCell>
                  <TableCell>SOL-Transfer-Historie</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>from_wallet, to_address, amount_sol</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </SmallTable>
        </Chapter>

        {/* 7. MCP-Tools */}
        <Chapter
          id="trade-mcp"
          title="MCP-Tools"
          icon="🤖"
          expanded={expandedChapters.includes('trade-mcp')}
          onChange={handleChapterChange('trade-mcp')}
        >
          <Alert severity="info" sx={{ mb: 2 }}>
            Trading MCP-Tools fuer AI-gesteuerten Handel und Wallet-Management.
          </Alert>

          <Grid container spacing={1}>
            {[
              { name: 'execute_buy', desc: 'Buy-Order ausfuehren', cat: 'Trading' },
              { name: 'execute_sell', desc: 'Sell-Order ausfuehren', cat: 'Trading' },
              { name: 'sell_all_positions', desc: 'Alle Positionen verkaufen', cat: 'Trading' },
              { name: 'execute_transfer', desc: 'SOL-Transfer', cat: 'Trading' },
              { name: 'get_wallets', desc: 'Alle Wallets auflisten', cat: 'Wallets' },
              { name: 'create_wallet', desc: 'Neues Wallet erstellen', cat: 'Wallets' },
              { name: 'get_wallet', desc: 'Wallet-Details', cat: 'Wallets' },
              { name: 'update_wallet', desc: 'Wallet aktualisieren', cat: 'Wallets' },
              { name: 'delete_wallet', desc: 'Wallet loeschen', cat: 'Wallets' },
              { name: 'toggle_trading', desc: 'Trading ein/aus', cat: 'Wallets' },
              { name: 'toggle_transfer', desc: 'Transfer ein/aus', cat: 'Wallets' },
              { name: 'add_virtual_balance', desc: 'Guthaben aufladen', cat: 'Wallets' },
              { name: 'get_positions', desc: 'Positionen auflisten', cat: 'Daten' },
              { name: 'get_position', desc: 'Position-Details', cat: 'Daten' },
              { name: 'get_trade_logs', desc: 'Trade-Historie', cat: 'Daten' },
              { name: 'get_transfer_logs', desc: 'Transfer-Historie', cat: 'Daten' },
              { name: 'get_dashboard_stats', desc: 'Dashboard-Statistiken', cat: 'Dashboard' },
              { name: 'get_wallet_performance', desc: 'Wallet-Performance', cat: 'Dashboard' },
              { name: 'health_check', desc: 'Service-Status', cat: 'System' },
            ].map((tool) => (
              <Grid key={tool.name} size={{ xs: 12, sm: 6 }}>
                <McpToolRow name={tool.name} desc={tool.desc} cat={tool.cat} />
              </Grid>
            ))}
          </Grid>
        </Chapter>
      </>
    )}
  </InfoPageWrapper>
  );
};

export default TradingInfo;
