// Only public summary events reach the preview; never forward raw reasoning.
export class StatementReasoning {
  private part='';
  private text='';
  private displayed='';

  accept(event:Record<string,unknown>):string|null {
    const delta=event.type==='response.reasoning_summary_text.delta';
    const done=event.type==='response.reasoning_summary_text.done';
    if(!delta&&!done)return null;
    const text=delta?event.delta:event.text;
    if(typeof text!=='string'||!text.length)return null;
    const part=`${event.item_id}:${event.summary_index}`;
    if(part!==this.part){this.part=part;this.text='';}
    this.text=delta?this.text+text:text;
    // A new paragraph replaces the previous one; an unfinished blank line does not.
    const line=this.text.split(/\r?\n/).map(line=>line
      .replace(/^\s*(?:#{1,6}\s+|[-*]\s+)/,'')
      .replace(/\*\*|__|`/g,'').trim()).filter(Boolean).at(-1);
    if(!line||line===this.displayed)return null;
    this.displayed=line;
    return line;
  }
}
