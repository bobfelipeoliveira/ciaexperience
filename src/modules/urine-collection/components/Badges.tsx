import { Badge, Missing } from '../../../core/components/ui';
import { label, MATERIAL, PRIORITIES, PRIORITY_TONE, STATUS_TONE, STATUSES, type Material, type Priority, type Status } from '../domain/constants';

export function StatusBadge({ status }: { status: Status }) {
  return <Badge tone={STATUS_TONE[status]}>{label(STATUSES, status)}</Badge>;
}
export function PriorityBadge({ priority }: { priority: Priority | null }) {
  if (!priority) return <Missing text="PRIORIDADE N/I" />;
  return <Badge tone={PRIORITY_TONE[priority]}>{priority === 'URGENTE' ? '⚠ ' : ''}{label(PRIORITIES, priority)}</Badge>;
}
export function MaterialBadge({ value }: { value: Material | null }) {
  if (!value) return <Missing text="MATERIAL N/I" />;
  const tone = value === 'SIM' ? 'b-ok' : value === 'NAO' ? 'b-crit' : 'b-warn';
  return <Badge tone={tone}>Potinho: {label(MATERIAL, value)}</Badge>;
}
