import type { ReactNode } from 'react';
import { ChoiceChips, TextArea, TextInput, AlertBox } from '../../../core/components/ui';
import { Icon } from '../../../core/components/Icon';
import { MATERIAL, METHOD_HINT, ORIGINS, PERIODS, PRIORITIES, SHIFTS, type Material, type Method, type Origin, type Period, type Priority, type Shift } from '../domain/constants';
import type { UrineRequestInput } from '../domain/types';
import type { FormErrors } from '../domain/validation';
import { parseAddress } from '../domain/address';
import { formatPhone } from '../../../core/lib/text';

const opts = <T extends string>(m: Record<T, string>) => (Object.entries(m) as [T, string][]).map(([value, label]) => ({ value, label }));

function Section({ n, title, children, id }: { n: string; title: string; children: ReactNode; id?: string }) {
  return (
    <section className="form-section" id={id}>
      <h3><span className="step">{n}</span>{title}</h3>
      <div className="stack">{children}</div>
    </section>
  );
}

export interface RequestFormProps {
  value: UrineRequestInput;
  onChange: (patch: Partial<UrineRequestInput>) => void;
  errors: FormErrors;
  /** campos marcados como deduzidos automaticamente (mostra aviso para conferir) */
  inferred?: Partial<Record<keyof UrineRequestInput, string>>;
  lockScheduledDate?: boolean;
  onRescheduleClick?: () => void;
}

