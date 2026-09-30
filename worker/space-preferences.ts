import type { SpacePreferences } from '../src/domain';

// Additive and idempotent, so GitHub auto-deploys also work before migration 0011.
export const spacePreferencesSchema=`CREATE TABLE IF NOT EXISTS space_preferences (
 space_id TEXT PRIMARY KEY REFERENCES spaces(id),
 rent_enabled INTEGER NOT NULL DEFAULT 0 CHECK(rent_enabled IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0
)`;

export async function readSpacePreferences(db:D1Database,spaceId:string):Promise<SpacePreferences> {
 await db.prepare(spacePreferencesSchema).run();
 const row=await db.prepare('SELECT rent_enabled,revision FROM space_preferences WHERE space_id=?').bind(spaceId).first<{rent_enabled:number;revision:number}>();
 return {rent_enabled:row?!!row.rent_enabled:false,revision:row?.revision??0};
}

export async function saveSpacePreferences(db:D1Database,spaceId:string,enabled:boolean,revision:number):Promise<boolean> {
 await db.prepare(spacePreferencesSchema).run();
 const created=await db.prepare(`INSERT INTO space_preferences(space_id,rent_enabled,revision)
 SELECT ?,?,1 WHERE ?=0 ON CONFLICT(space_id) DO NOTHING`).bind(spaceId,enabled?1:0,revision).run();
 if(created.meta.changes)return true;
 const updated=await db.prepare('UPDATE space_preferences SET rent_enabled=?,revision=revision+1 WHERE space_id=? AND revision=?').bind(enabled?1:0,spaceId,revision).run();
 return !!updated.meta.changes;
}
