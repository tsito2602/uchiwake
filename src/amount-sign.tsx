// iOS number keypads have no minus key, so refunds get their sign from this button.
export function SignToggle({value,label,disabled,onFlip}:{value:number;label:string;disabled?:boolean;onFlip:()=>void}) {
  return <button type="button" className="amount-sign" aria-label={`${label}をマイナスにする`} aria-pressed={value<0} disabled={disabled||!Number.isFinite(value)||value===0} onClick={onFlip}>−</button>;
}

export const flipAmountText=(text:string)=>text.trim().startsWith('-')?text.trim().slice(1):`-${text.trim()}`;
