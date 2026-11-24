/**
 * Mapeamento da planilha "Quadro básico monitoramento atend. intercorrência"
 * (aba "Coleta de urina ") para o padrão do CIA EXPERIENCE.
 *
 * - Padroniza CVA/CVD, SIM/NÃO, origem e turno SEM mudar o significado.
 * - Valores que não puderem ser interpretados ficam vazios e vão para o relatório.
 * - Preserva a linha original em legacy_data e a observação em legacy_notes.
 * - import_key determinístico: importar de novo o mesmo arquivo NÃO duplica.
 */
import { normalize, clean, formatPhone } from '../../../core/lib/text.ts';
import { findCity, findNeighborhood } from '../geo/gazetteer.ts';
import type { Material, Method, Origin, Shift, Status } from './constants.ts';

export const ORIGINAL_COLUMNS = [
  'TURNO', 'DATA DO RECEBIMENTO', 'ORIGEM DA SOLICITAÇÃO', 'NOME DO PACIENTE', 'FORMA DE COLETA',
  'MATERIAL NA CASA PARA COLETA? (Potinho)', 'DATA AGENDADA', 'NOME DO FAMILIAR QUE CONFIRMOU O AGENDAMENTO',
  'TELEFONE DE CONTATO', 'COLABORADOR RESPONSÁVEL PELO AGENDAMENTO', 'CONVÊNIO', 'BAIRRO',
  'NECESSIDADE DE REAGENDAMENTO?', 'DATA REAGENDADA', 'SUPORTE ROTA', 'ENFERMEIRO QUE REALIZOU A COLETA',
  'DATA DA COLETA', 'OBSERVAÇÃO',
] as const;
export type OriginalColumn = (typeof ORIGINAL_COLUMNS)[number];

/** Reconhece o cabeçalho mesmo com espaços duplos, acentos ou caixa diferente. */
export function matchColumn(header: string): OriginalColumn | null {
  const h = normalize(header).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const rules: [RegExp, OriginalColumn][] = [
    [/^turno/, 'TURNO'], [/recebimento/, 'DATA DO RECEBIMENTO'], [/^origem/, 'ORIGEM DA SOLICITACAO' as OriginalColumn],
    [/nome do paciente|^paciente/, 'NOME DO PACIENTE'], [/forma de coleta/, 'FORMA DE COLETA'],
    [/material|potinho/, 'MATERIAL NA CASA PARA COLETA? (Potinho)'], [/^data agendada/, 'DATA AGENDADA'],
    [/familiar/, 'NOME DO FAMILIAR QUE CONFIRMOU O AGENDAMENTO'], [/telefone/, 'TELEFONE DE CONTATO'],
    [/colaborador/, 'COLABORADOR RESPONSÁVEL PELO AGENDAMENTO'], [/convenio/, 'CONVÊNIO'], [/^bairro/, 'BAIRRO'],
    [/necessidade de reagend/, 'NECESSIDADE DE REAGENDAMENTO?'], [/data reagendada/, 'DATA REAGENDADA'],
    [/suporte rota/, 'SUPORTE ROTA'], [/enfermeiro/, 'ENFERMEIRO QUE REALIZOU A COLETA'],
    [/data da coleta/, 'DATA DA COLETA'], [/observa/, 'OBSERVAÇÃO'],
  ];
  for (const [re, col] of rules) if (re.test(h)) return col === ('ORIGEM DA SOLICITACAO' as OriginalColumn) ? 'ORIGEM DA SOLICITAÇÃO' : col;
  return null;
}

export function isUrineSheetName(name: string): boolean {
  return /coleta\s*de\s*urina/.test(normalize(name));
}

export type Cell = string | number | boolean | Date | null | undefined;

export interface ImportIssue { level: 'error' | 'warning' | 'info'; field: string; message: string; }

