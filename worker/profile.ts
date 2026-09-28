export const profileSchema = `CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

export function googleAvatar(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))) return url.href;
  } catch { /* Ignore an invalid provider image URL. */ }
}

export async function profileFor<T extends { id: string; name: string; avatarUrl?: string }>(db: D1Database | undefined, user: T): Promise<T> {
  if (!db) return user;
  await db.prepare(profileSchema).run();
  const profile = await db.prepare('SELECT display_name, avatar_url FROM user_profiles WHERE user_id = ?').bind(user.id).first<{ display_name: string | null; avatar_url: string | null }>();
  return { ...user, name: profile?.display_name ?? user.name, avatarUrl: googleAvatar(profile?.avatar_url) ?? user.avatarUrl };
}

export async function saveProviderAvatar(db: D1Database | undefined, id: string, avatar: string | undefined) {
  if (!db || !avatar) return;
  await db.prepare(profileSchema).run();
  await db.prepare(`INSERT INTO user_profiles (user_id, avatar_url) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET avatar_url = excluded.avatar_url, updated_at = CURRENT_TIMESTAMP`).bind(id, avatar).run();
}

export async function saveDisplayName(db: D1Database, id: string, name: string) {
  await db.prepare(profileSchema).run();
  await db.prepare(`INSERT INTO user_profiles (user_id, display_name) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`).bind(id, name).run();
}
