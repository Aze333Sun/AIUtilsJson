import * as handlebars from 'handlebars';
import * as fs from 'fs';

export interface ConverterOptions {
  indent?: number;
  sort?: boolean;
  template?: string;
}

export interface ChatConverterOptions {
  includeTimestamp?: boolean;
}

export interface NormalizedMessage {
  role: string;
  content: string;
  reasoning_content?: string;
  name?: string;
  timestamp?: string;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  model?: string;
}

const CODE_LANGUAGE_MAP: [RegExp, string][] = [
  [/\busing\s+System/, 'csharp'],
  [/\bnamespace\s+\w+/, 'csharp'],
  [/\bpublic\s+(class|static|void|string|int|bool|float|double)\b/, 'csharp'],
  [/\bprivate\s+(void|int|string|bool|float)\b/, 'csharp'],
  [/\bConsole\.(Write|Read)/, 'csharp'],
  [/^#\s*include\s*[<"]/, 'cpp'],
  [/\bstd::/, 'cpp'],
  [/\bcout\s*<</, 'cpp'],
  [/\bprintf\s*\(/, 'c'],
  [/\bmalloc\s*\(/, 'c'],
  [/^import\s+(java|javax)\./, 'java'],
  [/\bpublic\s+(static\s+)?void\s+main/, 'java'],
  [/\bSystem\.out\.print/, 'java'],
  [/\bdef\s+\w+\s*\(.*\)\s*:/, 'python'],
  [/\bimport\s+\w+\s*$/, 'python'],
  [/^from\s+\w+\s+import/, 'python'],
  [/\bprint\s*\(/, 'python'],
  [/\bself\.\w+/, 'python'],
  [/^(let|const|var)\s+\w+\s*=/, 'javascript'],
  [/\bconsole\.log/, 'javascript'],
  [/\brequire\s*\(/, 'javascript'],
  [/\bmodule\.exports/, 'javascript'],
  [/^import\s+.*from\s+['"]/, 'typescript'],
  [/:\s*(string|number|boolean|void)\s*[={]/, 'typescript'],
  [/\binterface\s+\w+/, 'typescript'],
  [/\btype\s+\w+\s*=/, 'typescript'],
  [/^<!DOCTYPE\s+html/i, 'html'],
  [/<html[\s>]/i, 'html'],
  [/<div[\s>]/i, 'html'],
  [/\bSELECT\s+.*\bFROM\b/i, 'sql'],
  [/\bINSERT\s+INTO\b/i, 'sql'],
  [/\bCREATE\s+TABLE\b/i, 'sql'],
  [/\bUPDATE\s+\w+\s+SET\b/i, 'sql'],
  [/^[\w.-]+\s*\{[^}]*\}/m, 'css'],
  [/@media\s*\(/, 'css'],
  [/\bflex-direction:/, 'css'],
  [/^#!/, 'bash'],
  [/\bsudo\s+/, 'bash'],
  [/\bapt(-get)?\s+install/, 'bash'],
  [/\bnpm\s+install/, 'bash'],
  [/\bdocker\s+/, 'bash'],
  [/^---\s*$/m, 'yaml'],
  [/^\w+:\s*.+/m, 'yaml'],
  [/^"[\w.]+"\s*:\s*"/, 'json'],
];

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

  private detectCodeLanguage(code: string): string {
    const trimmed = code.trim();
    if (!trimmed) return '';
    for (const [pattern, lang] of CODE_LANGUAGE_MAP) {
      if (pattern.test(trimmed)) return lang;
    }
    return '';
  }

  private processContent(content: string): string {
    if (!content) return '';

    let result = content
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");

    if (this.hasMarkdownStructure(result)) {
      return result;
    }

    const hasCodeFence = result.startsWith('```') || result.endsWith('```') || result.includes('\n```') || result.includes('```\n');
    const hasCodeBlock = /```[\s\S]*```/.test(result);
    const hasTable = /\|.+\|/.test(result) && /\|[\s\-:]+\|/m.test(result);

    if (hasCodeFence || hasCodeBlock || hasTable) {
      return result;
    }

    const lines = result.split('\n');
    const hasLongLine = lines.some(line => line.length > 80);

    if (hasLongLine || lines.length > 5) {
      const lang = this.detectCodeLanguage(result);
      return `\`\`\`${lang}\n${result}\n\`\`\``;
    }

    return result;
  }

  private hasMarkdownStructure(text: string): boolean {
    const patterns = [
      /^#{1,6}\s+/m,
      /^\*{1,3}\s+/m,
      /^-{1,3}\s+/m,
      /^>\s+/m,
      /^\d+\.\s+/m,
      /\[.*\]\(.*\)/,
      /^---+$/m,
      /^\|.+\|/m,
    ];
    return patterns.some(p => p.test(text));
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

  detectAndNormalizeChatPublic(jsonString: string): NormalizedMessage[] {
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
    return this.detectAndNormalizeChat(data);
  }

  private detectAndNormalizeChat(data: any): NormalizedMessage[] {
    if (Array.isArray(data)) {
      if (data.length > 0 && data[0].mapping) {
        return this.normalizeChatGPTHistory(data);
      }
      if (data.length > 0 && this.looksLikeMessageArray(data)) {
        return data.map((m: any) => this.normalizeMessage(m));
      }
      throw new Error('无法识别的聊天格式：数组中的元素不包含有效的消息结构');
    }

    if (data.mapping) {
      return this.normalizeChatGPTMapping(data);
    }

    if (data.messages && Array.isArray(data.messages)) {
      return data.messages.map((m: any) => this.normalizeMessage(m));
    }

    if (data.contents && Array.isArray(data.contents)) {
      return data.contents.map((m: any) => this.normalizeGeminiContent(m));
    }

    if (data.conversations && Array.isArray(data.conversations)) {
      return this.normalizeConversations(data);
    }

    if (this.isDeepSeekFormat(data)) {
      return this.normalizeDeepSeekChat(data);
    }

    if (this.isClaudeFormat(data)) {
      return this.normalizeClaudeChat(data);
    }

    if (this.isQwenFormat(data)) {
      return this.normalizeQwenChat(data);
    }

    if (this.isKimiFormat(data)) {
      return this.normalizeKimiChat(data);
    }

    throw new Error('无法识别的聊天格式，支持: messages[], contents[], conversations[], mapping, deepseek, claude, qwen, kimi 或消息数组');
  }

  private looksLikeMessageArray(arr: any[]): boolean {
    if (arr.length === 0) return false;
    return arr.every(item =>
      item && typeof item === 'object' && typeof item.role === 'string'
    );
  }

  private normalizeConversations(data: any): NormalizedMessage[] {
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

  private normalizeChatGPTHistory(history: any[]): NormalizedMessage[] {
    const result: NormalizedMessage[] = [];
    history.forEach((conv: any, idx: number) => {
      const title = conv.title || `对话 ${idx + 1}`;
      if (history.length > 1) {
        result.push({ role: 'system', content: `---\n# ${title}\n---` });
      }
      const msgs = this.buildMessagesFromMapping(conv.mapping, title);
      result.push(...msgs);
    });
    return result;
  }

  private normalizeChatGPTMapping(data: any): NormalizedMessage[] {
    const title = data.title || '对话记录';
    return this.buildMessagesFromMapping(data.mapping, title);
  }

  private buildMessagesFromMapping(mapping: Record<string, any>, title: string): NormalizedMessage[] {
    const messages: NormalizedMessage[] = [];

    const nodeMap = mapping;
    const nodeIds = Object.keys(nodeMap);

    const childrenMap: { [key: string]: string[] } = {};
    const parentMap: { [key: string]: string | null } = {};
    let rootId: string | null = null;

    nodeIds.forEach((id) => {
      const node = nodeMap[id];
      const parent = node.parent || null;
      parentMap[id] = parent;

      if (!parent) {
        rootId = id;
      } else {
        if (!childrenMap[parent]) childrenMap[parent] = [];
        childrenMap[parent].push(id);
      }
    });

    if (!rootId && nodeIds.length > 0) {
      let candidate: string = nodeIds[0];
      for (let i = 0; i < nodeIds.length; i++) {
        const p = parentMap[candidate];
        if (!p) break;
        candidate = p;
      }
      rootId = candidate;
    }

    if (!rootId) return messages;

    const orderedIds: string[] = [];
    const walk = (id: string) => {
      const children = childrenMap[id] || [];
      children.forEach((childId) => {
        orderedIds.push(childId);
        walk(childId);
      });
    };
    walk(rootId);

    orderedIds.forEach((id) => {
      const node = nodeMap[id];
      const msg = node.message;
      if (!msg) return;

      if (msg.author && msg.author.role === 'user') {
        msg.role = 'user';
      } else if (msg.author && msg.author.role === 'assistant') {
        msg.role = 'assistant';
      } else if (msg.author && msg.author.role === 'system') {
        msg.role = 'system';
      } else if (msg.author && msg.author.role === 'tool') {
        msg.role = 'tool';
      }

      const normalized = this.normalizeMessage(msg);
      if (msg.metadata?.model_slug) {
        normalized.content = `_模型: ${msg.metadata.model_slug}_\n\n${normalized.content}`;
      }
      messages.push(normalized);
    });

    if (messages.length === 0 && title) {
      messages.push({ role: 'system', content: `_（对话"${title}"无有效消息）_` });
    }

    return messages;
  }

  private normalizeMessage(msg: any): NormalizedMessage {
    const role = msg.role || 'unknown';
    let content = '';

    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = this.normalizeContentBlocks(msg.content);
    } else if (msg.content && typeof msg.content === 'object') {
      const parts = msg.content.parts;
      if (Array.isArray(parts)) {
        content = parts.filter((p: any) => typeof p === 'string').join('\n');
      } else if (msg.content.content_type === 'text' && typeof msg.content.text === 'string') {
        content = msg.content.text;
      } else {
        content = JSON.stringify(msg.content, null, 2);
      }
    }

    const timestamp = msg.timestamp || msg.created_at || msg.created || msg.time || msg.create_time;

    let tool_calls = msg.tool_calls;
    if (msg.content?.tool_calls) {
      tool_calls = msg.content.tool_calls;
    }

    let reasoning_content = msg.reasoning_content;
    if (!reasoning_content && msg.content && typeof msg.content === 'object') {
      reasoning_content = msg.content.reasoning_content;
    }

    return {
      role,
      content: content || '',
      reasoning_content: reasoning_content || undefined,
      name: msg.name,
      timestamp: this.formatTimestamp(timestamp),
      tool_calls,
      tool_call_id: msg.tool_call_id,
      model: msg.model,
    };
  }

  private normalizeContentBlocks(blocks: any[]): string {
    const parts: string[] = [];
    blocks.forEach((block: any) => {
      if (typeof block === 'string') {
        parts.push(block);
      } else if (block.type === 'text') {
        parts.push(block.text || '');
      } else if (block.type === 'code') {
        const lang = block.language || '';
        parts.push(`\`\`\`${lang}\n${block.code || block.text || ''}\n\`\`\``);
      } else if (block.type === 'image_url' || block.type === 'image') {
        parts.push('_[图片内容]_');
      } else if (block.type === 'thinking') {
        parts.push(`> **思考过程**\n> ${this.wrapBlockquote(block.thinking || block.text || '')}`);
      } else if (block.type === 'tool_use') {
        parts.push(`**工具调用**: \`${block.name || 'unknown'}\`\n\`\`\`json\n${JSON.stringify(block.input || {}, null, 2)}\n\`\`\``);
      } else if (block.type === 'tool_result') {
        parts.push(`**工具结果**:\n\`\`\`\n${typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2)}\n\`\`\``);
      } else if (block.type === 'text_delta') {
        parts.push(block.text || '');
      }
    });
    return parts.join('\n\n');
  }

  private wrapBlockquote(text: string): string {
    return text.split('\n').map(line => `> ${line}`).join('\n');
  }

  private formatTimestamp(ts: any): string | undefined {
    if (!ts) return undefined;
    if (typeof ts === 'number') {
      try {
        const d = new Date(ts * 1000);
        return d.toISOString().replace('T', ' ').replace(/\.\d+Z/, '');
      } catch {
        return String(ts);
      }
    }
    if (typeof ts === 'string') {
      return ts.replace('T', ' ').replace(/\.\d+Z/, '').replace(/\.\d+/, '');
    }
    return String(ts);
  }

  private isDeepSeekFormat(data: any): boolean {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
    const keys = Object.keys(data);
    if (keys.length === 0) return false;
    const sampleKeys = keys.slice(0, 5);
    let matchCount = 0;
    sampleKeys.forEach(key => {
      const node = data[key];
      if (
        node
        && typeof node === 'object'
        && typeof node.id !== 'undefined'
        && node.message
        && typeof node.message === 'object'
        && Array.isArray(node.message.fragments)
      ) {
        matchCount++;
      }
    });
    return matchCount > 0;
  }

  private normalizeDeepSeekChat(data: any): NormalizedMessage[] {
    const nodeMap = data;
    const nodeIds = Object.keys(nodeMap);

    const childrenMap: { [key: string]: string[] } = {};
    const parentMap: { [key: string]: string | null } = {};
    let rootId: string | null = null;

    nodeIds.forEach(id => {
      const node = nodeMap[id];
      const parent = node.parent || null;
      parentMap[id] = parent;
      if (!parent) {
        rootId = id;
      } else {
        if (!childrenMap[parent]) childrenMap[parent] = [];
        childrenMap[parent].push(id);
      }
    });

    if (!rootId && nodeIds.length > 0) {
      let candidate = nodeIds[0];
      for (let i = 0; i < nodeIds.length; i++) {
        const p = parentMap[candidate];
        if (!p) break;
        candidate = p;
      }
      rootId = candidate;
    }

    if (!rootId) return [];

    const orderedIds: string[] = [];
    const walk = (id: string) => {
      const children = childrenMap[id] || [];
      children.forEach(childId => {
        orderedIds.push(childId);
        walk(childId);
      });
    };
    walk(rootId);

    const messages: NormalizedMessage[] = [];
    orderedIds.forEach(id => {
      const node = nodeMap[id];
      const msg = node.message;
      if (!msg) return;

      const fragments: NormalizedMessage[] = [];
      if (Array.isArray(msg.fragments)) {
        msg.fragments.forEach((frag: any) => {
          const role = frag.type === 'REQUEST' ? 'user'
            : frag.type === 'RESPONSE' ? 'assistant'
            : frag.type === 'SYSTEM' ? 'system'
            : 'unknown';
          fragments.push({
            role,
            content: frag.content || '',
            timestamp: this.formatTimestamp(msg.inserted_at),
            model: msg.model,
          });
        });
      }

      if (fragments.length === 0) {
        const content = typeof msg.content === 'string' ? msg.content : '';
        if (content) {
          fragments.push({ role: 'unknown', content, model: msg.model });
        }
      }

      fragments.forEach(frag => {
        if (msg.model && frag.role === 'assistant') {
          frag.content = `_模型: ${msg.model}_\n\n${frag.content}`;
        }
        messages.push(frag);
      });
    });

    return messages;
  }

  private isClaudeFormat(data: any): boolean {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
    if (data.messages && Array.isArray(data.messages)) {
      const first = data.messages[0];
      if (first && Array.isArray(first.content) && first.content.some((b: any) =>
        b.type === 'thinking' || b.type === 'text' || b.type === 'tool_use' || b.type === 'tool_result'
      )) {
        return true;
      }
    }
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      if (first && Array.isArray(first.content) && first.content.some((b: any) =>
        b.type === 'thinking' || b.type === 'text' || b.type === 'tool_use' || b.type === 'tool_result'
      )) {
        return true;
      }
    }
    return false;
  }

  private normalizeClaudeChat(data: any): NormalizedMessage[] {
    const msgs = data.messages || (Array.isArray(data) ? data : []);
    return msgs.map((m: any) => this.normalizeMessage(m));
  }

  private isQwenFormat(data: any): boolean {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
    if (Array.isArray(data)) {
      if (data.length > 0 && data[0].chatId) return true;
    }
    if (data.chatId || data.chat_id) return true;
    if (data.chats && Array.isArray(data.chats)) return true;
    return false;
  }

  private normalizeQwenChat(data: any): NormalizedMessage[] {
    const result: NormalizedMessage[] = [];
    const chats = data.chats || (Array.isArray(data) ? data : [data]);

    chats.forEach((chat: any, idx: number) => {
      const title = chat.title || chat.chatId || `对话 ${idx + 1}`;
      if (chats.length > 1) {
        result.push({ role: 'system', content: `---\n# ${title}\n---` });
      }
      const msgs = chat.messages || chat.chatItems || [];
      if (Array.isArray(msgs)) {
        msgs.forEach((m: any) => {
          const role = m.role || m.senderType || 'unknown';
          let content = '';
          if (typeof m.content === 'string') {
            content = m.content;
          } else if (m.content && typeof m.content === 'object') {
            content = m.content.text || m.content.body || JSON.stringify(m.content, null, 2);
          }
          result.push({
            role,
            content,
            timestamp: this.formatTimestamp(m.createdAt || m.createTime || m.timestamp),
            model: m.model,
          });
        });
      }
    });

    return result;
  }

  private isKimiFormat(data: any): boolean {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
    if (data.chatRecords && Array.isArray(data.chatRecords)) return true;
    if (data.item_list && Array.isArray(data.item_list)) return true;
    return false;
  }

  private normalizeKimiChat(data: any): NormalizedMessage[] {
    const result: NormalizedMessage[] = [];
    const records = data.chatRecords || data.item_list || [];

    if (data.name || data.title) {
      result.push({ role: 'system', content: `---\n# ${data.name || data.title}\n---` });
    }

    records.forEach((item: any) => {
      const role = item.role === 'user' ? 'user'
        : item.role === 'assistant' ? 'assistant'
        : item.role || 'unknown';
      let content = '';
      if (typeof item.text === 'string') {
        content = item.text;
      } else if (typeof item.content === 'string') {
        content = item.content;
      } else if (Array.isArray(item.messages)) {
        content = item.messages
          .map((m: any) => m.content || m.text || '')
          .filter(Boolean)
          .join('\n\n');
      }
      result.push({
        role,
        content,
        timestamp: this.formatTimestamp(item.created_at || item.createTime),
        model: item.model,
      });
    });

    return result;
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
      const ts = hasTimestamp && msg.timestamp ? ` | ${msg.timestamp}` : '';
      result += `## ${msgIndex}. ${roleLabel}${ts}\n\n`;

      if (msg.name) {
        result += `> **名称**: ${msg.name}\n\n`;
      }

      if (msg.reasoning_content) {
        result += '> **推理过程:**\n>\n';
        const processed = this.processContent(msg.reasoning_content);
        result += `${this.wrapBlockquote(processed)}\n\n`;
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
      case 'user': return '用户';
      case 'assistant': return '助手';
      case 'system': return '系统';
      case 'tool': return '工具';
      case 'model': return '模型';
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
    if (this.isJsonString(value)) {
      const lang = 'json';
      return `\n${' '.repeat(this.indent * depth)}\`\`\`${lang}\n${value}\n${' '.repeat(this.indent * depth)}\`\`\``;
    }
    if (this.isCodeString(value)) {
      const lang = this.detectCodeLanguage(value);
      return `\n${' '.repeat(this.indent * depth)}\`\`\`${lang}\n${value}\n${' '.repeat(this.indent * depth)}\`\`\``;
    }
    if (this.isMarkdownString(value)) {
      return value;
    }
    if (value.includes('\n') && value.split('\n').length > 3) {
      const lang = this.detectCodeLanguage(value);
      return `\n${' '.repeat(this.indent * depth)}\`\`\`${lang}\n${value}\n${' '.repeat(this.indent * depth)}\`\`\``;
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
      /^#\s*include\s*[<"]/,
      /\busing\s+System/,
      /\bnamespace\s+\w+/,
      /\bdef\s+\w+\s*\(.*\)\s*:/,
      /\bSELECT\s+.*\bFROM\b/i,
    ];
    return codePatterns.some(pattern => pattern.test(trimmed));
  }

  private isMarkdownString(value: string): boolean {
    return this.hasMarkdownStructure(value);
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

    const keySets = arr.map(item => new Set(Object.keys(item)));
    if (keySets.length === 0) return false;

    const commonKeys = new Set([...keySets[0]]);
    for (let i = 1; i < keySets.length; i++) {
      for (const key of commonKeys) {
        if (!keySets[i].has(key)) {
          commonKeys.delete(key);
        }
      }
    }

    return commonKeys.size >= 2;
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
          return this.renderTableCellObject(value);
        }
        const str = String(value);
        const cleaned = str.replace(/\n/g, ' ').replace(/\|/g, '\\|');
        if (cleaned.length > 100) {
          return cleaned.substring(0, 100) + '...';
        }
        return cleaned;
      });
      return `| ${values.join(' | ')} |`;
    });

    return `\n${header}\n${separator}\n${rows.join('\n')}\n`;
  }

  private renderTableCellObject(value: any): string {
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      if (value.every(v => typeof v !== 'object')) {
        return value.join(', ');
      }
      return `<details><summary>[${value.length}项]</summary>${JSON.stringify(value, null, 2).replace(/\n/g, '<br>')}</details>`;
    }
    const json = JSON.stringify(value, null, 2);
    const preview = json.substring(0, 80);
    if (json.length > 80) {
      return `<details><summary>${preview.replace(/\n/g, ' ').replace(/\|/g, '\\|')}...</summary>${json.replace(/\n/g, '<br>').replace(/\|/g, '\\|')}</details>`;
    }
    return preview.replace(/\n/g, ' ').replace(/\|/g, '\\|');
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
