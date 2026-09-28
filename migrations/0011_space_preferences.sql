CREATE TABLE IF NOT EXISTS space_preferences (
 space_id TEXT PRIMARY KEY REFERENCES spaces(id),
 rent_enabled INTEGER NOT NULL DEFAULT 1 CHECK(rent_enabled IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0
);
