export const statementReviewReasonCodes=['purchase_unknown','merchant_unknown','multiple_categories','none'] as const;
export type StatementReviewReason=typeof statementReviewReasonCodes[number];

const messages={
  purchase_unknown:'購入内容が分からないため、費目を決められませんでした。購入履歴・レシートを確認して費目を選んでください。',
  merchant_unknown:'店名・支払先を特定できませんでした。利用したお店やサービスを確認して費目を選んでください。',
  multiple_categories:'複数の費目が候補に残っています。購入内容や用途を確認して費目を選んでください。'
};
export function statementReviewReasonText(reason:unknown):string|undefined {
  return typeof reason==='string'&&Object.hasOwn(messages,reason)?messages[reason as keyof typeof messages]:undefined;
}
