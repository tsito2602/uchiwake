// Only fixed messages/codes reach the client or logs, never upstream messages or input.
const messages={
  configuration:'Cloudflare AIの接続設定を確認してください。',
  timeout:'AIの読み取り応答が途絶えたため中断しました。ファイルは選択したままです。もう一度取り込んでください。',
  output_limit:'AIの出力上限に達したため、明細の受信を完了できませんでした。',
  content_filter:'AIが明細の読み取りを中断したため、明細の受信を完了できませんでした。',
  refusal:'AIが明細の読み取りに応じなかったため、明細の受信を完了できませんでした。',
  invalid_result:'AIから受信した明細の形式を確認できませんでした。',
  classification_result:'AIから受信した費目の仕分け結果を確認できませんでした。',
  classification_memory:'保存された分類設定を読み込めませんでした。',
  disconnected:'AIとの接続が途中で切れたため、明細の受信を完了できませんでした。',
  incomplete:'AIが処理を完了しなかったため、明細の受信を完了できませんでした。',
  rate_limit:'AIのリクエスト制限に達しました。少し待ってからお試しください。',
  quota:'AIサービスの利用枠を確認してください。残高または利用上限に達しています。',
  authentication:'AIサービスの認証に失敗しました。接続設定を確認してください。',
  permission:'このAPIキーでは選択したAIを利用できません。モデルの利用権限を確認してください。',
  upstream:'AI側でエラーが発生し、明細の受信を完了できませんでした。'
} as const;
export type ImportErrorCode=keyof typeof messages;
export type ImportDiagnostics=Partial<ReturnType<typeof import('./jev').jevDiagnostics>>&{
  failure?:{model:'luna'|'jev'|'unknown';stage:'request'|'response'|'stream'|'validation';http_status:number|null;provider_code:string;attempt?:number;source?:{file:number;page:number;row:number}};
  run?:{rechecking:boolean;received_entries:number};
  classification?:{evaluated:number;classified:number;review:number;low_confidence:number;low_evidence:number;missing_merchant:number;missing_purchase_context:number;with_purchase_context:number;retries:number;confidence_min:number|null;confidence_max:number|null;noul_min:number|null;noul_max:number|null};
};
export class ImportError extends Error {
  retryAfterMs?:number;
  constructor(public code:ImportErrorCode,public diagnostics?:ImportDiagnostics){super(messages[code]);}
}
// Do not copy exception messages, arbitrary provider codes, request IDs or bodies.
export function describeAIFailure(error:ImportError,model:string,stage:NonNullable<ImportDiagnostics['failure']>['stage'],status?:unknown,code?:unknown) {
  const knownCodes=['insufficient_quota','rate_limit_exceeded','invalid_api_key','model_not_found','permission_denied','server_error','internal_server_error','overloaded_error','service_unavailable'];
  if(!error.diagnostics?.failure)error.diagnostics={...error.diagnostics,failure:{
    model:model==='typesafe/jev'?'jev':model==='openai/gpt-6-luna'?'luna':'unknown',stage,
    http_status:typeof status==='number'&&Number.isInteger(status)&&status>=100&&status<=599?status:null,
    provider_code:typeof code==='string'&&knownCodes.includes(code)?code:code==null?'absent':'unrecognized'
  }};
  if(error.code==='upstream'&&error.diagnostics.failure?.model!=='unknown')error.message=error.diagnostics.failure?.model==='jev'?'費目の仕分け中にAIサービスでエラーが発生したため、取り込みを中断しました。':'明細の読み取り中にAIサービスでエラーが発生したため、取り込みを中断しました。';
  return error;
}
export function upstreamImportError(code:unknown,status?:number):ImportError {
  if(code==='insufficient_quota')return new ImportError('quota');
  if(code==='rate_limit_exceeded'||status===429)return new ImportError('rate_limit');
  if(code==='invalid_api_key'||status===401)return new ImportError('authentication');
  if(code==='model_not_found'||code==='permission_denied'||status===403)return new ImportError('permission');
  return new ImportError('upstream');
}
export function incompleteImportError(reason:unknown):ImportError {
  return new ImportError(reason==='max_output_tokens'?'output_limit':reason==='content_filter'?'content_filter':'incomplete');
}
export function logImportFailure(error:ImportError,received:number,status?:number):void {
  console.error(JSON.stringify({event:'statement_import_failed',code:error.code,received_entries:received,...(status?{status}:{}),...(error.diagnostics?{diagnostics:error.diagnostics}:{})}));
}
