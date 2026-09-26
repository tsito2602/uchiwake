// Only fixed messages/codes reach the client or logs, never upstream messages or input.
const messages={
  output_limit:'AIの出力上限に達したため、明細の受信を完了できませんでした。',
  content_filter:'AIが画像の読み取りを中断したため、明細の受信を完了できませんでした。',
  refusal:'AIが画像の読み取りに応じなかったため、明細の受信を完了できませんでした。',
  invalid_result:'AIから受信した明細の形式を確認できませんでした。',
  disconnected:'AIとの接続が途中で切れたため、明細の受信を完了できませんでした。',
  incomplete:'AIが処理を完了しなかったため、明細の受信を完了できませんでした。',
  rate_limit:'AIのリクエスト制限に達しました。少し待ってからお試しください。',
  quota:'OpenAI APIの利用枠を確認してください。残高または利用上限に達しています。',
  authentication:'OpenAI APIキーの認証に失敗しました。キーの設定を確認してください。',
  permission:'このAPIキーでは選択したAIを利用できません。モデルの利用権限を確認してください。',
  upstream:'AI側でエラーが発生し、明細の受信を完了できませんでした。'
} as const;
export type ImportErrorCode=keyof typeof messages;
export class ImportError extends Error {
  constructor(public code:ImportErrorCode){super(messages[code]);}
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
  console.error(JSON.stringify({event:'statement_import_failed',code:error.code,received_entries:received,...(status?{status}:{})}));
}
