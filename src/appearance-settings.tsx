import { useSyncExternalStore } from 'react';
import { Monitor, Sun, Moon, Paintbrush } from 'lucide-react';
import { getThemePreference, setThemePreference, THEME_EVENT } from './theme';

const subscribe = (listener: () => void) => {
  window.addEventListener(THEME_EVENT, listener);
  return () => window.removeEventListener(THEME_EVENT, listener);
};

export function AppearanceSettings() {
  const preference = useSyncExternalStore(subscribe, getThemePreference);
  return <section className="section settings-section appearance-settings">
    <h2 className="section-heading"><Paintbrush size={20} aria-hidden="true"/>外観</h2>
    <div className="appearance-control" role="group" aria-label="表示モード">
      {([
        { value: 'system', label: '自動', accessibleLabel: '端末に合わせる', icon: Monitor },
        { value: 'light', label: 'ライト', accessibleLabel: 'ライト', icon: Sun },
        { value: 'dark', label: 'ダーク', accessibleLabel: 'ダーク', icon: Moon },
      ] as const).map(({ value, label, accessibleLabel, icon: Icon }) =>
        <button type="button" key={value} aria-label={accessibleLabel}
          aria-pressed={preference === value} onClick={() => setThemePreference(value)}>
          <Icon size={20} aria-hidden="true"/>{label}
        </button>)}
    </div>
  </section>;
}
