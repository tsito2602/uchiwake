-- Refunds can bring a card withdrawal to zero or below, and a negative statement can be
-- deducted from the next month's payment instead (carry_to_next).
-- SQLite cannot drop a CHECK, so card_statements is rebuilt. Its entries are parked first so
-- the rebuild never leaves a row pointing at a missing statement; rowids keep their order.
CREATE TABLE card_entries_parked AS SELECT rowid AS parked_rowid,* FROM card_entries;
DELETE FROM card_entries;
DROP TRIGGER card_entries_scope;
CREATE TABLE card_statements_next (
  id TEXT PRIMARY KEY,
  due_month TEXT NOT NULL,
  title TEXT NOT NULL,
  confirmed_total INTEGER NOT NULL CHECK (confirmed_total BETWEEN -100000000 AND 100000000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  card_id TEXT REFERENCES shared_cards(id),
  space_id TEXT NOT NULL DEFAULT 'legacy',
  revision INTEGER NOT NULL DEFAULT 0,
  carry_to_next INTEGER NOT NULL DEFAULT 0 CHECK (carry_to_next IN (0,1) AND (carry_to_next=0 OR confirmed_total<0))
);
INSERT INTO card_statements_next (id,due_month,title,confirmed_total,created_at,card_id,space_id,revision)
  SELECT id,due_month,title,confirmed_total,created_at,card_id,space_id,revision FROM card_statements;
DROP TABLE card_statements;
ALTER TABLE card_statements_next RENAME TO card_statements;
CREATE INDEX card_statements_due_month ON card_statements(due_month);
CREATE UNIQUE INDEX card_statements_card_month ON card_statements(due_month,card_id) WHERE card_id IS NOT NULL;
CREATE INDEX statements_space_month ON card_statements(space_id,due_month);
CREATE TRIGGER card_statements_space_insert BEFORE INSERT ON card_statements
WHEN NOT EXISTS(SELECT 1 FROM spaces WHERE id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'invalid space'); END;
CREATE TRIGGER card_statements_space_update BEFORE UPDATE OF space_id ON card_statements
WHEN NOT EXISTS(SELECT 1 FROM spaces WHERE id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'invalid space'); END;
CREATE TRIGGER card_statements_scope BEFORE INSERT ON card_statements
WHEN NEW.card_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM shared_cards WHERE id=NEW.card_id AND space_id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'card space mismatch'); END;
CREATE TRIGGER card_entries_scope BEFORE INSERT ON card_entries
WHEN NOT EXISTS(SELECT 1 FROM card_statements WHERE id=NEW.statement_id AND space_id=NEW.space_id)
BEGIN SELECT RAISE(ABORT,'statement space mismatch'); END;
INSERT INTO card_entries (rowid,id,statement_id,spent_on,title,category,amount,created_at,space_id)
  SELECT parked_rowid,id,statement_id,spent_on,title,category,amount,created_at,space_id FROM card_entries_parked ORDER BY parked_rowid;
DROP TABLE card_entries_parked;
