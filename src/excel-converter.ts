import * as XLSX from 'xlsx';

export interface ExcelConvertOptions {
  sheetName?: string;
  sheetIndex?: number;
  headerRow?: number;
  range?: string;
  includeEmpty?: boolean;
  nestedKeys?: boolean;
  keyColumn?: string;
  valueColumn?: string;
  outputFormat?: 'array' | 'object' | 'grouped';
  groupByKey?: string;
}

export interface SheetInfo {
  name: string;
  index: number;
  rowCount: number;
  colCount: number;
  headers: string[];
  preview: any[][];
}

export class ExcelToJsonConverter {
  convert(buffer: Buffer | ArrayBuffer, options: ExcelConvertOptions = {}): any {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = this.getSheet(workbook, options);
    const data = this.parseSheet(sheet, options);

    switch (options.outputFormat) {
      case 'object':
        return this.toArrayOfObjects(data);
      case 'grouped':
        return this.toGrouped(data, options.groupByKey);
      case 'array':
      default:
        return data.slice(1);
    }
  }

  getSheetInfo(buffer: Buffer | ArrayBuffer): SheetInfo[] {
    const workbook = XLSX.read(buffer, { type: 'array' });
    return workbook.SheetNames.map((name, index) => {
      const sheet = workbook.Sheets[name];
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      const rowCount = range.e.r - range.s.r + 1;
      const colCount = range.e.c - range.s.c + 1;

      const headers = this.extractHeaders(sheet, range);
      const preview = this.extractPreview(sheet, range, 5);

      return { name, index, rowCount, colCount, headers, preview };
    });
  }

  private getSheet(workbook: XLSX.WorkBook, options: ExcelConvertOptions): XLSX.WorkSheet {
    if (options.sheetName) {
      const sheet = workbook.Sheets[options.sheetName];
      if (!sheet) throw new Error(`工作表 "${options.sheetName}" 不存在`);
      return sheet;
    }

    const index = options.sheetIndex ?? 0;
    const name = workbook.SheetNames[index];
    if (!name) throw new Error(`工作表索引 ${index} 超出范围`);
    return workbook.Sheets[name];
  }

  private parseSheet(sheet: XLSX.WorkSheet, options: ExcelConvertOptions): any[][] {
    const range = options.range
      ? XLSX.utils.decode_range(options.range)
      : XLSX.utils.decode_range(sheet['!ref'] || 'A1');

    const headerRow = options.headerRow ?? 0;
    const startRow = range.s.r + headerRow;

    const rows: any[][] = [];
    for (let r = startRow; r <= range.e.r; r++) {
      const row: any[] = [];
      let hasData = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        const value = cell ? this.parseCellValue(cell) : '';
        if (value !== '' && value !== null && value !== undefined) hasData = true;
        row.push(value);
      }
      if (hasData || options.includeEmpty) {
        rows.push(row);
      }
    }

    return rows;
  }

  private parseCellValue(cell: XLSX.CellObject): any {
    switch (cell.t) {
      case 'n': {
        const numVal = typeof cell.v === 'number' ? cell.v : Number(cell.v);
        if (Number.isInteger(numVal) && Math.abs(numVal) > 30000 && numVal < 100000) {
          const date = XLSX.SSF.parse_date_code(numVal);
          if (date) {
            return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
          }
        }
        return cell.v;
      }
      case 'b':
        return cell.v;
      case 'd':
        return cell.v;
      default:
        return cell.v !== null && cell.v !== undefined ? String(cell.v) : '';
    }
  }

  private extractHeaders(sheet: XLSX.WorkSheet, range: XLSX.Range): string[] {
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
      headers.push(cell ? String(cell.v || '') : `列${c + 1}`);
    }
    return headers;
  }

  private extractPreview(sheet: XLSX.WorkSheet, range: XLSX.Range, maxRows: number): any[][] {
    const rows: any[][] = [];
    const startRow = range.s.r + 1;
    const endRow = Math.min(startRow + maxRows - 1, range.e.r);

    for (let r = startRow; r <= endRow; r++) {
      const row: any[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        row.push(cell ? cell.v : '');
      }
      rows.push(row);
    }
    return rows;
  }

  private toArrayOfObjects(data: any[][]): Record<string, any>[] {
    if (data.length === 0) return [];
    const headers = data[0] as string[];
    return data.slice(1).map(row => {
      const obj: Record<string, any> = {};
      headers.forEach((header, i) => {
        const key = String(header || `列${i + 1}`).trim();
        const val = row[i] !== undefined ? row[i] : null;
        obj[key] = val === '' ? null : val;
      });
      return obj;
    });
  }

  private toGrouped(data: any[][], groupByKey?: string): Record<string, any[]> {
    const objects = this.toArrayOfObjects(data);
    if (!groupByKey || objects.length === 0) {
      return { all: objects };
    }

    const result: Record<string, any[]> = {};
    objects.forEach(obj => {
      const key = String(obj[groupByKey] ?? '未分组');
      if (!result[key]) result[key] = [];
      const { [groupByKey]: _, ...rest } = obj;
      result[key].push(rest);
    });
    return result;
  }
}

export function convertExcelToJson(buffer: Buffer | ArrayBuffer, options: ExcelConvertOptions = {}): any {
  const converter = new ExcelToJsonConverter();
  return converter.convert(buffer, options);
}

export function getExcelSheetInfo(buffer: Buffer | ArrayBuffer): SheetInfo[] {
  const converter = new ExcelToJsonConverter();
  return converter.getSheetInfo(buffer);
}
