# Cloudflare経由のAI取り込み

## 導入前に用意するもの

1. `uchiwake-staging` Workerと同じCloudflareアカウントに、AI Gateway **`uchiwake`** を作成する。
2. AI Gatewayの **Unified Billing** にクレジットを用意する。この構成ではOpenAI・TypeSafe個別のAPIキーは不要。同じGatewayに既存のBYOK設定がある場合は、その課金経路が優先されるので確認する。
3. Cloudflareへログインした開発端末で、下記のDB移行とデプロイを実行する。アカウント情報・APIトークンをチャットやGitに貼る必要はない。
4. 実API確認用に、合計あり・合計なし・重なりのある画像・同日同店同額の別取引・返金・Amazonなど購入内容不明の例を用意する。画像、PDF、CSVの既存入力形式に対応する。

`wrangler.staging.jsonc` の追加設定：

```json
{
  "ai": { "binding": "AI" },
  "vars": {
    "APP_ENV": "staging",
    "AI_IMPORT_PROVIDER": "cloudflare",
    "AI_GATEWAY_ID": "uchiwake"
  }
}
```

Gateway名を変える場合は `AI_GATEWAY_ID` も変更する。Workers Buildsで `--keep-vars` を使用している場合は、ダッシュボードに同名の古い環境変数が残っていないか確認する。

```sh
git switch feat/luna-jev-import
git pull --ff-only
npm ci
npx wrangler login
npm run db:staging
npm run deploy:staging
```

DB移行は `0012_import_classification.sql`。分類の修正履歴・明示ルールの2表と、保存済み明細の費目編集を記録するトリガーを追加する。金額・既存の明細行は書き換えない。DB移行はWorkers Buildsの自動デプロイに含まれないので、stagingへのマージ前に実行する。

デプロイ後：`https://uchiwake-staging.tsito-apps.workers.dev/`

## 担当と判断

| 処理 | 担当・条件 |
| --- | --- |
| 画像・PDF・CSV読み取り | Luna `openai/gpt-6-luna`。行・出典・購入内容・明示合計を構造化して返す |
| 表記の正規化・合計計算 | コード。返金の符号、整数金額、出典を検証 |
| 重なり | Lunaが明細番号・前後関係・位置を確認。同日・店名・金額だけで統合しない。コードも同一出典の再送を吸収 |
| 明示ルール | 店名と購入内容の条件が一致した場合だけ適用。競合は要確認 |
| 費目の判定 | Jev `typesafe/jev`。choiceと分布、confidence、根拠の十分さのnoulを取得 |
| 自動適用 | confidence ≥ 0.85、根拠noul ≥ 0.90、入力の根拠あり。いずれも暫定値であり正答率ではない |
| Amazonなど | 店名だけでは自動分類しない。購入内容の引用と十分な根拠が必要 |
| 再読み取り | 差額・不明な読取値・画像/PDFの未確定分類があればLunaで最大1回。合計に合わせた金額の創作は禁止 |
| 最終保存 | ユーザーが費目・金額を直し、原本確認チェック後に保存 |

Jevの `probabilities` は候補ごとの割合、`confidence` は分布の集中度。最大の割合を正答確率とみなさない。返却形式・全候補・分布の合計・最大候補の整合性を検証する。API障害・不完全な応答は取り込みエラーにし、要確認として完了させない。

明示された同じ請求範囲の合計だけを照合に使う。精算対象外の費目もこの照合には含める。合計がなければ `source_total=null` とし、行の追加・削除・修正に表示合計が追従する。日付の空白期間や件数だけから欠落を推測しない。再読で原本合計が消えたり異なる値になっても、都合のよい合計への置き換えで不一致を解消しない。

## 画面と修正履歴

