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

interface NormalizedMessage {
  role: string;
  content: string;
  name?: string;
  timestamp?: string;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
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
        throw new Error(`无效的JSON: ${(sanitizeError as Error).message}`);
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
        throw new Error(`无效的JSON: ${(sanitizeError as Error).message}`);
      }
    }

    const messages = this.detectAndNormalizeChat(data);
    return this.renderChatToMarkdown(messages, options);
  }

  private detectAndNormalizeChat(data: any): NormalizedMessage[] {
    if (Array.isArray(data)) {
      return data.map(m => this.normalizeMessage(m));
    }

    if (data.messages && Array.isArray(data.messages)) {
      return data.messages.map((m: any) => this.normalizeMessage(m));
    }

    if (data.contents && Array.isArray(data.contents)) {
      return data.contents.map((m: any) => this.normalizeGeminiContent(m));
    }

    if (data.conversations && Array.isArray(data.conversations)) {
      const result: NormalizedMessage[] = [];
      data.conversations.forEach((conv: any, i: number) => {
        const title = conv.title || conv.name || `对话 ${i + 1}`;
        if (data.conversations.length > 1) {
          result.push({ role: 'system', content: `---\n# ${title}\n---` });
        }
        const msgs = conv.messages || conv.chats || conv.conversation || [];
        if (Array.isArray(msgs)) {
          result.push(...msgs.map((m: any) => this.normalizeMessage(m)));
        }
      });
      return result;
    }

    throw new Error('无法识别的聊天格式，支持: messages[], contents[], conversations[] 或消息数组');
  }

  private normalizeMessage(msg: any): NormalizedMessage {
    const role = msg.role || 'unknown';
    let content = '';

    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text || '')
        .join('\n');
      const imageParts = msg.content.filter((p: any) => p.type === 'image_url' || p.type === 'image');
      if (imageParts.length > 0) {
        content += '\n\n_[图片内容]_';
      }
    } else if (msg.content && typeof msg.content === 'object') {
      content = JSON.stringify(msg.content, null, 2);
    }

    const timestamp = msg.timestamp || msg.created_at || msg.created || msg.time;

    return {
      role,
      content,
      name: msg.name,
      timestamp,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
    };
  }

  private normalizeGeminiContent(content: any): NormalizedMessage {
    const role = content.role === 'model' ? 'assistant' : content.role || 'user';
    let text = '';

    if (content.parts && Array.isArray(content.parts)) {
      text = content.parts
        .filter((p: any) => p.text !== undefined)
        .map((p: any) => p.text)
        .join('\n');
      const hasInlineData = content.parts.some((p: any) => p.inline_data);
      if (hasInlineData) {
        text += '\n\n_[附件内容]_';
      }
    }

    return { role, content: text };
  }

  private renderChatToMarkdown(messages: NormalizedMessage[], options: ChatConverterOptions): string {
    const hasTimestamp = options.includeTimestamp !== false;
    let result = '# 对话记录\n\n';
    let msgIndex = 0;

    messages.forEach((msg) => {
      if (msg.role === 'system' && msg.content.startsWith('---\n# ')) {
        result += `${msg.content}\n\n`;
        return;
      }

      msgIndex++;
      const roleLabel = this.getRoleLabel(msg.role);
      const ts = hasTimestamp && msg.timestamp ? ` (${msg.timestamp})` : '';
      result += `## ${msgIndex}. ${roleLabel}${ts}\n\n`;

      if (msg.name) {
        result += `> **名称**: ${msg.name}\n\n`;
      }

      if (msg.content) {
        const processed = this.processContent(msg.content);
        result += `${processed}\n\n`;
      }

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        result += '**工具调用:**\n\n';
        msg.tool_calls.forEach((tc) => {
          const idStr = tc.id ? ` (ID: \`${tc.id}\`)` : '';
          result += `- **${tc.function.name}**${idStr}\n`;
          try {
            const args = JSON.parse(tc.function.arguments);
            result += `  \`\`\`json\n  ${JSON.stringify(args, null, 2).replace(/\n/g, '\n  ')}\n  \`\`\`\n`;
          } catch {
            result += `  \`\`\`\n  ${tc.function.arguments}\n  \`\`\`\n`;
          }
        });
        result += '\n';
      }

      if (msg.tool_call_id) {
        result += `> 工具响应 \`${msg.tool_call_id}\`\n\n`;
      }

      result += '---\n\n';
    });

    if (msgIndex === 0) {
      result += '_（无消息）_\n';
    }

    return result.trim();
  }

  private getRoleLabel(role: string): string {
    switch (role) {
      case 'user': return '💬 用户';
      case 'assistant': return '🤖 助手';
      case 'system': return '⚙️ 系统';
      case 'tool': return '🔧 工具';
      case 'model': return '🤖 模型';
      default: return role.charAt(0).toUpperCase() + role.slice(1);
    }
  }

  private convertWithTemplate(data: any): string {
    let templateContent: string;
    try {
      templateContent = fs.readFileSync(this.template!, 'utf-8');
    } catch (error) {
      throw new Error(`读取模板文件失败: ${(error as Error).message}`);
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
