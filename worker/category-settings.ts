import type {CategoryAppearance} from '../src/domain';
export async function readCategorySettings(db:D1Database):Promise<CategoryAppearance[]> {
  const result=await db.prepare('SELECT * FROM category_settings ORDER BY rowid').all<Record<string,unknown>>();
  return result.results.filter(row=>typeof row.category==='string').map(row=>({
    category:String(row.category),icon:String(row.icon),color:String(row.color),
    ...(row.original_category?{original_category:String(row.original_category)}:{}),
    ...(row.include_in_settlement===0||row.include_in_settlement===false?{include_in_settlement:false}:{})
  }));
}
export async function categorySchemaReady(db:D1Database):Promise<boolean> {
  const result=await db.prepare('PRAGMA table_info(category_settings)').all<{name:string}>();
  return result.results.some(row=>row.name==='include_in_settlement')&&result.results.some(row=>row.name==='original_category');
}
