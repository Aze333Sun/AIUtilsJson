import { JsonToMarkdownConverter, NormalizedMessage } from './converter';

export interface ExtractOptions {
  includeCode?: boolean;
  includeToolCalls?: boolean;
  includeReasoning?: boolean;
  includeTimestamps?: boolean;
  includeModelInfo?: boolean;
  maxContentLength?: number;
  groupByTopic?: boolean;
}

interface ExtractedConversation {
  title: string;
  startTime?: string;
  endTime?: string;
  model?: string;
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  topics: string[];
  keyQA: Array<{ question: string; answer: string }>;
  codeSnippets: Array<{ language: string; code: string; context: string }>;
  toolCalls: Array<{ name: string; arguments: string; result?: string }>;
  summary: string;
}

const DEFAULT_EXTRACT_OPTIONS: ExtractOptions = {
  includeCode: true,
  includeToolCalls: true,
  includeReasoning: false,
  includeTimestamps: true,
  includeModelInfo: true,
  maxContentLength: 500,
  groupByTopic: true,
};

export class ChatRecordExtractor {
  private converter: JsonToMarkdownConverter;
  private options: ExtractOptions;

  constructor(options: ExtractOptions = {}) {
    this.converter = new JsonToMarkdownConverter();
    this.options = { ...DEFAULT_EXTRACT_OPTIONS, ...options };
  }

  extract(jsonString: string): string {
    const messages = this.converter.detectAndNormalizeChatPublic(jsonString);
    const conversations = this.splitConversations(messages);
    const extracted = conversations.map(conv => this.extractConversation(conv));
    return this.renderExtractedDocument(extracted);
  }

  extractFromMessages(messages: NormalizedMessage[]): string {
    const conversations = this.splitConversations(messages);
    const extracted = conversations.map(conv => this.extractConversation(conv));
    return this.renderExtractedDocument(extracted);
  }

  private splitConversations(messages: NormalizedMessage[]): NormalizedMessage[][] {
    const conversations: NormalizedMessage[][] = [];
    let current: NormalizedMessage[] = [];

    messages.forEach(msg => {
      if (msg.role === 'system' && msg.content.startsWith('---\n# ')) {
        if (current.length > 0) {
          conversations.push(current);
        }
        current = [msg];
        return;
      }
      current.push(msg);
    });

    if (current.length > 0) {
      conversations.push(current);
    }

    if (conversations.length === 0 && messages.length > 0) {
      conversations.push(messages);
    }

    return conversations;
  }

  private extractConversation(messages: NormalizedMessage[]): ExtractedConversation {
    const userMsgs = messages.filter(m => m.role === 'user');
    const assistantMsgs = messages.filter(m => m.role === 'assistant');
    const timestamps = messages.map(m => m.timestamp).filter(Boolean) as string[];
    const models = [...new Set(assistantMsgs.map(m => m.model).filter(Boolean) as string[])];

    const title = this.inferTitle(messages);
    const topics = this.extractTopics(userMsgs);
    const keyQA = this.extractKeyQA(messages);
    const codeSnippets = this.extractCodeSnippets(messages);
    const toolCalls = this.extractToolCalls(messages);
    const summary = this.generateSummary(messages, topics, keyQA);

    return {
      title,
      startTime: timestamps[0],
      endTime: timestamps[timestamps.length - 1],
      model: models.join(', ') || undefined,
      messageCount: messages.length,
      userMessages: userMsgs.length,
      assistantMessages: assistantMsgs.length,
      topics,
      keyQA,
      codeSnippets,
      toolCalls,
      summary,
    };
  }

  private inferTitle(messages: NormalizedMessage[]): string {
    const titleMsg = messages.find(m => m.role === 'system' && m.content.startsWith('---\n# '));
    if (titleMsg) {
      const match = titleMsg.content.match(/---\n# (.+)\n---/);
      if (match) return match[1];
    }

    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      const content = firstUserMsg.content.trim();
      const firstLine = content.split('\n')[0].trim();
      if (firstLine.length <= 80) return firstLine;
      return firstLine.substring(0, 77) + '...';
    }
    const firstMsg = messages.find(m => m.role !== 'system');
    if (firstMsg) {
      const content = firstMsg.content.trim();
      const firstLine = content.split('\n')[0].trim();
      return firstLine.length <= 80 ? firstLine : firstLine.substring(0, 77) + '...';
    }
    return '未命名对话';
  }

