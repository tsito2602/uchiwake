# uchiwake 1.0.0

リリース元は `staging` の PR #15 までの変更です。`main` を本番、`staging` を検証用として使用します。

## 本番の構成

| 項目 | 本番 | ステージング |
| --- | --- | --- |
| Worker | `uchiwake` | `uchiwake-staging` |
| URL | `https://uchiwake.tsito-apps.workers.dev/` | `https://uchiwake-staging.tsito-apps.workers.dev/` |
| D1 | `uchiwake`（UUID: `268a3dcd-71e8-4de4-935e-2c77aec9e2e5`） | 既存の `uchiwake-staging` |
| APP_ENV | `production` | `staging` |
| Google OAuth・セッション鍵 | 本番用を新規設定 | 既存設定 |
| デモ・AI診断・アイコン比較ページ | 無効 | 有効 |

本番URLは公開予定のアドレスです。Workerの作成・デプロイ・ログイン確認が済むまでは稼働済みとは扱いません。
本番は空のD1から開始し、ステージングの明細やアカウントデータはコピーしません。
取り込み原本は保存しない実装のため、R2は使用しません。AI bindingは同じアカウントの既存AI Gateway `uchiwake` を使用します。

## 初回作成

1. 本番D1は作成済みで、ユーザーから上記UUIDが提供されています。再作成せず、Cloudflareの対象アカウントとD1名・UUIDの一致を確認します。

   ```sh
   npx wrangler whoami
   npx wrangler d1 info uchiwake
   ```

2. UUIDは `wrangler.production.jsonc` に設定済みです。追加のビルド変数 `D1_DATABASE_ID` は不要です。
   `npm run config:production` は確定済みのIDを使って `.wrangler.production.generated.jsonc` を生成します。既存のビルド設定に `D1_DATABASE_ID` がある場合は同じUUIDだけを許可し、不正なID・既存ステージング・別DBの指定では停止します。
   生成ファイルはコミットしません。`wrangler.production.jsonc` はテンプレートなので、デプロイは必ず生成後の設定を使用します。

3. ビルド・型チェック・テストを実行し、本番D1だけに全マイグレーションを適用します。

   ```sh
   npm ci
   npm run check
   npm run db:production
   npx wrangler d1 migrations list uchiwake --remote --config .wrangler.production.generated.jsonc
   ```

4. 本番用Google OAuthクライアントを作成し、次のリダイレクトURIを登録します。

   ```text
   https://uchiwake.tsito-apps.workers.dev/api/auth/google/callback
   ```

   Worker `uchiwake` の実行時設定に `GOOGLE_CLIENT_ID`（Text）、`GOOGLE_CLIENT_SECRET`、`SESSION_SECRET`、`ALLOWED_EMAILS`（後ろ3つはSecret）を登録します。
   `SESSION_SECRET` は本番専用の32バイト以上のランダム値を生成します。秘密値はGit・ビルドログ・VITE変数に入れません。
   `ALLOWED_EMAILS` は利用するGoogleアカウントをカンマ区切りで指定します。先頭の利用者が、初回ログイン時に空の「うちの家計」を所有します。
   各利用者には個人スペースも作成されます。共有スペースは招待コードで参加します。
   新しいWorkerでは初回デプロイ後に実行時設定を追加することも可能です。全項目が揃うまではログインできず、家計APIは503になります。

5. 本番へデプロイします。既存の実行時変数・Secretsは維持します。

   ```sh
   npm run deploy:production
   ```

## Workers Builds

`tsito2602/uchiwake` の `main` を Worker `uchiwake` に接続します。

| 項目 | 設定 |
| --- | --- |
| ルート | `/` |
| ビルド | `npm ci` |
| 初回デプロイ | `npm run deploy:production:initial` |
| 2回目以降のデプロイ | `npm run deploy:production` |
| ビルド変数 | `NODE_VERSION=24` |
| 監視対象パス | `*` |
| 非本番ブランチのビルド | 無効（stagingは既存Workerを使用） |

初回コマンドはビルド・型チェック・テスト成功後に、確定済みの本番D1へ全マイグレーションを適用し、成功した場合だけデプロイします。ローカルPCでの実行は不要です。
初回成功後はデプロイコマンドを `npm run deploy:production` に変更します。以降の通常デプロイにはDB移行を含めず、スキーマ変更が必要な場合だけ事前に適用します。
Workers BuildsのAPIトークンにはWorkerのデプロイ権限に加えて、初回DB移行用の対象アカウントの **D1: Edit** 権限が必要です。
Cloudflareが自動作成するビルド用トークンの既定権限にはD1が含まれないため、初回ビルド前に権限を設定してください（[公式設定ドキュメント](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token)）。
`APP_ENV=production`、AI binding、AI Gateway設定は本番テンプレートで指定します。
認証用の4項目はビルド変数ではなくWorkerの実行時設定です。

## リリース確認

- `/` が200でログイン画面、`/version.json` が `version: "1.0.0"` を返す。
- `/api/auth/session` が未ログイン時に `configured: true, user: null` を返す。
- 未ログインの `/api/spaces` が401になる。
- 許可したGoogleアカウントでログイン、再読み込み、ログアウトができる。
- 個人・共有スペース、招待、カード、明細取り込み・保存・精算を実アカウントで確認する。
- 本番のデモ表示・サンプル取り込み・AI診断が利用できない。

本番確認後、対象のmainコミットに `v1.0.0` タグとGitHub Releaseを作成します。
DBは既存のstagingと別リソースのため、本番の作成・移行でstagingデータは変更しません。
