import { PageHeader, PageLoading, ErrorBox } from '../../../core/components/ui';
import { NotificationsList } from '../../../core/pages/NotificationsList';
import { fmtDateTime } from '../../../core/lib/dates';
import { useUrineData } from '../hooks/UrineData';
import { AlertList } from '../components/AlertList';

export default function AlertsPage() {
  const { alerts, loading, error, reload, lastUpdated, settings } = useUrineData();
  if (loading) return <PageLoading />;
  return (
    <div className="stack">
      <PageHeader title="Central de alertas" subtitle={`Alertas operacionais recalculados automaticamente após cada inclusão, alteração, cancelamento ou reagendamento (fuso America/Sao_Paulo). Atualizado ${lastUpdated ? fmtDateTime(lastUpdated.toISOString()) : '—'}.`}
        actions={<button className="btn btn-secondary" onClick={() => void reload()}>Atualizar agora</button>} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      <section className="card">
        <div className="card-head"><div><h2>Alertas operacionais</h2><p>Limite do alerta de volume: mais de {String(settings['urine.volume_alert_threshold'] ?? 3)} coletas para amanhã (configurável).</p></div></div>
        <AlertList alerts={alerts} />
      </section>
      <section className="card">
        <div className="card-head"><div><h2>Minhas notificações</h2><p>Avisos pessoais (emergências, novos cadastros, aprovações). Cada aviso é enviado uma única vez.</p></div></div>
        <NotificationsList />
      </section>
    </div>
  );
}
