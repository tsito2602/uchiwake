import { categories, type Category, type CategoryAppearance } from './domain';
import { defaultCardColor, categoryColors } from './card-colors';

export const categoryIcons = [
  {value:'basket',label:'食料品'}, {value:'utensils',label:'食事'},
  {value:'shopping',label:'買い物'}, {value:'lightbulb',label:'電気'},
  {value:'phone',label:'通信'}, {value:'train',label:'交通'},
  {value:'home',label:'住居'}, {value:'heart',label:'健康'},
  {value:'gamepad',label:'娯楽'}, {value:'tag',label:'その他'},
  {value:'coffee',label:'カフェ'}, {value:'book',label:'本・学習'},
  {value:'shirt',label:'衣服'}, {value:'plane',label:'旅行'},
  {value:'gift',label:'贈り物'}, {value:'paw',label:'ペット'},
  {value:'car',label:'自動車'}, {value:'bike',label:'自転車'},
  {value:'bus',label:'バス'}, {value:'fuel',label:'ガソリン'},
  {value:'parking',label:'駐車場'}, {value:'hotel',label:'宿泊'},
  {value:'map',label:'お出かけ'}, {value:'beach',label:'レジャー'},
  {value:'water',label:'水道'}, {value:'flame',label:'ガス'},
  {value:'wifi',label:'インターネット'}, {value:'laptop',label:'パソコン'},
  {value:'sofa',label:'家具'}, {value:'wrench',label:'修理'},
  {value:'scissors',label:'美容院'}, {value:'sparkles',label:'美容'},
  {value:'pill',label:'薬'}, {value:'stethoscope',label:'診療'},
  {value:'baby',label:'育児'}, {value:'graduation',label:'教育'},
  {value:'music',label:'音楽'}, {value:'film',label:'映画'},
  {value:'dumbbell',label:'スポーツ'}, {value:'wallet',label:'お財布'},
] as const;
export type CategoryIconName = typeof categoryIcons[number]['value'];
const defaults:Record<Category,{color:string;icon:CategoryIconName}>={
  '食費':{color:'#738778',icon:'basket'},'外食費':{color:'#b78d6a',icon:'utensils'},
  '日用品費':{color:'#8995a5',icon:'shopping'},'水道光熱費':{color:'#c0a16e',icon:'lightbulb'},
  '通信費':{color:'#8a87a4',icon:'phone'},'交通費':{color:'#6f98a1',icon:'train'},
  '住居費':{color:'#a28c80',icon:'home'},'医療費':{color:'#b48a96',icon:'heart'},
  '娯楽費':{color:'#9c94b4',icon:'gamepad'},'その他・要確認':{color:'#989898',icon:'tag'},
};
export const validCategoryIcon=(value:unknown):value is CategoryIconName=>categoryIcons.some(icon=>icon.value===value);
export const normalizeCategoryName=(value:string)=>value.normalize('NFKC').trim();
export const validCategoryName=(value:unknown):value is string=>typeof value==='string'&&normalizeCategoryName(value).length>0&&normalizeCategoryName(value).length<=30&&!/[\u0000-\u001f\u007f]/.test(value);
const categoryDefault=(category:Category)=>Object.hasOwn(defaults,category)?defaults[category]:{color:defaultCardColor,icon:'tag' as const};
export const validCategoryColor=(_category:Category,value:unknown)=>categoryColors.some(color=>color.value===value);
export const defaultCategoryAppearance=(category:Category):CategoryAppearance=>({category,...categoryDefault(category)});
export function categoryAppearance(category:Category,settings:CategoryAppearance[]=[]):CategoryAppearance {
  return settings.find(item=>item.category===category)??defaultCategoryAppearance(category);
}
export const allCategoryAppearances=(settings:CategoryAppearance[]=[]):CategoryAppearance[]=>[...new Set<string>([...categories,...settings.map(item=>item.category)])].map(category=>categoryAppearance(category,settings));
