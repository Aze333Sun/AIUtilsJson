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
      .replace(/\r/g, '')
      .replace(/\\(?![u"]) /g, '\\\\')
      .replace(/([^\\])"/g, '$1\\"');
  }

  private processContent(content: string): string {
    if (!content) return '';
    
    let result = content
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
    
    if (result.includes('\n```') || result.includes('```\n')) {
      return result;
    }
    
    const lines = result.split('\n');
    const hasLongLine = lines.some(line => line.length > 80);
    const hasCodePattern = /```[\s\S]*```/.test(result);
    
    if (hasCodePattern) {
      return result;
    }
    
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
        throw new Error(`Invalid JSON: ${(error as Error).message}`);
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
        throw new Error(`Invalid JSON: ${(error as Error).message}`);
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
    return `"${value}"`;
  }

  private isJsonString(value: string): boolean {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }

  private isCodeString(value: string): boolean {
    const codePatterns = [
      /^(function|const|let|var|class|import|export)/,
      /^\s*\{.*\}\s*$/,
      /^\s*\[.*\]\s*$/
    ];
    return codePatterns.some(pattern => pattern.test(value.trim()));
  }

  private convertArray(arr: any[], depth: number): string {
    if (arr.length === 0) {
      return '[]';
    }

    if (this.isTableData(arr)) {
      return this.convertToTable(arr);
    }

    const indentStr = ' '.repeat(this.indent * depth);
    const itemIndent = ' '.repeat(this.indent * (depth + 1));
    
    let result = '\n';
    
    arr.forEach((item, index) => {
      const itemStr = this.convertToMarkdown(item, depth + 1);
      const isNested = typeof item === 'object' && item !== null;
      if (isNested && !Array.isArray(item)) {
        const title = `### ${index + 1}. ${Object.keys(item)[0] || 'Item'}`;
        result += `${indentStr}- ${title}\n`;
        const nestedContent = this.convertToMarkdown(item, depth + 1);
        result += nestedContent;
      } else {
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
    
    const keys = Object.keys(arr[0]);
    return arr.every(item => {
      const itemKeys = Object.keys(item);
      return itemKeys.length === keys.length && keys.every(key => itemKeys.includes(key));
    });
  }

  private convertToTable(arr: any[]): string {
    if (arr.length === 0) return '[]';

    const keys = Object.keys(arr[0]);
    const header = `| ${keys.join(' | ')} |`;
    const separator = `| ${keys.map(() => '---').join(' | ')} |`;
    
    const rows = arr.map(item => {
      const values = keys.map(key => {
        const value = item[key];
        if (typeof value === 'string' && value.length > 50) {
          return value.substring(0, 50) + '...';
        }
        return String(value);
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
      
      result += `\n${indentStr}${title}\n`;
      
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
