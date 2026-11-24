import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { appConfig } from './config';

export const supabase: SupabaseClient = createClient(
  appConfig.isConfigured ? appConfig.supabaseUrl : 'https://not-configured.supabase.co',
  appConfig.isConfigured ? appConfig.supabaseAnonKey : 'not-configured-key-placeholder',
  {
    auth: {
      // PKCE: o link do e-mail volta com ?code=..., compatível com as rotas do site.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

/** Busca TODAS as linhas de uma consulta paginada (o Supabase limita 1000 por vez). */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxRows = 20000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
