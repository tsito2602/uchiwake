// Money set like a printed statement: the yen sign and separators sit smaller than the figures.
export function Money({value,className}:{value:number;className?:string}) {
  const text=Math.round(value).toLocaleString('ja-JP');
  return <span className={`money${className?` ${className}`:''}`}><span className="money-accessible">¥{text}</span><span className="money-yen" aria-hidden="true">¥</span>{Array.from(text).map((char,index)=><span key={index} className={/[0-9-]/.test(char)?undefined:'money-sep'} aria-hidden="true">{char}</span>)}</span>;
}
