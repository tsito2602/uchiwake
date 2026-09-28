# iPhoneホーム画面アイコン

参考: [Kondoのアイコンメモ](https://github.com/tsito2602/kondo/blob/3440015f3c0e9a8676ec9f3f4ce0ce26428a8158/assets/brand/README.md)、
同リポジトリの `scripts/fixtures/README.md`・`scripts/render-touch-icon.mjs`。

Kondoでは比較H/Iがライトで白、ダークで黒へ切り替わることをユーザー実機で確認している。
一方、同じPNG形式・透過背景でも切り替わらない図柄があり、形式や再追加だけで直るとは限らない。
図柄に対するiOS内部の判定条件は不明。Kondo現行ロゴと、過去の成功した比較Iは区別する。

## uchiwakeの経緯

- v2: 通常PNGは透過。maskableには不透明背景が残っていた。ユーザーから背景が透過しないとの報告。
- v3: maskableも透過にし、density 384で生成。ユーザーからライトでも背景が白くならないとの報告。
- v4: Kondoの再現手順6に合わせ、ホーム画面用の画像・favicon・manifestをテーマで差し替えない。
  アプリ内のロゴのみ明暗で切り替える。PNGは明暗共通の暗い図柄で、背景・隙間・中央の穴は透過。
  白い縁取りは追加しない。14%拡大した形状を維持する。

## v4の指定

- Apple Touch Iconとfavicon: `/brand-icons/apple-touch-v4.png`（180px、同じ画像）。
- manifest: `/manifest-v4.webmanifest`。192/512px・maskableも同じ原本と配色。
- manifestの `background_color` / `theme_color`: `#FFFFFF`（Kondoと同じ）。画像に白い面は描かない。
- PNG生成: SVGをdensity 384で読み込み、各サイズへ縮小。compressionLevel 9、palette false。
- インストールID `/` と保存データは変更しない。旧manifest URLも同じ参照画像へ揃える。

生成画像のアルファ・白い下地がないこと・テーマ切替時に参照が不変なこと・配信バイト列は自動検証する。
この検証ではiOSの背景自動合成までは確認できない。v4のライト白／ダーク黒の実機結果は未確認。
新しい版をSafariから追加して、ホーム画面のアイコン外観をライト／ダークで比較する。
新しいURLや再追加で必ず改善するとは説明しない。失敗した場合は成功したKondo比較Iと
同じページ・manifest条件で並べ、画像内容と登録条件の影響を分けて調べる。
