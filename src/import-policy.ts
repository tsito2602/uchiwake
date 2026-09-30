import type { EntryDraft } from './domain';
import { statementReviewReasonText } from './statement-review-reason';

export type ImportSource={file:number;page:number;row:number;excerpt:string};
export type JevReviewCause='low_confidence'|'low_evidence'|'missing_merchant'|'missing_purchase_context';
export type ImportMeta={
  id:string;source:ImportSource;context:string;amount_uncertain:boolean;
  status:'pending'|'classifying'|'classified'|'review';original_category?:string;
  confidence?:number;noul?:number;review_causes?:JevReviewCause[];candidates?:{category:string;score:number}[];history?:string[];
  classification_basis?:'context'|'merchant'|'unknown';
  reason?:string;rule_id?:string;remember_rule?:boolean;rule_keyword?:string;
};
export type SourceTotal={amount:number;file:number;page:number;label:string};
export type ClassificationRule={id:string;merchant_key:string;context_keyword:string;category:string};
export const AUTO_CLASSIFY_CONFIDENCE=0.85; // Provisional; tune against reviewed imports, not as a correctness probability.
export const AUTO_CLASSIFY_EVIDENCE=0.9;
export const reviewCauseLabel=(cause:JevReviewCause)=>({low_confidence:'候補が複数',low_evidence:'根拠不足',missing_merchant:'店名不明',missing_purchase_context:'購入内容不明'})[cause];
export const merchantKey=(title:string)=>title.trim().toLowerCase();
export const broadMerchant=(title:string)=>/amazon|アマゾン|楽天|rakuten|yahoo|ヤフー|paypal|ペイパル|メルカリ|mercari|コンビニ|セブン.?イレブン|ファミリーマート|ローソン/i.test(title);
// Explicit product policy, separate from learned history or broad-store rules.
export function foodDefaultMerchant(title:string):boolean {
  const name=title.normalize('NFKC').toLowerCase().replace(/[\s・･.\-‐‑–—]/g,'');
  if(/amazon|アマゾン|楽天|rakuten|yahoo|ヤフー|paypal|ペイパル|メルカリ|mercari/.test(name))return false;
  if(/銀行|bank|atm|チケット|ticket|トラベル|カード|券売機|乗車券|切符/.test(name))return false;
  return /コンビニ|セブンイレブン|7eleven|seveneleven|ファミリーマート|ファミマ|familymart|ローソン|lawson|ミニストップ|ministop|デイリーヤマザキ|ニューデイズ|newdays|セイコーマート|自販機|自動販売機|ジハンキ|飲料ベンダー/.test(name);
}
export const rowTotal=(entries:EntryDraft[])=>entries.reduce((sum,row)=>sum+row.amount,0);
export function applicableRules(entry:EntryDraft,rules:ClassificationRule[]) {
  const key=merchantKey(entry.title),context=merchantKey(entry.import_meta?.context||'');
  return rules.filter(rule=>rule.merchant_key===key&&(!broadMerchant(entry.title)||!!rule.context_keyword)&&(!rule.context_keyword||context.includes(rule.context_keyword)));
}
export function matchingRule(entry:EntryDraft,rules:ClassificationRule[]) {
  const matches=applicableRules(entry,rules);
  // Conflicting explicit rules must be reviewed, never resolved by database order.
  return new Set(matches.map(rule=>rule.category)).size===1?matches.sort((a,b)=>b.context_keyword.length-a.context_keyword.length)[0]:undefined;
}
export function validRule(entry:EntryDraft) {
  if(entry.import_meta?.rule_keyword!==undefined&&typeof entry.import_meta.rule_keyword!=='string')return false;
  if(entry.import_meta?.context!==undefined&&typeof entry.import_meta.context!=='string')return false;
  const keyword=merchantKey(entry.import_meta?.rule_keyword||'');
  return !!entry.title&&keyword.length<=100&&(!keyword||merchantKey(entry.import_meta?.context||'').includes(keyword))&&(!broadMerchant(entry.title)||(!!keyword&&!merchantKey(entry.title).includes(keyword)));
}
export function reviewReasons(entry:EntryDraft,reviewCategory:string):string[] {
  const reasons:string[]=[];
  if(!entry.title.trim())reasons.push('店名・内容を読み取れませんでした。元の明細を見て入力してください。');
  if(!entry.amount||entry.import_meta?.amount_uncertain)reasons.push('金額を確定できませんでした。元の明細の金額を確認して入力してください。');
  if(!entry.spent_on)reasons.push('利用日を読み取れませんでした。元の明細で確認してください。');
  if(entry.category===reviewCategory)reasons.push(statementReviewReasonText(entry.review_reason)||entry.import_meta?.reason||'費目を絞り込めませんでした。購入内容に合う費目を選んでください。');
  return reasons;
}

