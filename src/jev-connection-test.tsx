import { useState } from 'react';

export function JevConnectionTest({busy,result,onRun}:{busy:boolean;result:string;onRun:()=>void}) {
  const [copyLabel,setCopyLabel]=useState('診断結果をコピー');
  return <section className="jev-connection-test" aria-label="Jev接続テスト">
    <button type="button" disabled={busy} onClick={()=>{setCopyLabel('診断結果をコピー');onRun();}}>{busy?'接続を確認中…':'Jev接続テスト'}</button>
    <small>画像を使わず、短いサンプルで仕分けの接続を確認します。AI呼び出しは1回です。</small>
    {result&&<><textarea aria-label="接続テストの診断結果" readOnly value={result} rows={7}/><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(result);setCopyLabel('コピーしました');}catch{setCopyLabel('結果を選択してコピーしてください');}}}>{copyLabel}</button></>}
  </section>;
}
