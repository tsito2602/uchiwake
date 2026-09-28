import type { ReactNode } from 'react';

export function SettingsToggle({label,checked,disabled,onChange,className=''}:{label:ReactNode;checked:boolean;disabled?:boolean;onChange:(checked:boolean)=>void;className?:string}) {
 return <label className={`card-settings-active ${className}`}><span className="settings-toggle-label">{label}</span><input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)}/><span className="card-active-switch" aria-hidden="true"><span className="card-active-switch-thumb"/></span></label>;
}
