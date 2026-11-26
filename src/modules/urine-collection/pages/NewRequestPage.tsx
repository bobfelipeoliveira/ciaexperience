import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, AlertBox, useToast, Tabs, Badge } from '../../../core/components/ui';
import { Icon } from '../../../core/components/Icon';
import { useAuth } from '../../../core/auth/AuthProvider';
import { friendlyError } from '../../../core/lib/errors';
import { fmtDate, hourNowSP, todayISO } from '../../../core/lib/dates';
import { emptyInput, type UrineRequestInput } from '../domain/types';
import { localRulesProvider, type ExtractionResult, type Extracted } from '../domain/parser';
import { buildQuestions, type DuplicateHit, type SmartQuestion } from '../domain/questions';
import { validateInput } from '../domain/validation';
import { label, MATERIAL, METHODS, ORIGINS, PERIODS, PRIORITIES, SHIFTS, STATUSES, type Status } from '../domain/constants';
import { RequestForm, normalizeInputForSave } from '../components/RequestForm';
import { createRequest, findDuplicates } from '../services/requests';

type Mode = 'texto' | 'formulario';

function applyExtraction(ex: ExtractionResult, base: UrineRequestInput) {
  const v: UrineRequestInput = { ...base };
  const inferred: Partial<Record<keyof UrineRequestInput, string>> = {};
  const take = <K extends keyof UrineRequestInput>(k: K, e: Extracted<UrineRequestInput[K]>) => {
    if (e.value === null || e.value === undefined) return;
    v[k] = e.value as UrineRequestInput[K];
    if (e.confidence === 'inferred') inferred[k] = e.note ?? 'Deduzido automaticamente — confira.';
  };
  take('patient_name', ex.patient_name as Extracted<string>);
  take('patient_age', ex.patient_age as Extracted<number | null>);
  take('collection_method', ex.collection_method);
  take('origin', ex.origin);
  take('priority', ex.priority);
  take('received_date', ex.received_date);
  take('receipt_shift', ex.receipt_shift);
  take('scheduled_date', ex.scheduled_date);
  take('scheduled_period', ex.scheduled_period);
  take('scheduled_time', ex.scheduled_time);
  take('material_available', ex.material_available);
  take('family_contact_name', ex.family_contact_name);
  take('contact_phone', ex.contact_phone);
  take('health_plan', ex.health_plan);
  if (ex.notes.value) v.notes = ex.notes.value;
  const a = ex.address.value;
  if (a) {
    v.address_raw = a.raw; v.address_street = a.street; v.address_number = a.number; v.address_complement = a.complement;
    v.state = a.state; v.address_reference = a.reference;
  }
  take('neighborhood', ex.neighborhood);
  take('city', ex.city);
  take('cep', ex.cep);
  return { v, inferred };
}

/** Situação inicial sugerida (a técnica pode mudar). Nunca "REALIZADA" por ter data. */
export function suggestStatus(v: UrineRequestInput): Status {
  if (!v.scheduled_date) return 'RECEBIDA';
  if (v.material_available === 'NAO') return 'AGUARDANDO_MATERIAL';
  if (!v.family_contact_name || v.material_available !== 'SIM') return 'AGUARDANDO_CONFIRMACAO';
  return 'AGENDADA';
}

