#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import { convert, convertChat } from './converter';

const program = new Command();

program
  .name('json2md')
  .description('Convert JSON to Markdown')
  .version('1.0.0');

program
  .option('--json <string>', 'Input JSON string')
  .option('--input <file>', 'Input JSON file path')
  .option('--output <file>', 'Output Markdown file path')
  .option('--indent <number>', 'Indentation spaces', parseInt, 2)
  .option('--sort', 'Sort keys alphabetically')
  .option('--gui', 'Launch GUI interface')
  .option('--template <file>', 'Custom template file path')
  .option('--chat', 'Convert chat format JSON (messages array)');

program.parse(process.argv);

const options = program.opts();

async function main() {
  try {
    if (options.gui) {
      try {
        await import('./gui');
        const { launchGui } = await import('./gui');
        await launchGui();
      } catch (error) {
        console.error('Failed to launch GUI:', (error as Error).message);
        console.error('Make sure Electron is installed: npm install electron -D');
        process.exit(1);
      }
      return;
    }

    let jsonContent: string;

    if (options.json) {
      jsonContent = options.json;
    } else if (options.input) {
      if (!fs.existsSync(options.input)) {
        console.error(`Error: Input file '${options.input}' does not exist`);
        process.exit(1);
      }
      jsonContent = fs.readFileSync(options.input, 'utf-8');
    } else {
      console.error('Error: Either --json or --input must be provided');
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
      console.log(`Successfully wrote to ${options.output}`);
    } else {
      console.log(result);
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

main();