  private extractTopics(userMsgs: NormalizedMessage[]): string[] {
    const topics: string[] = [];
    const seen = new Set<string>();

    userMsgs.forEach(msg => {
      const content = msg.content.trim();
      const sentences = content.split(/[。？！\n.?!]+/).filter(s => s.trim().length > 2);
      sentences.forEach(s => {
        const trimmed = s.trim();
        if (trimmed.length >= 4 && trimmed.length <= 50 && !seen.has(trimmed)) {
          seen.add(trimmed);
          topics.push(trimmed);
        }
      });
    });

    return topics.slice(0, 10);
  }

  private extractKeyQA(messages: NormalizedMessage[]): Array<{ question: string; answer: string }> {
    const qaPairs: Array<{ question: string; answer: string }> = [];
    const maxLen = this.options.maxContentLength || 500;

    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        const question = this.truncateContent(messages[i].content, maxLen);
        let answer = '';

        for (let j = i + 1; j < messages.length && j < i + 3; j++) {
          if (messages[j].role === 'assistant') {
            answer = this.truncateContent(messages[j].content, maxLen);
            break;
          }
        }

        if (answer) {
          qaPairs.push({ question, answer });
        }
      }
    }

    return qaPairs;
  }

  private extractCodeSnippets(messages: NormalizedMessage[]): Array<{ language: string; code: string; context: string }> {
    if (!this.options.includeCode) return [];

    const snippets: Array<{ language: string; code: string; context: string }> = [];
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;

    messages.forEach(msg => {
      if (msg.role !== 'assistant') return;
      const content = msg.content;
      let match;

      while ((match = codeBlockRegex.exec(content)) !== null) {
        const language = match[1] || '未知';
        const code = match[2].trim();
        if (code.length > 10) {
          const beforeIndex = match.index;
          const contextText = content.substring(Math.max(0, beforeIndex - 100), beforeIndex).trim();
          const contextLine = contextText.split('\n').pop() || '';
          snippets.push({
            language,
            code: code.length > 800 ? code.substring(0, 797) + '...' : code,
            context: contextLine.substring(0, 80),
          });
        }
      }
    });

    return snippets.slice(0, 20);
  }

  private extractToolCalls(messages: NormalizedMessage[]): Array<{ name: string; arguments: string; result?: string }> {
    if (!this.options.includeToolCalls) return [];

    const calls: Array<{ name: string; arguments: string; result?: string }> = [];

    messages.forEach(msg => {
      if (msg.tool_calls) {
        msg.tool_calls.forEach(tc => {
          calls.push({
            name: tc.function.name,
            arguments: tc.function.arguments,
          });
        });
      }
    });

    return calls.slice(0, 20);
  }

  private generateSummary(
    messages: NormalizedMessage[],
    topics: string[],
    keyQA: Array<{ question: string; answer: string }>
  ): string {
    const userMsgs = messages.filter(m => m.role === 'user');
    const assistantMsgs = messages.filter(m => m.role === 'assistant');

    const parts: string[] = [];

    if (topics.length > 0) {
      parts.push(`涉及主题: ${topics.slice(0, 5).join('、')}`);
    }

    parts.push(`共 ${userMsgs.length} 个问题，${assistantMsgs.length} 个回答`);

    if (keyQA.length > 0) {
      const firstQ = keyQA[0].question.split('\n')[0];
      parts.push(`首个问题: ${firstQ.substring(0, 60)}`);
    }

    return parts.join('；');
  }

  private truncateContent(content: string, maxLen: number): string {
    const cleaned = content
      .replace(/```[\s\S]*?```/g, '[代码块]')
      .replace(/!\[.*?\]\(.*?\)/g, '[图片]')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .trim();

    if (cleaned.length <= maxLen) return cleaned;
    return cleaned.substring(0, maxLen - 3) + '...';
  }

  private renderExtractedDocument(conversations: ExtractedConversation[]): string {
    const lines: string[] = [];
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    lines.push('# 对话记录提取报告');
    lines.push('');
    lines.push(`> 生成时间: ${dateStr} | 对话数: ${conversations.length}`);
    lines.push('');

    const totalMessages = conversations.reduce((s, c) => s + c.messageCount, 0);
    const totalUser = conversations.reduce((s, c) => s + c.userMessages, 0);
    const totalAssistant = conversations.reduce((s, c) => s + c.assistantMessages, 0);

    lines.push('## 概览');
    lines.push('');
    lines.push(`| 指标 | 值 |`);
    lines.push(`| --- | --- |`);
    lines.push(`| 对话总数 | ${conversations.length} |`);
    lines.push(`| 消息总数 | ${totalMessages} |`);
    lines.push(`| 用户消息 | ${totalUser} |`);
    lines.push(`| 助手消息 | ${totalAssistant} |`);

    const allModels = [...new Set(conversations.map(c => c.model).filter(Boolean) as string[])];
    if (allModels.length > 0) {
      lines.push(`| 使用模型 | ${allModels.join(', ')} |`);
    }

    if (conversations.length > 0 && conversations[0].startTime) {
      const firstTime = conversations[0].startTime;
      const lastConv = conversations[conversations.length - 1];
      const lastTime = lastConv.endTime || lastConv.startTime;
      if (lastTime) {
        lines.push(`| 时间范围 | ${firstTime} ~ ${lastTime} |`);
      }
    }

    lines.push('');

    if (conversations.length > 1) {
      lines.push('## 对话目录');
      lines.push('');
      conversations.forEach((conv, i) => {
        lines.push(`${i + 1}. **${conv.title}** - ${conv.summary.substring(0, 80)}`);
      });
      lines.push('');
    }

    conversations.forEach((conv, i) => {
      const prefix = conversations.length > 1 ? `## ${i + 1}. ` : '## ';
      lines.push(`${prefix}${conv.title}`);
      lines.push('');

      if (this.options.includeTimestamps && conv.startTime) {
        const timeRange = conv.endTime && conv.endTime !== conv.startTime
          ? `${conv.startTime} ~ ${conv.endTime}`
          : conv.startTime;
        lines.push(`> 时间: ${timeRange}`);
        if (this.options.includeModelInfo && conv.model) {
          lines.push(`> 模型: ${conv.model}`);
        }
        lines.push('');
      } else if (this.options.includeModelInfo && conv.model) {
        lines.push(`> 模型: ${conv.model}`);
        lines.push('');
      }

      lines.push(`**摘要**: ${conv.summary}`);
      lines.push('');

      if (conv.topics.length > 0) {
        lines.push(`**主题**: ${conv.topics.map(t => `\`${t}\``).join(' ')}`);
        lines.push('');
      }

      if (conv.keyQA.length > 0) {
        lines.push('### 关键问答');
        lines.push('');
        conv.keyQA.forEach((qa, qi) => {
          lines.push(`**Q${qi + 1}**: ${qa.question}`);
          lines.push('');
          lines.push(`**A${qi + 1}**: ${qa.answer}`);
          lines.push('');
        });
      }

      if (conv.codeSnippets.length > 0) {
        lines.push('### 代码片段');
        lines.push('');
        conv.codeSnippets.forEach((snippet, si) => {
          lines.push(`**片段 ${si + 1}** (${snippet.language})${snippet.context ? ` - ${snippet.context}` : ''}`);
          lines.push('');
          lines.push('```' + snippet.language);
          lines.push(snippet.code);
          lines.push('```');
          lines.push('');
        });
      }

      if (conv.toolCalls.length > 0) {
        lines.push('### 工具调用');
        lines.push('');
        conv.toolCalls.forEach((tc, ti) => {
          lines.push(`${ti + 1}. \`${tc.name}\``);
          lines.push(`   - 参数: \`${tc.arguments.substring(0, 100)}\``);
        });
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    });

    return lines.join('\n').trimEnd();
  }
}

export function extractChatRecords(jsonString: string, options: ExtractOptions = {}): string {
  const extractor = new ChatRecordExtractor(options);
  return extractor.extract(jsonString);
}
