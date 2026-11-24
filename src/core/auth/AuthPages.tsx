import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { appConfig } from '../config';
import { friendlyError } from '../lib/errors';
import { Icon, BrandMark } from '../components/Icon';
import { AlertBox, SelectInput, TextInput } from '../components/ui';
import { siteBaseUrl, useAuth } from './AuthProvider';

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <aside className="auth-hero">
        <div>
          <div className="row" style={{ gap: 14 }}>
            <div className="brand-mark" style={{ width: 52, height: 52 }}><BrandMark size={34} /></div>
            <div>
              <h1>{appConfig.appName}</h1>
              <div className="tag">{appConfig.appSubtitle}</div>
            </div>
          </div>
          <p className="slogan">Informação que <b>organiza</b>.<br />Inteligência que <b>movimenta</b>.</p>
        </div>
        <div className="auth-features">
          <div><Icon name="sparkles" /> Registro de coletas em poucos minutos: cole a mensagem e o sistema organiza.</div>
          <div><Icon name="calendar" /> Agenda inteligente com alertas de volume, atraso e pendências.</div>
          <div><Icon name="map" /> Visão regional da operação no Rio de Janeiro.</div>
          <div><Icon name="shield" /> Dados de pacientes protegidos, com acesso por perfil e auditoria.</div>
        </div>
        <div className="small" style={{ opacity: 0.75, position: 'relative', zIndex: 1 }}>{appConfig.company} · Módulo Coletas de Urina</div>
      </aside>
      <main className="auth-panel"><div className="auth-card">{children}</div></main>
    </div>
  );
}

export function ConfigMissingPage() {
  return (
    <AuthLayout>
      <h2>Configuração pendente</h2>
      <p className="lead">O sistema ainda não está ligado ao banco de dados (Supabase).</p>
      {appConfig.secretKeyDetected ? (
        <AlertBox kind="critical" title="Chave secreta detectada!">
          A chave configurada é a <b>service_role/secret</b>. Ela NUNCA pode ficar no site. Remova-a das variáveis do GitHub,
          gere uma nova chave secreta no Supabase (a atual deve ser considerada exposta) e use a chave <b>anon/publishable</b>.
        </AlertBox>
      ) : (
        <AlertBox kind="info" title="O que falta fazer">
          Cadastre as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no GitHub
          (Settings → Secrets and variables → Actions → Variables) e publique novamente. O passo a passo está no README do projeto.
        </AlertBox>
      )}
    </AuthLayout>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlError = new URLSearchParams(window.location.search).get('error_description');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) setError(friendlyError(error));
  }

  return (
    <AuthLayout>
      <h2>Entrar</h2>
      <p className="lead">Acesse com seu e-mail e senha.</p>
      {urlError && <AlertBox kind="warning" title="O link não pôde ser usado">{urlError}. Se você acabou de confirmar o e-mail, apenas entre com sua senha.</AlertBox>}
      <form className="stack" onSubmit={submit} noValidate>
        <TextInput label="E-mail" type="email" value={email} onChange={setEmail} autoComplete="email" required inputMode="email" />
        <TextInput label="Senha" type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
        {error && <AlertBox kind="critical">{error}</AlertBox>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy || !email || !password}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
      <div className="auth-links">
        <Link to="/recuperar-senha">Esqueci minha senha</Link>
        <Link to="/cadastro">Criar conta</Link>
      </div>
    </AuthLayout>
  );
}

export function passwordProblems(p: string): string[] {
  const out: string[] = [];
  if (p.length < 10) out.push('mínimo de 10 caracteres');
  if (!/[a-z]/.test(p)) out.push('letra minúscula');
  if (!/[A-Z]/.test(p)) out.push('letra maiúscula');
  if (!/\d/.test(p)) out.push('número');
  if (!/[^A-Za-z0-9]/.test(p)) out.push('símbolo (ex.: ! @ # $)');
  return out;
}

