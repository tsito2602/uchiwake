import { useId, type CSSProperties } from 'react';
import { cardColors } from './card-colors';

export function ColorSwatchPicker({value,onChange,disabled,options=cardColors}:{value:string;onChange:(value:string)=>void;disabled?:boolean;options?:readonly {value:string;label:string}[]}) {
  const name=useId();
  return <fieldset className="color-picker" disabled={disabled}>
    <legend>アイコンのカラー</legend>
    <div className="color-swatches">{options.map(color=><label className="color-swatch" key={color.value} style={{'--swatch-color':color.value} as CSSProperties}>
      <input type="radio" name={name} value={color.value} checked={value===color.value} onChange={()=>onChange(color.value)} aria-label={color.label}/>
      <span aria-hidden="true"><span className="swatch-check">✓</span></span>
    </label>)}</div>
  </fieldset>;
}
