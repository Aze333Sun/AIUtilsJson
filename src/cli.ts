#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import { convert, convertChat } from './converter';
import { convertExcelToJson, getExcelSheetInfo } from './excel-converter';
import { extractChatRecords } from './chat-extractor';

const program = new Command();

program
  .name('json2md')
  .description('将 JSON 转换为结构化 Markdown，或将 Excel 转换为 JSON')
  .version('1.0.0');

program
  .option('--json <string>', '输入 JSON 字符串')
  .option('--input <file>', '输入 JSON 文件路径')
  .option('--output <file>', '输出文件路径')
  .option('--indent <number>', '缩进空格数', (v) => parseInt(v, 10), 2)
  .option('--sort', '按键名排序')
  .option('--gui', '启动图形界面')
  .option('--template <file>', '自定义模板文件路径')
  .option('--chat', '转换聊天格式 JSON (自动检测: messages/mapping/contents/deepseek/claude/qwen/kimi)')
  .option('--excel <file>', '将 Excel 文件转换为 JSON')
  .option('--sheet <name>', 'Excel 工作表名称（默认第一个）')
  .option('--sheet-index <number>', 'Excel 工作表索引（从0开始）', (v) => parseInt(v, 10))
  .option('--header-row <number>', '表头行号（从0开始）', (v) => parseInt(v, 10), 0)
  .option('--excel-format <format>', 'JSON 输出格式: array | object | grouped', 'object')
  .option('--group-by <column>', '按指定列分组（需配合 --excel-format grouped）')
  .option('--list-sheets', '列出 Excel 文件中的所有工作表信息')
  .option('--extract', '从聊天记录中提取关键信息生成摘要文档')
  .option('--no-code', '提取时排除代码片段')
  .option('--no-tools', '提取时排除工具调用')
  .option('--with-reasoning', '提取时包含推理过程');

program.parse(process.argv);

const options = program.opts();

async function main() {
  try {
    if (options.gui) {
      console.log('请使用以下命令启动图形界面:');
      console.log('  npx electron dist/gui.js');
      process.exit(0);
    }

    if (options.excel) {
      await handleExcel();
      return;
    }

    let jsonContent: string;

    if (options.json) {
      jsonContent = options.json;
    } else if (options.input) {
      if (!fs.existsSync(options.input)) {
        console.error(`错误: 输入文件 '${options.input}' 不存在`);
        process.exit(1);
      }
      jsonContent = fs.readFileSync(options.input, 'utf-8');
    } else {
      console.error('错误: 必须提供 --json, --input 或 --excel 参数');
      program.help();
      process.exit(1);
    }

    let result: string;

    if (options.extract) {
      result = extractChatRecords(jsonContent, {
        includeCode: !options.noCode,
        includeToolCalls: !options.noTools,
        includeReasoning: !!options.withReasoning,
      });
    } else if (options.chat) {
      result = convertChat(jsonContent, {
        includeTimestamp: true,
      });
    } else {
      result = convert(jsonContent, {
        indent: options.indent,
        sort: options.sort,
        template: options.template,
      });
    }

    if (options.output) {
      fs.writeFileSync(options.output, result);
      console.log(`已成功写入 ${options.output}`);
    } else {
      console.log(result);
    }
  } catch (error) {
    console.error(`错误: ${(error as Error).message}`);
    process.exit(1);
  }
}

async function handleExcel() {
  if (!fs.existsSync(options.excel)) {
    console.error(`错误: Excel 文件 '${options.excel}' 不存在`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(options.excel);

  if (options.listSheets) {
    const sheets = getExcelSheetInfo(buffer);
    sheets.forEach(sheet => {
      console.log(`\n工作表 ${sheet.index + 1}: ${sheet.name}`);
      console.log(`  行数: ${sheet.rowCount}, 列数: ${sheet.colCount}`);
      console.log(`  表头: ${sheet.headers.join(', ')}`);
      if (sheet.preview.length > 0) {
        console.log(`  预览 (前${sheet.preview.length}行):`);
        sheet.preview.forEach((row, i) => {
          console.log(`    行${i + 1}: ${row.join(' | ')}`);
        });
      }
    });
    return;
  }

  const result = convertExcelToJson(buffer, {
    sheetName: options.sheet,
    sheetIndex: options.sheetIndex,
    headerRow: options.headerRow,
    outputFormat: options.excelFormat,
    groupByKey: options.groupBy,
  });

  const json = JSON.stringify(result, null, options.indent);

  if (options.output) {
    fs.writeFileSync(options.output, json);
    console.log(`已成功写入 ${options.output}`);
  } else {
    console.log(json);
  }
}

main().catch((error) => {
  console.error(`致命错误: ${(error as Error).message}`);
  process.exit(1);
});
