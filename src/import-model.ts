export const importModels = [
  {id:'gpt-6-luna',label:'GPT-6 Luna'},
  {id:'gpt-6-sol',label:'GPT-6 Sol'},
] as const;
export type ImportModel = typeof importModels[number]['id'];
export function isImportModel(value:unknown):value is ImportModel {
  return importModels.some(model=>model.id===value);
}
