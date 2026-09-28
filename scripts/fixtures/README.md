# ライト背景の実機比較用・固定データ

2026-09-28、ユーザーの同一ホーム画面の画像では、Kondoだけライトで白背景へ切り替わり、
うちわけv7はライトでも黒い背景だった。太い白縁は反映済みなので、旧アイコンの保持を原因と断定しない。

- `kondo-v13-touch.png`: 配信画像を再エンコードせず取得。
  - URL: https://kondo-staging.tsito-apps.workers.dev/icons/kondo-apple-touch-icon-v13.png
  - SHA-256: `a6034d27c9a37409c3011eeec5eeb642718e1638fbee307d7000e01bcbbcc670`
- `uchiwake-v7.svg`: v7の背景なしSVGを固定。C/Dはこの配色だけを変える。
- Bは既存の `public/apple-touch-icon-v7.png` を再エンコードせず使う。
  - SHA-256: `f7016460d416935f13d5df3995f5885de93bad2c349132e931b5466b6d054525`

両PNGとも180px・RGBA・sRGB・384dpi・ICCプロファイルなし。
Kondoの図柄は純黒、うちわけは濃いグレーと2段階のグレー。
配色差がOSの処理に影響するかは未確定。Cは濃い部分だけ純黒、Dは3色すべて純黒とし、
白縁・仕切り・形・配置・透明度を維持する。通常アプリには採用しない。

各比較ページは同じホスト・HTML構造・アイコン登録・manifest設定を使い、
別々のidとscopeで通常アプリから独立する。A/Bで登録条件と画像差を切り分け、
Aのみ白ならC/Dで配色差を調べる。配信データのテストとiOSの実機結果を混同しない。
