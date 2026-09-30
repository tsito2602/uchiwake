-- Existing records remain in a locked legacy space until its owner claims it.
CREATE TABLE spaces (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('personal','shared')),
 owner_id TEXT, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO spaces(id,name,kind) VALUES ('legacy','うちの家計','shared');
CREATE UNIQUE INDEX personal_space_owner ON spaces(owner_id) WHERE kind='personal';
CREATE TABLE space_members (
 space_id TEXT NOT NULL REFERENCES spaces(id), user_id TEXT NOT NULL, name TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1, joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(space_id,user_id)
);
CREATE INDEX space_members_user ON space_members(user_id,active);
ALTER TABLE bills ADD COLUMN space_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE shared_cards ADD COLUMN space_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE shared_cards ADD COLUMN deleted_at TEXT;
ALTER TABLE card_statements ADD COLUMN space_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE card_statements ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE card_entries ADD COLUMN space_id TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX bills_space_month ON bills(space_id,due_month);
CREATE INDEX statements_space_month ON card_statements(space_id,due_month);
CREATE INDEX entries_space ON card_entries(space_id,statement_id);
CREATE INDEX cards_space ON shared_cards(space_id);
ALTER TABLE rent_rules RENAME TO rent_rules_legacy;
CREATE TABLE rent_rules (
 space_id TEXT NOT NULL REFERENCES spaces(id), effective_month TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>0), PRIMARY KEY(space_id,effective_month)
);
INSERT INTO rent_rules SELECT 'legacy',effective_month,amount FROM rent_rules_legacy;
DROP TABLE rent_rules_legacy;
ALTER TABLE category_settings RENAME TO category_settings_legacy;
CREATE TABLE category_settings (
 space_id TEXT NOT NULL REFERENCES spaces(id), category TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL,
 original_category TEXT, include_in_settlement INTEGER NOT NULL DEFAULT 1 CHECK(include_in_settlement IN (0,1)),
 PRIMARY KEY(space_id,category)
);
INSERT INTO category_settings SELECT 'legacy',category,icon,color,original_category,include_in_settlement FROM category_settings_legacy;
DROP TABLE category_settings_legacy;
CREATE UNIQUE INDEX category_settings_original ON category_settings(space_id,original_category) WHERE original_category IS NOT NULL;
CREATE TABLE space_invites (
 code_hash TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id), created_by TEXT NOT NULL,
 expires_at INTEGER NOT NULL, consumed_by TEXT, revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE invite_attempts (user_id TEXT PRIMARY KEY, window INTEGER NOT NULL, attempts INTEGER NOT NULL);
-- Defaults are effective-dated. Explicit month overrides and snapshots take priority.
CREATE TABLE settlement_rules (
 space_id TEXT NOT NULL REFERENCES spaces(id), month TEXT NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('default','month')), config TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(space_id,month,scope)
);

-- SQLite cannot ADD a non-null REFERENCES column to populated tables.
-- Keep existing rows in place and enforce the new relations on all writes.
CREATE TRIGGER bills_space_insert BEFORE INSERT ON bills
WHEN NOT EXISTS(SELECT 1 FROM spaces WHERE id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'invalid space'); END;
CREATE TRIGGER bills_space_update BEFORE UPDATE OF space_id ON bills
WHEN NOT EXISTS(SELECT 1 FROM spaces WHERE id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'invalid space'); END;
CREATE TRIGGER shared_cards_space_insert BEFORE INSERT ON shared_cards
WHEN NOT EXISTS(SELECT 1 FROM spaces WHERE id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'invalid space'); END;
CREATE TRIGGER shared_cards_space_update BEFORE UPDATE OF space_id ON shared_cards
WHEN NOT EXISTS(SELECT 1 FROM spaces WHERE id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'invalid space'); END;
CREATE TRIGGER card_statements_space_insert BEFORE INSERT ON card_statements
WHEN NOT EXISTS(SELECT 1 FROM spaces WHERE id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'invalid space'); END;
CREATE TRIGGER card_statements_space_update BEFORE UPDATE OF space_id ON card_statements
WHEN NOT EXISTS(SELECT 1 FROM spaces WHERE id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'invalid space'); END;
CREATE TRIGGER card_entries_space_insert BEFORE INSERT ON card_entries
WHEN NOT EXISTS(SELECT 1 FROM spaces WHERE id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'invalid space'); END;
CREATE TRIGGER card_entries_space_update BEFORE UPDATE OF space_id ON card_entries
WHEN NOT EXISTS(SELECT 1 FROM spaces WHERE id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'invalid space'); END;
CREATE TRIGGER card_entries_scope BEFORE INSERT ON card_entries
WHEN NOT EXISTS(SELECT 1 FROM card_statements WHERE id=NEW.statement_id AND space_id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'statement space mismatch'); END;
CREATE TRIGGER card_statements_scope BEFORE INSERT ON card_statements
WHEN NEW.card_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM shared_cards WHERE id=NEW.card_id AND space_id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'card space mismatch'); END;
