ALTER TABLE category_settings ADD COLUMN original_category TEXT;
ALTER TABLE category_settings ADD COLUMN include_in_settlement INTEGER NOT NULL DEFAULT 1 CHECK (include_in_settlement IN (0,1));
CREATE UNIQUE INDEX category_settings_original ON category_settings(original_category) WHERE original_category IS NOT NULL;
