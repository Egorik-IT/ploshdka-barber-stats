ALTER TABLE users ADD COLUMN IF NOT EXISTS calculation_category text
    CHECK (calculation_category IN ('barber', 'expert', 'top', 'admin'));

CREATE TABLE IF NOT EXISTS yclients_directory (
    branch_id integer NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    company_id bigint NOT NULL,
    kind text NOT NULL CHECK (kind IN ('clients', 'services', 'goods')),
    external_id text NOT NULL,
    data jsonb NOT NULL,
    synced_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (branch_id, kind, external_id)
);
CREATE TABLE IF NOT EXISTS client_photo_overrides (
    company_id bigint NOT NULL,
    client_id text NOT NULL,
    photo_url text NOT NULL DEFAULT '',
    PRIMARY KEY (company_id, client_id)
);
CREATE TABLE IF NOT EXISTS calculation_settings (
    scope text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS yclients_report_cache (
    cache_key text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS finance_entries (
    scope text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS yclients_directory_sync (
    branch_id integer PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
    company_id bigint NOT NULL,
    synced_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS yclients_client_details (
    branch_id integer NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    company_id bigint NOT NULL,
    client_id text NOT NULL,
    data jsonb NOT NULL,
    synced_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (branch_id, company_id, client_id)
);
