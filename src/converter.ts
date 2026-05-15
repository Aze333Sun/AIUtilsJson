import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

export interface ConverterOptions {
  indent?: number;
  sort?: boolean;
  template?: string;
}

export interface ChatConverterOptions {
  includeTimestamp?: boolean;
}

export class JsonToMarkdownConverter {
  private indent: number;
  private sort: boolean;
  private template?: string;

  constructor(options: ConverterOptions = {}) {
    this.indent = options.indent || 2;
    this.sort = options.sort || false;
    this.template = options.template;
  }

  private sanitizeJson(input: string): string {
    return input
      .replace(/^\uFEFF/, '')
      .replace(/\r/g, '')
      .replace(/\\(?![\\/"bfnrtu])/g, '\\\\');
  }

  private processContent(content: string): string {
    if (!content) return '';

    let result = content
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");

    if (result.startsWith('```') || result.endsWith('```') || result.includes('\n```') || result.includes('```\n')) {
      return result;
    }

    const hasCodePattern = /```[\s\S]*```/.test(result);
    if (hasCodePattern) {
      return result;
    }

    const lines = result.split('\n');
    const hasLongLine = lines.some(line => line.length > 80);

    if (hasLongLine || lines.length > 5) {
      return `\`\`\`\n${result}\n\`\`\``;
    }

    return result;
  }

  convert(jsonString: string): string {
    let data: any;
    try {
      data = JSON.parse(jsonString);
    } catch (error) {
      try {
        const sanitized = this.sanitizeJson(jsonString);
        data = JSON.parse(sanitized);
      } catch (sanitizeError) {
        throw new Error(`Invalid JSON: ${(sanitizeError as Error).message}`);
      }
    }

    if (this.template) {
      return this.convertWithTemplate(data);
    }

    return this.convertToMarkdown(data, 0);
  }

  convertChat(jsonString: string, options: ChatConverterOptions = {}): string {
    let data: any;
    try {
      data = JSON.parse(jsonString);
    } catch (error) {
      try {
        const sanitized = this.sanitizeJson(jsonString);
        data = JSON.parse(sanitized);
      } catch (sanitizeError) {
        throw new Error(`Invalid JSON: ${(sanitizeError as Error).message}`);
      }
    }

    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error('Invalid chat format: missing or invalid messages array');
    }

    return this.convertChatToMarkdown(data.messages, options);
  }

  private convertChatToMarkdown(messages: any[], options: ChatConverterOptions): string {
    let result = '';
    messages.forEach((msg, index) => {
      const role = msg.role || 'unknown';
      const content = msg.content || '';
      const roleLabel = role === 'user' ? 'User' :
                        role === 'assistant' ? 'Assistant' :
                        role === 'system' ? 'System' :
                        role.charAt(0).toUpperCase() + role.slice(1);

      const timestamp = options.includeTimestamp !== false && msg.timestamp ? ` (${msg.timestamp})` : '';

      result += `## ${index + 1}. ${roleLabel}${timestamp}\n\n`;

      const processedContent = this.processContent(content);
      result += `${processedContent}\n\n---\n\n`;
    });

    return result.trim();
  }

  private convertWithTemplate(data: any): string {
    let templateContent: string;
    try {
      templateContent = fs.readFileSync(this.template!, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read template file: ${(error as Error).message}`);
    }

    handlebars.registerHelper('isArray', function (value: any) {
      return Array.isArray(value);
    });

    handlebars.registerHelper('isObject', function (value: any) {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    });

    handlebars.registerHelper('add', function (a: number, b: number) {
      return a + b;
    });

    const template = handlebars.compile(templateContent);
    return template(data);
  }

  private convertToMarkdown(value: any, depth: number): string {
    const indentStr = ' '.repeat(this.indent * depth);

    if (value === null) {
      return 'null';
    }

    if (value === undefined) {
      return 'undefined';
    }

    switch (typeof value) {
      case 'string':
        return this.convertString(value, depth);
      case 'number':
      case 'boolean':
        return String(value);
      case 'object':
        if (Array.isArray(value)) {
          return this.convertArray(value, depth);
        }
        return this.convertObject(value, depth);
      default:
        return String(value);
    }
  }

  private convertString(value: string, depth: number): string {
    if (this.isJsonString(value) || this.isCodeString(value)) {
      return `\n${' '.repeat(this.indent * depth)}\`\`\`json\n${value}\n${' '.repeat(this.indent * depth)}\`\`\``;
    }
    return value;
  }

  private isJsonString(value: string): boolean {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null;
    } catch {
      return false;
    }
  }

  private isCodeString(value: string): boolean {
    const trimmed = value.trim();
    const codePatterns = [
      /^(function|const|let|var|class|import|export)\s/,
      /^[a-zA-Z_$][\w$]*\s*\(.*\)\s*\{/,
    ];
    return codePatterns.some(pattern => pattern.test(trimmed));
  }

  private convertArray(arr: any[], depth: number): string {
    if (arr.length === 0) {
      return '[]';
    }

    if (this.isTableData(arr)) {
      return this.convertToTable(arr);
    }

    const indentStr = ' '.repeat(this.indent * depth);
    let result = '\n';

    arr.forEach((item, index) => {
      const isObjectItem = typeof item === 'object' && item !== null && !Array.isArray(item);
      if (isObjectItem) {
        result += `${indentStr}- **Item ${index + 1}**\n`;
        const keys = Object.keys(item);
        keys.forEach(key => {
          const val = this.convertToMarkdown(item[key], depth + 2);
          result += `${' '.repeat(this.indent * (depth + 1))}- **${key}**: ${val.trimStart()}\n`;
        });
      } else {
        const itemStr = this.convertToMarkdown(item, depth + 1);
        result += `${indentStr}- ${itemStr}\n`;
      }
    });

    return result;
  }

  private isTableData(arr: any[]): boolean {
    if (arr.length === 0) return false;
    if (!arr.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
      return false;
    }

    const allKeys = new Set<string>();
    arr.forEach(item => Object.keys(item).forEach(k => allKeys.add(k)));

    return arr.every(item => {
      const itemKeys = Object.keys(item);
      return allKeys.size === itemKeys.length && [...allKeys].every(key => itemKeys.includes(key));
    });
  }

  private convertToTable(arr: any[]): string {
    if (arr.length === 0) return '[]';

    const allKeys = new Set<string>();
    arr.forEach(item => Object.keys(item).forEach(k => allKeys.add(k)));
    const keys = [...allKeys];

    const header = `| ${keys.join(' | ')} |`;
    const separator = `| ${keys.map(() => '---').join(' | ')} |`;

    const rows = arr.map(item => {
      const values = keys.map(key => {
        const value = item[key];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') {
          return JSON.stringify(value).substring(0, 50);
        }
        const str = String(value);
        const cleaned = str.replace(/\n/g, ' ').replace(/\|/g, '\\|');
        if (cleaned.length > 50) {
          return cleaned.substring(0, 50) + '...';
        }
        return cleaned;
      });
      return `| ${values.join(' | ')} |`;
    });

    return `\n${header}\n${separator}\n${rows.join('\n')}\n`;
  }

  private convertObject(obj: any, depth: number): string {
    const keys = Object.keys(obj);
    if (this.sort) {
      keys.sort();
    }

    const indentStr = ' '.repeat(this.indent * depth);
    let result = '';

    keys.forEach((key, index) => {
      const value = obj[key];
      const isLast = index === keys.length - 1;

      const titleLevel = Math.min(depth + 1, 6);
      const title = '#'.repeat(titleLevel) + ' ' + key;

      if (index === 0) {
        result += `${indentStr}${title}\n`;
      } else {
        result += `\n${indentStr}${title}\n`;
      }

      const valueStr = this.convertToMarkdown(value, depth + 1);
      result += valueStr;

      if (!isLast && depth < 4) {
        result += '\n';
      }
    });

    return result;
  }
}

export function convert(jsonString: string, options: ConverterOptions = {}): string {
  const converter = new JsonToMarkdownConverter(options);
  return converter.convert(jsonString);
}

export function convertChat(jsonString: string, options: ChatConverterOptions = {}): string {
  const converter = new JsonToMarkdownConverter();
  return converter.convertChat(jsonString, options);
}
