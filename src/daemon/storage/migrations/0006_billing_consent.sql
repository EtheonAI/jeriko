-- Billing consent evidence — chargeback defense data collected at checkout.
--
-- Stores IP address, user agent, terms acceptance, and billing address
-- confirmation for each subscription. This data is critical for dispute
-- evidence per Stripe's chargeback prevention guidelines.

CREATE TABLE IF NOT EXISTS billing_consent (
  id                        TEXT PRIMARY KEY,                    -- UUID
  subscription_id           TEXT,                                -- Stripe subscription ID (sub_xxx)
  customer_id               TEXT,                                -- Stripe customer ID (cus_xxx)
  email                     TEXT,                                -- Customer email at time of consent
  client_ip                 TEXT,                                -- IP address at checkout
  user_agent                TEXT,                                -- User agent at checkout
  terms_url                 TEXT,                                -- Terms of Service URL shown
  terms_version             TEXT,                                -- Terms version accepted
  terms_accepted_at         INTEGER,                             -- Unix timestamp of acceptance
  privacy_url               TEXT,                                -- Privacy Policy URL shown
  billing_address_collected INTEGER NOT NULL DEFAULT 0,          -- 1 if Stripe collected billing address
  stripe_consent_collected  INTEGER NOT NULL DEFAULT 0,          -- 1 if Stripe consent_collection was used
  checkout_session_id       TEXT,                                -- Stripe checkout session ID (cs_xxx)
  created_at                INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_billing_consent_sub ON billing_consent(subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_consent_customer ON billing_consent(customer_id);
