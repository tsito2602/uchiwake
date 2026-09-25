CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  due_month TEXT NOT NULL CHECK (due_month GLOB '[12][0-9][0-9][0-9]-[01][0-9]'),
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('card','rent','utilities','other')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS bills_due_month ON bills(due_month);
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  spent_on TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  note TEXT NOT NULL DEFAULT '',
  receipt_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS expenses_spent_on ON expenses(spent_on);
