/**
 * BLOCO DE ANOTAÇÃO INTELIGENTE — interpretador de texto livre.
 *
 * Funciona 100% no navegador, sem IA paga e sem enviar dados a terceiros.
 * Regras:
 *  - Nunca inventa: o que não estiver no texto volta como "missing".
 *  - Ausência de informação NÃO vira resposta negativa.
 *  - Cada campo informa de onde veio (trecho do texto) para conferência.
 *
 * A interface ExtractionProvider permite plugar, no futuro, um modelo de IA
 * (com autorização e avaliação de privacidade), sem alterar as telas.
 */
import { normalize, titleCase, onlyDigits, formatPhone } from '../../../core/lib/text.ts';
import { parseAddress, findPlaceInText, STREET_TYPES, type ParsedAddress } from './address.ts';
import type { Material, Method, Origin, Period, Priority, Shift } from './constants.ts';

export type Confidence = 'found' | 'inferred' | 'missing';
export interface Extracted<T> { value: T | null; confidence: Confidence; evidence?: string; note?: string; }

export interface ExtractionResult {
  patient_name: Extracted<string>;
  patient_age: Extracted<number>;
  collection_method: Extracted<Method>;
  origin: Extracted<Origin>;
  priority: Extracted<Priority>;
  emergency_justification: Extracted<string>;
  received_date: Extracted<string>;
  receipt_shift: Extracted<Shift>;
  scheduled_date: Extracted<string>;
  scheduled_period: Extracted<Period>;
  scheduled_time: Extracted<string>;
  material_available: Extracted<Material>;
  family_contact_name: Extracted<string>;
  contact_phone: Extracted<string>;
  health_plan: Extracted<string>;
  address: Extracted<ParsedAddress>;
  neighborhood: Extracted<string>;
  city: Extracted<string>;
  cep: Extracted<string>;
  notes: Extracted<string>;
  /** Remetente da mensagem do WhatsApp (ex.: "Rayane Cristina: ...") */
  scheduler_name: Extracted<string>;
  /** Conflitos detectados (ex.: CVA e CVD no mesmo texto) */
  conflicts: string[];
}

export interface ExtractionContext { today: string; nowHour: number; }

export interface ExtractionProvider {
  id: string;
  label: string;
  extract(text: string, ctx: ExtractionContext): Promise<ExtractionResult>;
}

const missing = <T>(): Extracted<T> => ({ value: null, confidence: 'missing' });
const found = <T>(value: T, evidence?: string, note?: string): Extracted<T> => ({ value, confidence: 'found', evidence, note });
const inferred = <T>(value: T, note: string, evidence?: string): Extracted<T> => ({ value, confidence: 'inferred', note, evidence });

