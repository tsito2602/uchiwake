// Adapted from Beautiful UI's MIT-licensed Thinking / Reasoning primitive.
// Keep the compact header; real summary events drive its text (no demo timers).
export function ImportThinking({text}:{text?:string}) {
  const label=text||'Thinking...';
  return <div className="import-thinking" role="status" aria-live="polite" aria-atomic="true" aria-label={label}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
    <span className="import-thinking-text" title={label}>{label}</span>
  </div>;
}
