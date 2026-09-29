import { useEffect, useState } from 'react';
import type { Api } from './space-api';
import type { ClassificationRule } from './import-policy';

export function ClassificationSettings({api,disabled}:{api:Api;disabled:boolean}) {
  const [rules,setRules]=useState<ClassificationRule[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;void api<{rules:ClassificationRule[]}>('/classification/rules').then(result=>{if(active)setRules(result.rules);}).catch(()=>{if(active)setError('分類ルールを読み込めませんでした');});return()=>{active=false;};},[api]);
  const remove=async(id:string)=>{setBusy(true);setError('');try{await api(`/classification/rules/${encodeURIComponent(id)}`,{method:'DELETE'});setRules(current=>current.filter(rule=>rule.id!==id));}catch{setError('ルールを削除できませんでした');}finally{setBusy(false);}};
  return <section className="section settings-section"><h2>自動分類ルール</h2><p className="subtle">取り込みの確認画面で「今後もこの条件で分類」を選んだルールです。通常の修正履歴は候補の表示だけに使います。</p>
    {error&&<p role="alert">{error}</p>}
    {!rules.length&&!error&&<p className="subtle">自動分類ルールはまだありません。</p>}
    {rules.map(rule=><div className="classification-rule" key={rule.id}><span><strong>{rule.merchant_key} → {rule.category}</strong><small>{rule.context_keyword?`購入内容に「${rule.context_keyword}」を含む場合`:'この店名と一致する場合'}</small></span><button disabled={disabled||busy} onClick={()=>void remove(rule.id)}>削除</button></div>)}
  </section>;
}
