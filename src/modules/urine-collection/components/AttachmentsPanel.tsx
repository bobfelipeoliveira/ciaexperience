import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog, EmptyState, ErrorBox, Spinner, useToast } from '../../../core/components/ui';
import { Icon } from '../../../core/components/Icon';
import { friendlyError } from '../../../core/lib/errors';
import { fmtDateTime } from '../../../core/lib/dates';
import { useAuth } from '../../../core/auth/AuthProvider';
import type { Attachment } from '../domain/types';
import { ATTACHMENT_CATEGORIES, label, type AttachmentCategory } from '../domain/constants';
import { attachmentUrl, deleteAttachment, listAttachments, uploadAttachment, MAX_BYTES } from '../services/requests';

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

export function AttachmentsPanel({ requestId, canUpload }: { requestId: string; canUpload: boolean }) {
  const toast = useToast();
  const { session, hasRole } = useAuth();
  const isCoord = hasRole('urine_collection', ['coordenacao']);
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<AttachmentCategory>('PEDIDO_MEDICO');
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<Attachment | null>(null);
  const [preview, setPreview] = useState<{ url: string; a: Attachment } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setItems(await listAttachments(requestId)); setError(null); } catch (e) { setError(friendlyError(e)); }
  }, [requestId]);
  useEffect(() => { void load(); }, [load]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    let ok = 0;
    for (const f of Array.from(files)) {
      try { await uploadAttachment(requestId, f, category); ok++; }
      catch (e) { toast('error', `${f.name}: ${friendlyError(e)}`); }
    }
    setUploading(false);
    if (input.current) input.current.value = '';
    if (ok) toast('success', `${ok} arquivo(s) anexado(s).`);
    await load();
  }

  async function open(a: Attachment, download: boolean) {
    try {
      const url = await attachmentUrl(a, download);
      if (download) { window.location.assign(url); return; }
      setPreview({ url, a });
    } catch (e) { toast('error', friendlyError(e)); }
  }

  return (
    <section className="card stack">
      <div className="card-head">
        <div><h2>Anexos</h2><p>Pedido médico, solicitação de exame e documentos. Arquivos privados: os links valem por 60 segundos.</p></div>
      </div>
      {canUpload && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ minWidth: 220 }}>
            <span className="field-label">Tipo de documento</span>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value as AttachmentCategory)}>
              {Object.entries(ATTACHMENT_CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <input ref={input} type="file" hidden multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => void onFiles(e.target.files)} />
          <button className="btn btn-primary" disabled={uploading} onClick={() => input.current?.click()}><Icon name="upload" size={18} /> {uploading ? 'Enviando…' : 'Anexar arquivo'}</button>
          <span className="muted small">PDF, JPG, PNG ou WEBP · até {MAX_BYTES / 1048576} MB</span>
        </div>
      )}
      {error && <ErrorBox error={error} onRetry={load} />}
      {!items && !error && <Spinner />}
      {items && items.length === 0 && <EmptyState icon="paperclip" title="Nenhum anexo" />}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Arquivo</th><th>Tipo</th><th className="hide-mobile">Enviado por</th><th className="hide-mobile">Quando</th><th></th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td><b style={{ overflowWrap: 'anywhere' }}>{a.file_name}</b><div className="muted small">{kb(a.size_bytes)}</div></td>
                  <td>{label(ATTACHMENT_CATEGORIES, a.category)}</td>
                  <td className="hide-mobile">{a.uploaded_by_name ?? '—'}</td>
                  <td className="hide-mobile nowrap">{fmtDateTime(a.uploaded_at)}</td>
                  <td className="nowrap">
                    <button className="btn btn-ghost btn-sm" onClick={() => void open(a, false)} aria-label="Visualizar"><Icon name="eye" size={18} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => void open(a, true)} aria-label="Baixar"><Icon name="download" size={18} /></button>
                    {(isCoord || a.uploaded_by === session?.user.id) && <button className="btn btn-ghost btn-sm" onClick={() => setToDelete(a)} aria-label="Excluir"><Icon name="trash" size={18} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {toDelete && (
        <ConfirmDialog danger title="Excluir anexo?" confirmLabel="Excluir" message={<>O arquivo <b>{toDelete.file_name}</b> será apagado definitivamente.</>}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => { try { await deleteAttachment(toDelete); toast('success', 'Anexo excluído.'); setToDelete(null); await load(); } catch (e) { toast('error', friendlyError(e)); } }} />
      )}
      {preview && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="modal wide" role="dialog" aria-modal="true">
            <div className="modal-head"><h2 style={{ overflowWrap: 'anywhere' }}>{preview.a.file_name}</h2><button className="icon-btn" onClick={() => setPreview(null)} aria-label="Fechar"><Icon name="x" /></button></div>
            <div className="modal-body" style={{ padding: 0 }}>
              {preview.a.mime_type === 'application/pdf'
                ? <iframe title={preview.a.file_name} src={preview.url} style={{ width: '100%', height: '75vh', border: 0 }} />
                : <img src={preview.url} alt={preview.a.file_name} style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }} />}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
