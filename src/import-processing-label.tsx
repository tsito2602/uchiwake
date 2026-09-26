import { ThinkingOrb } from 'thinking-orbs';

export function ImportProcessingLabel({label}:{label:string}) {
  return <span className="import-processing-label" role="status">
    <ThinkingOrb state="breathing" size={20} theme="dark" aria-hidden="true"/>
    <span>{label}</span>
  </span>;
}