export interface MappedRow {
  line: number;
  import_key: string;
  patient_name: string | null;
  collection_method: Method | null;
  origin: Origin | null;
  material_available: Material | null;
  received_date: string | null;
  receipt_shift: Shift | null;
  scheduled_date: string | null;
  original_scheduled_date: string | null;
  family_contact_name: string | null;
  contact_phone: string | null;
  scheduler_name: string | null;
  health_plan: string | null;
  neighborhood: string | null;
  city: string | null;
  needs_reschedule: boolean | null;
  route_support: boolean | null;
  nurse_name: string | null;
  collected_date: string | null;
  status: Status;
  legacy_notes: string | null;
  legacy_data: Record<string, unknown>;
  issues: ImportIssue[];
  possibleDuplicateOf: number[];
}

function toISO(v: Cell): { iso: string | null; invalid: boolean } {
  if (v === null || v === undefined || v === '') return { iso: null, invalid: false };
  if (v instanceof Date && !isNaN(v.getTime())) {
    // datas do Excel chegam como meia-noite UTC
    return { iso: v.toISOString().slice(0, 10), invalid: false };
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86400000);
    return { iso: new Date(ms).toISOString().slice(0, 10), invalid: false };
  }
  const s = String(v).trim();
  if (!s || s === '*' || s === '-') return { iso: null, invalid: s === '*' };
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
    if (dt.getUTCDate() === +m[1] && dt.getUTCMonth() === +m[2] - 1) return { iso: dt.toISOString().slice(0, 10), invalid: false };
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { iso: `${iso[1]}-${iso[2]}-${iso[3]}`, invalid: false };
  return { iso: null, invalid: true };
}

const txt = (v: Cell) => (v === null || v === undefined ? null : clean(v instanceof Date ? v.toISOString().slice(0, 10) : String(v)));

function yesNo(v: Cell): { val: boolean | null; raw: string | null; unknown: boolean } {
  const raw = txt(v);
  if (!raw) return { val: null, raw, unknown: false };
  const n = normalize(raw).replace(/[^a-z]/g, '');
  if (n === 'sim' || n === 's') return { val: true, raw, unknown: false };
  if (n === 'nao' || n === 'n' || n === 'nai') return { val: false, raw, unknown: false };
  return { val: null, raw, unknown: true };
}

/** Padroniza nome de colaborador: remove ponto final, espaços extras e corrige ^ trocado por ~ (CONCEIÇÂO → CONCEIÇÃO). */
export function normalizeStaffName(v: Cell): string | null {
  const s = txt(v);
  if (!s) return null;
  return s.replace(/Â(?=O\b)/g, 'Ã').replace(/[.]+$/, '').replace(/\s+/g, ' ').toUpperCase().trim();
}

function normalizePlan(v: Cell): string | null {
  const s = txt(v);
  if (!s) return null;
  const n = normalize(s);
  if (/^solar\s*-\s*/.test(n)) return normalizePlan(s.replace(/^\s*solar\s*-\s*/i, ''));
  if (/^amil/.test(n)) {
    const sfx = n.match(/amil\s*-?\s*(pf|pj|sp)/);
    return sfx ? `AMIL - ${sfx[1].toUpperCase()}` : 'AMIL';
  }
  if (/^unimed/.test(n)) return /brasil/.test(n) ? 'UNIMED BRASIL' : 'UNIMED';
  if (/^bradesco/.test(n)) return 'BRADESCO';
  if (/^sul ?america/.test(n)) return 'SULAMÉRICA';
  if (/^cassi/.test(n)) return 'CASSI';
  if (/^caberj/.test(n)) return 'CABERJ';
  return s.toUpperCase();
}

