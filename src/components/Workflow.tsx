import { Check, ChevronRight } from 'lucide-react';
import type { PostStatus } from '../types/post';

export function Workflow({ status, generating }: { status?: PostStatus; generating: boolean }) {
  const active =
    generating || status === 'generating'
      ? 0
      : status === 'ready' || status === 'failed'
        ? 1
        : status === 'approved'
          ? 2
          : status
            ? 3
            : 0;
  const steps = ['Criar conteúdo', 'Revisar', 'Aprovar', 'Publicar'];
  return (
    <ol className="workflow" aria-label="Etapas do conteúdo">
      {steps.map((step, i) => (
        <li
          className={active === i ? 'active' : active > i ? 'complete' : ''}
          key={step}
          aria-current={active === i ? 'step' : undefined}
        >
          <span className="step-number">{active > i ? <Check size={13} /> : i + 1}</span>
          <span>{step}</span>
          {i < 3 && <ChevronRight className="step-chevron" size={14} />}
        </li>
      ))}
    </ol>
  );
}
