/**
 * Parser CSV robusto (RFC 4180) sem dependências externas.
 * Suporta aspas, vírgulas dentro de campos, quebras de linha e BOM.
 */

export interface CsvParseOptions {
  delimiter?: string;
  skipEmptyLines?: boolean;
  hasHeader?: boolean;
}

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
  rowCount: number;
}

export function parseCsv(content: string, options: CsvParseOptions = {}): CsvParseResult {
  const delimiter = options.delimiter || ',';
  const skipEmptyLines = options.skipEmptyLines ?? true;

  let text = content.replace(/^\uFEFF/, '');

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (!skipEmptyLines || row.some((c) => c.trim() !== '')) {
      rows.push(row);
    }
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // última linha
  if (field !== '' || row.length > 0) {
    pushRow();
  }

  if (rows.length === 0) {
    return { headers: [], rows: [], rowCount: 0 };
  }

  const first = rows[0];
  let headers: string[];
  let dataRows: string[][];
  if (options.hasHeader === true) {
    headers = first.map((h) => h.trim());
    dataRows = rows.slice(1);
  } else {
    headers = first.map((_, idx) => `coluna_${idx + 1}`);
    dataRows = rows;
  }

  return {
    headers,
    rows: dataRows,
    rowCount: dataRows.length,
  };
}

/** Gera um CSV a partir de arrays. Usado para gerar arquivo de exemplo. */
export function stringifyCsv(headers: string[], rows: string[][]): string {
  const escape = (value: string) => {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return lines.join('\n');
}
