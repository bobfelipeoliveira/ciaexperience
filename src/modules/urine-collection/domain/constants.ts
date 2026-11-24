/** Códigos guardados no banco → rótulos padronizados exibidos e exportados. */
export const ORIGINS = {
  INTERCORRENCIA: 'INTERCORRÊNCIA',
  TICKET_ELETIVO: 'TICKET ELETIVO',
  DEMANDA_EXTERNA: 'DEMANDA EXTERNA',
} as const;
export type Origin = keyof typeof ORIGINS;

export const PRIORITIES = {
  ELETIVA: 'ELETIVA',
  URGENTE: 'URGENTE',
  EMERGENCIAL: 'EMERGENCIAL',
} as const;
export type Priority = keyof typeof PRIORITIES;

export const METHODS = { CVA: 'CVA', CVD: 'CVD' } as const;
export type Method = keyof typeof METHODS;
export const METHOD_HINT: Record<Method, string> = {
  CVA: 'Coleta por micção espontânea / coletor (sem sonda)',
  CVD: 'Coleta por sonda vesical de demora',
};

export const MATERIAL = { SIM: 'SIM', NAO: 'NÃO', NAO_CONFIRMADO: 'NÃO CONFIRMADO' } as const;
export type Material = keyof typeof MATERIAL;

export const SHIFTS = { DIURNO: 'DIURNO', NOTURNO: 'NOTURNO' } as const;
export type Shift = keyof typeof SHIFTS;

export const PERIODS = {
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  NOITE: 'Noite',
  HORARIO: 'Horário definido',
  QUALQUER: 'Qualquer horário',
} as const;
export type Period = keyof typeof PERIODS;

export const STATUSES = {
  RECEBIDA: 'RECEBIDA',
  AGUARDANDO_CONFIRMACAO: 'AGUARDANDO CONFIRMAÇÃO',
  AGUARDANDO_MATERIAL: 'AGUARDANDO MATERIAL',
  AGENDADA: 'AGENDADA',
  EM_EXECUCAO: 'EM EXECUÇÃO',
  REALIZADA: 'REALIZADA',
  REAGENDADA: 'REAGENDADA',
  CANCELADA: 'CANCELADA',
  NAO_REALIZADA: 'NÃO REALIZADA',
  PENDENTE_INFORMACAO: 'PENDENTE DE INFORMAÇÃO',
} as const;
export type Status = keyof typeof STATUSES;

/** Status que encerram a solicitação (não entram na agenda ativa). */
export const CLOSED_STATUSES: Status[] = ['REALIZADA', 'CANCELADA', 'NAO_REALIZADA'];
export const isActiveStatus = (s: Status) => !CLOSED_STATUSES.includes(s);

export const STATUS_TONE: Record<Status, string> = {
  RECEBIDA: 'b-info',
  AGUARDANDO_CONFIRMACAO: 'b-warn',
  AGUARDANDO_MATERIAL: 'b-warn',
  AGENDADA: 'b-wine',
  EM_EXECUCAO: 'b-pink',
  REALIZADA: 'b-ok',
  REAGENDADA: 'b-warn',
  CANCELADA: 'b-neutral',
  NAO_REALIZADA: 'b-crit',
  PENDENTE_INFORMACAO: 'b-warn',
};

export const PRIORITY_TONE: Record<Priority, string> = {
  ELETIVA: 'b-info',
  URGENTE: 'b-warn',
  EMERGENCIAL: 'b-crit',
};
export const PRIORITY_COLOR: Record<Priority, string> = {
  ELETIVA: '#6b3fa0',
  URGENTE: '#b86e00',
  EMERGENCIAL: '#b4182d',
};

export const ATTACHMENT_CATEGORIES = {
  PEDIDO_MEDICO: 'Pedido médico',
  SOLICITACAO_EXAME: 'Solicitação de exame',
  DOCUMENTO: 'Documento pertinente',
  OUTRO: 'Outro',
} as const;
export type AttachmentCategory = keyof typeof ATTACHMENT_CATEGORIES;

export const NOT_INFORMED = 'NÃO INFORMADO';

export function label<T extends Record<string, string>>(map: T, key: string | null | undefined, fallback = NOT_INFORMED): string {
  if (!key) return fallback;
  return (map as Record<string, string>)[key] ?? key;
}
