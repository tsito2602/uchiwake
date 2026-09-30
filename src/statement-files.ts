export type StatementFile = {name:string;kind:'image'|'pdf'|'csv';data:string;size:number};
export const statementFileAccept='.jpg,.jpeg,.png,.webp,.pdf,.csv,image/jpeg,image/png,image/webp,application/pdf,text/csv';
export const statementFileTypes='画像（JPEG・PNG・WebP）・PDF・CSV';

function binaryMime(bytes:Uint8Array):string|undefined {
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
  if([0x89,0x50,0x4e,0x47].every((byte,index)=>bytes[index]===byte))return 'image/png';
  const text=String.fromCharCode(...bytes.subarray(0,12));
  if(text.startsWith('RIFF')&&text.slice(8,12)==='WEBP')return 'image/webp';
  if(/^%PDF-\d\.\d/.test(text))return 'application/pdf';
}

function encodedMime(value:unknown):string|undefined {
  if(typeof value!=='string')return;
  const header=/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,/.exec(value);
  if(!header)return;
  const data=value.slice(header[0].length),padding=data.indexOf('=');
  if(!data||/[^A-Za-z0-9+/=]/.test(data))return;
  if(padding<0?data.length%4===1:data.length%4!==0||!/^={1,2}$/.test(data.slice(padding)))return;
  try {
    const prefix=Uint8Array.from(atob(data.slice(0,16)),char=>char.charCodeAt(0));
    if(binaryMime(prefix)===header[1])return header[1];
  }catch{return;}
}

export const isSupportedImage=(value:unknown)=>encodedMime(value)?.startsWith('image/')===true;
const validText=(text:string)=>!!text.trim()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(text);
export function isStatementFile(value:unknown):value is StatementFile {
  if(!value||typeof value!=='object')return false;
  const file=value as StatementFile;
  if(typeof file.name!=='string'||!file.name.trim()||typeof file.data!=='string'||!Number.isSafeInteger(file.size)||file.size<=0)return false;
  return file.kind==='csv'?validText(file.data):file.kind==='pdf'?encodedMime(file.data)==='application/pdf':file.kind==='image'&&isSupportedImage(file.data);
}

export function decodeCsv(bytes:Uint8Array):string {
  const bom=bytes[0]===0xff&&bytes[1]===0xfe?'utf-16le':bytes[0]===0xfe&&bytes[1]===0xff?'utf-16be':null;
  for(const encoding of bom?[bom]:['utf-8','shift_jis']){
    try {const text=new TextDecoder(encoding,{fatal:true}).decode(bytes);if(validText(text))return text;}catch{/* Try the next supported encoding. */}
  }
  throw new Error('CSVの文字を読み取れませんでした。UTF-8またはShift_JISで保存したCSVを選んでください。');
}

export async function readStatementFile(file:File):Promise<StatementFile> {
  if(!file.size)throw new Error(`「${file.name}」は空のファイルです。`);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const mime=binaryMime(bytes);
  if(mime){
    const chunks:string[]=[];
    for(let offset=0;offset<bytes.length;offset+=32768)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+32768)));
    return {name:file.name,size:file.size,kind:mime==='application/pdf'?'pdf':'image',data:`data:${mime};base64,${btoa(chunks.join(''))}`};
  }
  if(/\.csv$/i.test(file.name)||['text/csv','application/csv'].includes(file.type))return {name:file.name,size:file.size,kind:'csv',data:decodeCsv(bytes)};
  throw new Error(`「${file.name}」を読み取れませんでした。${statementFileTypes}を選んでください。`);
}

export function mergeStatementFiles(current:StatementFile[],added:StatementFile[]):StatementFile[] {
  const next=[...current];
  for(const file of added)if(!next.some(item=>item.kind===file.kind&&item.data===file.data))next.push(file);
  return next;
}

export function statementFileSize(size:number):string {
  return size<1024?'1 KB未満':size<1024*1024?`${Math.ceil(size/1024)} KB`:`${(size/1024/1024).toLocaleString('ja-JP',{maximumFractionDigits:1})} MB`;
}