- 行は実際に抽出できた順に追加し、待機→仕分け中→分類済み/要確認を同じ行で更新する。実処理に人工的な待ち時間は入れない。
- 読み取りと仕分けは独立した2本の進行表示にし、金額確認は両方の完了後の工程として表示する。全行の受信が完了するまでは割合を推測せず、完了後は仕分け済み件数/全件数を反映する。
- 進行表示の下に実際の処理内容と経過時間を表示する。再読が始まる場合は金額差・不鮮明な読み取り・購入内容の確認のどれが理由かを案内する。
- 要確認には理由、上位費目候補、以前の修正候補、該当ファイル/ページ/行と引用を表示する。金額不一致には差額を表示する。元画像を展開、PDFをダウンロード、CSVを参照できる。
- 通常の費目修正はその取引だけに適用。修正履歴は同じスペースの同じ店名に限り直近5件から候補を表示し、Jev入力にも自動ルールにも変換しない。
- 「今後もこの条件で分類」は初期状態オフ。保存時にだけルールを登録する。Amazon等では、読み取った購入内容の具体的な語を条件にする必要がある。
- 自動分類ルールはスペース設定から削除できる。スペースの認証・権限確認を全APIで行う。費目名の変更は履歴・ルールにも反映する。
- 画像、PDF、CSV原本とJev出力はD1に保存しない。修正履歴は店名・変更前後の費目、ルールは店名・条件・費目を保存する。Gatewayへの各呼び出しでログ収集・キャッシュを無効にする。

## 費用と検証

通常はLunaの読取1回と、明示ルールがない行ごとのJev呼び出し。Jevは最大4件ずつ並行実行する。修正履歴はモデルに送らない。確認理由はコードのテンプレートで作る。再読後も購入内容・金額等が同じ行はJevの結果を再利用する。

Lunaの受信とJevの実行待ちは分離している。Jevが4件とも応答待ちでもLunaの受信を続け、受信済みの行を表示する。追加のモデル呼び出しや推論設定の変更は行わない。

再読み取りが必要なケースではLunaに原本をもう一度送るため、その分の入力・出力が増える。実費はファイルの量と再読の頻度に依存する。ファイル数・行数にアプリ独自の一律制限は設けていないが、プロバイダー自身の制限で処理できない場合はエラーを表示する。

`npm run check` でビルド、型チェック、回帰テストを実行する。追加テストは `tests/luna-jev-import.test.mjs` と確認UIのテスト。モックされたAI bindingと実SQLiteで、逐次更新・同額別取引・返金・合計欠落・再読・API障害・中止・履歴/ルールの分離・スペース権限を検証する。

実APIでは以下を確認する。自動分類のしきい値は実際の修正結果を見て調整する必要がある。

1. 合計のない明細も保存前確認まで進む。
2. 重複スクリーンショットの同一利用は一度だけ、同額の別利用はそれぞれ残る。
3. 返金・手数料を含む合計を照合し、不一致は再読後に差額を案内する。
4. Amazonの店名だけの行は要確認になる。修正→保存→再取り込みしても修正だけでは自動ルールにならない。
5. 明示条件付きルールは該当商品だけに適用され、設定から削除できる。
6. 処理中に閉じる/中止しても後から結果が画面に戻らない。エラー時は部分結果を保存しない。

## 切り戻し

`AI_IMPORT_PROVIDER` を `openai` にして再デプロイすると従来のOpenAI直接接続へ戻せる。この場合はWorker Secretの `OPENAI_API_KEY` が必要。DB移行はそのまま保持できる。Cloudflare経由では取り込みもレポートコメントもLunaを同じbindingから呼ぶため、個別のOpenAI APIキーは不要。

## API仕様の参照

- [Cloudflare AI binding / AI Gateway](https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/)
- [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/)
- [GPT 6 Luna](https://developers.cloudflare.com/ai/models/openai/gpt-6-luna/)
- [Jev](https://developers.cloudflare.com/ai/models/typesafe/jev/)
- [TypeSafe confidence](https://docs.typesafe.ai/confidence)
- [TypeSafe Noul](https://docs.typesafe.ai/primitives/noul)
