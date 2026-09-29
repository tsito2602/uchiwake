import type { ImportSource } from './import-policy';
import type { StatementFile } from './statement-files';

export function ImportSourcePreview({source,files}:{source:ImportSource;files:StatementFile[]}) {
  const file=files[source.file-1];
  return <details className="import-source"><summary>元の明細：{file?.name||`ファイル${source.file}`} · {source.page}ページ{source.row>0?` · ${source.row}行目`:''}</summary>
    {source.excerpt&&<blockquote>{source.excerpt}</blockquote>}
    {file?.kind==='image'?<img src={file.data} alt={`${file.name}の元画像`} loading="lazy"/>:file?.kind==='pdf'?<a href={file.data} download={file.name}>元のPDFをダウンロード</a>:file?.kind==='csv'?<pre>{file.data}</pre>:null}
  </details>;
}