/** Hash curto e determinístico (FNV-1a 64 bits em hexadecimal) — sem dependências. */
export function stableHash(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function mapRow(line: number, get: (c: OriginalColumn) => Cell, rawRow: Record<string, unknown>): MappedRow {
  const issues: ImportIssue[] = [];
  const name = txt(get('NOME DO PACIENTE'));
  if (!name) issues.push({ level: 'error', field: 'Nome do paciente', message: 'Nome do paciente vazio — a linha não será importada.' });

  const shiftRaw = normalize(txt(get('TURNO')) ?? '');
  const receipt_shift: Shift | null = shiftRaw.startsWith('diurn') ? 'DIURNO' : shiftRaw.startsWith('notur') ? 'NOTURNO' : null;
  if (shiftRaw && !receipt_shift) issues.push({ level: 'warning', field: 'Turno', message: `Turno "${txt(get('TURNO'))}" não reconhecido — ficará NÃO INFORMADO.` });

  const originRaw = normalize(txt(get('ORIGEM DA SOLICITAÇÃO')) ?? '');
  let origin: Origin | null = null;
  if (/intercor/.test(originRaw)) origin = 'INTERCORRENCIA';
  else if (/ticket|tiket|elet|eleet/.test(originRaw)) origin = 'TICKET_ELETIVO';
  else if (/demanda/.test(originRaw)) origin = 'DEMANDA_EXTERNA';
  if (originRaw && !origin) issues.push({ level: 'warning', field: 'Origem', message: `Origem "${txt(get('ORIGEM DA SOLICITAÇÃO'))}" não reconhecida.` });
  if (/eleet|^eletivo$/.test(originRaw.trim())) issues.push({ level: 'info', field: 'Origem', message: `"${txt(get('ORIGEM DA SOLICITAÇÃO'))}" padronizado como TICKET ELETIVO.` });

  const methodRaw = normalize(txt(get('FORMA DE COLETA')) ?? '').replace(/[^a-z]/g, '');
  const collection_method: Method | null = methodRaw === 'cva' ? 'CVA' : methodRaw === 'cvd' ? 'CVD' : null;
  if (methodRaw && !collection_method) issues.push({ level: 'warning', field: 'Forma de coleta', message: `"${txt(get('FORMA DE COLETA'))}" não reconhecido.` });
  if (!methodRaw) issues.push({ level: 'info', field: 'Forma de coleta', message: 'Vazio — ficará NÃO INFORMADO.' });

  const mat = yesNo(get('MATERIAL NA CASA PARA COLETA? (Potinho)'));
  const material_available: Material | null = mat.val === true ? 'SIM' : mat.val === false ? 'NAO' : null;
  if (mat.unknown) issues.push({ level: 'warning', field: 'Material', message: `"${mat.raw}" não reconhecido.` });

  const rec = toISO(get('DATA DO RECEBIMENTO'));
  const sch = toISO(get('DATA AGENDADA'));
  const resch = toISO(get('DATA REAGENDADA'));
  const col = toISO(get('DATA DA COLETA'));
  if (rec.invalid) issues.push({ level: 'warning', field: 'Data do recebimento', message: `Data inválida "${txt(get('DATA DO RECEBIMENTO'))}" — ficará vazia.` });
  if (sch.invalid) issues.push({ level: 'warning', field: 'Data agendada', message: `Data inválida "${txt(get('DATA AGENDADA'))}" — ficará vazia (original preservado).` });
  if (resch.invalid) issues.push({ level: 'warning', field: 'Data reagendada', message: `Valor "${txt(get('DATA REAGENDADA'))}" não é data — ignorado (original preservado).` });
  if (col.invalid) issues.push({ level: 'warning', field: 'Data da coleta', message: `Data inválida "${txt(get('DATA DA COLETA'))}".` });
  if (rec.iso && sch.iso && sch.iso < rec.iso) issues.push({ level: 'warning', field: 'Data agendada', message: 'Data agendada anterior ao recebimento — possível erro de digitação na planilha. Revise após importar.' });

  const needs = yesNo(get('NECESSIDADE DE REAGENDAMENTO?'));
  const route = yesNo(get('SUPORTE ROTA'));
  const nurse = normalizeStaffName(get('ENFERMEIRO QUE REALIZOU A COLETA'));

  let scheduled_date = sch.iso;
  let original_scheduled_date: string | null = null;
  if (resch.iso && resch.iso !== sch.iso) {
    original_scheduled_date = sch.iso;
    scheduled_date = resch.iso;
  }

  // Status: somente o que a planilha comprova. "Realizada" exige DATA DA COLETA.
  let status: Status = 'RECEBIDA';
  if (col.iso) status = 'REALIZADA';
  else if (scheduled_date) status = original_scheduled_date ? 'REAGENDADA' : 'AGENDADA';
  if (nurse && !col.iso) issues.push({ level: 'warning', field: 'Execução', message: 'Há enfermeiro informado, mas sem data da coleta — NÃO será marcada como realizada.' });
  if (col.iso && !nurse) issues.push({ level: 'info', field: 'Execução', message: 'Data da coleta sem enfermeiro informado.' });

  const neighRaw = txt(get('BAIRRO'));
  const neighPlace = findNeighborhood(neighRaw);
  const cityPlace = neighPlace ? null : findCity(neighRaw);
  let neighborhood = neighRaw;
  let city: string | null = null;
  if (neighPlace) { neighborhood = neighPlace.name; city = neighPlace.city; }
  else if (cityPlace) {
    // a planilha às vezes traz o MUNICÍPIO na coluna bairro (ex.: "Nova Iguaçu")
    neighborhood = null; city = cityPlace.name;
    issues.push({ level: 'info', field: 'Bairro', message: `"${neighRaw}" é um município — gravado como cidade (bairro ficará NÃO INFORMADO).` });
  } else if (neighRaw) {
    issues.push({ level: 'info', field: 'Bairro', message: `Bairro "${neighRaw}" não está na base geográfica — mantido como digitado; cidade NÃO INFORMADA.` });
  }

  const phoneRaw = txt(get('TELEFONE DE CONTATO'));
  const legacy_data: Record<string, unknown> = { linha: line, ...rawRow };

  const keyBase = [normalize(name), rec.iso ?? txt(get('DATA DO RECEBIMENTO')), sch.iso ?? txt(get('DATA AGENDADA')), normalize(txt(get('NOME DO FAMILIAR QUE CONFIRMOU O AGENDAMENTO'))), normalize(txt(get('COLABORADOR RESPONSÁVEL PELO AGENDAMENTO')))].join('|');

  return {
    line,
    import_key: 'xlsx-urina-' + stableHash(keyBase),
    patient_name: name,
    collection_method, origin, material_available,
    received_date: rec.iso, receipt_shift,
    scheduled_date, original_scheduled_date,
    family_contact_name: txt(get('NOME DO FAMILIAR QUE CONFIRMOU O AGENDAMENTO')),
    contact_phone: phoneRaw ? formatPhone(phoneRaw.replace(/\(zap\)|zap/gi, '').trim()) : null,
    scheduler_name: normalizeStaffName(get('COLABORADOR RESPONSÁVEL PELO AGENDAMENTO')),
    health_plan: normalizePlan(get('CONVÊNIO')),
    neighborhood, city,
    needs_reschedule: needs.val ?? (original_scheduled_date ? true : null),
    route_support: route.val,
    nurse_name: col.iso ? nurse : nurse,
    collected_date: col.iso,
    status,
    legacy_notes: txt(get('OBSERVAÇÃO')),
    legacy_data,
    issues,
    possibleDuplicateOf: [],
  };
}

/** Marca possíveis duplicidades dentro do próprio arquivo (mesmo paciente + mesma data agendada). */
export function flagDuplicates(rows: MappedRow[]): void {
  const seen = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.patient_name) continue;
    const k = `${normalize(r.patient_name)}|${r.scheduled_date ?? ''}`;
    seen.set(k, [...(seen.get(k) ?? []), r.line]);
  }
  const keys = new Map<string, number[]>();
  for (const r of rows) keys.set(r.import_key, [...(keys.get(r.import_key) ?? []), r.line]);
  for (const r of rows) {
    if (!r.patient_name) continue;
    const same = (seen.get(`${normalize(r.patient_name)}|${r.scheduled_date ?? ''}`) ?? []).filter((l) => l !== r.line);
    const sameKey = (keys.get(r.import_key) ?? []).filter((l) => l !== r.line);
    r.possibleDuplicateOf = [...new Set([...same, ...sameKey])];
    if (r.possibleDuplicateOf.length) {
      r.issues.push({ level: 'warning', field: 'Duplicidade', message: `Possível duplicidade com a(s) linha(s) ${r.possibleDuplicateOf.join(', ')} (mesmo paciente e mesma data).` });
    }
  }
}
