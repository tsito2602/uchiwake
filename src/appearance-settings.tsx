import {HapticTouch} from './haptic-touch';
import {haptic} from './haptics';
import {SegmentSelection} from './segment-selection';
import { useSyncExternalStore,type CSSProperties } from 'react';
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
    <div className="appearance-control" role="group" aria-label="表示モード" style={{'--appearance-index':['system','light','dark'].indexOf(preference)} as CSSProperties}><SegmentSelection index={['system','light','dark'].indexOf(preference)}/>
      {([
        { value: 'system', label: '自動', accessibleLabel: '端末に合わせる', icon: Monitor },
        { value: 'light', label: 'ライト', accessibleLabel: 'ライト', icon: Sun },
        { value: 'dark', label: 'ダーク', accessibleLabel: 'ダーク', icon: Moon },
      ] as const).map(({ value, label, accessibleLabel, icon: Icon }) =>
        <button type="button" key={value} aria-label={accessibleLabel}
          aria-pressed={preference === value} onClick={() => {if (preference !== value) haptic(); setThemePreference(value);}}>
          {preference !== value && <HapticTouch/>}<Icon size={20} aria-hidden="true"/>{label}
        </button>)}
    </div>
  </section>;
}
