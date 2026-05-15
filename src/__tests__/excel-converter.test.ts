import { ExcelToJsonConverter, convertExcelToJson, getExcelSheetInfo } from '../excel-converter';
import * as XLSX from 'xlsx';

function createTestWorkbook(data: any[][], sheetName = 'Sheet1'): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return Buffer.from(buf);
}

describe('ExcelToJsonConverter', () => {
  describe('convert', () => {
    it('应将 Excel 转换为对象数组', () => {
      const data = [
        ['姓名', '年龄', '城市'],
        ['张三', 25, '北京'],
        ['李四', 30, '上海'],
      ];
      const buffer = createTestWorkbook(data);
      const result = convertExcelToJson(buffer, { outputFormat: 'object' });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ 姓名: '张三', 年龄: 25, 城市: '北京' });
      expect(result[1]).toEqual({ 姓名: '李四', 年龄: 30, 城市: '上海' });
    });

    it('应将 Excel 转换为原始数组', () => {
      const data = [
        ['A', 'B'],
        [1, 2],
        [3, 4],
      ];
      const buffer = createTestWorkbook(data);
      const result = convertExcelToJson(buffer, { outputFormat: 'array' });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toEqual([1, 2]);
      expect(result[1]).toEqual([3, 4]);
    });

    it('应将 Excel 按指定列分组', () => {
      const data = [
        ['类别', '名称', '价格'],
        ['水果', '苹果', 5],
        ['水果', '香蕉', 3],
        ['蔬菜', '白菜', 2],
      ];
      const buffer = createTestWorkbook(data);
      const result = convertExcelToJson(buffer, {
        outputFormat: 'grouped',
        groupByKey: '类别',
      });

      expect(result.水果).toBeDefined();
      expect(result.蔬菜).toBeDefined();
      expect(result.水果.length).toBe(2);
      expect(result.蔬菜.length).toBe(1);
      expect(result.水果[0].名称).toBe('苹果');
    });

    it('应支持指定工作表名称', () => {
      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.aoa_to_sheet([['A'], [1]]);
      const ws2 = XLSX.utils.aoa_to_sheet([['B'], [2]]);
      XLSX.utils.book_append_sheet(wb, ws1, 'First');
      XLSX.utils.book_append_sheet(wb, ws2, 'Second');
      const buffer = Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

      const result = convertExcelToJson(buffer, {
        sheetName: 'Second',
        outputFormat: 'object',
      });

      expect(result[0]).toEqual({ B: 2 });
    });

    it('应支持指定工作表索引', () => {
      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.aoa_to_sheet([['X'], [10]]);
      const ws2 = XLSX.utils.aoa_to_sheet([['Y'], [20]]);
      XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');
      XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2');
      const buffer = Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

      const result = convertExcelToJson(buffer, {
        sheetIndex: 1,
        outputFormat: 'object',
      });

      expect(result[0]).toEqual({ Y: 20 });
    });

    it('应对不存在的工作表名称抛出错误', () => {
      const buffer = createTestWorkbook([['A'], [1]]);
      expect(() => {
        convertExcelToJson(buffer, { sheetName: '不存在' });
      }).toThrow();
    });

    it('应处理空 Excel', () => {
      const data = [['姓名', '年龄']];
      const buffer = createTestWorkbook(data);
      const result = convertExcelToJson(buffer, { outputFormat: 'object' });
      expect(result).toEqual([]);
    });

    it('应处理包含空单元格的数据', () => {
      const data = [
        ['姓名', '年龄'],
        ['张三', 25],
        ['李四', null],
      ];
      const buffer = createTestWorkbook(data);
      const result = convertExcelToJson(buffer, { outputFormat: 'object' });
      expect(result.length).toBe(2);
      expect(result[1].年龄).toBeNull();
    });
  });

  describe('getSheetInfo', () => {
    it('应返回工作表信息', () => {
      const data = [
        ['姓名', '年龄'],
        ['张三', 25],
        ['李四', 30],
      ];
      const buffer = createTestWorkbook(data);
      const info = getExcelSheetInfo(buffer);

      expect(info.length).toBe(1);
      expect(info[0].name).toBe('Sheet1');
      expect(info[0].index).toBe(0);
      expect(info[0].headers).toEqual(['姓名', '年龄']);
      expect(info[0].preview.length).toBeGreaterThan(0);
    });

    it('应返回多个工作表的信息', () => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['A']]), 'First');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['B']]), 'Second');
      const buffer = Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

      const info = getExcelSheetInfo(buffer);
      expect(info.length).toBe(2);
      expect(info[0].name).toBe('First');
      expect(info[1].name).toBe('Second');
    });
  });
});