export function jevProbabilityTotal(values:number[]) {
  const sum=values.reduce((total,value)=>total+value,0);
  // Preserve the 0.01 distribution tolerance. Account only for binary floating
  // point roundoff in the non-negative sum and subtraction (e.g. 1 - 0.99).
  // Do not round provider values to a fixed number of decimal places.
  const roundoff=Number.EPSILON*(values.length+1)*Math.max(1,sum);
  return {sum,valid:Number.isFinite(sum)&&Math.abs(sum-1)<=0.01+roundoff};
}

// Jev confidence measures concentration, not observed accuracy. Validate the whole
// distribution and require evidence independently before applying its top choice.
export function jevDecision(raw:unknown,allowed:string[],entry:EntryDraft,reviewCategory:string):EntryDraft {
  const answers=(raw as {answers?:Record<string,any>})?.answers;
  const answer=answers?.category,sufficient=answers?.sufficient;
  if(answer?.type!=='choice'||!allowed.includes(answer.choice)||typeof answer.confidence!=='number'||!Number.isFinite(answer.confidence)||answer.confidence<0||answer.confidence>1||!answer.probabilities||typeof answer.probabilities!=='object'||Array.isArray(answer.probabilities)||sufficient?.type!=='noul'||typeof sufficient.noul!=='number'||!Number.isFinite(sufficient.noul)||sufficient.noul<0||sufficient.noul>1)throw new Error('invalid Jev result');
  const probabilities=answer.probabilities as Record<string,unknown>;
  if(Object.keys(probabilities).length!==allowed.length||allowed.some(category=>typeof probabilities[category]!=='number'||!Number.isFinite(probabilities[category])||Number(probabilities[category])<0||Number(probabilities[category])>1))throw new Error('invalid Jev probabilities');
  const candidates=allowed.map(category=>({category,score:Number(probabilities[category])})).sort((a,b)=>b.score-a.score);
  if(!jevProbabilityTotal(candidates.map(item=>item.score)).valid||Number(probabilities[answer.choice])+0.000001<candidates[0].score)throw new Error('invalid Jev choice');
  const causes:JevReviewCause[]=[];
  if(answer.confidence<AUTO_CLASSIFY_CONFIDENCE)causes.push('low_confidence');
  if(sufficient.noul<AUTO_CLASSIFY_EVIDENCE)causes.push('low_evidence');
  if(!entry.title)causes.push('missing_merchant');
  if(broadMerchant(entry.title)&&!entry.import_meta?.context.trim())causes.push('missing_purchase_context');
  const certain=causes.length===0;
  const reasons={low_confidence:'複数の費目が候補に残っています。',low_evidence:'費目を決める根拠が十分ではありません。',missing_merchant:'店名・内容が不明です。',missing_purchase_context:'このお店の名前だけでは購入内容を特定できません。'};
  return {...entry,category:certain?answer.choice:reviewCategory,import_meta:{...entry.import_meta!,status:certain?'classified':'review',confidence:answer.confidence,noul:sufficient.noul,review_causes:causes,candidates:candidates.slice(0,3),original_category:certain?answer.choice:reviewCategory,...(!certain?{reason:causes.map(cause=>reasons[cause]).join('')+'購入履歴・レシートを確認して費目を選んでください。'}:{})}};
}
