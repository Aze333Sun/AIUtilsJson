import { convert, convertChat, JsonToMarkdownConverter } from '../converter';

describe('JsonToMarkdownConverter', () => {
  describe('convert', () => {
    it('应转换简单对象', () => {
      const json = '{"name": "test", "value": 42}';
      const result = convert(json);
      expect(result).toContain('# name');
      expect(result).toContain('test');
      expect(result).toContain('# value');
      expect(result).toContain('42');
    });

    it('应转换嵌套对象', () => {
      const json = '{"outer": {"inner": "hello"}}';
      const result = convert(json);
      expect(result).toContain('# outer');
      expect(result).toContain('## inner');
      expect(result).toContain('hello');
    });

    it('应转换数组为列表', () => {
      const json = '{"items": ["a", "b", "c"]}';
      const result = convert(json);
      expect(result).toContain('# items');
      expect(result).toContain('- a');
      expect(result).toContain('- b');
      expect(result).toContain('- c');
    });

    it('应转换结构一致的数组为表格', () => {
      const json = '{"users": [{"id": 1, "name": "A"}, {"id": 2, "name": "B"}]}';
      const result = convert(json);
      expect(result).toContain('| id | name |');
      expect(result).toContain('| --- | --- |');
      expect(result).toContain('| 1 | A |');
      expect(result).toContain('| 2 | B |');
    });

    it('应对键进行排序', () => {
      const json = '{"b": 2, "a": 1}';
      const result = convert(json, { sort: true });
      const aIndex = result.indexOf('# a');
      const bIndex = result.indexOf('# b');
      expect(aIndex).toBeLessThan(bIndex);
    });

    it('应对无效 JSON 抛出错误', () => {
      expect(() => convert('not json')).toThrow();
    });

    it('应处理 null 和 boolean', () => {
      const json = '{"flag": true, "empty": null}';
      const result = convert(json);
      expect(result).toContain('true');
      expect(result).toContain('null');
    });

    it('应处理空数组', () => {
      const json = '{"items": []}';
      const result = convert(json);
      expect(result).toContain('[]');
    });
  });

  describe('convertChat', () => {
    it('应转换 messages 数组格式', () => {
      const json = JSON.stringify({
        messages: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '你好！' },
        ],
      });
      const result = convertChat(json);
      expect(result).toContain('# 对话记录');
      expect(result).toContain('用户');
      expect(result).toContain('助手');
      expect(result).toContain('你好');
    });

    it('应处理 reasoning_content', () => {
      const json = JSON.stringify({
        messages: [
          { role: 'assistant', content: '答案', reasoning_content: '思考过程' },
        ],
      });
      const result = convertChat(json);
      expect(result).toContain('推理过程');
      expect(result).toContain('思考过程');
    });

    it('应处理 tool_calls', () => {
      const json = JSON.stringify({
        messages: [
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'get_weather', arguments: '{"city": "Beijing"}' },
              },
            ],
          },
        ],
      });
      const result = convertChat(json);
      expect(result).toContain('工具调用');
      expect(result).toContain('get_weather');
      expect(result).toContain('call_1');
    });

    it('应转换 Gemini contents 格式', () => {
      const json = JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi there' }] },
        ],
      });
      const result = convertChat(json);
      expect(result).toContain('用户');
      expect(result).toContain('助手');
      expect(result).toContain('Hello');
      expect(result).toContain('Hi there');
    });

    it('应转换 DeepSeek 对话树格式', () => {
      const deepseekData = {
        '8': {
          id: '8',
          parent: null,
          children: ['10'],
          message: null,
        },
        '10': {
          id: '10',
          parent: '8',
          children: ['11'],
          message: {
            files: [],
            model: 'deepseek-chat',
            inserted_at: '2025-04-26T22:28:48.135000+08:00',
            fragments: [
              { type: 'REQUEST', content: '什么是Unity?' },
            ],
          },
        },
        '11': {
          id: '11',
          parent: '10',
          children: [],
          message: {
            files: [],
            model: 'deepseek-chat',
            inserted_at: '2025-04-26T22:28:48.135000+08:00',
            fragments: [
              { type: 'RESPONSE', content: 'Unity是一个跨平台游戏引擎。' },
            ],
          },
        },
      };
      const json = JSON.stringify(deepseekData);
      const result = convertChat(json);
      expect(result).toContain('用户');
      expect(result).toContain('什么是Unity?');
      expect(result).toContain('助手');
      expect(result).toContain('Unity是一个跨平台游戏引擎');
      expect(result).toContain('模型');
      expect(result).toContain('deepseek-chat');
    });

    it('应处理 DeepSeek 多分支对话树', () => {
      const deepseekData = {
        '1': {
          id: '1',
          parent: null,
          children: ['2'],
          message: null,
        },
        '2': {
          id: '2',
          parent: '1',
          children: ['3', '4'],
          message: {
            model: 'deepseek-chat',
            inserted_at: '2025-04-26T10:00:00+08:00',
            fragments: [{ type: 'REQUEST', content: '问题1' }],
          },
        },
        '3': {
          id: '3',
          parent: '2',
          children: [],
          message: {
            model: 'deepseek-chat',
            inserted_at: '2025-04-26T10:01:00+08:00',
            fragments: [{ type: 'RESPONSE', content: '回答A' }],
          },
        },
        '4': {
          id: '4',
          parent: '2',
          children: [],
          message: {
            model: 'deepseek-chat',
            inserted_at: '2025-04-26T10:02:00+08:00',
            fragments: [{ type: 'RESPONSE', content: '回答B' }],
          },
        },
      };
      const json = JSON.stringify(deepseekData);
      const result = convertChat(json);
      expect(result).toContain('问题1');
      expect(result).toContain('回答A');
      expect(result).toContain('回答B');
    });

    it('应处理 DeepSeek 空 fragments 回退到 message.content', () => {
      const deepseekData = {
        '1': {
          id: '1',
          parent: null,
          children: ['2'],
          message: null,
        },
        '2': {
          id: '2',
          parent: '1',
          children: [],
          message: {
            model: 'deepseek-chat',
            inserted_at: '2025-04-26T10:00:00+08:00',
            fragments: [],
            content: '回退内容',
          },
        },
      };
      const json = JSON.stringify(deepseekData);
      const result = convertChat(json);
      expect(result).toContain('回退内容');
    });

    it('应转换 Claude content blocks 格式', () => {
      const json = JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: '写一个Python函数' }],
          },
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: '用户需要一个Python函数...' },
              { type: 'text', text: '这是一个Python函数：' },
              { type: 'code', language: 'python', code: 'def hello():\n    print("Hello")' },
            ],
          },
        ],
      });
      const result = convertChat(json);
      expect(result).toContain('用户');
      expect(result).toContain('写一个Python函数');
      expect(result).toContain('助手');
      expect(result).toContain('思考过程');
      expect(result).toContain('```python');
      expect(result).toContain('def hello');
    });

    it('应转换 Qwen 格式', () => {
      const json = JSON.stringify({
        chatId: 'chat-001',
        messages: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '你好！' },
        ],
      });
      const result = convertChat(json);
      expect(result).toContain('用户');
      expect(result).toContain('你好');
      expect(result).toContain('助手');
    });

    it('应转换 Kimi 格式', () => {
      const json = JSON.stringify({
        name: '测试对话',
        chatRecords: [
          { role: 'user', text: '问题' },
          { role: 'assistant', text: '回答' },
        ],
      });
      const result = convertChat(json);
      expect(result).toContain('测试对话');
      expect(result).toContain('用户');
      expect(result).toContain('问题');
      expect(result).toContain('助手');
      expect(result).toContain('回答');
    });

    it('应转换纯消息数组', () => {
      const json = JSON.stringify([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ]);
      const result = convertChat(json);
      expect(result).toContain('用户');
      expect(result).toContain('Hi');
      expect(result).toContain('助手');
      expect(result).toContain('Hello!');
    });

    it('应对无法识别的格式抛出错误', () => {
      const json = '{"unknown": "data"}';
      expect(() => convertChat(json)).toThrow();
    });
  });

  describe('convert - 代码语言检测', () => {
    it('应检测 Python 代码并标注语言', () => {
      const json = '{"code": "def hello():\\n    print(\\"world\\")"}';
      const result = convert(json);
      expect(result).toContain('```python');
    });

    it('应检测 C# 代码并标注语言', () => {
      const json = '{"code": "using System;\\npublic class Program { }"}';
      const result = convert(json);
      expect(result).toContain('```csharp');
    });

    it('应检测 SQL 代码并标注语言', () => {
      const json = '{"query": "SELECT * FROM users WHERE id = 1"}';
      const result = convert(json);
      expect(result).toContain('```sql');
    });

    it('应保留已有的 Markdown 格式', () => {
      const json = '{"content": "# 标题\\n\\n- 列表项1\\n- 列表项2"}';
      const result = convert(json);
      expect(result).toContain('# 标题');
      expect(result).toContain('- 列表项1');
      expect(result).not.toContain('```');
    });
  });

  describe('convert - 表格增强', () => {
    it('应转换部分键一致的数组为表格', () => {
      const json = JSON.stringify({
        items: [
          { name: 'A', value: 1 },
          { name: 'B', value: 2, extra: 'x' },
        ],
      });
      const result = convert(json);
      expect(result).toContain('| name |');
      expect(result).toContain('| value |');
    });

    it('应在表格中渲染嵌套对象', () => {
      const json = JSON.stringify({
        items: [
          { name: 'A', meta: { version: 1 } },
          { name: 'B', meta: { version: 2 } },
        ],
      });
      const result = convert(json);
      expect(result).toContain('| name |');
      expect(result).toContain('| meta |');
    });
  });

  describe('ConverterOptions', () => {
    it('应支持自定义缩进', () => {
      const json = '{"items": ["a", "b"]}';
      const result4 = convert(json, { indent: 4 });
      const result2 = convert(json, { indent: 2 });
      expect(result4).not.toBe(result2);
    });
  });
});