export function RequestForm({ value: v, onChange, errors, inferred = {}, lockScheduledDate, onRescheduleClick }: RequestFormProps) {
  const set = <K extends keyof UrineRequestInput>(k: K) => (val: UrineRequestInput[K]) => onChange({ [k]: val } as Partial<UrineRequestInput>);
  const str = <K extends keyof UrineRequestInput>(k: K) => (val: string) => onChange({ [k]: (val === '' ? null : val) } as Partial<UrineRequestInput>);
  const hint = (k: keyof UrineRequestInput, base?: ReactNode) => inferred[k] ? <span style={{ color: 'var(--warn-700)' }}>⚑ {inferred[k]}</span> : base;

  function splitAddress() {
    const a = parseAddress(v.address_raw);
    onChange({
      address_street: a.street ?? v.address_street, address_number: a.number ?? v.address_number,
      address_complement: a.complement ?? v.address_complement, neighborhood: a.neighborhood ?? v.neighborhood,
      city: a.city ?? v.city, state: a.state ?? v.state, cep: a.cep ?? v.cep,
      address_reference: a.reference ?? v.address_reference,
    });
  }

  return (
    <div className="stack">
      <Section n="A" title="Identificação do paciente" id="sec-identificacao">
        <div className="grid-3">
          <div style={{ gridColumn: 'span 2' }}>
            <TextInput label="Nome completo do paciente" value={v.patient_name} onChange={(x) => onChange({ patient_name: x })} required maxLength={200} error={errors.patient_name} />
          </div>
          <TextInput label="Idade" type="number" inputMode="numeric" value={v.patient_age ?? ''} min="0" max="130"
            onChange={(x) => onChange({ patient_age: x === '' ? null : Math.max(0, Math.min(130, Math.round(+x))) })} error={errors.patient_age} hint="Opcional" />
        </div>
        <div className="grid-2">
          <TextInput label="Convênio" value={v.health_plan} onChange={str('health_plan')} maxLength={120} />
          <ChoiceChips<Method> label="Forma de coleta" value={v.collection_method} onChange={set('collection_method')}
            options={[{ value: 'CVA', label: 'CVA', title: METHOD_HINT.CVA }, { value: 'CVD', label: 'CVD', title: METHOD_HINT.CVD }]}
            hint="Se não souber, deixe sem marcar (ficará NÃO INFORMADO)." />
        </div>
      </Section>

      <Section n="B" title="Origem e prioridade" id="sec-origem">
        <ChoiceChips<Origin> label="Origem da solicitação" required value={v.origin} onChange={set('origin')} options={opts(ORIGINS)} error={errors.origin} />
        <ChoiceChips<Priority> label="Prioridade" required value={v.priority} onChange={set('priority')} options={opts(PRIORITIES)}
          chipClass={(p) => `prio-${p}`} error={errors.priority} hint="A prioridade é independente da origem." />
        {v.priority === 'URGENTE' && <AlertBox kind="warning" title="Coleta URGENTE">A coordenação será notificada ao salvar.</AlertBox>}
      </Section>

      <Section n="C" title="Material na residência" id="sec-material">
        <ChoiceChips<Material> label="Existe material disponível na residência para a coleta? (potinho)" value={v.material_available}
          onChange={set('material_available')} options={opts(MATERIAL)} chipClass={(m) => (m === 'NAO_CONFIRMADO' ? 'chip-none' : '')} />
        {v.material_available === 'NAO' && (
          <div className="grid-2">
            <TextInput label="Quem ficará responsável pelo material?" value={v.material_responsible} onChange={str('material_responsible')} maxLength={150} />
            <TextInput label="Prazo para disponibilizar" type="date" value={v.material_deadline} onChange={str('material_deadline')} error={errors.material_deadline} />
          </div>
        )}
        {v.material_available === 'NAO_CONFIRMADO' && <AlertBox kind="warning">Será criada uma pendência de confirmação de material.</AlertBox>}
      </Section>

      <Section n="D" title="Agendamento" id="sec-agendamento">
        <div className="grid-3">
          <TextInput label="Data de recebimento" type="date" value={v.received_date} onChange={str('received_date')} error={errors.received_date} hint={hint('received_date')} />
          <ChoiceChips<Shift> label="Turno de recebimento" value={v.receipt_shift} onChange={set('receipt_shift')} options={opts(SHIFTS)} hint={hint('receipt_shift', 'Independente do período da coleta.')} />
          <div className="field">
            <TextInput label="Data agendada para a coleta" type="date" value={v.scheduled_date} onChange={str('scheduled_date')} error={errors.scheduled_date}
              disabled={lockScheduledDate} hint={lockScheduledDate ? 'Para mudar, use "Reagendar" (o histórico é preservado).' : hint('scheduled_date')} />
            {lockScheduledDate && onRescheduleClick && <button type="button" className="btn btn-secondary btn-sm" onClick={onRescheduleClick}><Icon name="calendar" size={16} /> Reagendar</button>}
          </div>
        </div>
        <ChoiceChips<Period> label="Período previsto" value={v.scheduled_period} onChange={(p) => onChange({ scheduled_period: p, scheduled_time: p === 'HORARIO' ? v.scheduled_time : null })} options={opts(PERIODS)} hint={hint('scheduled_period')} />
        {v.scheduled_period === 'HORARIO' && (
          <div className="grid-3"><TextInput label="Horário" type="time" value={v.scheduled_time?.slice(0, 5)} onChange={str('scheduled_time')} error={errors.scheduled_time} /></div>
        )}
        <div className="grid-3">
          <TextInput label="Familiar que confirmou" value={v.family_contact_name} onChange={str('family_contact_name')} maxLength={150} />
          <TextInput label="Telefone de contato" type="tel" inputMode="tel" value={v.contact_phone} onChange={str('contact_phone')}
            maxLength={60} error={errors.contact_phone} hint="Com DDD." />
          <TextInput label="Colaborador(a) responsável pelo agendamento" value={v.scheduler_name} onChange={str('scheduler_name')} maxLength={150} />
        </div>
        <div className="grid-2">
          <TextInput label="Profissional previsto para a coleta" value={v.assigned_nurse_name} onChange={str('assigned_nurse_name')} maxLength={150} hint="Quem deve realizar (se já definido)." />
          <ChoiceChips<'S' | 'N'> label="Suporte rota" value={v.route_support === null ? null : v.route_support ? 'S' : 'N'}
            onChange={(x) => onChange({ route_support: x === null ? null : x === 'S' })} options={[{ value: 'S', label: 'SIM' }, { value: 'N', label: 'NÃO' }]} />
        </div>
      </Section>

      <Section n="E" title="Endereço" id="sec-endereco">
        <div className="field">
          <TextArea label="Endereço completo (pode colar tudo em um campo)" value={v.address_raw} onChange={str('address_raw')} rows={2} maxLength={500}
            placeholder="Ex.: Rua das Flores, 120, apartamento 301, Vila da Penha, Rio de Janeiro - RJ" hint="O texto original é guardado para conferência. CEP não é obrigatório." />
          <div><button type="button" className="btn btn-secondary btn-sm" onClick={splitAddress} disabled={!v.address_raw}><Icon name="sparkles" size={16} /> Separar endereço automaticamente</button></div>
        </div>
        <div className="grid-4">
          <div style={{ gridColumn: 'span 2' }}><TextInput label="Logradouro" value={v.address_street} onChange={str('address_street')} maxLength={200} /></div>
          <TextInput label="Número" value={v.address_number} onChange={str('address_number')} maxLength={20} />
          <TextInput label="Complemento" value={v.address_complement} onChange={str('address_complement')} maxLength={120} />
        </div>
        <div className="grid-4">
          <TextInput label="Bairro" value={v.neighborhood} onChange={str('neighborhood')} maxLength={120} />
          <TextInput label="Cidade" value={v.city} onChange={str('city')} maxLength={120} hint={hint('city')} />
          <TextInput label="UF" value={v.state} onChange={(x) => onChange({ state: x ? x.toUpperCase().slice(0, 2) : null })} maxLength={2} error={errors.state} />
          <TextInput label="CEP (opcional)" value={v.cep} onChange={str('cep')} inputMode="numeric" maxLength={9} error={errors.cep} />
        </div>
        <TextInput label="Ponto de referência" value={v.address_reference} onChange={str('address_reference')} maxLength={300} />
      </Section>

      <Section n="F" title="Observações" id="sec-obs">
        <TextArea label="Observações" value={v.notes} onChange={str('notes')} rows={3} maxLength={4000} />
      </Section>
    </div>
  );
}

export function normalizeInputForSave(v: UrineRequestInput): UrineRequestInput {
  const t = (s: string | null) => (s && s.trim() ? s.trim() : null);
  return {
    ...v,
    patient_name: v.patient_name.trim().replace(/\s+/g, ' '),
    health_plan: t(v.health_plan), family_contact_name: t(v.family_contact_name),
    contact_phone: v.contact_phone ? formatPhone(v.contact_phone) : null,
    scheduler_name: t(v.scheduler_name), assigned_nurse_name: t(v.assigned_nurse_name),
    address_raw: t(v.address_raw), address_street: t(v.address_street), address_number: t(v.address_number),
    address_complement: t(v.address_complement), neighborhood: t(v.neighborhood), city: t(v.city),
    state: v.state ? v.state.toUpperCase() : null, cep: t(v.cep), address_reference: t(v.address_reference),
    material_responsible: t(v.material_responsible), notes: t(v.notes),
    scheduled_time: v.scheduled_period === 'HORARIO' ? v.scheduled_time : null,
  };
}
