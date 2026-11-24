import { lazy, Suspense, type ReactElement, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './core/auth/AuthProvider';
import { ConfigMissingPage, ForgotPasswordPage, LoginPage, PendingAccessPage, ResetPasswordPage, SignupPage } from './core/auth/AuthPages';
import { AppShell } from './core/layout/AppShell';
import { EmptyState, ErrorBox, PageLoading, ToastProvider } from './core/components/ui';
import { NotificationsProvider } from './core/pages/NotificationsList';
import { appConfig } from './core/config';
import { MODULES } from './modules';
import type { PlatformModule } from './core/modules';

const UsersPage = lazy(() => import('./core/pages/UsersPage'));
const SettingsPage = lazy(() => import('./core/pages/SettingsPage'));

function Forbidden() {
  return <EmptyState icon="lock" title="Acesso restrito">Esta área não está disponível para o seu perfil.</EmptyState>;
}

function ModuleProviders({ modules, children }: { modules: PlatformModule[]; children: ReactNode }) {
  return modules.reduceRight<ReactNode>((acc, m) => (m.Provider ? <m.Provider>{acc}</m.Provider> : acc), children) as ReactElement;
}

function AuthedApp() {
  const { ready, session, access, accessError, recoveryMode, isAdmin, hasRole, refreshAccess } = useAuth();
  if (!ready) return <PageLoading />;
  if (recoveryMode) return <ResetPasswordPage />;
  if (!session) {
    return (
      <Routes>
        <Route path="/cadastro" element={<SignupPage />} />
        <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  if (accessError) return <div className="content"><ErrorBox error="Não foi possível carregar seu perfil. Verifique se os scripts SQL foram executados no Supabase." onRetry={refreshAccess} /></div>;
  if (!access) return <PageLoading />;
  const modules = MODULES.filter((m) => (access.modules ?? []).some((x) => x.key === m.key && x.active) && (isAdmin || hasRole(m.key, ['tecnica', 'coordenacao'])));
  if (access.profile?.status !== 'approved' || (!isAdmin && modules.length === 0)) return <PendingAccessPage />;

  return (
    <NotificationsProvider>
      <ModuleProviders modules={modules}>
        <AppShell modules={modules}>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              {modules.flatMap((m) => m.routes.map((r) => {
                const allowed = r.adminOnly ? isAdmin : !r.roles || hasRole(m.key, r.roles);
                const El = r.element;
                return <Route key={m.key + r.path} path={r.path} element={allowed ? <El /> : <Forbidden />} />;
              }))}
              <Route path="/usuarios" element={isAdmin ? <UsersPage /> : <Forbidden />} />
              <Route path="/configuracoes" element={<SettingsPage />} />
              <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AppShell>
      </ModuleProviders>
    </NotificationsProvider>
  );
}

export default function App() {
  if (!appConfig.isConfigured) return <HashRouter><ConfigMissingPage /></HashRouter>;
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <AuthedApp />
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
}
