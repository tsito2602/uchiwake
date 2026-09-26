export const cardColors = [
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
// One fixed palette for every category, including the original muted colors.
export const categoryColors = [
  ...cardColors,
  {value:'#738778',label:'セージグリーン'},
  {value:'#b78d6a',label:'キャメル'},
  {value:'#8995a5',label:'ブルーグレー'},
  {value:'#c0a16e',label:'サンドベージュ'},
  {value:'#8a87a4',label:'ラベンダーグレー'},
  {value:'#6f98a1',label:'ダスティブルー'},
  {value:'#a28c80',label:'グレージュ'},
  {value:'#b48a96',label:'ダスティローズ'},
  {value:'#9c94b4',label:'ラベンダー'},
  {value:'#989898',label:'グレー'},
] as const;
export const defaultCardColor = cardColors[0].value;
export const validCardColor = (value:unknown):value is string =>
  typeof value==='string' && cardColors.some(color=>color.value===value);
