/**
 * Separa um endereço colado em um único campo:
 *   "Rua das Flores, 120, apartamento 301, Vila da Penha, Rio de Janeiro - RJ."
 * → logradouro, número, complemento, bairro, cidade, UF, CEP, referência.
 *
 * Nunca inventa: o que não for identificado volta como null.
 * CEP NÃO é obrigatório.
 */
import { normalize } from '../../../core/lib/text.ts';
import { findCity, findNeighborhood, KNOWN_NAMES } from '../geo/gazetteer.ts';

export interface ParsedAddress {
  raw: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  reference: string | null;
}

const UFS = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
export const STREET_TYPES =
  '(?:rua|r\\.|av\\.?|avenida|estrada|estr\\.|est\\.|travessa|tv\\.|trav\\.|pra[cç]a|p[cç]a\\.?|alameda|al\\.|rodovia|rod\\.|largo|ladeira|beco|servid[aã]o|vila|condom[ií]nio|cond\\.|boulevard|via|caminho|parque)';
const STREET_RE = new RegExp(`^${STREET_TYPES}\\s`, 'i');
const COMPLEMENT_RE =
  /^(?:apto?\.?|apartamento|ap\.?|bloco|bl\.?|casa|cs\.?|fundos|frente|lote|lt\.?|quadra|qd\.?|sala|cobertura|cob\.?|loja|andar|torre|unidade|kitnet|sobrado)\b/i;
const NUMBER_RE = /^(?:n[º°o.]?\s*)?(\d{1,6}[a-z]?|s\/?n)\.?$/i;
const REFERENCE_RE = /\b(?:pr[oó]ximo (?:a|ao|à|de|do|da)|perto (?:de|do|da)|ref(?:er[eê]ncia)?\.?:?|em frente (?:a|ao|à)|ao lado (?:de|do|da))\s+.+$/i;

const titleKeep = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.;,]+$/, '');

