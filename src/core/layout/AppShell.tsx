import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Icon, BrandMark } from '../components/Icon';
import { PageLoading } from '../components/ui';
import { useAuth } from '../auth/AuthProvider';
import { initials } from '../lib/text';
import { appConfig } from '../config';
import type { PlatformModule } from '../modules';
import { useNotifications } from '../pages/NotificationsList';

function ModuleMenu({ mod }: { mod: PlatformModule }) {
  const { hasRole, isAdmin } = useAuth();
  const badges = mod.useBadges?.() ?? {};
  return (
    <>
      <div className="nav-section">{mod.name}</div>
      {mod.menu.filter((i) => (i.adminOnly ? isAdmin : !i.roles || hasRole(mod.key, i.roles))).map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end}>
          <Icon name={i.icon} />{i.label}
          {i.badge && badges[i.badge] ? <span className="nav-badge">{badges[i.badge]}</span> : null}
        </NavLink>
      ))}
    </>
  );
}

export function AppShell({ modules, children }: { modules: PlatformModule[]; children: ReactNode }) {
  const { access, isAdmin, signOut, primaryRoleLabel } = useAuth();
  const { unread } = useNotifications();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const name = access?.profile?.full_name ?? '';
  const current = modules[0];

  return (
    <div className="shell">
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Menu principal">
        <div className="brand">
          <div className="brand-mark"><BrandMark /></div>
          <div><div className="brand-title">{appConfig.appName}</div><div className="brand-sub">{appConfig.appSubtitle}</div></div>
        </div>
        <nav className="nav">
          {modules.map((m) => <ModuleMenu key={m.key} mod={m} />)}
          <div className="nav-section">Plataforma</div>
          {isAdmin && <NavLink to="/usuarios"><Icon name="users" />Usuários</NavLink>}
          {isAdmin && <NavLink to="/importacao"><Icon name="upload" />Importar planilha</NavLink>}
          <NavLink to="/configuracoes"><Icon name="settings" />Configurações</NavLink>
          <button className="btn btn-ghost" style={{ color: '#fff', justifyContent: 'flex-start', gap: 12, padding: '8px 12px' }} onClick={() => void signOut()}><Icon name="logout" />Sair</button>
        </nav>
        <div className="sidebar-foot">{appConfig.company}<br />{appConfig.slogan}</div>
      </aside>
      <div className={`backdrop${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setOpen(true)} aria-label="Abrir menu"><Icon name="menu" /></button>
          <div className="topbar-title">
            <strong>{appConfig.appName}</strong>
            <span>{appConfig.appSubtitle}</span>
          </div>
          {current && <span className="module-pill">{current.headerLabel}</span>}
          <div className="topbar-actions">
            <Link to="/alertas" className="icon-btn" aria-label={`Notificações${unread ? ` (${unread} novas)` : ''}`}>
              <Icon name="bell" />{unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
            </Link>
            <Link to="/configuracoes" className="user-chip" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="avatar">{initials(name)}</span>
              <span className="who"><b>{name.split(' ').slice(0, 2).join(' ')}</b><small>{primaryRoleLabel}</small></span>
            </Link>
          </div>
        </header>
        <main className="content"><Suspense fallback={<PageLoading />}>{children}</Suspense></main>
      </div>
    </div>
  );
}