function snippet(text: string, idx: number, len: number): string {
  const a = Math.max(0, idx - 20);
  const b = Math.min(text.length, idx + len + 20);
  return (a > 0 ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ').trim() + (b < text.length ? '…' : '');
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function validDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const WEEKDAY_WORDS: [RegExp, number][] = [
  [/\bdomingo\b/, 0], [/\bsegunda(?:-feira| feira)?\b/, 1], [/\bterca(?:-feira| feira)?\b/, 2],
  [/\bquarta(?:-feira| feira)?\b/, 3], [/\bquinta(?:-feira| feira)?\b/, 4], [/\bsexta(?:-feira| feira)?\b/, 5],
  [/\bsabado\b/, 6],
];

interface DateMention { iso: string; index: number; length: number; text: string; relative: boolean; }

/** Encontra menções de data no texto normalizado (mesmos índices do texto original — normalize preserva tamanho? não; usamos o texto minúsculo sem acentos com mesma contagem). */
function findDates(lower: string, ctx: ExtractionContext): DateMention[] {
  const out: DateMention[] = [];
  const year = +ctx.today.slice(0, 4);
  // dd/mm/aaaa, dd/mm/aa, dd/mm, dd-mm
  for (const m of lower.matchAll(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/g)) {
    const d = +m[1], mo = +m[2];
    let y = m[3] ? +m[3] : year;
    if (y < 100) y += 2000;
    // sem ano: se a data já passou há mais de 6 meses, assume o ano seguinte (virada de ano)
    let iso = validDate(y, mo, d);
    if (iso && !m[3]) {
      const diff = (Date.parse(iso) - Date.parse(ctx.today)) / 86400000;
      if (diff < -180) iso = validDate(y + 1, mo, d);
    }
    if (iso) out.push({ iso, index: m.index!, length: m[0].length, text: m[0], relative: false });
  }
  const rel: [RegExp, number][] = [[/\bdepois de amanha\b/g, 2], [/\bamanha\b/g, 1], [/\bhoje\b/g, 0], [/\bontem\b/g, -1]];
  const taken: [number, number][] = [];
  for (const [re, n] of rel) {
    for (const m of lower.matchAll(re)) {
      if (taken.some(([a, b]) => m.index! >= a && m.index! < b)) continue;
      taken.push([m.index!, m.index! + m[0].length]);
      out.push({ iso: addDays(ctx.today, n), index: m.index!, length: m[0].length, text: m[0], relative: true });
    }
  }
  // "dia 25"
  for (const m of lower.matchAll(/\bdia\s+(\d{1,2})\b(?![/.-]\d)/g)) {
    const d = +m[1];
    const [ty, tm, td] = ctx.today.split('-').map(Number);
    let iso = validDate(ty, tm, d);
    if (iso && d < td) iso = tm === 12 ? validDate(ty + 1, 1, d) : validDate(ty, tm + 1, d);
    if (iso) out.push({ iso, index: m.index!, length: m[0].length, text: m[0], relative: true });
  }
  // dias da semana → próxima ocorrência
  const todayDow = new Date(ctx.today + 'T12:00:00Z').getUTCDay();
  for (const [re, dow] of WEEKDAY_WORDS) {
    const g = new RegExp(re.source, 'g');
    for (const m of lower.matchAll(g)) {
      let delta = (dow - todayDow + 7) % 7;
      if (delta === 0) delta = 7;
      out.push({ iso: addDays(ctx.today, delta), index: m.index!, length: m[0].length, text: m[0], relative: true });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

const HEALTH_PLANS: [RegExp, string][] = [
  [/\bamil\b(?:\s*-?\s*(pf|pj|sp))?/i, 'Amil'], [/\bunimed(?:\s+brasil)?\b/i, 'Unimed'],
  [/\bbradesco(?:\s+sa[uú]de)?\b/i, 'Bradesco'], [/\bsul\s?am[eé]rica\b/i, 'SulAmérica'],
  [/\bcassi\b/i, 'CASSI'], [/\bcaberj\b/i, 'CABERJ'], [/\bfio\s?sa[uú]de\b/i, 'Fiosaúde'],
  [/\bsa[uú]de\s+caixa\b/i, 'Saúde Caixa'], [/\bm[uú]tua\b/i, 'MÚTUA'], [/\bgolden\s+cross\b/i, 'Golden Cross'],
  [/\bgeap\b/i, 'GEAP'], [/\bpostal\s+sa[uú]de\b/i, 'Postal Saúde'], [/\bsa[uú]de\s+petrobras\b|\bams\s+petrobras\b/i, 'Saúde Petrobras'],
  [/\bporto\s+seguro\b/i, 'Porto Seguro'], [/\bprevent\s+senior\b/i, 'Prevent Senior'], [/\bcare\s+plus\b/i, 'Care Plus'],
  [/\bomint\b/i, 'Omint'], [/\ballianz\b/i, 'Allianz'], [/\bhapvida\b|\bnotre\s?dame\b/i, 'Hapvida NotreDame'],
  [/\bassim\s+sa[uú]de\b/i, 'Assim Saúde'], [/\bsa[uú]de\s+caxias\b/i, 'Saúde Caxias'], [/\bfusex\b/i, 'FUSEx'],
];

const RELATIONS = 'filh[ao]|espos[ao]|marido|mulher|net[ao]|sobrinh[ao]|nora|genro|irm[aã]o?|irm[aã]|cuidador[a]?|respons[aá]vel|familiar|m[aã]e|pai|cunhad[ao]|enteado|enteada|vizinh[ao]|companheir[ao]';
const NAME_WORD = "[A-ZÁÂÃÉÊÍÓÔÕÚÇ][a-záâãéêíóôõúç'’]+";
const NAME_RE = `${NAME_WORD}(?:[ \\t]+(?:d[aoe]s?[ \\t]+)?${NAME_WORD}){0,5}`;
const STOP_NAME = /^(telefone|tel|contato|endere[cç]o|rua|avenida|conv[eê]nio|coleta|paciente|tem|possui|n[aã]o|sim|cva|cvd|amanh[aã]|hoje|solicita[cç][aã]o|familiar|confirmou)$/i;

function cleanName(raw: string): string | null {
  const words = raw.trim().split(/\s+/);
  const kept: string[] = [];
  for (const w of words) {
    if (STOP_NAME.test(w)) break;
    kept.push(w);
  }
  while (kept.length && /^d[aoe]s?$/i.test(kept[kept.length - 1])) kept.pop();
  const s = kept.join(' ');
  return s.length >= 2 ? s : null;
}

/** Mantém só as palavras iniciais com maiúscula (e conectivos "da/de/do"). */
function capitalizedPrefix(raw: string): string | null {
  const out: string[] = [];
  for (const w of raw.trim().split(/\s+/)) {
    if (STOP_NAME.test(w)) break;
    if (/^[A-ZÁÂÃÉÊÍÓÔÕÚÇ]/.test(w)) out.push(w);
    else if (/^d[aoe]s?$/.test(w) && out.length) out.push(w);
    else break;
  }
  while (out.length && /^d[aoe]s?$/.test(out[out.length - 1])) out.pop();
  return out.length ? out.join(' ') : null;
}

/**
 * Limpa o texto antes da interpretação: bordas de tabela do OCR ("|"), datas com
 * espaços ("25 /11/2026"), emojis e espaços repetidos.
 */
export function prepareText(text: string): string {
  return text
    .replace(/[\u{10000}-\u{10FFFF}]/gu, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s*\|\s*/g, '\n')
    .replace(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/g, '$1/$2/$3')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const LABEL_LINE = /^\s*(?:\d+\s*[.)-]\s*)?[A-Za-zÀ-ú][^:\n]{1,45}:/;
const NOT_A_SENDER = /^(pac|paciente|nome|data|usa|endere[cç]o|telefone|contato|conv[eê]nio|contrato|idade|obs|observa[cç][aã]o|motivo|profiss[aã]o)$/i;

export function extractFromText(text: string, ctx: ExtractionContext): ExtractionResult {
  text = prepareText(text);
  const original = text.replace(/ /g, ' ');
  // normalize preserva o comprimento quando só removemos diacríticos combinantes após NFD? Não —
  // por isso usamos um "lower" alinhado caractere a caractere:
  const lower = Array.from(original).map((ch) => (ch === '\n' ? '\n' : normalize(ch) || (ch.trim() ? ch.toLowerCase() : ' '))).join('');
  const r: ExtractionResult = {
    patient_name: missing(), patient_age: missing(), collection_method: missing(), origin: missing(),
    priority: missing(), emergency_justification: missing(), received_date: missing(), receipt_shift: missing(),
    scheduled_date: missing(), scheduled_period: missing(), scheduled_time: missing(), material_available: missing(),
    family_contact_name: missing(), contact_phone: missing(), health_plan: missing(), address: missing(),
    neighborhood: missing(), city: missing(), cep: missing(), notes: missing(), scheduler_name: missing(), conflicts: [],
  };
  if (!original.trim()) return r;

  // ---------- Nome do paciente ----------
  const nameLabels = [...original.matchAll(/\b(?:paciente|pac|pcte|pct|benefici[aá]rio)\b\.?\s*:?\s*(?:(?:sr|sra)\.?\s+|senhora?\s+|dona\s+)?|\bnome(?:\s+do\s+paciente)?\s*:\s*/gi)];
  const names: { value: string; index: number; len: number }[] = [];
  for (const label of nameLabels) {
    const after = original.slice(label.index! + label[0].length);
    const m = after.match(new RegExp(`^(${NAME_RE})`, 'u')) ?? after.match(/^([A-ZÁÂÃÉÊÍÓÔÕÚÇ]{2,}(?:\s+[A-ZÁÂÃÉÊÍÓÔÕÚÇ]{1,}){1,6})/u);
    const raw = m ? cleanName(m[1]) : null;
    if (raw && raw.split(' ').length >= 2) names.push({ value: raw === raw.toUpperCase() ? titleCase(raw) : raw, index: label.index!, len: label[0].length + raw.length });
  }
  if (names.length) {
    r.patient_name = found(names[0].value, snippet(original, names[0].index, names[0].len));
    const distinct = [...new Set(names.map((n) => normalize(n.value)))];
    if (distinct.length > 1) r.conflicts.push(`Encontrei nomes diferentes para o paciente: ${[...new Set(names.map((n) => n.value))].join(' / ')}. Confirme o nome correto.`);
  }

  // ---------- Remetente do WhatsApp (colaborador(a) responsável) ----------
  const sender = original.match(/^\s*(?:\[[^\]\n]{3,30}\]\s*)?(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?,?\s*\d{1,2}:\d{2}\s*-\s*)?([A-ZÁÂÃÉÊÍÓÔÕÚÇ][a-záâãéêíóôõúç]+(?:\s+[A-ZÁÂÃÉÊÍÓÔÕÚÇ][a-záâãéêíóôõúç]+){1,3})\s*:\s/u);
  if (sender && !NOT_A_SENDER.test(sender[1].split(' ')[0])) {
    r.scheduler_name = found(sender[1], sender[0].trim(), 'Remetente da mensagem do WhatsApp');
  }

  // ---------- Idade ----------
  const age = lower.match(/\bidade\s*:?\s*(\d{1,3})\s*(?:a\b|anos\b)?/) ?? lower.match(/\b(\d{1,3})\s*(?:anos|a\.)(?=\W|$)/);
  if (age && +age[1] <= 130) r.patient_age = found(+age[1], snippet(original, age.index!, age[0].length));

  // ---------- Forma de coleta ----------
  const hasCVA = /\bcva\b|cateterismo vesical de al[ií]vio|sondagem de al[ií]vio/.test(lower);
  const hasCVD = /\bcvd\b|sonda vesical de demora|cateter vesical de demora|\bsvd\b/.test(lower);
  const markedCVA = /\bcva\s*\(\s*x\s*\)/.test(lower);
  const markedCVD = /\bcvd\s*\(\s*x\s*\)/.test(lower);
  if (markedCVA !== markedCVD) {
    const which = markedCVA ? 'CVA' : 'CVD';
    const i = lower.search(markedCVA ? /\bcva\s*\(\s*x/ : /\bcvd\s*\(\s*x/);
    r.collection_method = found(which, snippet(original, i, 8), 'Opção marcada com (x)');
  } else if (hasCVA && hasCVD) {
    r.conflicts.push('O texto menciona CVA e CVD. Confirme a forma de coleta.');
  } else if (hasCVA) {
    const i = lower.search(/\bcva\b|cateterismo|sondagem de al/);
    r.collection_method = found('CVA', snippet(original, i, 3));
  } else if (hasCVD) {
    const i = lower.search(/\bcvd\b|sonda vesical|cateter vesical|\bsvd\b/);
    r.collection_method = found('CVD', snippet(original, i, 3));
  }

  // ---------- Origem ----------
  const originRules: [RegExp, Origin][] = [
    [/intercorr[e]ncia|intercorrencia/, 'INTERCORRENCIA'],
    [/\bticket\b|\btiket\b/, 'TICKET_ELETIVO'],
    [/demanda externa/, 'DEMANDA_EXTERNA'],
  ];
  const origins = originRules.filter(([re]) => re.test(lower));
  if (origins.length === 1) {
    const i = lower.search(origins[0][0]);
    r.origin = found(origins[0][1], snippet(original, i, 12));
  } else if (origins.length > 1) {
    r.conflicts.push('Mais de uma origem foi mencionada. Confirme a origem da solicitação.');
  }

  // ---------- Prioridade (independente da origem) ----------
  const prio: [RegExp, Priority][] = [
    // "emergencial/emergência" é tratado como URGENTE (a operação usa apenas ELETIVA e URGENTE)
    [/emergencia[l]?|emergencial|\burgent[e]\b|\burgencia\b/, 'URGENTE'],
    [/\beletiv[ao]\b/, 'ELETIVA'],
  ];
  for (const [re, p] of prio) {
    const m = lower.match(re);
    if (!m) continue;
    // "ticket eletivo" é origem, não prioridade
    if (p === 'ELETIVA' && /ticket eletiv/.test(lower.slice(Math.max(0, m.index! - 7), m.index! + 8))) {
      const rest = lower.replace(/ticket eletiv[ao]/g, '');
      if (!/\beletiv[ao]\b/.test(rest)) continue;
    }
    r.priority = found(p, snippet(original, m.index!, m[0].length));
    break;
  }
  const just = original.match(/(?:justificativa|motivo(?: da urg[eê]ncia| da emerg[eê]ncia)?)\s*:\s*([^\n.]+)/i);
  if (just) r.emergency_justification = found(just[1].trim(), snippet(original, just.index!, just[0].length));

  // ---------- Datas ----------
  const dates = findDates(lower, ctx);
  for (const d of dates) {
    const before = lower.slice(Math.max(0, d.index - 35), d.index);
    if (/receb|chegou|solicitad[ao] (?:em|no dia)|aberto (?:em|no dia)|pedido (?:em|no dia)/.test(before) && r.received_date.confidence === 'missing') {
      r.received_date = found(d.iso, snippet(original, d.index, d.length));
    } else if (r.scheduled_date.confidence === 'missing' && !/nasc|interna|hospitaliz|alta /.test(before) && d.iso >= addDays(ctx.today, -1)) {
      const bareDate = /(?:^|\n)\s*data\s*:?\s*$/i.test(original.slice(Math.max(0, d.index - 35), d.index));
      r.scheduled_date = bareDate
        ? inferred(d.iso, 'Campo "Data" interpretado como data da coleta — confira.', snippet(original, d.index, d.length))
        : found(d.iso, snippet(original, d.index, d.length), d.relative ? `"${d.text}" interpretado como ${d.iso.split('-').reverse().join('/')}` : undefined);
    }
  }
  if (r.received_date.confidence === 'missing') {
    r.received_date = inferred(ctx.today, 'Data de hoje (padrão). Altere se a solicitação chegou em outro dia.');
  }

  // ---------- Turno de recebimento ----------
  const shift = lower.match(/\b(diurno|noturno|plantao (?:diurno|noturno)|plantao da noite|plantao do dia)\b/);
  if (shift) {
    r.receipt_shift = found(/notur|noite/.test(shift[1]) ? 'NOTURNO' : 'DIURNO', snippet(original, shift.index!, shift[0].length));
  } else {
    r.receipt_shift = inferred(ctx.nowHour >= 7 && ctx.nowHour < 19 ? 'DIURNO' : 'NOTURNO', 'Definido pelo horário atual do registro. Altere se necessário.');
  }

  // ---------- Período / horário da coleta ----------
  const time = lower.match(/\b(?:as|às|a partir das|apos as|depois das|ate as)?\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(?:h|hs|horas)?\b/);
  const periodRules: [RegExp, Period][] = [
    [/primeiro horario|parte da manha|\bmanha\b|\bcedo\b/, 'MANHA'],
    [/\btarde\b/, 'TARDE'],
    [/\bnoite\b(?!.*plantao)/, 'NOITE'],
    [/qualquer horario/, 'QUALQUER'],
  ];
  for (const [re, p] of periodRules) {
    const m = lower.match(re);
    if (m && !/plantao (?:da )?noite|turno da noite|noturno/.test(lower.slice(Math.max(0, m.index! - 12), m.index! + 6))) {
      r.scheduled_period = found(p, snippet(original, m.index!, m[0].length));
      break;
    }
  }
  if (time) {
    const h = +time[1];
    const mi = time[2] ? +time[2] : 0;
    const ctxBefore = lower.slice(Math.max(0, time.index! - 15), time.index! + time[0].length);
    if (h <= 23 && mi <= 59 && !/\d[/.-]$/.test(lower.slice(0, time.index!)) && /h|:|horas/.test(time[0])) {
      const hhmm = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
      if (/apos|depois|a partir|ate/.test(ctxBefore)) {
        // restrição de horário vai para observação, sem fixar o horário
        r.notes = found(`Restrição de horário: ${time[0].trim()}`, snippet(original, time.index!, time[0].length));
        if (r.scheduled_period.confidence === 'missing') r.scheduled_period = inferred(h < 12 ? 'MANHA' : h < 18 ? 'TARDE' : 'NOITE', `Período deduzido da restrição "${time[0].trim()}"`);
      } else {
        r.scheduled_time = found(hhmm, snippet(original, time.index!, time[0].length));
        r.scheduled_period = found('HORARIO', snippet(original, time.index!, time[0].length));
      }
    }
  }

  // ---------- Material na residência ----------
  const mat = /(potinho|pote|frasco|coletor|material|kit)/;
  const matNeg = lower.match(new RegExp(`(?:nao|sem|n)\\s+(?:\\w+\\s+){0,3}${mat.source}|${mat.source}\\s+(?:\\w+\\s+){0,2}(?:nao tem|nao possui|em falta|faltando|indisponivel)`));
  const matUnk = lower.match(new RegExp(`${mat.source}\\s+(?:\\w+\\s+){0,3}(?:nao confirmad|a confirmar|verificar|confirmar)|(?:verificar|confirmar)\\s+(?:se\\s+)?(?:\\w+\\s+){0,3}${mat.source}`));
  const matPos = lower.match(new RegExp(`(?:tem|possui|ha|existe|dispoe de|com)\\s+(?:o\\s+|a\\s+|um\\s+|uma\\s+)?${mat.source}|${mat.source}\\s+(?:\\w+\\s+){0,3}(?:disponivel|na residencia|em casa|ok)`));
  // resposta de questionário: "1. Material na casa para coleta...: SIM"
  let qa: 'SIM' | 'NAO' | null = null;
  let qaLine = '';
  for (const line of original.split('\n')) {
    const m = normalize(line).match(new RegExp(`${mat.source}[^:?]*[:?]\\s*(sim|nao)\\b`));
    if (m) { qa = m[2] === 'sim' ? 'SIM' : 'NAO'; qaLine = line.trim(); break; }
  }
  const other = qa === 'SIM' ? matNeg : qa === 'NAO' ? matPos : null;
  if (qa && other) {
    const said = original.slice(other.index!, other.index! + other[0].length + 20).split('\n')[0].trim();
    const q = qaLine.replace(/^\s*\d+\s*[.)-]\s*/, '').split(/[:?]\s*(?=sim|n[aã]o)/i)[0].slice(0, 45).trim();
    r.conflicts.push(`Informação de material contraditória: o texto diz "${said}", mas na pergunta "${q}…" a resposta é ${qa === 'SIM' ? 'SIM' : 'NÃO'}. Existe potinho na residência?`);
  } else if (qa) r.material_available = found(qa, qaLine);
  else if (matUnk) r.material_available = found('NAO_CONFIRMADO', snippet(original, matUnk.index!, matUnk[0].length));
  else if (matNeg) r.material_available = found('NAO', snippet(original, matNeg.index!, matNeg[0].length));
  else if (matPos) r.material_available = found('SIM', snippet(original, matPos.index!, matPos[0].length));

  // ---------- Telefone ----------
  const phoneRe = /(?:\+?55\s*)?(?:\(?\s*(\d{2})\s*\)?\s*)?(9?\s?\d{4})[\s.-]?(\d{4})\b/g;
  for (const m of r.contact_phone.confidence === 'missing' ? original.matchAll(phoneRe) : []) {
    const digits = onlyDigits(m[0]).replace(/^55(?=\d{10,11}$)/, '');
    const pre = original.slice(Math.max(0, m.index! - 6), m.index!);
    if (/cep\s*:?\s*$/i.test(pre)) continue;
    if (digits.length >= 8 && digits.length <= 11 && !/^\d{5}-?\d{3}$/.test(m[0].trim())) {
      r.contact_phone = found(formatPhone(digits), snippet(original, m.index!, m[0].length));
      break;
    }
  }

  // ---------- Familiar (linha do questionário tem prioridade) ----------
  for (const line of original.split('\n')) {
    if (!/familiar|respons[aá]vel que/i.test(line) || !line.includes(':')) continue;
    const answer = line.split(/:\s(?!\d)|:(?=\s*[A-ZÁÉÍÓÚ])/).pop() ?? '';
    const nameFirst = answer.match(new RegExp(`(${NAME_RE})\\s*\\(?\\s*(${RELATIONS})\\b`, 'u'));
    const relFirst = answer.match(new RegExp(`(${RELATIONS})\\s*:?\\s*(${NAME_RE})`, 'u'));
    const nm = nameFirst ? capitalizedPrefix(nameFirst[1]) : relFirst ? capitalizedPrefix(relFirst[2]) : capitalizedPrefix(answer);
    const rel = nameFirst?.[2] ?? relFirst?.[1];
    if (nm) r.family_contact_name = found(rel ? `${nm} (${rel.toLowerCase()})` : nm, snippet(original, original.indexOf(line), line.length));
    const ph = onlyDigits(answer.match(/\(?\s*\d{2}\s*\)?\s*9?\s?\d{4}[\s.-]?\d{4}/)?.[0]);
    if (ph.length >= 10 && ph.length <= 11) r.contact_phone = found(formatPhone(ph), snippet(original, original.indexOf(line), line.length), 'Telefone do familiar que confirmou');
    if (nm) break;
  }

  // ---------- Familiar ----------
  if (r.family_contact_name.confidence === 'missing') {
  const relRe = new RegExp(`(?:^|[\\s,.(])(?:a|o)?\\s*(${RELATIONS})\\s*(?:,|:|-)?\\s*(?:(?:sr\\.?|sra\\.?|senhora?|dona|chamad[ao])\\s+)?(${NAME_RE})`, 'giu');
  for (const fam of original.matchAll(relRe)) {
    const name = capitalizedPrefix(fam[2]);
    if (name) {
      r.family_contact_name = found(`${name} (${fam[1].toLowerCase()})`, snippet(original, fam.index!, fam[0].length));
      break;
    }
  }
  }
  if (r.family_contact_name.confidence === 'missing') {
    const famLabel = original.match(new RegExp(`(?:falei com|contato com|confirmado (?:com|por)|confirmou com)\\s*(?:a|o)?\\s*(?:(?:sr|sra)\\.?\\s+|dona\\s+)?(${NAME_RE})(?:\\s*\\((${RELATIONS})\\))?`, 'iu'));
    const name = famLabel ? capitalizedPrefix(famLabel[1]) : null;
    if (famLabel && name) r.family_contact_name = found(famLabel[2] ? `${name} (${famLabel[2].toLowerCase()})` : name, snippet(original, famLabel.index!, famLabel[0].length));
  }

  // ---------- Convênio ----------
  const planLabel = original.match(/conv[eê]nio\s*:?\s*([A-Za-zÀ-ú0-9 \-]{2,40}?)(?=[,.;\n]|$)/i);
  for (const [re, nameP] of HEALTH_PLANS) {
    const m = original.match(re);
    if (m) {
      const suffix = m[1] ? ` - ${m[1].toUpperCase()}` : '';
      r.health_plan = found(nameP + suffix, snippet(original, m.index!, m[0].length));
      break;
    }
  }
  if (r.health_plan.confidence === 'missing' && planLabel) {
    r.health_plan = found(planLabel[1].trim(), snippet(original, planLabel.index!, planLabel[0].length));
  }

  // ---------- Endereço ----------
  let addrLabel = original.match(/(?:endere[cç]o|end\.|reside em|mora (?:na|no|em))\s*:?\s*([^\n]+)/i);
  if (addrLabel) {
    // junta as linhas seguintes até o próximo rótulo ("Telefone de contato:", "Data de internação:"...)
    const rest = original.slice(addrLabel.index! + addrLabel[0].length).split('\n').slice(1);
    const extra: string[] = [];
    for (const l of rest) { if (!l.trim() || LABEL_LINE.test(l) || extra.length >= 2) break; extra.push(l.trim()); }
    if (extra.length) {
      // linha terminando em "-" continua com novo trecho; senão, é a mesma palavra/trecho quebrado pelo print
      let joined = addrLabel[1].trim();
      for (const l of extra) joined = /[-–]$/.test(joined) ? `${joined.replace(/[-–]$/, '').trim()} - ${l}` : `${joined} ${l}`;
      addrLabel = Object.assign([addrLabel[0], joined], { index: addrLabel.index, input: addrLabel.input }) as RegExpMatchArray;
    }
  }
  const addrStreet = original.match(new RegExp(`(?:^|[\\s.;:])(${STREET_TYPES}\\s[^\\n]+)`, 'i'));
  const addrText = addrLabel?.[1] ?? addrStreet?.[1] ?? null;
  if (addrText) {
    // corta no início de outra informação (ex.: "Telefone", "Convênio") se vier na mesma linha
    const cut = addrText.split(/\.\s+(?=[A-ZÁÉÍÓÚ][a-z]+\s)|\s(?=(?:telefone|tel\.?|contato|conv[eê]nio|familiar|obs)\b)/i)[0];
    const parsed = parseAddress(cut);
    const idx = original.indexOf(cut);
    r.address = found(parsed, snippet(original, idx, cut.length));
    if (parsed.neighborhood) r.neighborhood = found(parsed.neighborhood, parsed.raw);
    if (parsed.city) {
      const explicitCity = normalize(parsed.raw).includes(normalize(parsed.city));
      r.city = explicitCity ? found(parsed.city, parsed.raw) : inferred(parsed.city, 'Cidade deduzida a partir do bairro informado.');
    }
    if (parsed.cep) r.cep = found(parsed.cep, parsed.raw);
  } else {
    const place = findPlaceInText(original);
    if (place.neighborhood) r.neighborhood = found(place.neighborhood, place.neighborhood);
    if (place.city) r.city = found(place.city, place.city);
    else if (place.neighborhood) {
      const parsed = parseAddress(place.neighborhood);
      if (parsed.city) r.city = inferred(parsed.city, 'Cidade deduzida a partir do bairro informado.');
    }
    const cep = original.match(/\b(\d{5})-?(\d{3})\b/);
    if (cep) r.cep = found(`${cep[1]}-${cep[2]}`, cep[0]);
  }

  // ---------- Observações relevantes ----------
  const sentences = original.split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).filter(Boolean);
  const noteKeys = /(obs|observa|aten[cç][aã]o|cuidado|prefer|pede|solicita que|ligar antes|contato antecipado|interfone|portaria|acamad|cadeirante|cachorro|c[aã]o|hor[aá]rio|antes das|depois das|ap[oó]s as|n[aã]o pode|jejum|laborat[oó]rio|antibi[oó]tico|atb)/i;
  const notes = sentences.filter((s) => noteKeys.test(s) && !/^paciente\b/i.test(s) && !/familiar|potinho|material na casa|^\s*\d+\s*[.)-]/i.test(s)
    && !/[:?]\s*(sim|n[aã]o)\.?$/i.test(s) && !/\?$/.test(s) && !/^\s*-/.test(s) && s.length < 220);
  const atend = original.match(/n[º°o.]?\s*(?:de\s+)?atendimento\s*:?\s*(\d{3,12})/i);
  if (atend) notes.unshift(`Nº atendimento: ${atend[1]}.`);
  const program = original.match(/motivo do atendimento\s*:\s*([^\n]+(?:\n(?![^:\n]{1,45}:)[^\n]+){0,3})/i);
  if (program) notes.push(`Atendimento domiciliar: ${program[1].replace(/\s+/g, ' ').trim().slice(0, 200)}.`);
  for (const qline of original.split('\n')) {
    const q = qline.match(/^\s*\d+\s*[.)-]\s*-?\s*(.+?)[:?]\s*(sim|n[aã]o)\b\.?\s*$/i);
    if (q && !new RegExp(mat.source + '|familiar', 'i').test(normalize(q[1]))) notes.push(`${q[1].trim().slice(0, 90)}: ${q[2].toUpperCase()}.`);
  }
  const chosen = onlyDigits(r.contact_phone.value);
  const others: string[] = [];
  for (const c of original.matchAll(new RegExp(`\\(?\\s*(\\d{10,11})\\s*\\)?\\s+(${NAME_WORD})\\s+\\(?(${RELATIONS})\\)?`, 'gu'))) {
    if (c[1] !== chosen) others.push(`${c[2]} (${c[3].toLowerCase()}) ${formatPhone(c[1])}`);
  }
  if (others.length) notes.push(`Outros contatos do cadastro: ${[...new Set(others)].join('; ')}.`);
  if (notes.length) {
    const joined = [r.notes.value, ...notes].filter(Boolean).join(' ');
    r.notes = found(joined, notes[0]);
  }

  return r;
}

/** Provedor padrão (regras locais). */
export const localRulesProvider: ExtractionProvider = {
  id: 'local-rules',
  label: 'Interpretação local (sem envio de dados)',
  async extract(text, ctx) {
    return extractFromText(text, ctx);
  },
};
