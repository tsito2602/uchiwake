CREATE TABLE classification_history (
 id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id),
 merchant_key TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL,
 previous_category TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX classification_history_merchant ON classification_history(space_id,merchant_key,created_at DESC);
CREATE TABLE classification_rules (
 id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id),
 merchant_key TEXT NOT NULL, context_keyword TEXT NOT NULL DEFAULT '', category TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(space_id,merchant_key,context_keyword)
);
-- Record committed edits atomically, including concurrent/revision-checked edits.
-- History is never promoted to a rule. No card values or source files are retained.
CREATE TRIGGER classification_category_edit AFTER UPDATE OF category ON card_entries
WHEN OLD.category<>NEW.category
BEGIN
 INSERT INTO classification_history(id,space_id,merchant_key,title,category,previous_category)
 VALUES(lower(hex(randomblob(16))),NEW.space_id,lower(trim(NEW.title)),NEW.title,NEW.category,OLD.category);
END;
CREATE TRIGGER classification_category_rename AFTER UPDATE OF category ON category_settings
WHEN OLD.category<>NEW.category
BEGIN
 UPDATE classification_history SET category=NEW.category WHERE space_id=NEW.space_id AND category=OLD.category;
 UPDATE classification_history SET previous_category=NEW.category WHERE space_id=NEW.space_id AND previous_category=OLD.category;
 UPDATE classification_rules SET category=NEW.category WHERE space_id=NEW.space_id AND category=OLD.category;
END;