export function SignupPage() {
  const [f, setF] = useState({ full_name: '', sector_id: '', email: '', phone: '', password: '', confirm: '' });
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [touched, setTouched] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    supabase.from('sectors').select('id,name').eq('active', true).order('name').then(({ data }) => setSectors(data ?? []));
  }, []);

  const pw = passwordProblems(f.password);
  const errors = {
    full_name: f.full_name.trim().split(/\s+/).length < 2 ? 'Informe nome e sobrenome.' : null,
    sector_id: !f.sector_id ? 'Selecione o setor.' : null,
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) ? 'E-mail inválido.' : null,
    phone: f.phone.replace(/\D/g, '').length < 10 ? 'Informe o telefone com DDD.' : null,
    password: pw.length ? `A senha precisa de: ${pw.join(', ')}.` : null,
    confirm: f.confirm !== f.password ? 'As senhas não conferem.' : null,
  };
  const valid = Object.values(errors).every((e) => !e);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signUp({
      email: f.email.trim().toLowerCase(),
      password: f.password,
      options: {
        emailRedirectTo: siteBaseUrl(),
        // Apenas dados cadastrais. Nenhum privilégio é concedido por aqui.
        data: { full_name: f.full_name.trim(), phone: f.phone.trim(), sector_id: f.sector_id },
      },
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else setDone(true);
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="stack">
          <Icon name="mail" size={44} className="muted" />
          <h2>Confirme seu e-mail</h2>
          <p>Enviamos um link de confirmação para <b>{f.email}</b>. Abra a mensagem e clique no link (verifique também a caixa de spam).</p>
          <AlertBox kind="info" title="Próximo passo">Depois da confirmação, seu acesso fica <b>aguardando aprovação</b> da administração. Você será avisado(a) ao entrar.</AlertBox>
          <Link className="btn btn-secondary" to="/">Voltar para o login</Link>
        </div>
      </AuthLayout>
    );
  }

  const show = (k: keyof typeof errors) => (touched ? errors[k] : null);
  return (
    <AuthLayout>
      <h2>Criar conta</h2>
      <p className="lead">Após confirmar o e-mail, a administração libera o seu acesso.</p>
      <form className="stack" onSubmit={submit} noValidate>
        <TextInput label="Nome completo" value={f.full_name} onChange={set('full_name')} required autoComplete="name" maxLength={150} error={show('full_name')} />
        <SelectInput label="Setor" value={f.sector_id} onChange={set('sector_id')} required options={sectors.map((s) => ({ value: s.id, label: s.name }))} error={show('sector_id')} />
        <TextInput label="E-mail" type="email" value={f.email} onChange={set('email')} required autoComplete="email" inputMode="email" error={show('email')} />
        <TextInput label="Telefone" type="tel" value={f.phone} onChange={set('phone')} required autoComplete="tel" inputMode="tel" placeholder="(21) 99999-9999" maxLength={20} error={show('phone')} />
        <TextInput label="Senha" type="password" value={f.password} onChange={set('password')} required autoComplete="new-password"
          hint="Mínimo 10 caracteres, com maiúscula, minúscula, número e símbolo." error={show('password')} />
        <TextInput label="Confirmar senha" type="password" value={f.confirm} onChange={set('confirm')} required autoComplete="new-password" error={show('confirm')} />
        {error && <AlertBox kind="critical">{error}</AlertBox>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Enviando…' : 'Criar conta'}</button>
      </form>
      <div className="auth-links"><Link to="/">Já tenho conta</Link></div>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: siteBaseUrl() });
    setBusy(false);
    // Mesmo se o e-mail não existir, a mensagem é a mesma (não revela quem tem conta).
    if (error && /rate|network|fetch/i.test(error.message)) setError(friendlyError(error));
    else setSent(true);
  }
  return (
    <AuthLayout>
      <h2>Recuperar senha</h2>
      {sent ? (
        <div className="stack">
          <AlertBox kind="success" title="Verifique seu e-mail">Se existir uma conta com este endereço, você receberá um link para criar uma nova senha. Abra o link <b>neste mesmo navegador</b>.</AlertBox>
          <Link className="btn btn-secondary" to="/">Voltar para o login</Link>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <p className="lead">Informe o e-mail cadastrado.</p>
          <TextInput label="E-mail" type="email" value={email} onChange={setEmail} required autoComplete="email" inputMode="email" />
          {error && <AlertBox kind="critical">{error}</AlertBox>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy || !email}>{busy ? 'Enviando…' : 'Enviar link'}</button>
          <div className="auth-links"><Link to="/">Voltar</Link></div>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { clearRecovery } = useAuth();
  const nav = useNavigate();
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problems = passwordProblems(p);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problems.length || p !== c) return;
    setBusy(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password: p });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else { clearRecovery(); nav('/', { replace: true }); }
  }
  return (
    <AuthLayout>
      <h2>Criar nova senha</h2>
      <form className="stack" onSubmit={submit}>
        <TextInput label="Nova senha" type="password" value={p} onChange={setP} autoComplete="new-password" required
          error={p && problems.length ? `Falta: ${problems.join(', ')}.` : null} hint="Mínimo 10 caracteres, com maiúscula, minúscula, número e símbolo." />
        <TextInput label="Confirmar nova senha" type="password" value={c} onChange={setC} autoComplete="new-password" required error={c && c !== p ? 'As senhas não conferem.' : null} />
        {error && <AlertBox kind="critical">{error}</AlertBox>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy || !!problems.length || p !== c}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
      </form>
    </AuthLayout>
  );
}

export function PendingAccessPage() {
  const { access, refreshAccess, signOut, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const st = access?.profile?.status;
  const approvedNoRole = st === 'approved';
  return (
    <AuthLayout>
      <div className="stack">
        <Icon name={st === 'blocked' || st === 'rejected' ? 'lock' : 'clock'} size={44} className="muted" />
        {approvedNoRole ? (
          <><h2>Acesso aprovado, sem módulo atribuído</h2><p>Seu cadastro foi aprovado, mas ainda não há um perfil (Técnica ou Coordenação) atribuído a você. Peça à administração para concluir a liberação.</p></>
        ) : st === 'blocked' ? (
          <><h2>Acesso bloqueado</h2><p>Seu acesso foi bloqueado pela administração.{access?.profile?.status_reason ? ` Motivo: ${access.profile.status_reason}` : ''}</p></>
        ) : st === 'rejected' ? (
          <><h2>Cadastro não aprovado</h2><p>Seu cadastro não foi aprovado.{access?.profile?.status_reason ? ` Motivo: ${access.profile.status_reason}` : ''} Em caso de dúvida, procure a coordenação.</p></>
        ) : (
          <><h2>Aguardando aprovação</h2><p>Olá{access?.profile?.full_name ? `, ${access.profile.full_name.split(' ')[0]}` : ''}! Seu e-mail <b>{session?.user.email}</b> foi confirmado. A administração foi avisada e vai liberar seu acesso em breve.</p></>
        )}
        <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); await refreshAccess(); setBusy(false); }}>
          <Icon name="refresh" size={18} /> {busy ? 'Verificando…' : 'Verificar novamente'}
        </button>
        <button className="btn btn-ghost" onClick={() => void signOut()}><Icon name="logout" size={18} /> Sair</button>
      </div>
    </AuthLayout>
  );
}