export function parseAddress(input: string | null | undefined): ParsedAddress {
  const raw = (input ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const out: ParsedAddress = { raw, street: null, number: null, complement: null, neighborhood: null, city: null, state: null, cep: null, reference: null };
  if (!raw) return out;

  let s = raw;

  // CEP
  const cep = s.match(/\b(?:cep[:\s]*)?(\d{5})-?(\d{3})\b/i);
  if (cep) {
    out.cep = `${cep[1]}-${cep[2]}`;
    s = s.replace(cep[0], ' ');
  }

  // Referência
  const ref = s.match(REFERENCE_RE);
  if (ref) {
    out.reference = titleKeep(ref[0].replace(/^ref(?:er[eê]ncia)?\.?:?\s*/i, ''));
    s = s.slice(0, ref.index).trim().replace(/[\s,;.\-–]+$/, '');
  }

  // UF no final: "- RJ", "/RJ", ", RJ"
  const uf = s.match(new RegExp(`(?:[-–/,]\\s*|\\s)(${UFS})\\.?\\s*$`, 'i'));
  if (uf && uf[1].toUpperCase() === uf[1]) {
    out.state = uf[1].toUpperCase();
    s = s.slice(0, uf.index).trim();
  } else if (uf && /rj/i.test(uf[1]) && /[-–/]/.test(uf[0])) {
    out.state = 'RJ';
    s = s.slice(0, uf.index).trim();
  }

  // Quebra em partes por vírgula, ponto-e-vírgula, " - " e quebras de linha
  const parts = s
    .split(/\s*[,;\n]\s*|\s+[-–]\s*|(?<=\w)[-–]\s+/)
    .map((p) => titleKeep(p))
    .filter(Boolean);

  const unknown: string[] = [];
  const complements: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const pn = normalize(p);
    if (new RegExp(`^(${UFS})$`).test(p)) {
      out.state = out.state ?? p;
      continue;
    }

    if (!out.street && STREET_RE.test(p)) {
      // "Rua das Flores 120" / "Rua das Flores nº 120"
      const m = p.match(/^(.*?)(?:,?\s+(?:n[º°o.]?\s*)?(\d{1,6}[a-z]?|s\/?n))$/i);
      if (m && m[1].split(' ').length >= 2) {
        out.street = titleKeep(m[1]);
        out.number = m[2].toUpperCase() === 'SN' || /s\/?n/i.test(m[2]) ? 'S/N' : m[2];
      } else {
        out.street = p;
      }
      continue;
    }
    const num = p.match(NUMBER_RE);
    if (num && !out.number) {
      out.number = /s\/?n/i.test(num[1]) ? 'S/N' : num[1];
      continue;
    }
    if (COMPLEMENT_RE.test(p)) {
      complements.push(p);
      continue;
    }
    // "120 apto 301"
    const numComp = p.match(/^(\d{1,6}[a-z]?)\s+(.+)$/i);
    if (numComp && !out.number && COMPLEMENT_RE.test(numComp[2])) {
      out.number = numComp[1];
      complements.push(numComp[2]);
      continue;
    }
    // Cidade "Rio de Janeiro/RJ"
    const cityUf = p.match(new RegExp(`^(.+?)\\s*/\\s*(${UFS})$`, 'i'));
    if (cityUf && findCity(cityUf[1])) {
      out.city = findCity(cityUf[1])!.name;
      out.state = out.state ?? cityUf[2].toUpperCase();
      continue;
    }
    const city = findCity(p);
    const neigh = findNeighborhood(p);
    if (city && !neigh) {
      if (!out.city) out.city = city.name;
      continue;
    }
    if (neigh && city) {
      // Nome que é bairro e cidade ao mesmo tempo (ex.: "Centro" não é cidade; "Rio de Janeiro" é cidade)
      if (!out.neighborhood && i < parts.length - 1) out.neighborhood = neigh.name;
      else out.city = city.name;
      continue;
    }
    if (neigh && !out.neighborhood) {
      out.neighborhood = neigh.name;
      continue;
    }
    if (pn) unknown.push(p);
  }

  if (complements.length) out.complement = complements.join(', ');

  // Parte desconhecida: se ainda faltar bairro, a primeira desconhecida após o logradouro vira bairro
  if (!out.neighborhood && unknown.length) {
    const cand = unknown.find((u) => !/\d{3,}/.test(u) && u.length <= 60);
    if (cand) {
      out.neighborhood = cand;
      unknown.splice(unknown.indexOf(cand), 1);
    }
  }
  if (!out.street && unknown.length && /[a-z]/i.test(unknown[0]) && unknown[0].split(' ').length >= 2 && !out.neighborhood) {
    out.street = unknown.shift()!;
  }

  // Cidade deduzida do bairro conhecido, quando não informada (marcada como dedução na tela)
  if (!out.city && out.neighborhood) {
    const n = findNeighborhood(out.neighborhood);
    if (n) out.city = n.city;
  }
  if (out.city && !out.state) {
    const c = findCity(out.city);
    if (c) out.state = 'RJ';
  }
  return out;
}

export function isAddressIncomplete(a: Pick<ParsedAddress, 'street' | 'neighborhood' | 'city'>): boolean {
  return !a.street || !a.neighborhood || !a.city;
}

/** Procura, em um texto livre, o nome de um bairro/cidade conhecido. */
export function findPlaceInText(text: string): { neighborhood: string | null; city: string | null } {
  const n = ` ${normalize(text).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  let neighborhood: string | null = null;
  let city: string | null = null;
  for (const k of KNOWN_NAMES) {
    if (k.norm.length < 4) continue;
    if (n.includes(` ${k.norm.replace(/[^a-z0-9 ]/g, ' ')} `)) {
      if (k.place.kind === 'BAIRRO' && !neighborhood) neighborhood = k.place.name;
      if (k.place.kind === 'MUNICIPIO' && !city) city = k.place.name;
    }
    if (neighborhood && city) break;
  }
  return { neighborhood, city };
}
