import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeCsv,isStatementFile,readStatementFile,mergeStatementFiles} from '../src/statement-files.ts';

const csv='利用日,店名,金額\r\n2026-09-01,"店,支店\n売場","1,500"\r\n2026-09-02,返金,-200\r\n';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/X9sAAAAASUVORK5CYII=','base64');

test('画像とPDFを内容で判別し、空のMIMEでも読み込み順と原本の全バイトを保つ',async()=>{
 const pdf=Buffer.from('%PDF-1.7\n1 0 obj << /Type /Pages /Count 2 >> endobj\n%%EOF');
 for(const [name,bytes,kind,mime] of [['画像.PNG',png,'image','image/png'],['明細.PDF',pdf,'pdf','application/pdf']]){
   const result=await readStatementFile(new File([bytes],name));
   assert.equal(result.kind,kind);assert.equal(result.name,name);assert.equal(result.size,bytes.length);
   assert.equal(result.data,`data:${mime};base64,${bytes.toString('base64')}`);
   assert.ok(isStatementFile(result));
 }
});

test('CSVは引用符・セル内改行・負数・同一行を変えず、UTF-8とBOM付きUTF-16を読める',async()=>{
 const duplicated=csv+csv.split('\r\n')[2]+'\r\n';
 for(const bytes of [Buffer.from(duplicated),Buffer.from('\ufeff'+duplicated),Buffer.from('\ufeff'+duplicated,'utf16le')]){
   const result=await readStatementFile(new File([bytes],'明細.CSV',{type:'application/vnd.ms-excel'}));
   assert.equal(result.kind,'csv');assert.equal(result.data,duplicated);assert.ok(isStatementFile(result));
 }
 const bigEndian=Buffer.from('\ufeff'+csv,'utf16le').swap16();
 assert.equal(decodeCsv(bigEndian),csv);
});

test('日本のカードCSVのShift_JISを文字化けさせず読み取る',async()=>{
 const bytes=Buffer.from('9798977093fa2c935896bc2c8be08a7a0d0a323032362d30392d30312c8358815b8370815b2c313530300d0a','hex');
 const file=await readStatementFile(new File([bytes],'card.csv'));
 assert.equal(file.data,'利用日,店名,金額\r\n2026-09-01,スーパー,1500\r\n');
});

test('選択追加で既存のファイルを保持し、同じ内容の二重選択だけを除く',async()=>{
 const first=await readStatementFile(new File([csv],'one.csv'));
 const duplicate={...first,name:'コピー.csv'};
 const second=await readStatementFile(new File([csv+'2026-09-03,店,300\n'],'two.csv'));
 const current=[first];
 assert.deepEqual(mergeStatementFiles(current,[duplicate,second,second]),[first,second]);
 assert.deepEqual(current,[first]);
});

test('空ファイル・不正な文字コード・偽装したPDFや画像・非対応形式を読み取れたことにしない',async()=>{
 for(const file of [new File([],'empty.csv'),new File([Buffer.from([0,1,2])],'bad.csv'),new File(['not a PDF'],'bad.pdf',{type:'application/pdf'}),new File(['not an image'],'bad.png',{type:'image/png'}),new File(['hello'],'note.txt')])await assert.rejects(readStatementFile(file));
 for(const file of [{kind:'pdf',data:'data:application/pdf;base64,aGVsbG8='},{kind:'pdf',data:'data:application/pdf;base64,JVBERi0xLj===AA'},{kind:'csv',data:'\u0000binary'},{kind:'csv',data:'  '},{kind:'html',data:'<html>'}])assert.equal(isStatementFile({name:'test',size:10,...file}),false);
});
