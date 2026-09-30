CREATE TABLE IF NOT EXISTS shared_cards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE card_statements ADD COLUMN card_id TEXT REFERENCES shared_cards(id);
CREATE UNIQUE INDEX IF NOT EXISTS card_statements_card_month ON card_statements(due_month,card_id) WHERE card_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rent_rules (
  effective_month TEXT PRIMARY KEY,
  amount INTEGER NOT NULL CHECK (amount > 0)
);
