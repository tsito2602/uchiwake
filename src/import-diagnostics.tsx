import { useState } from 'react';

export function ImportDiagnostics({result}:{result:string}) {
  const [copyLabel,setCopyLabel]=useState('診断結果をコピー');
  if(!result)return null;
  return <details className="import-diagnostics">
    <summary>取り込みの診断</summary>
    <textarea aria-label="AI取り込みの診断結果" readOnly value={result} rows={7}/>
    <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(result);setCopyLabel('コピーしました');}catch{setCopyLabel('結果を選択してコピーしてください');}}}>{copyLabel}</button>
  </details>;
}
