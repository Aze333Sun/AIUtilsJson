import { ChatRecordExtractor, extractChatRecords } from '../chat-extractor';

describe('ChatRecordExtractor', () => {
  const sampleChat = {
    messages: [
      { role: 'user', content: '如何用Python读取CSV文件？' },
      { role: 'assistant', content: '可以使用pandas库：\n\n```python\nimport pandas as pd\ndf = pd.read_csv("file.csv")\n```\n\n这样就能读取CSV文件了。', model: 'gpt-4' },
      { role: 'user', content: '如何筛选特定列？' },
      { role: 'assistant', content: '使用列名选择：\n\n```python\ndf[["name", "age"]]\n```\n\n或者用 `df.filter()` 方法。', model: 'gpt-4' },
    ],
  };

  const deepseekChat = {
    '1': { id: '1', parent: null, children: ['2'], message: null },
    '2': {
      id: '2', parent: '1', children: [],
      message: {
        model: 'deepseek-chat',
        inserted_at: '2025-04-26T10:00:00+08:00',
        fragments: [
          { type: 'REQUEST', content: 'Unity是什么？' },
          { type: 'RESPONSE', content: 'Unity是一个跨平台游戏引擎，广泛用于2D和3D游戏开发。' },
        ],
      },
    },
  };

  const multiConvChat = {
    conversations: [
      {
        title: 'Python学习',
        messages: [
          { role: 'user', content: 'Python如何定义函数？' },
          { role: 'assistant', content: '使用def关键字：\n\n```python\ndef hello(name):\n    print(f"Hello, {name}")\n```' },
        ],
      },
      {
        title: 'JavaScript问题',
        messages: [
          { role: 'user', content: 'JavaScript如何异步编程？' },
          { role: 'assistant', content: '可以使用Promise或async/await。' },
        ],
      },
    ],
  };

  describe('extract', () => {
    it('应从聊天记录中提取关键信息', () => {
      const json = JSON.stringify(sampleChat);
      const result = extractChatRecords(json);

      expect(result).toContain('对话记录提取报告');
      expect(result).toContain('概览');
      expect(result).toContain('关键问答');
      expect(result).toContain('如何用Python读取CSV文件');
      expect(result).toContain('pandas');
    });

    it('应提取代码片段', () => {
      const json = JSON.stringify(sampleChat);
      const result = extractChatRecords(json, { includeCode: true });

      expect(result).toContain('代码片段');
      expect(result).toContain('```python');
      expect(result).toContain('import pandas');
    });

    it('应支持排除代码片段', () => {
      const json = JSON.stringify(sampleChat);
      const result = extractChatRecords(json, { includeCode: false });

      expect(result).not.toContain('### 代码片段');
    });

    it('应从 DeepSeek 格式中提取', () => {
      const json = JSON.stringify(deepseekChat);
      const result = extractChatRecords(json);

      expect(result).toContain('对话记录提取报告');
      expect(result).toContain('Unity');
      expect(result).toContain('deepseek-chat');
    });

    it('应处理多对话格式并生成目录', () => {
      const json = JSON.stringify(multiConvChat);
      const result = extractChatRecords(json);

      expect(result).toContain('对话目录');
      expect(result).toContain('Python学习');
      expect(result).toContain('JavaScript问题');
    });

    it('应生成概览统计表', () => {
      const json = JSON.stringify(sampleChat);
      const result = extractChatRecords(json);

      expect(result).toContain('| 对话总数 |');
      expect(result).toContain('| 消息总数 |');
      expect(result).toContain('| 用户消息 |');
      expect(result).toContain('| 助手消息 |');
    });

    it('应提取主题标签', () => {
      const json = JSON.stringify(sampleChat);
      const result = extractChatRecords(json);

      expect(result).toContain('**主题**');
    });

    it('应生成摘要', () => {
      const json = JSON.stringify(sampleChat);
      const result = extractChatRecords(json);

      expect(result).toContain('**摘要**');
      expect(result).toContain('个问题');
      expect(result).toContain('个回答');
    });

    it('应处理空对话', () => {
      const json = JSON.stringify({ messages: [] });
      const result = extractChatRecords(json);

      expect(result).toContain('对话记录提取报告');
    });

    it('应支持包含模型信息', () => {
      const json = JSON.stringify(sampleChat);
      const result = extractChatRecords(json, { includeModelInfo: true });

      expect(result).toContain('gpt-4');
    });

    it('应支持排除时间戳', () => {
      const json = JSON.stringify(deepseekChat);
      const result = extractChatRecords(json, { includeTimestamps: false });

      expect(result).toContain('对话记录提取报告');
    });
  });

  describe('ChatRecordExtractor class', () => {
    it('应支持自定义 maxContentLength', () => {
      const extractor = new ChatRecordExtractor({ maxContentLength: 50 });
      const json = JSON.stringify({
        messages: [
          { role: 'user', content: '这是一个很长的问题内容，超过了最大长度限制，应该被截断处理' },
          { role: 'assistant', content: '这是回答' },
        ],
      });
      const result = extractor.extract(json);

      expect(result).toContain('对话记录提取报告');
    });
  });
});
