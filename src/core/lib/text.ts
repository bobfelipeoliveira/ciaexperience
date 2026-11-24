/** Remove acentos, baixa a caixa e colapsa espaços — usado em buscas e comparações. */
export function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** "MARIA DA SILVA" → "Maria da Silva" */
export function titleCase(s: string): string {
  const small = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]/.test(p));
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function onlyDigits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

export function formatPhone(raw: string | null | undefined): string {
  const d = onlyDigits(raw);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return (raw ?? '').trim();
}

export function clean(s: string | null | undefined): string | null {
  const t = (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t : null;
}

export function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
