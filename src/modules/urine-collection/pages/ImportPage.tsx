import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../core/supabase';
import { AlertBox, Badge, ConfirmDialog, PageHeader, StatCard, Tabs, useToast } from '../../../core/components/ui';
import { Icon } from '../../../core/components/Icon';
import { friendlyError } from '../../../core/lib/errors';
import { fmtDate } from '../../../core/lib/dates';
import { useUrineData } from '../hooks/UrineData';
import { readUrineSheet, type SheetReadResult } from '../domain/xlsxReader';
import type { MappedRow } from '../domain/importer';
import { label, MATERIAL, ORIGINS, STATUSES } from '../domain/constants';

type Filter = 'todas' | 'pendencias' | 'erros' | 'duplicadas' | 'ja_importadas';
interface Report { inserted: number; duplicates: number; errors: number; error_list: { row: string; error: string }[] }

export default function ImportPage() {
  const toast = useToast();
  const { reload } = useUrineData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [res, setRes] = useState<SheetReadResult | null>(null);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>('pendencias');
  const [confirm, setConfirm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<Report | null>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) { toast('error', 'Envie um arquivo Excel .xlsx.'); return; }
    if (f.size > 25 * 1024 * 1024) { toast('error', 'Arquivo muito grande (máx. 25 MB).'); return; }
    setReading(true); setRes(null); setReport(null); setFileName(f.name);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      const r = readUrineSheet(wb);
      setRes(r);
      // registros desta planilha que JÁ estão no sistema (importação repetida)
      const keys = r.rows.map((x) => x.import_key);
      const found = new Set<string>();
      for (let i = 0; i < keys.length; i += 200) {
        const { data, error } = await supabase.from('urine_collection_requests').select('import_key').in('import_key', keys.slice(i, i + 200));
        if (error) throw error;
        (data ?? []).forEach((d) => found.add(d.import_key as string));
      }
      setExisting(found);
      setExcluded(new Set(r.rows.filter((x) => !x.patient_name).map((x) => x.line)));
    } catch (e) {
      toast('error', 'Não foi possível ler o arquivo: ' + friendlyError(e));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const rows = res?.rows ?? [];
  const toImport = rows.filter((r) => !excluded.has(r.line) && r.patient_name && !existing.has(r.import_key));
  const shown = useMemo(() => rows.filter((r) =>
    filter === 'todas' ? true
    : filter === 'erros' ? r.issues.some((i) => i.level === 'error')
    : filter === 'duplicadas' ? r.possibleDuplicateOf.length > 0
    : filter === 'ja_importadas' ? existing.has(r.import_key)
    : r.issues.some((i) => i.level !== 'info')), [rows, filter, existing]);

  const empties = useMemo(() => {
    const fields: [string, (r: MappedRow) => unknown][] = [
      ['Forma de coleta', (r) => r.collection_method], ['Material', (r) => r.material_available], ['Data agendada', (r) => r.scheduled_date],
      ['Familiar', (r) => r.family_contact_name], ['Telefone', (r) => r.contact_phone], ['Convênio', (r) => r.health_plan],
      ['Bairro', (r) => r.neighborhood], ['Cidade (deduzida)', (r) => r.city], ['Enfermeiro', (r) => r.nurse_name], ['Data da coleta', (r) => r.collected_date],
    ];
    return fields.map(([l, f]) => ({ label: l, empty: rows.filter((r) => !f(r)).length }));
  }, [rows]);

  async function runImport() {
    if (!res) return;
    setConfirm(false); setImporting(true); setProgress(0);
    try {
      const { data: batch, error: be } = await supabase.from('urine_collection_import_batches')
        .insert({ file_name: fileName.slice(0, 200), sheet_name: res.sheetName ?? '', total_rows: toImport.length }).select('id').single();
      if (be) throw be;
      const total: Report = { inserted: 0, duplicates: 0, errors: 0, error_list: [] };
      for (let i = 0; i < toImport.length; i += 100) {
        const chunk = toImport.slice(i, i + 100).map(({ issues: _i, possibleDuplicateOf: _p, line: _l, ...rest }) => rest);
        const { data, error } = await supabase.rpc('urine_import_rows', { p_batch: batch.id, p_rows: chunk });
        if (error) throw error;
        const r = data as Report;
        total.inserted += r.inserted; total.duplicates += r.duplicates; total.errors += r.errors; total.error_list.push(...r.error_list);
        setProgress(Math.min(100, Math.round(((i + chunk.length) / toImport.length) * 100)));
      }
      setReport(total);
      toast('success', `Importação concluída: ${total.inserted} registro(s) incluído(s).`);
      await reload();
    } catch (e) {
      toast('error', friendlyError(e));
    } finally { setImporting(false); }
  }

  return (
    <div className="stack">
      <PageHeader title="Importar planilha" subtitle="Traga o histórico da planilha atual para o CIA EXPERIENCE com revisão antes de gravar." />
      <AlertBox kind="info" title="Como funciona">
        O arquivo é lido <b>no seu navegador</b>. Somente a aba <b>“Coleta de urina”</b> é considerada — as demais abas são ignoradas.
        Nada é gravado até você confirmar. Importar o mesmo arquivo de novo <b>não duplica</b> registros.
      </AlertBox>
      <section className="card row-between">
        <div><b>{fileName || 'Nenhum arquivo selecionado'}</b><p className="muted small">Ex.: “Quadro básico monitoramento atend. intercorrência (7).xlsx”</p></div>
        <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        <button className="btn btn-primary" disabled={reading || importing} onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} /> {reading ? 'Lendo…' : 'Escolher arquivo .xlsx'}</button>
      </section>

      {res && !res.sheetName && <AlertBox kind="critical" title="Aba não encontrada">Não encontrei uma aba chamada “Coleta de urina”. Abas no arquivo: {res.otherSheets.join(', ')}.</AlertBox>}

      {res && res.sheetName && !report && (
        <>
          <div className="grid-stats">
            <StatCard label="Linhas na aba" value={rows.length} foot={`aba “${res.sheetName.trim()}” · ${res.emptyRowsSkipped} vazias ignoradas`} />
            <StatCard label="Serão importadas" value={toImport.length} accent="var(--ok-700)" />
            <StatCard label="Já existem no sistema" value={existing.size} accent="var(--ink-500)" foot="importação anterior" />
            <StatCard label="Com alertas" value={rows.filter((r) => r.issues.some((i) => i.level === 'warning')).length} accent="var(--warn-700)" />
            <StatCard label="Com erro (excluídas)" value={rows.filter((r) => r.issues.some((i) => i.level === 'error')).length} accent="var(--crit-700)" />
            <StatCard label="Possíveis duplicadas" value={rows.filter((r) => r.possibleDuplicateOf.length).length} accent="var(--warn-700)" />
          </div>
          <div className="grid-2">
            <section className="card">
              <h3 style={{ marginBottom: 10 }}>Mapeamento das colunas</h3>
              {res.missingColumns.length > 0 && <AlertBox kind="warning">Colunas não encontradas: {res.missingColumns.join(', ')}</AlertBox>}
              <div className="table-wrap"><table className="table"><thead><tr><th>Na planilha</th><th>No sistema</th></tr></thead>
                <tbody>{res.mapping.map((m) => <tr key={m.header}><td>{m.header}</td><td>{m.column ? <Badge tone="b-ok">{m.column}</Badge> : <Badge tone="b-warn">não usada</Badge>}</td></tr>)}</tbody></table></div>
              <p className="muted small" style={{ marginTop: 8 }}>Outras abas ignoradas: {res.otherSheets.join(', ') || 'nenhuma'}.</p>
            </section>
            <section className="card">
              <h3 style={{ marginBottom: 10 }}>Campos vazios</h3>
              <div className="table-wrap"><table className="table"><thead><tr><th>Campo</th><th className="num">Vazios</th></tr></thead>
                <tbody>{empties.map((e) => <tr key={e.label}><td>{e.label}</td><td className="num">{e.empty}</td></tr>)}</tbody></table></div>
              <p className="muted small" style={{ marginTop: 8 }}>Campos vazios ficam como <b>NÃO INFORMADO</b>. Nada é inventado. “Realizada” somente quando há DATA DA COLETA.</p>
            </section>
          </div>

          <section className="card stack">
            <div className="row-between">
              <h3>Revisão linha a linha</h3>
              <Tabs<Filter> value={filter} onChange={setFilter} tabs={[
                { value: 'pendencias', label: 'Com alertas' }, { value: 'duplicadas', label: 'Duplicadas' }, { value: 'erros', label: 'Erros' },
                { value: 'ja_importadas', label: 'Já importadas' }, { value: 'todas', label: 'Todas' }]} />
            </div>
            <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
              <table className="table">
                <thead><tr><th>Importar</th><th>Linha</th><th>Paciente</th><th>Padronização</th><th>Pendências</th></tr></thead>
                <tbody>
                  {shown.map((r) => {
                    const already = existing.has(r.import_key);
                    return (
                      <tr key={r.line} style={already ? { opacity: 0.55 } : undefined}>
                        <td><input type="checkbox" style={{ width: 20, height: 20 }} disabled={!r.patient_name || already} checked={!excluded.has(r.line) && !!r.patient_name && !already}
                          onChange={(e) => setExcluded((s) => { const n = new Set(s); if (e.target.checked) n.delete(r.line); else n.add(r.line); return n; })} aria-label={`Importar linha ${r.line}`} /></td>
                        <td>{r.line}</td>
                        <td><b>{r.patient_name ?? '—'}</b><div className="muted small">{r.received_date ? `receb. ${fmtDate(r.received_date)}` : ''}{already ? ' · já importada' : ''}</div></td>
                        <td className="small">{[label(ORIGINS, r.origin, 'origem N/I'), r.collection_method ?? 'forma N/I', `potinho ${label(MATERIAL, r.material_available, 'N/I')}`, label(STATUSES, r.status)].join(' · ')}</td>
                        <td className="small">{r.issues.length === 0 ? <span className="muted">—</span> : r.issues.map((i, k) => <div key={k} style={{ color: i.level === 'error' ? 'var(--crit-700)' : i.level === 'warning' ? 'var(--warn-700)' : 'var(--ink-500)' }}>• {i.field}: {i.message}</div>)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="row-between">
              <span className="muted small">{shown.length} linha(s) neste filtro. Desmarque linhas que não devem ser importadas.</span>
              <button className="btn btn-primary btn-lg" disabled={!toImport.length || importing} onClick={() => setConfirm(true)}>
                <Icon name="check" /> {importing ? `Importando… ${progress}%` : `Importar ${toImport.length} registro(s)`}
              </button>
            </div>
          </section>
        </>
      )}

      {report && (
        <section className="card stack">
          <h2>Relatório da importação</h2>
          <div className="grid-stats">
            <StatCard label="Incluídos" value={report.inserted} accent="var(--ok-700)" />
            <StatCard label="Ignorados (já existiam)" value={report.duplicates + existing.size} accent="var(--ink-500)" />
            <StatCard label="Com erro" value={report.errors} accent="var(--crit-700)" />
            <StatCard label="Excluídos por você" value={[...excluded].filter((l) => rows.some((r) => r.line === l && r.patient_name)).length} />
          </div>
          {report.error_list.length > 0 && (
            <div className="table-wrap"><table className="table"><thead><tr><th>Linha</th><th>Erro</th></tr></thead>
              <tbody>{report.error_list.map((e, i) => <tr key={i}><td>{e.row}</td><td className="small">{friendlyError(e.error)}</td></tr>)}</tbody></table></div>
          )}
          <div className="row"><Link className="btn btn-primary" to="/coletas">Ver solicitações</Link><button className="btn btn-secondary" onClick={() => { setRes(null); setReport(null); setFileName(''); }}>Nova importação</button></div>
        </section>
      )}

      {confirm && (
        <ConfirmDialog title="Confirmar importação?" confirmLabel={`Importar ${toImport.length}`} onCancel={() => setConfirm(false)} onConfirm={() => void runImport()}
          message={<>Serão gravados <b>{toImport.length}</b> registro(s) da aba “{res?.sheetName?.trim()}”. Valores originais e observações ficam preservados. A operação fica registrada na auditoria.</>} />
      )}
    </div>
  );
}
