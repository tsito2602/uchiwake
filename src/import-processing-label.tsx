import { ThinkingOrb } from 'thinking-orbs';

export function ImportProcessingLabel({label}:{label:string}) {
  return <span className="import-processing-label" role="status" aria-label={label}>
    <ThinkingOrb state="breathing" size={20} theme="dark" aria-hidden="true"/>
    <span className="import-processing-shimmer" data-text={label} aria-hidden="true">{label}</span>
  </span>;
}
