import {
  attentionLabels,
  commercialLabels,
  labelFor,
  meetingLabels,
  qualificationLabels,
  stageLabels,
} from '@/lib/studiosp/labels';
import type { StudiospLead } from '@/lib/studiosp/types';
import { StatusBadge } from './status-badge';

export function LeadStatusBar({ lead }: { lead: StudiospLead }) {
  const hasAttention = lead.attention_state !== 'no_action';
  return (
    <div className="border-border bg-card grid overflow-hidden rounded-lg border sm:grid-cols-2 xl:grid-cols-5">
      <StatusCell label="Etapa principal">
        <StatusBadge label={labelFor(stageLabels, lead.stage)} tone="primary" />
      </StatusCell>
      <StatusCell label="Atenção">
        <StatusBadge
          label={labelFor(attentionLabels, lead.attention_state)}
          tone={hasAttention ? 'warning' : 'neutral'}
        />
      </StatusCell>
      <StatusCell label="Qualificação">
        <StatusBadge
          label={labelFor(qualificationLabels, lead.qualification_status)}
          tone={
            lead.qualification_status === 'completed' ? 'success' : 'neutral'
          }
        />
      </StatusCell>
      <StatusCell label="Reunião">
        <StatusBadge
          label={labelFor(meetingLabels, lead.meeting_status)}
          tone={lead.meeting_status === 'confirmed' ? 'success' : 'neutral'}
        />
      </StatusCell>
      <StatusCell label="Comercial" last>
        <StatusBadge
          label={labelFor(commercialLabels, lead.commercial_status)}
          tone={lead.commercial_status === 'won' ? 'success' : 'neutral'}
        />
      </StatusCell>
    </div>
  );
}

function StatusCell({
  label,
  children,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`border-border min-w-0 border-b p-3 sm:border-r xl:border-b-0 ${last ? 'sm:border-r-0' : ''}`}
    >
      <p className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}
