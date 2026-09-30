import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import type { ImportSource } from './import-policy';
import type { StatementFile } from './statement-files';

export function ImportSourcePreview({source,files}:{source:ImportSource;files:StatementFile[]}) {
  const file=files[source.file-1];
  return <details className="import-source"><summary>元の明細：{file?.name||`ファイル${source.file}`} · {source.page}ページ{source.row>0?` · ${source.row}行目`:''}</summary>
    {source.excerpt&&<blockquote>{source.excerpt}</blockquote>}
    {file?.kind==='image'?<img src={file.data} alt={`${file.name}の元画像`} loading="lazy"/>:file?.kind==='pdf'?<a href={file.data} download={file.name}>元のPDFをダウンロード</a>:file?.kind==='csv'?<pre>{file.data}</pre>:null}
  </details>;
}

function SourceAccordion({label,open,onToggle,children}:{label:ReactNode;open:boolean;onToggle:()=>void;children:ReactNode}) {
  const id=useId();
  const reduced=useReducedMotion();
  return <div className="import-source-accordion">
    <button type="button" className="import-source-toggle" aria-expanded={open} aria-controls={id} onClick={onToggle}>
      {label}<ChevronDown size={16} aria-hidden="true"/>
    </button>
    <div id={id} inert={!open}>
      <AnimatePresence initial={false}>
        {open&&<motion.div key="content" className="import-source-expander" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduced?0:.24,ease:[.22,1,.36,1]}}>
          {children}
        </motion.div>}
      </AnimatePresence>
    </div>
  </div>;
}

export function ImportOriginalFiles({files}:{files:StatementFile[]}) {
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState<number|null>(null);
  if(!files.length)return null;
  return <section className="import-original-files" aria-label="取り込み元のファイル">
    <SourceAccordion label={<><span>取り込み元のファイル</span><small>{files.length}件</small></>} open={open} onToggle={()=>setOpen(!open)}>
      <div className="import-source-file-list">
        {files.map((file,index)=><SourceAccordion key={`${index}-${file.name}`} label={<span title={file.name}>{file.name}</span>} open={active===index} onToggle={()=>setActive(active===index?null:index)}>
          <div className="import-source import-source-content">
            {file.kind==='image'?<img src={file.data} alt={`${file.name}の元画像`} loading="lazy"/>:
              file.kind==='pdf'?<a href={file.data} download={file.name}>元のPDFをダウンロードして確認</a>:
              <pre>{file.data}</pre>}
          </div>
        </SourceAccordion>)}
      </div>
    </SourceAccordion>
  </section>;
}
