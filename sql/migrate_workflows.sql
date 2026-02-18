-- Migration: Trading Workflows
ALTER TABLE positions ADD COLUMN IF NOT EXISTS peak_price_sol DECIMAL(30, 18);

CREATE TABLE IF NOT EXISTS trading_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(4) NOT NULL CHECK (type IN ('BUY', 'SELL')),
    is_active BOOLEAN DEFAULT FALSE,
    chain JSONB NOT NULL DEFAULT '{}',
    buy_amount_mode VARCHAR(7) CHECK (buy_amount_mode IN ('fixed', 'percent')),
    buy_amount_value NUMERIC(20, 9),
    sell_amount_pct NUMERIC(5, 2) DEFAULT 100.0,
    cooldown_seconds INTEGER DEFAULT 60,
    max_open_positions INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_wallet ON trading_workflows(wallet_id);
CREATE INDEX IF NOT EXISTS idx_workflows_type_active ON trading_workflows(type, is_active);

CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES trading_workflows(id) ON DELETE CASCADE,
    mint VARCHAR(255) NOT NULL,
    trigger_data JSONB DEFAULT '{}',
    steps_log JSONB DEFAULT '[]',
    result VARCHAR(10) NOT NULL CHECK (result IN ('EXECUTED', 'REJECTED', 'ERROR')),
    trade_log_id UUID REFERENCES trade_logs(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_exec_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_wf_exec_created ON workflow_executions(created_at DESC);
