# uchiwake

ふたりの共有口座への入金額と支出の内訳を管理するMVP。Reactの画面とHonoのAPIをCloudflare Workerとして配信します。

## ステージング

固定URL: https://uchiwake-staging.tsito-apps.workers.dev/

ステージング専用の D1 `uchiwake-staging` と非公開 R2 `uchiwake-receipts-staging` を使います。全画面とAPIを共有パスワードで保護します。パスワードを知る人だけがアクセスできます。実際の家計情報は、認証や運用の設計が固まってから登録してください。

## MVPの使い方

- 「ホーム」の引落予定に、カード請求や家賃など**その月に共有口座から引き落とされる額**を登録します。合計を2人で折半し、奇数円なら一方が1円多く入れます。
- 「家計簿」の支出は**使った日付の月**に登録します。費目別レポートに含まれますが、共有口座への入金額には二重計上しません。
- 「取り込み」からレシート画像（JPEG/PNG/WebP、4MB以下）を読み取り、候補を確認・修正してから保存します。AIキーの設定前は手入力が使えます。原本は非公開R2に保存します。
- 「レポート」で費目別の集計と、希望時だけAIコメントを作成します。

## 開発と反映

```sh
npm ci
npm run check
npm run deploy:staging
```

`npm run deploy:staging` はステージングWorkerに反映します。Cloudflare認証があるローカル端末かCIで実行してください。D1に新しいmigrationを追加した場合は、先に `npm run db:staging` を実行してください。現行の初期スキーマはステージングD1に適用済みです。

`OPENAI_API_KEY` はCloudflareの `uchiwake-staging` Workerの Secret に設定します。リポジトリ、フロントエンド、Wrangler設定には記載しません。モデルは `OPENAI_MODEL` (`gpt-6-luna`) で設定しています。利用できない場合、AI機能はエラーを返し、手入力は継続できます。

## 現段階の境界

PDF・CSV・カード明細の一括取り込み、銀行連携、個人別ログインと権限管理、自動請求額の照合は未実装です。レシートは1画像につき1支出です。ステージングの共有パスワードは個人別認証を代替するMVPの限定運用です。一般公開や実データ運用の前に認証とバックアップ方針を確認してください。
