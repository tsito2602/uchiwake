import type { EntryDraft } from '../src/domain';
import type { StatementFile } from '../src/statement-files';
import { applicableRules, broadMerchant, matchingRule, type JevReviewCause } from '../src/import-policy';
import { classificationMemoryForSpace } from './classification-memory';
import { extractLuna, extractedEntry, importStream } from './luna-jev-import';
import { ImportError, describeAIFailure } from './import-errors';
import type { AIBindings } from './ai-bindings';

export function lunaClassifiedEntry(raw:unknown,fileCount:number,categories:string[],review:string):EntryDraft {
  const entry=extractedEntry(raw,fileCount,review);
  const value=raw as {category?:unknown;basis?:unknown};
  if(typeof value.category!=='string'||!categories.includes(value.category)||(typeof value.basis!=='string'||!['context','merchant','unknown'].includes(value.basis)))throw new ImportError('classification_result');
  const basis=value.basis as 'context'|'merchant'|'unknown';
  const causes:JevReviewCause[]=[];
  if(!entry.title)causes.push('missing_merchant');
  if(broadMerchant(entry.title)&&(!entry.import_meta!.context||basis!=='context'))causes.push('missing_purchase_context');
  if(basis==='unknown'||value.category===review||(basis==='context'&&!entry.import_meta!.context))causes.push('low_evidence');
  const category=causes.length?review:value.category;
  return {...entry,category,import_meta:{...entry.import_meta!,classification_basis:basis,status:causes.length?'review':'classified',original_category:category,review_causes:causes,
    ...(causes.length?{reason:causes.includes('missing_purchase_context')?'このお店の名前だけでは購入内容を特定できません。購入履歴・レシートを確認して費目を選んでください。':'読み取った情報だけでは費目を決められません。購入履歴・レシートを確認して費目を選んでください。'}:{})}};
}

export function lunaImportStream(env:AIBindings&{DB:D1Database},space:string,files:StatementFile[],categories:string[],review:string,recheck:string|undefined,requestSignal:AbortSignal):Response {
  const response=importStream(requestSignal,async(signal,send)=>{
    const memory=await classificationMemoryForSpace(env.DB,space,categories.filter(name=>name!==review)).catch(()=>{throw new ImportError('classification_memory');});
    signal.throwIfAborted();
    const entries:EntryDraft[]=[];
    const result=await extractLuna(env,files,categories,review,recheck,signal,entry=>{
      const base={...entry,import_meta:{...entry.import_meta!,history:memory.history(entry.title)}};
      const rule=matchingRule(base,memory.rules);
      const row:EntryDraft=rule?{...base,category:rule.category,import_meta:{...base.import_meta,status:'classified',original_category:rule.category,rule_id:rule.id,review_causes:[],reason:undefined}}:
        applicableRules(base,memory.rules).length?{...base,category:review,import_meta:{...base.import_meta,status:'review',original_category:review,review_causes:[],reason:'保存された自動分類ルールの費目が競合しています。今回の費目を選び、スペース設定でルールを整理してください。'}}:base;
      entries.push(row);send({type:'entry',entry:row});
    },text=>send({type:'reasoning',text}),{
      properties:{category:{type:'string',enum:categories},basis:{type:'string',enum:['context','merchant','unknown']}},
      instructions:`各行の費目も読み取りと同時に決める。categoryは次の費目から正確に一つ選ぶ：${JSON.stringify(categories)}。
原本に購入内容がありそれで判断したらbasis="context"。店名から業態・用途を特定できる専門店ならbasis="merchant"として分類してよい。例えばヤオコーなどの食品スーパーは食費、オートバックスなどの自動車用品・整備店は車に対応する費目を選ぶ。専門店で店名しかないことだけを理由に要確認にしない。ただし買った商品を創作してcontextに書かない。
Amazon・総合通販・コンビニ・百貨店・決済代行など購入内容が多様な店名だけでは分類しない。原本に購入内容がなければbasis="unknown"、category=${JSON.stringify(review)}。店名・業態が分からない場合や複数の費目を区別できない場合も同様。その他は用途が分かり既存費目に当てはまらない場合に限る。数値の信頼度や説明文は生成しない。`,
      entry:raw=>{
        try{return lunaClassifiedEntry(raw,files.length,categories,review);}
        catch(error){throw describeAIFailure(error instanceof ImportError?error:new ImportError('invalid_result'),'openai/gpt-6-luna','validation');}
      }
    });
    return {...result,entries,confirmed_total:result.source_total?.amount??0};
  });
  response.headers.set('X-Import-Pipeline','luna');
  return response;
}
