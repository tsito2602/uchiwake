import { useRef, useState } from 'react';
import { Coins, CreditCard, FileImage, FileText, Files, Sparkles, Table2 } from 'lucide-react';
import { SpacePanel, type SpaceDockChange } from './space-panel';
import { displayColor } from './display-color';
import type { SharedCard } from './domain';
import type { StatementFile } from './statement-files';
import type { PanelOrigin } from './use-panel-morph';
import type { DockContext } from './floating-dock';

type Props={spaceName:string;card:SharedCard;month:string;files:StatementFile[];mode:'live'|'demo';demoView?:boolean;disabled:boolean;origin?:PanelOrigin;onClose:()=>void;onStart:()=>void;onDockChange:SpaceDockChange};

export function ImportConfirmationPanel({spaceName,card,month,files,mode,demoView=false,disabled,origin,onClose,onStart,onDockChange}:Props) {
  const [closing,setClosing]=useState(false);
  const decision=useRef<'start'|'back'|'done'|null>(null);
  const demo=mode==='demo';
  const dismiss=(choice:'start'|'back')=>{
    if(decision.current||(choice==='start'&&disabled))return;
    decision.current=choice;setClosing(true);
  };
  const exited=()=>{
    const choice=decision.current;
    if(!choice||choice==='done')return;
    decision.current='done';
    onClose();
    if(choice==='start')onStart();
  };
  const context:DockContext={label:'取り込みの確認',commit:true,actionAppearance:'studio',actionLabel:demo?'デモで仕分ける':'取り込みを始める',disabled:disabled||closing,onBack:()=>dismiss('back'),onAction:()=>dismiss('start')};
  return <SpacePanel title="取り込みの確認" icon={Files} context={context} origin={origin} closing={closing} onExited={exited} onDockChange={onDockChange}>
    <div className="import-confirmation">
      <div className="import-confirmation-cost">{demo?<Sparkles size={22} aria-hidden="true"/>:<Coins size={22} aria-hidden="true"/>}<div><strong>{demo?'デモは無料です':'AI利用枠を使用します'}</strong><p>{demo?'AI利用枠を消費せず、利用料もかかりません。':'取り込みにはAI利用料がかかります。'}</p></div></div>
      <dl className="import-confirmation-summary" aria-label="取り込み内容">
        <div><dt>スペース</dt><dd>{spaceName}</dd></div>
        <div><dt>カード</dt><dd><CreditCard size={20} color={displayColor(card.color)} aria-hidden="true"/>{card.name}</dd></div>
        <div><dt>引落月</dt><dd>{Number(month.slice(0,4))}年{Number(month.slice(5))}月</dd></div>
      </dl>
      {demo?<p className="import-confirmation-note">サンプル明細で試します。結果は保存されません。</p>:<section className="import-confirmation-files">
        <div className="import-file-heading"><h3>明細ファイル</h3><span>{files.length}ファイル</span></div>
        <ul>{files.map((file,index)=>{const Icon=file.kind==='image'?FileImage:file.kind==='pdf'?FileText:Table2;return <li key={`${index}-${file.name}`}><Icon size={18} aria-hidden="true"/><span>{file.name}</span><small>{file.kind==='image'?'画像':file.kind.toUpperCase()}</small></li>;})}</ul>
        {demoView&&<p className="import-confirmation-note">デモ表示中のため、読み取り結果は保存されません。</p>}
      </section>}
    </div>
  </SpacePanel>;
}
