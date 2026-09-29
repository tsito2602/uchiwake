import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Info } from 'lucide-react';
import { pathData, FIRST_STROKE_OFFSET_Y } from './brand-motion';
import { checkAppUpdate, currentVersion, type AppVersion } from './app-update';

export function AppUpdateSettings() {
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [available, setAvailable] = useState<AppVersion | null>(null);
  const [status, setStatus] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function check() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setChecking(true);
    setStatus('');
    try {
      const latest = await checkAppUpdate(currentVersion, AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]));
      if (controller.signal.aborted) return;
      setAvailable(latest);
      setStatus(latest ? '新しいバージョンを利用できます。' : '最新のバージョンです。');
    } catch {
      if (!controller.signal.aborted) setStatus('更新を確認できませんでした。通信を確認して、もう一度お試しください。');
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setChecking(false);
    }
  }
  function update() {
    setUpdating(true);
    // HTML and the version manifest are no-store; hashed assets load the new build.
    // Reload only on this explicit action, preserving local preferences and server data.
    window.location.reload();
  }
  return <section className="section settings-section app-update-settings">
    <h2 className="section-heading"><Info size={20} aria-hidden="true"/>アプリ</h2>
    <button type="button" className="settings-add-card" disabled={checking || updating} onClick={available ? update : () => void check()}>
      {available ? <Download size={18} aria-hidden="true"/> : <RefreshCw size={18} aria-hidden="true"/>}
      {updating ? '更新中…' : checking ? '確認中…' : available ? '新しいバージョンに更新' : '更新を確認'}
    </button>
    <p className="app-update-status" role="status" aria-live="polite">{status}</p>
  </section>;
}

export function AppInfo() {
  return <footer className="settings-app-info">
    <svg className="settings-app-mark login-brand-icon" viewBox="298 179 661 849" aria-hidden="true">{pathData.map((d, i) => <path key={i} d={d} transform={i === 0 ? `translate(0 ${FIRST_STROKE_OFFSET_Y})` : undefined} className={i === 2 ? 'mid' : i === 3 ? 'pale' : 'ink'}/>)}</svg>
    <strong>uchiwake</strong><small>バージョン {currentVersion.version}</small>
  </footer>;
}
