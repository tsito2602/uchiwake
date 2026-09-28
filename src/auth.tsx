import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { pathData, FIRST_STROKE_OFFSET_Y } from './brand-motion';
import './login.css';

export type User = { id: string; email: string; name: string; avatarUrl?: string };
export type AccountProps = { user: User; logout: () => Promise<void>; signingOut: boolean; updateProfile: (name: string) => Promise<void> };
type Session = { user: User | null; configured: boolean };
const messages: Record<string, string> = {
  unavailable: 'Googleログインは現在準備中です。',
  expired: 'ログインの有効時間が過ぎました。もう一度お試しください。',
  cancelled: 'ログインをキャンセルしました。',
  not_allowed: 'このアカウントには利用権限がありません。別のGoogleアカウントでお試しください。',
  failed: 'ログインできませんでした。もう一度お試しください。',
};
export function notifySessionExpired(response: Response) {
  if (response.status === 401) window.dispatchEvent(new Event('uchiwake:session-expired'));
}
function bootReady() {
  const root = document.getElementById('root');
  if (root) root.dataset.bootReady = 'true';
  document.dispatchEvent(new Event('uchiwake:ready'));
}
function Logo() {
  return <div className="login-brand"><svg className="login-brand-icon" viewBox="298 179 661 849" aria-hidden="true">{pathData.map((d, i) => <path key={i} d={d} transform={i === 0 ? `translate(0 ${FIRST_STROKE_OFFSET_Y})` : undefined} className={i === 2 ? 'mid' : i === 3 ? 'pale' : 'ink'}/>)}</svg><span>uchiwake</span></div>;
}
function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.8 23.8 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>;
}
export function AuthGate({ children }: { children: (user: User, logout: () => Promise<void>, signingOut: boolean, updateProfile: (name: string) => Promise<void>) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState(() => {
    const url = new URL(location.href), reason = url.searchParams.get('auth_error');
    if (reason) { url.searchParams.delete('auth_error'); history.replaceState(null, '', url); }
    return reason ? messages[reason] || messages.failed : '';
  });
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  async function loadSession(signal?: AbortSignal) {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('ログイン状態を確認できませんでした。');
      const result = await response.json() as Session;
      if (!signal?.aborted) setSession(result);
    } catch {
      if (!signal?.aborted) setError('通信を確認して、もう一度お試しください。');
    } finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void loadSession(controller.signal);
    const expired = () => { setSession(current => current ? { ...current, user: null } : { configured: true, user: null }); setError('ログインの有効時間が過ぎました。もう一度ログインしてください。'); };
    const restored = (event: PageTransitionEvent) => { setSigningIn(false); if (event.persisted) { setSession(null); void loadSession(controller.signal); } };
    window.addEventListener('uchiwake:session-expired', expired);
    window.addEventListener('pageshow', restored);
    return () => { controller.abort(); window.removeEventListener('uchiwake:session-expired', expired); window.removeEventListener('pageshow', restored); };
  }, []);
  useEffect(() => { if (!loading && !session?.user) bootReady(); }, [loading, session]);
  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      sessionStorage.removeItem('uchiwake-demo-view');
      setSession(current => current ? { ...current, user: null } : null);
      setError('');
    } catch { setError('ログアウトできませんでした。通信を確認してもう一度お試しください。'); }
    finally { setSigningOut(false); }
  }
  async function updateProfile(name: string) {
    const response = await fetch('/api/auth/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }), signal: AbortSignal.timeout(10000) });
    notifySessionExpired(response);
    const data = await response.json() as { user?: User; error?: string };
    if (!response.ok || !data.user) throw new Error(data.error || '表示名を保存できませんでした');
    setSession(current => current ? { ...current, user: data.user! } : current);
  }
  if (loading) return <main className="login"><p className="login-status" role="status">ログイン状態を確認しています…</p></main>;
  if (session?.user) return <>{error && <div className="auth-notice" role="alert">{error}<button onClick={() => setError('')} aria-label="通知を閉じる">×</button></div>}{children(session.user, logout, signingOut, updateProfile)}</>;
  return <main className="login"><div className="login-panel"><Logo/><h1>AIで仕分け。<br/>家計のうちわけ。</h1><div className="login-actions"><button className="google-sign-in" disabled={!session?.configured || signingIn} aria-busy={signingIn} onClick={() => { setSigningIn(true); location.assign('/api/auth/google'); }}><GoogleMark/><span>{signingIn ? 'Googleに移動しています…' : 'Googleでログイン'}</span></button>{error && <p className="login-error" role="alert">{error}</p>}{session && !session.configured && <p className="login-status">Googleログインは現在準備中です。</p>}{!session && <button className="login-retry" onClick={() => { setError(''); void loadSession(); }}>もう一度試す</button>}</div></div></main>;
}
export function AccountSettings({ user, logout, signingOut, updateProfile }: AccountProps) {
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setName(user.name), [user.name]);
  useEffect(() => setImageFailed(false), [user.avatarUrl]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true); setStatus('');
    try { await updateProfile(name.trim()); setStatus('表示名を保存しました。'); }
    catch (error) { setStatus(error instanceof Error ? error.message : '表示名を保存できませんでした'); }
    finally { setSaving(false); }
  }
  return <section className="section settings-section">
    <h2 className="section-heading"><UserRound size={20} aria-hidden="true"/>アカウント</h2>
    <div className="account-details">
      {user.avatarUrl && !imageFailed ? <img className="account-avatar" src={user.avatarUrl} referrerPolicy="no-referrer" alt="Googleアカウントのアイコン" onError={() => setImageFailed(true)}/> : <span className="account-avatar" aria-hidden="true">{(user.name || user.email).slice(0, 1)}</span>}
      <div><p>{user.email}</p></div>
    </div>
    {!user.avatarUrl && <a className="account-reconnect" href="/api/auth/google">再ログインしてGoogleの画像を取得</a>}
    <form className="form account-form" onSubmit={event => void save(event)}>
      <label className="field"><span>表示名</span><input value={name} onChange={event => { setName(event.target.value); setStatus(''); }} required maxLength={100} autoComplete="nickname" disabled={saving}/></label>
      <button type="submit" className="settings-add-card" disabled={saving || signingOut || !name.trim() || name.trim() === user.name}>{saving ? '保存中…' : '表示名を保存'}</button>
      <p className="account-save-status" role="status" aria-live="polite">{status}</p>
    </form>
    <button type="button" className="settings-add-card" disabled={signingOut || saving} onClick={() => void logout()}><LogOut size={17}/>{signingOut ? 'ログアウト中…' : 'ログアウト'}</button>
  </section>;
}
