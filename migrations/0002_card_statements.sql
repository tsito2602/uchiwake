CREATE TABLE IF NOT EXISTS card_statements (
  id TEXT PRIMARY KEY,
  due_month TEXT NOT NULL,
  title TEXT NOT NULL,
  confirmed_total INTEGER NOT NULL CHECK (confirmed_total > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS card_statements_due_month ON card_statements(due_month);
CREATE TABLE IF NOT EXISTS card_entries (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES card_statements(id),
  spent_on TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount != 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS card_entries_statement ON card_entries(statement_id);
