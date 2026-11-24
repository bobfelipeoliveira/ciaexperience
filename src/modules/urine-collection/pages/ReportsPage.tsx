import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../core/supabase';
import { AlertBox, ChoiceChips, PageHeader, PageLoading, useToast } from '../../../core/components/ui';
import { Icon } from '../../../core/components/Icon';
import { friendlyError } from '../../../core/lib/errors';
import { fmtDateTime, todayISO } from '../../../core/lib/dates';
import { useAuth } from '../../../core/auth/AuthProvider';
import { useUrineData } from '../hooks/UrineData';
import { activeFilterCount, applyFilters, emptyFilters } from '../domain/filters';
import { columnsFor, rowsFor, toCSV } from '../domain/exporter';
import { FiltersBar } from '../components/FiltersBar';

interface ExportLog { id: string; user_name: string | null; format: string; layout: string; row_count: number; created_at: string; filters: Record<string, string> | null }

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportsPage() {
  const { rows, loading, includeArchived, setIncludeArchived } = useUrineData();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [filters, setFilters] = useState(emptyFilters());
  const [layout, setLayout] = useState<'ORIGINAL' | 'AMPLIADA'>('ORIGINAL');
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<ExportLog[]>([]);
  const list = useMemo(() => applyFilters(rows, filters), [rows, filters]);

  const loadLogs = () => supabase.from('urine_collection_export_logs').select('*').order('created_at', { ascending: false }).limit(50).then(({ data }) => setLogs((data ?? []) as ExportLog[]));
  useEffect(() => { void loadLogs(); }, []);

  async function exportAs(format: 'XLSX' | 'CSV') {
    if (!list.length) { toast('info', 'Nenhum registro para exportar com os filtros atuais.'); return; }
    setBusy(true);
    try {
      const stamp = todayISO();
      const name = `coletas-urina-${layout.toLowerCase()}-${stamp}`;
      if (format === 'CSV') {
        download(new Blob([toCSV(list, layout)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
      } else {
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        wb.creator = 'CIA EXPERIENCE';
        const ws = wb.addWorksheet('Coleta de urina');
        const cols = columnsFor(layout);
        ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(42, Math.max(14, c.length + 2)) }));
        rowsFor(list, layout).forEach((r) => ws.addRow(r));
        const head = ws.getRow(1);
        head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7A1E3A' } };
        head.alignment = { wrapText: true, vertical: 'middle' };
        head.height = 34;
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
        const buf = await wb.xlsx.writeBuffer();
        download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`);
      }
      // o texto de busca NÃO é registrado (pode conter nome de paciente — minimização LGPD)
      const f = Object.fromEntries(Object.entries(filters).filter(([k, v]) => k !== 'q' && ((v && k !== 'dateField') || (k === 'dateField' && (filters.from || filters.to)))));
      const { error } = await supabase.from('urine_collection_export_logs').insert({ format, layout, row_count: list.length, filters: { ...f, arquivadas: includeArchived } });
      if (error) toast('error', 'Arquivo gerado, mas não foi possível registrar no histórico: ' + friendlyError(error));
      else toast('success', `${list.length} registro(s) exportado(s).`);
      void loadLogs();
    } catch (e) {
      toast('error', friendlyError(e));
    } finally { setBusy(false); }
  }

  if (loading) return <PageLoading />;
  return (
    <div className="stack">
      <PageHeader title="Relatórios e exportação" subtitle="Gere a planilha automaticamente a partir dos registros do sistema." />
      <AlertBox kind="warning" title="Dados sensíveis (LGPD)">O arquivo exportado contém dados pessoais e de saúde. Guarde em local protegido, não envie por canais abertos e apague quando não for mais necessário. Toda exportação fica registrada.</AlertBox>
      <FiltersBar rows={rows} value={filters} onChange={setFilters} />
      <section className="card stack">
        <ChoiceChips<'ORIGINAL' | 'AMPLIADA'> label="Layout" value={layout} onChange={(v) => v && setLayout(v)} allowClear={false}
          options={[{ value: 'ORIGINAL', label: 'Planilha original (18 colunas)' }, { value: 'AMPLIADA', label: 'Ampliada (originais + novos campos)' }]}
          hint={layout === 'ORIGINAL' ? 'Mesmas colunas e ordem da planilha atual da operação.' : 'Inclui prioridade, status, endereço completo, cidade, justificativa e demais campos.'} />
        <label className="row small"><input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} style={{ width: 20, height: 20 }} /> Incluir registros arquivados</label>
        <div className="row-between">
          <span><b>{list.length}</b> registro(s) serão exportados{activeFilterCount(filters) ? ' (com filtros)' : ' (todos)'}.</span>
          <div className="row">
            <button className="btn btn-secondary" disabled={busy} onClick={() => void exportAs('CSV')}><Icon name="download" size={18} /> CSV</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void exportAs('XLSX')}><Icon name="download" size={18} /> {busy ? 'Gerando…' : 'Excel (.xlsx)'}</button>
          </div>
        </div>
      </section>
      <section className="card">
        <div className="card-head"><div><h2>Histórico de exportações</h2><p>{isAdmin ? 'Todas as exportações (visão do administrador).' : 'Suas exportações.'}</p></div></div>
        {logs.length === 0 ? <p className="muted">Nenhuma exportação registrada.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Quando</th><th>Quem</th><th>Formato</th><th>Layout</th><th className="num">Registros</th><th className="hide-mobile">Filtros</th></tr></thead>
            <tbody>{logs.map((l) => (
              <tr key={l.id}><td className="nowrap">{fmtDateTime(l.created_at)}</td><td>{l.user_name ?? '—'}</td><td>{l.format}</td><td>{l.layout}</td><td className="num">{l.row_count}</td>
                <td className="hide-mobile small muted">{l.filters ? Object.entries(l.filters).filter(([k]) => k !== 'q').map(([k, v]) => `${k}: ${v}`).join(' · ') || 'nenhum' : '—'}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
