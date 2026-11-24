/**
 * Confere a leitura de uma planilha SEM enviar nada a lugar nenhum e SEM imprimir
 * nomes de pacientes. Uso: node --experimental-strip-types scripts/check-import.ts caminho/arquivo.xlsx
 */
import ExcelJS from 'exceljs';
import { readUrineSheet } from '../src/modules/urine-collection/domain/xlsxReader.ts';

const file = process.argv[2];
if (!file) { console.error('Informe o caminho do arquivo .xlsx'); process.exit(1); }
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const r = readUrineSheet(wb);
const count = (f: (x: (typeof r.rows)[number]) => unknown) => {
  const m = new Map<string, number>();
  for (const x of r.rows) { const k = String(f(x)); m.set(k, (m.get(k) ?? 0) + 1); }
  return Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));
};
console.log({ aba: r.sheetName, outrasAbasIgnoradas: r.otherSheets.length, linhaCabecalho: r.headerRow, colunasFaltando: r.missingColumns, linhas: r.rows.length, vaziasIgnoradas: r.emptyRowsSkipped });
console.log('mapeamento', r.mapping.map((m) => `${m.header.trim()} → ${m.column ?? '??'}`));
console.log('status', count((x) => x.status));
console.log('origem', count((x) => x.origin), 'forma', count((x) => x.collection_method), 'material', count((x) => x.material_available), 'turno', count((x) => x.receipt_shift));
console.log('cidade', count((x) => x.city));
console.log('convênio', count((x) => x.health_plan));
console.log('colaboradores', Object.keys(count((x) => x.scheduler_name)).length, 'enfermeiros', count((x) => x.nurse_name));
console.log('chaves únicas', new Set(r.rows.map((x) => x.import_key)).size);
const issues = new Map<string, number>();
for (const x of r.rows) for (const i of x.issues) { const k = `${i.level} · ${i.field} · ${i.message.replace(/"[^"]*"/g, '"…"').replace(/linha\(s\) [\d, ]+/, 'linha(s) N')}`; issues.set(k, (issues.get(k) ?? 0) + 1); }
console.log('pendências', Object.fromEntries([...issues].sort((a, b) => b[1] - a[1])));
