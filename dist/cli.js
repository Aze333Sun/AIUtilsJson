#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const converter_1 = require("./converter");
const program = new commander_1.Command();
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
                await Promise.resolve().then(() => __importStar(require('./gui')));
                const { launchGui } = await Promise.resolve().then(() => __importStar(require('./gui')));
                await launchGui();
            }
            catch (error) {
                console.error('Failed to launch GUI:', error.message);
                console.error('Make sure Electron is installed: npm install electron -D');
                process.exit(1);
            }
            return;
        }
        let jsonContent;
        if (options.json) {
            jsonContent = options.json;
        }
        else if (options.input) {
            if (!fs.existsSync(options.input)) {
                console.error(`Error: Input file '${options.input}' does not exist`);
                process.exit(1);
            }
            jsonContent = fs.readFileSync(options.input, 'utf-8');
        }
        else {
            console.error('Error: Either --json or --input must be provided');
            program.help();
            process.exit(1);
        }
        let result;
        if (options.chat) {
            result = (0, converter_1.convertChat)(jsonContent, {
                includeTimestamp: true,
            });
        }
        else {
            result = (0, converter_1.convert)(jsonContent, {
                indent: options.indent,
                sort: options.sort,
                template: options.template,
            });
        }
        if (options.output) {
            fs.writeFileSync(options.output, result);
            console.log(`Successfully wrote to ${options.output}`);
        }
        else {
            console.log(result);
        }
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}
main();
