import { displayColor } from './display-color';
import { useId, type CSSProperties } from 'react';
import { cardColors, paletteColorLabel } from './card-colors';

export function ColorSwatchPicker({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  const name=useId();
  return <fieldset className="color-picker" disabled={disabled}>
    <legend>アイコンのカラー<span className="color-picker-value"><i aria-hidden="true" style={{background:displayColor(value)}}/>{paletteColorLabel(value)}</span></legend>
    <p className="palette-hint">ライト・ダークに合わせて見やすい色に切り替わります。</p>
    <div className="color-swatches">{cardColors.map(color=><label className="color-swatch" key={color.value} style={{'--swatch-color':displayColor(color.value)} as CSSProperties}>
      <input type="radio" name={name} value={color.value} checked={value===color.value} onChange={()=>onChange(color.value)} aria-label={color.label}/>
      <span aria-hidden="true"><span className="swatch-check">✓</span></span>
    </label>)}</div>
  </fieldset>;
}