const EXTRACT_FIELDS: { key: keyof ExtractionResult; label: string; fmt?: (x: unknown) => string }[] = [
  { key: 'patient_name', label: 'Paciente' },
  { key: 'patient_age', label: 'Idade', fmt: (x) => `${x} anos` },
  { key: 'collection_method', label: 'Forma de coleta', fmt: (x) => label(METHODS, x as string) },
  { key: 'origin', label: 'Origem', fmt: (x) => label(ORIGINS, x as string) },
  { key: 'priority', label: 'Prioridade', fmt: (x) => label(PRIORITIES, x as string) },
  { key: 'received_date', label: 'Recebimento', fmt: (x) => fmtDate(x as string) },
  { key: 'receipt_shift', label: 'Turno de recebimento', fmt: (x) => label(SHIFTS, x as string) },
  { key: 'scheduled_date', label: 'Data pretendida', fmt: (x) => fmtDate(x as string) },
  { key: 'scheduled_period', label: 'Período', fmt: (x) => label(PERIODS, x as string) },
  { key: 'material_available', label: 'Material (potinho)', fmt: (x) => label(MATERIAL, x as string) },
  { key: 'family_contact_name', label: 'Familiar' },
  { key: 'contact_phone', label: 'Telefone' },
  { key: 'health_plan', label: 'Convênio' },
  { key: 'neighborhood', label: 'Bairro' },
  { key: 'city', label: 'Cidade' },
  { key: 'cep', label: 'CEP' },
];

function QuestionCard({ q, onAnswer, onGo }: { q: SmartQuestion; onAnswer: (field: string, value: string) => void; onGo: (section: string) => void }) {
  const [txt, setTxt] = useState('');
  return (
    <div className={`question${q.severity === 'critical' ? ' crit' : ''}`}>
      <Icon name={q.severity === 'critical' ? 'alert' : 'sparkles'} />
      <div className="stack-sm" style={{ flex: 1, minWidth: 0 }}>
        <span className="q-text">{q.text}</span>
        {q.options && (
          <div className="chips">
            {q.options.map((o) => <button key={o.value} type="button" className="chip" onClick={() => onAnswer(q.field, o.value)}>{o.label}</button>)}
          </div>
        )}
        {q.freeText && (
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (txt.trim()) onAnswer(q.field, txt.trim()); }}>
            <input className="input" style={{ flex: '1 1 220px' }} value={txt} onChange={(e) => setTxt(e.target.value)} aria-label={q.text} />
            <button className="btn btn-primary btn-sm" disabled={!txt.trim()}>Aplicar</button>
          </form>
        )}
        {q.field === 'address' && <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => onGo('sec-endereco')}>Complementar endereço</button></div>}
        {q.field === 'scheduled_date' && <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => onGo('sec-agendamento')}>Informar data</button></div>}
        {q.link && <div><Link className="btn btn-secondary btn-sm" to={q.link.to} target="_blank" rel="noopener">{q.link.label} ↗</Link></div>}
      </div>
    </div>
  );
}

