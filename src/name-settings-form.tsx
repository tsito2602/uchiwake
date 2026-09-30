import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type NameSaveAction = { label: string; disabled: boolean; saving: boolean; onAction: () => void };

type Props = {
  label: string;
  value: string;
  maxLength: number;
  disabled?: boolean;
  showLabel?: boolean;
  autoComplete?: string;
  className?: string;
  onSave: (name: string) => Promise<void>;
  onActionChange?: (action: NameSaveAction | undefined) => void;
};

export function NameSettingsForm({ label, value, maxLength, disabled = false, showLabel = true, autoComplete, className = '', onSave, onActionChange }: Props) {
  const [name, setName] = useState(value);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const changed = name.trim() !== value.trim();
  const visible = changed || saving;
  const saveDisabled = disabled || saving || !changed || !name.trim();
  const saveRef = useRef(save); saveRef.current = save;
  const action = useMemo<NameSaveAction | undefined>(() => visible ? {
    label: saving ? '保存中…' : `${label}を保存`, disabled: saveDisabled, saving, onAction: () => void saveRef.current(),
  } : undefined, [visible, label, saving, saveDisabled]);
  useLayoutEffect(() => { onActionChange?.(action); }, [onActionChange, action]);
  useLayoutEffect(() => () => onActionChange?.(undefined), [onActionChange]);
  useEffect(() => setName(value), [value]);

  async function save() {
    if (saveDisabled) return;
    const nextName = name.trim();
    setSaving(true); setStatus(''); setFailed(false);
    try {
      await onSave(nextName);
      setName(nextName);
      setStatus(`${label}を保存しました。`);
    } catch (error) {
      setFailed(true);
      setStatus(error instanceof Error ? error.message : `${label}を保存できませんでした`);
    } finally { setSaving(false); }
  }

  return <form className={`form name-settings-form ${className}`} onSubmit={event => { event.preventDefault(); void save(); }}>
    <label className="field">
      {showLabel && <span>{label}</span>}
      <input aria-label={showLabel ? undefined : label} value={name} onChange={event => { setName(event.target.value); setStatus(''); setFailed(false); }} required maxLength={maxLength} autoComplete={autoComplete} disabled={disabled || saving}/>
    </label>
    {!onActionChange && <div className="name-save-reveal" data-visible={visible} aria-hidden={!visible} inert={!visible}>
      <div><div className="name-save-action">
        <button type="submit" className="settings-add-card" disabled={saveDisabled} aria-busy={saving}>{saving ? '保存中…' : `${label}を保存`}</button>
      </div></div>
    </div>}
    <p className="name-save-status" role={failed ? 'alert' : 'status'}>{status}</p>
  </form>;
}
