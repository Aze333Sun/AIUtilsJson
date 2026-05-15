#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import { convert, convertChat } from './converter';

const program = new Command();

program
  .name('json2md')
  .description('将 JSON 转换为结构化 Markdown')
  .version('1.0.0');

program
  .option('--json <string>', '输入 JSON 字符串')
  .option('--input <file>', '输入 JSON 文件路径')
  .option('--output <file>', '输出 Markdown 文件路径')
  .option('--indent <number>', '缩进空格数', (v) => parseInt(v, 10), 2)
  .option('--sort', '按键名排序')
  .option('--gui', '启动图形界面')
  .option('--template <file>', '自定义模板文件路径')
  .option('--chat', '转换聊天格式 JSON (messages 数组)');

program.parse(process.argv);

const options = program.opts();

async function main() {
  try {
    if (options.gui) {
      console.log('请使用以下命令启动图形界面:');
      console.log('  npx electron dist/gui.js');
      process.exit(0);
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
      console.error('错误: 必须提供 --json 或 --input 参数');
      program.help();
      process.exit(1);
    }

    let result: string;

    if (options.chat) {
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

main().catch((error) => {
  console.error(`致命错误: ${(error as Error).message}`);
  process.exit(1);
});
