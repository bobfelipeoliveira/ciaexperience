/**
 * OPCIONAL — Aviso por E-MAIL ao administrador quando alguém confirma o cadastro.
 * (O aviso DENTRO do sistema já funciona sem esta função.)
 *
 * Usa o Resend (plano gratuito: 100 e-mails/dia — confira os limites atuais no site).
 * Configuração (Supabase → Edge Functions → Secrets):
 *   RESEND_API_KEY   chave do Resend (NUNCA no código/GitHub)
 *   MAIL_FROM        remetente verificado no Resend (ex.: "CIA <avisos@seudominio.com.br>")
 *   WEBHOOK_SECRET   texto aleatório longo; o mesmo vai no cabeçalho do Database Webhook
 * O destinatário vem da configuração "admin_notification_email" (tela Configurações).
 * O e-mail NÃO contém dados de pacientes: apenas o nome de quem se cadastrou.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('unauthorized', { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  const rec = payload?.record;
  const old = payload?.old_record;
  // dispara somente quando o e-mail acabou de ser confirmado
  if (!rec?.email_confirmed_at || old?.email_confirmed_at) return new Response('ignored');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: setting } = await admin.from('system_settings').select('value').eq('key', 'admin_notification_email').maybeSingle();
  const to = typeof setting?.value === 'string' ? setting.value : null;
  if (!to) return new Response('no admin email configured');

  const name = String(rec.full_name ?? 'Novo usuário').replace(/[<>]/g, '').slice(0, 150);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('MAIL_FROM'),
      to: [to],
      subject: 'CIA EXPERIENCE — novo cadastro aguardando aprovação',
      text: `${name} confirmou o e-mail e aguarda aprovação de acesso.\n\nAcesse o CIA EXPERIENCE → Usuários para aprovar ou recusar.`,
    }),
  });
  return new Response(res.ok ? 'sent' : 'mail error', { status: res.ok ? 200 : 502 });
});
