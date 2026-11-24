/**
 * Lê a aba de coletas de urina de um arquivo Excel já carregado pelo ExcelJS.
 * Não importa outras abas: elas são apenas listadas para conferência.
 */
import type ExcelJS from 'exceljs';
import { ORIGINAL_COLUMNS, flagDuplicates, isUrineSheetName, mapRow, matchColumn, type Cell, type MappedRow, type OriginalColumn } from './importer.ts';

export interface SheetReadResult {
  sheetName: string | null;
  otherSheets: string[];
  headerRow: number;
  mapping: { header: string; column: OriginalColumn | null }[];
  missingColumns: OriginalColumn[];
  rows: MappedRow[];
  emptyRowsSkipped: number;
}

export function cellToValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  const o = v as unknown as Record<string, unknown>;
  if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('');
  if ('result' in o) return cellToValue(o.result as ExcelJS.CellValue);
  if ('text' in o) return String(o.text);
  if ('error' in o) return null;
  return String(v);
}

export function readUrineSheet(wb: ExcelJS.Workbook): SheetReadResult {
  const sheets = wb.worksheets;
  const ws = sheets.find((s) => isUrineSheetName(s.name));
  const result: SheetReadResult = {
    sheetName: ws?.name ?? null,
    otherSheets: sheets.filter((s) => s !== ws).map((s) => s.name),
    headerRow: 0, mapping: [], missingColumns: [], rows: [], emptyRowsSkipped: 0,
  };
  if (!ws) return result;

  // procura a linha de cabeçalho nas 10 primeiras linhas
  let headerRow = 1;
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const vals = (ws.getRow(r).values as ExcelJS.CellValue[]).slice(1).map((c) => String(cellToValue(c) ?? ''));
    if (vals.filter((h) => matchColumn(h)).length >= 6) { headerRow = r; break; }
  }
  result.headerRow = headerRow;
  const headerVals = (ws.getRow(headerRow).values as ExcelJS.CellValue[]).slice(1);
  const colIndex = new Map<OriginalColumn, number>();
  headerVals.forEach((h, i) => {
    const header = String(cellToValue(h) ?? '').trim();
    if (!header) return;
    const column = matchColumn(header);
    result.mapping.push({ header, column });
    if (column && !colIndex.has(column)) colIndex.set(column, i + 1);
  });
  result.missingColumns = ORIGINAL_COLUMNS.filter((c) => !colIndex.has(c));

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (c: OriginalColumn): Cell => {
      const idx = colIndex.get(c);
      return idx ? cellToValue(row.getCell(idx).value) : null;
    };
    const raw: Record<string, unknown> = {};
    let any = false;
    for (const [col, idx] of colIndex) {
      const v = cellToValue(row.getCell(idx).value);
      if (v !== null && v !== '' && !(typeof v === 'string' && !v.trim())) any = true;
      raw[col] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
    }
    if (!any) { result.emptyRowsSkipped++; continue; }
    result.rows.push(mapRow(r, get, raw));
  }
  flagDuplicates(result.rows);
  return result;
}
