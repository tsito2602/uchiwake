-- The former combined bucket was ambiguous: retain it as unresolved, never silently classify it.
INSERT OR IGNORE INTO category_settings (category,icon,color,include_in_settlement)
SELECT '要確認',icon,color,include_in_settlement FROM category_settings WHERE category='その他・要確認';
UPDATE card_entries SET category='要確認' WHERE category='その他・要確認';
DELETE FROM category_settings WHERE category='その他・要確認';
