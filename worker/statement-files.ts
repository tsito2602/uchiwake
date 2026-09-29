import { isStatementFile, isSupportedImage, type StatementFile } from '../src/statement-files';

export function readStatementFiles(body:{files?:unknown;images?:unknown}):StatementFile[]|null {
  if(body.files!==undefined){
    if(body.images!==undefined||!Array.isArray(body.files)||!body.files.length||!body.files.every(isStatementFile))return null;
    return body.files;
  }
  // Older, cached clients can still send image-only imports.
  if(!Array.isArray(body.images)||!body.images.length||!body.images.every(isSupportedImage))return null;
  return body.images.map((image,index)=>({name:`明細${index+1}`,kind:'image',data:image as string,size:1}));
}

export function statementFileParts(files:StatementFile[]) {
  return files.map(file=>file.kind==='image'?{type:'input_image',image_url:file.data,detail:'high'}:
    file.kind==='pdf'?{type:'input_file',filename:/\.pdf$/i.test(file.name)?file.name:`${file.name}.pdf`,file_data:file.data}:
    // Send all CSV rows as text; spreadsheet file inputs can truncate at 1,000 rows.
    {type:'input_text',text:JSON.stringify({source:'statement_csv',filename:file.name,csv:file.data})});
}
