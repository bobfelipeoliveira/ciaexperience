import { lazy } from 'react';
import type { PlatformModule } from '../../core/modules';
import { UrineDataProvider, useUrineData } from './hooks/UrineData';

const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const NewRequestPage = lazy(() => import('./pages/NewRequestPage'));
const RequestsListPage = lazy(() => import('./pages/RequestsListPage'));
const RequestDetailPage = lazy(() => import('./pages/RequestDetailPage'));
const AgendaPage = lazy(() => import('./pages/AgendaPage'));
const MapPage = lazy(() => import('./pages/MapPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const IndicatorsPage = lazy(() => import('./pages/IndicatorsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));

export const urineCollectionModule: PlatformModule = {
  key: 'urine_collection',
  name: 'Coletas de Urina',
  headerLabel: 'MÓDULO: COLETAS DE URINA',
  Provider: UrineDataProvider,
  useBadges: () => {
    const { alerts } = useUrineData();
    return { alerts: alerts.filter((a) => a.severity !== 'info').length };
  },
  menu: [
    { to: '/', label: 'Visão geral', icon: 'home', end: true },
    { to: '/coletas/nova', label: 'Nova coleta', icon: 'plus' },
    { to: '/coletas', label: 'Solicitações', icon: 'list', end: true },
    { to: '/agenda', label: 'Agenda', icon: 'calendar' },
    { to: '/mapa', label: 'Mapa operacional', icon: 'map', roles: ['coordenacao'] },
    { to: '/alertas', label: 'Alertas', icon: 'bell', badge: 'alerts' },
    { to: '/indicadores', label: 'Indicadores', icon: 'chart', roles: ['coordenacao'] },
    { to: '/relatorios', label: 'Relatórios', icon: 'file', roles: ['coordenacao'] },
  ],
  routes: [
    { path: '/', element: OverviewPage },
    { path: '/coletas/nova', element: NewRequestPage },
    { path: '/coletas', element: RequestsListPage },
    { path: '/coletas/:id', element: RequestDetailPage },
    { path: '/agenda', element: AgendaPage },
    { path: '/mapa', element: MapPage, roles: ['coordenacao'] },
    { path: '/alertas', element: AlertsPage },
    { path: '/indicadores', element: IndicatorsPage, roles: ['coordenacao'] },
    { path: '/relatorios', element: ReportsPage, roles: ['coordenacao'] },
    { path: '/importacao', element: ImportPage, adminOnly: true },
  ],
};
