import type { ImportSource } from './import-policy';
import type { StatementFile } from './statement-files';

export function ImportSourcePreview({source,files}:{source:ImportSource;files:StatementFile[]}) {
  const file=files[source.file-1];
  return <details className="import-source"><summary>元の明細：{file?.name||`ファイル${source.file}`} · {source.page}ページ{source.row>0?` · ${source.row}行目`:''}</summary>
    {source.excerpt&&<blockquote>{source.excerpt}</blockquote>}
    {file?.kind==='image'?<img src={file.data} alt={`${file.name}の元画像`} loading="lazy"/>:file?.kind==='pdf'?<a href={file.data} download={file.name}>元のPDFをダウンロード</a>:file?.kind==='csv'?<pre>{file.data}</pre>:null}
  </details>;
}

export function ImportOriginalFiles({files}:{files:StatementFile[]}) {
  if(!files.length)return null;
  return <section className="import-original-files" aria-label="取り込み元のファイル">
    <h4>取り込み元のファイル<span>{files.length}件</span></h4>
    {files.map((file,index)=><details className="import-source" key={`${index}-${file.name}`}>
      <summary>{file.name}</summary>
      {file.kind==='image'?<img src={file.data} alt={`${file.name}の元画像`} loading="lazy"/>:
        file.kind==='pdf'?<a href={file.data} download={file.name}>元のPDFをダウンロードして確認</a>:
        <pre>{file.data}</pre>}
    </details>)}
  </section>;
}
