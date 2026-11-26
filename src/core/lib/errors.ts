/** Converte erros técnicos em mensagens compreensíveis. Nunca expõe dados de pacientes. */
export function friendlyError(err: unknown): string {
  const msg = typeof err === 'string' ? err : (err as { message?: string })?.message ?? '';
  const code = (err as { code?: string })?.code ?? '';
  const m = msg.toLowerCase();
  if (!msg) return 'Ocorreu um erro inesperado. Tente novamente.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão com o servidor. Verifique a internet e tente novamente.';
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Seu e-mail ainda não foi confirmado. Abra a mensagem que enviamos e clique no link de confirmação.';
  if (m.includes('user already registered')) return 'Já existe uma conta com este e-mail. Use "Entrar" ou "Esqueci minha senha".';
  if (m.includes('password should be') || m.includes('weak password') || m.includes('password is known')) return 'Senha fraca. Use ao menos 10 caracteres, com letras maiúsculas, minúsculas, números e símbolos.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
  if (m.includes('jwt expired') || m.includes('refresh token')) return 'Sua sessão expirou. Entre novamente.';
  if (code === '42501' || m.includes('row-level security') || m.includes('permission denied')) return 'Você não tem permissão para esta ação.';
  if (m.includes('ucr_done_requires_date')) return 'Para marcar como REALIZADA, informe a data da coleta.';
  if (m.includes('ucr_cancel_requires_reason')) return 'Informe o motivo do cancelamento / não realização.';
  if (m.includes('ucr_time_requires_period')) return 'Para informar horário, escolha o período "Horário definido".';
  if (m.includes('cep')) return 'CEP inválido. Use o formato 00000-000 ou deixe em branco.';
  if (m.includes('check constraint')) return 'Algum campo tem valor inválido. Revise os dados e tente novamente.';
  if (m.includes('mime') || m.includes('invalid_mime_type')) return 'Tipo de arquivo não permitido. Envie PDF, JPG, PNG ou WEBP.';
  if (m.includes('payload too large') || m.includes('exceeded the maximum')) return 'Arquivo muito grande. O limite é 10 MB.';
  // mensagens já escritas em português pelo banco
  if (/[áéíóúãõç]/i.test(msg) && msg.length < 200) return msg;
  return 'Não foi possível concluir a operação. Tente novamente; se persistir, avise a administração.';
}