export default function NewRequestPage() {
  const { access } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const today = todayISO();
  const myName = access?.profile?.full_name ?? '';

  const [mode, setMode] = useState<Mode>('texto');
  const [text, setText] = useState('');
  const [ex, setEx] = useState<ExtractionResult | null>(null);
  const [v, setV] = useState<UrineRequestInput>(() => ({ ...emptyInput(), received_date: today, receipt_shift: hourNowSP() >= 7 && hourNowSP() < 19 ? 'DIURNO' : 'NOTURNO', scheduler_name: myName }));
  const [inferred, setInferred] = useState<Partial<Record<keyof UrineRequestInput, string>>>({ received_date: 'Data de hoje (padrão).', receipt_shift: 'Pelo horário atual.' });
  const [status, setStatus] = useState<Status | null>(null);
  const [keepText, setKeepText] = useState(false);
  const [dups, setDups] = useState<DuplicateHit[]>([]);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (myName && !v.scheduler_name) setV((x) => ({ ...x, scheduler_name: myName })); }, [myName]); // eslint-disable-line

  // Verificação de duplicidade (com atraso para não consultar a cada letra)
  useEffect(() => {
    const t = window.setTimeout(async () => {
      try { setDups(await findDuplicates(v.patient_name, v.contact_phone)); } catch { setDups([]); }
    }, 700);
    return () => window.clearTimeout(t);
  }, [v.patient_name, v.contact_phone]);

  async function interpret() {
    const ctx = { today, nowHour: hourNowSP() };
    const r = await localRulesProvider.extract(text, ctx);
    setEx(r);
    const base = { ...emptyInput(), scheduler_name: myName };
    const { v: nv, inferred: inf } = applyExtraction(r, base);
    setV(nv); setInferred(inf); setStatus(null); setTouched(false);
    setTimeout(() => document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  const patch = (p: Partial<UrineRequestInput>) => {
    setV((x) => ({ ...x, ...p }));
    setInferred((inf) => { const n = { ...inf }; (Object.keys(p) as (keyof UrineRequestInput)[]).forEach((k) => delete n[k]); return n; });
  };
  const questions = useMemo(() => buildQuestions(v, today, dups, ex?.conflicts ?? []), [v, today, dups, ex]);
  const errors = validateInput({ ...v, status: status ?? suggestStatus(v) }, today);
  const shownErrors = touched ? errors : {};
  const effectiveStatus = status ?? suggestStatus(v);

  function answer(field: string, value: string) {
    if (field === 'material_responsible') patch({ material_responsible: value });
    else patch({ [field]: value } as Partial<UrineRequestInput>);
  }
  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  async function save() {
    setTouched(true);
    if (Object.keys(errors).length) {
      toast('error', 'Revise os campos destacados antes de salvar.');
      const first = Object.keys(errors)[0];
      const sec = ['origin', 'priority'].includes(first) ? 'sec-origem' : first === 'patient_name' ? 'sec-identificacao' : first === 'cep' || first === 'state' ? 'sec-endereco' : 'sec-agendamento';
      goTo(sec);
      return;
    }
    setSaving(true);
    try {
      const input = normalizeInputForSave({ ...v, status: effectiveStatus });
      if (keepText && text.trim()) input.notes = [input.notes, `Texto original recebido: ${text.trim()}`].filter(Boolean).join('\n\n').slice(0, 4000);
      const saved = await createRequest(input, mode === 'texto' && ex ? 'TEXTO_LIVRE' : 'FORMULARIO');
      toast('success', `Solicitação de ${saved.patient_name} salva com sucesso.`);
      nav(`/coletas/${saved.id}`, { replace: true });
    } catch (e) {
      toast('error', friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <PageHeader title="Nova coleta de urina" subtitle="Cole a mensagem recebida ou preencha o formulário. Os dois caminhos geram o mesmo registro." />
      <Tabs<Mode> value={mode} onChange={setMode} tabs={[
        { value: 'texto', label: <span className="row" style={{ gap: 6 }}><Icon name="sparkles" size={16} /> Bloco inteligente</span> },
        { value: 'formulario', label: <span className="row" style={{ gap: 6 }}><Icon name="edit" size={16} /> Preencher formulário</span> },
      ]} />

      {mode === 'texto' && (
        <div className="notepad">
          <div className="notepad-inner">
            <div className="notepad-head"><Icon name="sparkles" /> Bloco de anotação inteligente</div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Texto da solicitação"
              placeholder="Conte aqui o que precisamos saber sobre esta coleta…&#10;&#10;Ex.: Paciente Maria da Silva, 82 anos, coleta por CVA. Recebida pela Intercorrência. Eletiva para amanhã de manhã. Filha Ana confirmou, tel. 21 99999-9999. Tem potinho. Endereço: Rua das Flores, 120, apto 301, Vila da Penha, Rio de Janeiro."
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && text.trim()) void interpret(); }} />
            <div className="row-between">
              <span className="muted small"><Icon name="lock" size={14} /> A interpretação acontece no seu navegador. Nada é enviado a serviços externos.</span>
              <button className="btn btn-accent btn-lg" disabled={!text.trim()} onClick={() => void interpret()}><Icon name="sparkles" /> Interpretar</button>
            </div>
          </div>
        </div>
      )}

      {mode === 'texto' && ex && (
        <section className="card tinted" id="preview">
          <div className="card-head">
            <div><h2>Prévia organizada</h2><p>Confira. O que não estava no texto aparece como <b>NÃO INFORMADO</b> — nada foi inventado.</p></div>
            <div className="row small"><Badge tone="b-ok">encontrado</Badge><Badge tone="b-warn">deduzido — confira</Badge><Badge tone="b-missing">não informado</Badge></div>
          </div>
          <div className="extract-grid">
            {EXTRACT_FIELDS.map((f) => {
              const e = ex[f.key] as Extracted<unknown>;
              const val = e.value !== null && e.value !== undefined ? (f.fmt ? f.fmt(e.value) : String(e.value)) : 'NÃO INFORMADO';
              return (
                <div key={f.key} className={`extract-item ${e.confidence === 'found' ? 'found' : e.confidence === 'missing' ? 'missing' : ''}`} title={e.evidence ? `Trecho: ${e.evidence}` : e.note}>
                  <div className="k">{f.label}{e.confidence === 'inferred' && ' ⚑'}</div>
                  <div className="v">{val}</div>
                </div>
              );
            })}
            {ex.address.value && (
              <div className="extract-item found" style={{ gridColumn: '1 / -1' }}>
                <div className="k">Endereço identificado</div>
                <div className="v">{[ex.address.value.street, ex.address.value.number, ex.address.value.complement, ex.address.value.neighborhood, ex.address.value.city, ex.address.value.state, ex.address.value.cep].filter(Boolean).join(' · ') || ex.address.value.raw}</div>
              </div>
            )}
          </div>
        </section>
      )}

      {(mode === 'formulario' || ex) && questions.length > 0 && (
        <section className="card">
          <div className="card-head"><div><h2>O que ainda falta</h2><p>Responda aqui mesmo ou complete no formulário abaixo. Nenhuma pergunta é obrigatória, exceto as marcadas em vermelho.</p></div><Badge tone="b-info">{questions.length} pendência(s)</Badge></div>
          <div className="stack-sm">{questions.map((q) => <QuestionCard key={q.id} q={q} onAnswer={answer} onGo={goTo} />)}</div>
        </section>
      )}

      {(mode === 'formulario' || ex) && (
        <div ref={formRef} className="stack">
          <RequestForm value={v} onChange={patch} errors={shownErrors} inferred={inferred} />
          <section className="card">
            <div className="grid-2">
              <div className="field">
                <span className="field-label">Situação inicial</span>
                <select className="select" value={effectiveStatus} onChange={(e) => setStatus(e.target.value as Status)}>
                  {(['RECEBIDA', 'AGUARDANDO_CONFIRMACAO', 'AGUARDANDO_MATERIAL', 'AGENDADA', 'PENDENTE_INFORMACAO'] as Status[]).map((s) => <option key={s} value={s}>{label(STATUSES, s)}</option>)}
                </select>
                <span className="hint">Sugerida automaticamente: <b>{label(STATUSES, suggestStatus(v))}</b>. A coleta só fica "Realizada" quando a execução for registrada.</span>
              </div>
              {mode === 'texto' && ex && (
                <label className="row" style={{ alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={keepText} onChange={(e) => setKeepText(e.target.checked)} style={{ width: 22, height: 22, marginTop: 2 }} />
                  <span><b>Guardar o texto original nas observações</b><br /><span className="muted small">Desmarcado por padrão (minimização de dados — LGPD). Marque se o texto tiver detalhes importantes não capturados.</span></span>
                </label>
              )}
            </div>
          </section>
          {touched && Object.keys(errors).length > 0 && <AlertBox kind="critical" title="Há campos para corrigir">{Object.values(errors).join(' ')}</AlertBox>}
          <div className="row" style={{ justifyContent: 'flex-end', position: 'sticky', bottom: 12, zIndex: 5 }}>
            <Link className="btn btn-ghost" to="/">Cancelar</Link>
            <button className="btn btn-primary btn-lg" disabled={saving} onClick={() => void save()}>
              <Icon name="check" /> {saving ? 'Salvando…' : 'Salvar solicitação'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

