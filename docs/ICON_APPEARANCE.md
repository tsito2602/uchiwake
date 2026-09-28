# iPhoneホーム画面アイコン

## 現在採用している透過アイコンの作り方

2026-09-28にユーザーから保存を依頼された方式。
実装の基準コミットは `01b94f97ff3c8d627bbb22c80b78ac34d2a848ac`。
**背景面を描かないSVGで、マークだけ14%拡大する。SVGによる登録とテーマ切替を維持する。**
以下が現在の再現手順。後半のPNG方式・固定画像方式は過去の検証記録であり、現在の設定ではない。

### 元データと生成場所

- `src/brand-motion.ts`: 5本のSVGパス `pathData` と配色 `BRAND_THEMES` の原本。
- `scripts/build-brand.mjs`: 原本からアイコン・アプリ内ロゴ・manifestを生成する。
- `public/icon.svg`: 初期favicon。SVG内のメディアクエリで配色を切り替える。
- `public/icon-light.svg` / `public/icon-dark.svg`: 各テーマのホーム画面用アイコン。
- `public/logo-light.svg` / `public/logo-dark.svg`: アプリ内ロゴ。今回の14%拡大は適用しない。

### 画像の作成手順

1. アイコンの `viewBox` は `0 0 1254 1254` のままにする。
2. 背景の `<rect>` を描かず、5本の図柄のパスだけを配置する。
   白い下地・外周の白縁・影・背景色での塗りつぶしは加えない。
   パスの外側、中央の穴、一画目と二画目の間、円グラフの切れ目は透明になる。
3. 図柄全体を次のグループに入れ、中心 `(627, 627)` を基準に縦横とも1.14倍にする。
   SVGの枠の大きさは変えない。

   ```svg
   <g transform="translate(627 627) scale(1.14) translate(-627 -627)">
     <!-- 原本の5本のパスを、形状を変えずにここへ置く -->
   </g>
   ```

4. 各パスの塗り色を維持する。添字2（3本目）は `mid`、
   添字3（4本目）は `pale`、残りは `ink` を使う。

   | 用途 | ライト | ダーク |
   | --- | --- | --- |
   | ink | `#30302f` | `#f5f1e9` |
   | mid | `#9c978f` | `#b6b0a6` |
   | pale | `#cbc5bb` | `#817b72` |

   薄いグレーの円グラフ部分は図柄であり、除去する背景ではない。
   ダーク版の明るい `ink` も図柄の色で、白い下地とは区別する。
5. SVGとして書き出す。画像から白を色抜きしたり、PNGへ変換して登録し直したりしない。
   アプリ内ロゴのパス・余白・大きさと、起動アニメーションはこの変更に含めない。

### 維持する登録方法

`index.html` の初期指定は次のとおり。`apple-touch-icon` のPNG指定は追加しない。

```html
<link id="app-icon" rel="icon" href="/icon.svg" type="image/svg+xml"/>
<link id="app-manifest" rel="manifest" href="/manifest.webmanifest"/>
```

`src/boot.ts` は `prefers-color-scheme` に応じ、faviconを `/icon-light.svg` または
`/icon-dark.svg`、manifestを `/manifest-light.webmanifest` または
`/manifest-dark.webmanifest` へ切り替える。この登録方式も含めて現在の構成を維持する。

各manifestのアイコンは対応するSVGで、`sizes: "any"`、`type: "image/svg+xml"`、
`purpose: "any maskable"`。`id`・`start_url`・`scope` はすべて `/` のまま。
manifestの背景色指定はアプリ起動時のメタデータであり、SVG内へ背景面として描き込まない。
互換用の `/manifest-v4.webmanifest` も現在のライト用SVGを参照する。

### 再生成と確認

```sh
node scripts/build-brand.mjs
npm run check
```

`npm run dev` / `npm run build` でも生成スクリプトが実行される。
生成物を直接手直しせず、原本または生成スクリプトを編集する。
`tests/brand-icons.test.mjs` で背景・穴の透明度、輪郭への白い下地の混入、14%の拡大率、
アプリ内ロゴの維持、SVGの登録方法と配信内容を確認する。
`tests/brand-motion.test.mjs` はテーマ切替・起動処理を確認する。
この版はビルド・型チェック・107件のテストを通過した。
自動テストではiOSの背景合成までは再現しないため、実機結果を新たに確認したらここへ追記する。

## 参考資料と過去の検証記録

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
この検証ではiOSの背景自動合成までは確認できない。v4はユーザーから「変わらない」と報告された。
新しい版をSafariから追加して、ホーム画面のアイコン外観をライト／ダークで比較する。
新しいURLや再追加で必ず改善するとは説明しない。失敗した場合は成功したKondo比較Iと
同じページ・manifest条件で並べ、画像内容と登録条件の影響を分けて調べる。

## 2026-09-28 サイズ変更前の版へ復元

ユーザーから「縮小する前のアイコンではできていた」と報告。
その時点の画像・指定は `ff254711030539af11f111fa540f61dbe63e60dd`（v2導入直前）に保存されている。
PNG化と登録方式の変更も同時に行っていたため、サイズだけが原因とは判断しない。
元のSVGをバイト単位で復元し、元のfavicon・manifest・テーマ切り替えに戻した。
Apple Touch IconのPNG指定を外し、アプリ内ロゴ・短縮した起動アニメーション・認証は維持する。
この版のSVGには背景色の面があるが、元データを加工せず復元することを優先する。
白い縁の問題やサイズ調整は、この復元版の実機結果と切り離して扱う。
新しい画像が見えているという報告を、キャッシュの問題で片付けない。
復元後の実機結果は未確認。

## 2026-09-28 復元版を基準に背景除去・14%拡大

復元版にユーザーから「おっけーこの状態で」と了承があり、白い下地の除去と14%拡大を依頼された。
SVG内の背景矩形を削除し、図柄をキャンバス中央から1.14倍に拡大する。
SVGのURL・favicon・manifest・テーマ切替の方法は復元版のまま維持する。PNG化はしない。
アプリ内ロゴと起動アニメーションは変更しない。輪郭や白い下地は追加せず、隙間は透過する。
この変更後のiPhone実機での背景切替は未確認。
