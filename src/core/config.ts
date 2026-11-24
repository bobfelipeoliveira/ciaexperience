/**
 * Configuração vinda de variáveis de ambiente (definidas no GitHub → Settings →
 * Secrets and variables → Actions → Variables). Somente valores PÚBLICOS.
 * A chave "service_role"/"secret" NUNCA deve estar aqui.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

function looksLikeSecret(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  // JWT legado: verifica se o papel é service_role
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload?.role === 'service_role';
    } catch {
      return false;
    }
  }
  return false;
}

export const appConfig = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  isConfigured: /^https:\/\/.+/.test(url) && anonKey.length > 20 && !looksLikeSecret(anonKey),
  secretKeyDetected: anonKey.length > 0 && looksLikeSecret(anonKey),
  timeZone: 'America/Sao_Paulo',
  appName: 'CIA EXPERIENCE',
  appSubtitle: 'Centro de Inteligência Assistencial',
  company: 'Solar Cuidados',
  slogan: 'Informação que organiza. Inteligência que movimenta.',
  idleLogoutMinutes: 60,
};
