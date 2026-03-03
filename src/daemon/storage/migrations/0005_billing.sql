-- Billing subsystem — subscription state, event audit trail, license cache.

-- Subscription state (mirrors Stripe subscription lifecycle)
CREATE TABLE IF NOT EXISTS billing_subscription (
  id                    TEXT PRIMARY KEY,                    -- Stripe subscription ID (sub_xxx)
  customer_id           TEXT NOT NULL,                       -- Stripe customer ID (cus_xxx)
  email                 TEXT NOT NULL,                       -- Customer email
  tier                  TEXT NOT NULL DEFAULT 'free',        -- 'free' | 'pro' | 'team' | 'enterprise'
  status                TEXT NOT NULL DEFAULT 'active',      -- Stripe status
  current_period_start  INTEGER,                             -- Unix timestamp
  current_period_end    INTEGER,                             -- Unix timestamp
  cancel_at_period_end  INTEGER NOT NULL DEFAULT 0,          -- 1 if scheduled to cancel
  terms_accepted_at     INTEGER,                             -- T&C acceptance timestamp
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Full event audit trail (chargeback protection)
CREATE TABLE IF NOT EXISTS billing_event (
  id              TEXT PRIMARY KEY,                          -- Stripe event ID (evt_xxx)
  type            TEXT NOT NULL,                             -- Event type (e.g. invoice.paid)
  subscription_id TEXT,                                      -- Related subscription
  payload         TEXT NOT NULL,                             -- Full JSON event payload
  processed_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_billing_event_type ON billing_event(type);
CREATE INDEX IF NOT EXISTS idx_billing_event_sub ON billing_event(subscription_id);

-- Local license cache (offline grace period)
CREATE TABLE IF NOT EXISTS billing_license (
  key               TEXT PRIMARY KEY DEFAULT 'current',
  tier              TEXT NOT NULL DEFAULT 'free',
  email             TEXT,
  subscription_id   TEXT,
  customer_id       TEXT,
  valid_until       INTEGER,                                 -- Offline grace: 7 days from last verification
  verified_at       INTEGER,                                 -- Last Stripe verification timestamp
  connector_limit   INTEGER NOT NULL DEFAULT 2,
  trigger_limit     INTEGER NOT NULL DEFAULT 3
);
