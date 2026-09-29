const legacyCardColors = [
  {value:'#171717',label:'ブラック'},
  {value:'#64748b',label:'グレー'},
  {value:'#475569',label:'スレート'},
  {value:'#8b6552',label:'ブラウン'},
  {value:'#b48632',label:'マスタード'},
  {value:'#c77830',label:'オレンジ'},
  {value:'#3675d5',label:'ブルー'},
  {value:'#2387b5',label:'スカイブルー'},
  {value:'#238d9b',label:'シアン'},
  {value:'#25857d',label:'ティール'},
  {value:'#37866b',label:'グリーン'},
  {value:'#6e8b3d',label:'オリーブ'},
  {value:'#5359b8',label:'インディゴ'},
  {value:'#8b5fc7',label:'パープル'},
  {value:'#a955a4',label:'モーヴ'},
  {value:'#d05d8c',label:'ピンク'},
  {value:'#cb5c5c',label:'コーラル'},
  {value:'#bd424c',label:'レッド'},
] as const;
// All stored IDs remain supported, even when no longer offered as presets.
export const allPaletteColors = [
  {value:'#738778',label:'フォレストグリーン'},
  {value:'#b78d6a',label:'バーミリオン'},
  {value:'#8995a5',label:'ロイヤルブルー'},
  {value:'#c0a16e',label:'ゴールド'},
  {value:'#8a87a4',label:'バイオレット'},
  {value:'#6f98a1',label:'ターコイズ'},
  {value:'#a28c80',label:'チェスナット'},
  {value:'#b48a96',label:'ローズ'},
  {value:'#9c94b4',label:'マゼンタ'},
  {value:'#989898',label:'ニュートラルグレー'},
  ...legacyCardColors,
  {value:'#a32931',label:'レッド'},
  {value:'#d46e55',label:'コーラル'},
  {value:'#b7863a',label:'アンバー'},
  {value:'#a38f19',label:'イエロー'},
  {value:'#5b9837',label:'ライム'},
  {value:'#4d977e',label:'ミント'},
  {value:'#22665f',label:'ティール'},
  {value:'#328cae',label:'スカイブルー'},
  {value:'#304666',label:'ネイビー'},
  {value:'#4a4390',label:'インディゴ'},
  {value:'#9984b9',label:'ラベンダー'},
  {value:'#c4739e',label:'ピンク'},
] as const;
// Shared 6 × 4 palette, ordered by hue, with distinct lightness and chroma.
const presets = [
  ['#a32931','レッド'], ['#d46e55','コーラル'], ['#b78d6a','オレンジ'],
  ['#b7863a','アンバー'], ['#c0a16e','ゴールド'], ['#a38f19','イエロー'],
  ['#5b9837','ライム'], ['#6e8b3d','オリーブ'], ['#738778','グリーン'],
  ['#4d977e','ミント'], ['#22665f','ティール'], ['#6f98a1','シアン'],
  ['#328cae','スカイブルー'], ['#8995a5','ブルー'], ['#304666','ネイビー'],
  ['#4a4390','インディゴ'], ['#8a87a4','パープル'], ['#9984b9','ラベンダー'],
  ['#9c94b4','マゼンタ'], ['#c4739e','ピンク'], ['#b48a96','ローズ'],
  ['#a28c80','ブラウン'], ['#989898','グレー'], ['#171717','ブラック'],
] as const;
export const cardColors = presets.map(([value,label])=>({value,label}));
export const categoryColors = cardColors;
export const defaultCardColor = '#171717';
export const paletteColorLabel = (value:string) =>
  cardColors.find(color=>color.value===value)?.label ?? allPaletteColors.find(color=>color.value===value)?.label ?? value;
export const validCardColor = (value:unknown):value is string =>
  typeof value==='string' && allPaletteColors.some(color=>color.value===value);
