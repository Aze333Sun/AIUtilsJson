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
exports.JsonToMarkdownConverter = void 0;
exports.convert = convert;
exports.convertChat = convertChat;
const handlebars = __importStar(require("handlebars"));
const fs = __importStar(require("fs"));
class JsonToMarkdownConverter {
    constructor(options = {}) {
        this.indent = options.indent || 2;
        this.sort = options.sort || false;
        this.template = options.template;
    }
    sanitizeJson(input) {
        return input
            .replace(/^\uFEFF/, '')
            .replace(/\r/g, '')
            .replace(/\\(?![\\/"bfnrtu])/g, '\\\\');
    }
    processContent(content) {
        if (!content)
            return '';
        let result = content
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'");
        const hasCodeFence = result.startsWith('```') || result.endsWith('```') || result.includes('\n```') || result.includes('```\n');
        const hasCodeBlock = /```[\s\S]*```/.test(result);
        const hasTable = /\|.+\|/.test(result) && /\|[\s\-:]+\|/m.test(result);
        if (hasCodeFence || hasCodeBlock || hasTable) {
            return result;
        }
        const lines = result.split('\n');
        const hasLongLine = lines.some(line => line.length > 80);
        if (hasLongLine || lines.length > 5) {
            return `\`\`\`\n${result}\n\`\`\``;
        }
        return result;
    }
    convert(jsonString) {
        let data;
        try {
            data = JSON.parse(jsonString);
        }
        catch (error) {
            try {
                const sanitized = this.sanitizeJson(jsonString);
                data = JSON.parse(sanitized);
            }
            catch (sanitizeError) {
                throw new Error(`无效的JSON: ${sanitizeError.message}`);
            }
        }
        if (this.template) {
            return this.convertWithTemplate(data);
        }
        return this.convertToMarkdown(data, 0);
    }
    convertChat(jsonString, options = {}) {
        let data;
        try {
            data = JSON.parse(jsonString);
        }
        catch (error) {
            try {
                const sanitized = this.sanitizeJson(jsonString);
                data = JSON.parse(sanitized);
            }
            catch (sanitizeError) {
                throw new Error(`无效的JSON: ${sanitizeError.message}`);
            }
        }
        const messages = this.detectAndNormalizeChat(data);
        return this.renderChatToMarkdown(messages, options);
    }
    detectAndNormalizeChat(data) {
        if (Array.isArray(data)) {
            if (data.length > 0 && data[0].mapping) {
                return this.normalizeChatGPTHistory(data);
            }
            return data.map((m) => this.normalizeMessage(m));
        }
        if (data.mapping) {
            const convs = this.normalizeChatGPTMapping(data);
            return convs;
        }
        if (data.messages && Array.isArray(data.messages)) {
            return data.messages.map((m) => this.normalizeMessage(m));
        }
        if (data.contents && Array.isArray(data.contents)) {
            return data.contents.map((m) => this.normalizeGeminiContent(m));
        }
        if (data.conversations && Array.isArray(data.conversations)) {
            const result = [];
            data.conversations.forEach((conv, i) => {
                const title = conv.title || conv.name || `对话 ${i + 1}`;
                if (data.conversations.length > 1) {
                    result.push({ role: 'system', content: `---\n# ${title}\n---` });
                }
                const msgs = conv.messages || conv.chats || conv.conversation || [];
                if (Array.isArray(msgs)) {
                    result.push(...msgs.map((m) => this.normalizeMessage(m)));
                }
            });
            return result;
        }
        throw new Error('无法识别的聊天格式，支持: messages[], contents[], conversations[], mapping 或消息数组');
    }
    normalizeChatGPTHistory(history) {
        const result = [];
        history.forEach((conv, idx) => {
            const title = conv.title || `对话 ${idx + 1}`;
            if (history.length > 1) {
                result.push({ role: 'system', content: `---\n# ${title}\n---` });
            }
            const msgs = this.buildMessagesFromMapping(conv.mapping, title);
            result.push(...msgs);
        });
        return result;
    }
    normalizeChatGPTMapping(data) {
        const title = data.title || '对话记录';
        return this.buildMessagesFromMapping(data.mapping, title);
    }
    buildMessagesFromMapping(mapping, title) {
        const messages = [];
        const nodeMap = mapping;
        const nodeIds = Object.keys(nodeMap);
        const childrenMap = {};
        const parentMap = {};
        let rootId = null;
        nodeIds.forEach((id) => {
            const node = nodeMap[id];
            const parent = node.parent || null;
            parentMap[id] = parent;
            if (!parent) {
                rootId = id;
            }
            else {
                if (!childrenMap[parent])
                    childrenMap[parent] = [];
                childrenMap[parent].push(id);
            }
        });
        if (!rootId && nodeIds.length > 0) {
            let candidate = nodeIds[0];
            for (let i = 0; i < nodeIds.length; i++) {
                const p = parentMap[candidate];
                if (!p)
                    break;
                candidate = p;
            }
            rootId = candidate;
        }
        if (!rootId)
            return messages;
        const orderedIds = [];
        const walk = (id) => {
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
            if (!msg)
                return;
            if (msg.author && msg.author.role === 'user') {
                msg.role = 'user';
            }
            else if (msg.author && msg.author.role === 'assistant') {
                msg.role = 'assistant';
            }
            else if (msg.author && msg.author.role === 'system') {
                msg.role = 'system';
            }
            else if (msg.author && msg.author.role === 'tool') {
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
    normalizeMessage(msg) {
        const role = msg.role || 'unknown';
        let content = '';
        if (typeof msg.content === 'string') {
            content = msg.content;
        }
        else if (msg.content && typeof msg.content === 'object') {
            const parts = msg.content.parts;
            if (Array.isArray(parts)) {
                content = parts.filter((p) => typeof p === 'string').join('\n');
            }
            else if (msg.content.content_type === 'text' && typeof msg.content.text === 'string') {
                content = msg.content.text;
            }
            else {
                content = JSON.stringify(msg.content, null, 2);
            }
        }
        else if (Array.isArray(msg.content)) {
            content = msg.content
                .filter((p) => p.type === 'text')
                .map((p) => p.text || '')
                .join('\n');
            const imageParts = msg.content.filter((p) => p.type === 'image_url' || p.type === 'image');
            if (imageParts.length > 0) {
                content += '\n\n_[图片内容]_';
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
        };
    }
    formatTimestamp(ts) {
        if (!ts)
            return undefined;
        if (typeof ts === 'number') {
            try {
                const d = new Date(ts * 1000);
                return d.toISOString().replace('T', ' ').replace(/\.\d+Z/, '');
            }
            catch {
                return String(ts);
            }
        }
        if (typeof ts === 'string') {
            return ts.replace('T', ' ').replace(/\.\d+Z/, '').replace(/\.\d+/, '');
        }
        return String(ts);
    }
    normalizeGeminiContent(content) {
        const role = content.role === 'model' ? 'assistant' : content.role || 'user';
        let text = '';
        if (content.parts && Array.isArray(content.parts)) {
            text = content.parts
                .filter((p) => p.text !== undefined)
                .map((p) => p.text)
                .join('\n');
            const hasInlineData = content.parts.some((p) => p.inline_data);
            if (hasInlineData) {
                text += '\n\n_[附件内容]_';
            }
        }
        return { role, content: text };
    }
    renderChatToMarkdown(messages, options) {
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
                result += '**推理过程:**\n\n';
                const processed = this.processContent(msg.reasoning_content);
                result += `${processed}\n\n`;
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
                    }
                    catch {
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
    getRoleLabel(role) {
        switch (role) {
            case 'user': return '用户';
            case 'assistant': return '助手';
            case 'system': return '系统';
            case 'tool': return '工具';
            case 'model': return '模型';
            default: return role.charAt(0).toUpperCase() + role.slice(1);
        }
    }
    convertWithTemplate(data) {
        let templateContent;
        try {
            templateContent = fs.readFileSync(this.template, 'utf-8');
        }
        catch (error) {
            throw new Error(`读取模板文件失败: ${error.message}`);
        }
        handlebars.registerHelper('isArray', function (value) {
            return Array.isArray(value);
        });
        handlebars.registerHelper('isObject', function (value) {
            return typeof value === 'object' && value !== null && !Array.isArray(value);
        });
        handlebars.registerHelper('add', function (a, b) {
            return a + b;
        });
        const template = handlebars.compile(templateContent);
        return template(data);
    }
    convertToMarkdown(value, depth) {
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
    convertString(value, depth) {
        if (this.isJsonString(value) || this.isCodeString(value)) {
            return `\n${' '.repeat(this.indent * depth)}\`\`\`json\n${value}\n${' '.repeat(this.indent * depth)}\`\`\``;
        }
        return value;
    }
    isJsonString(value) {
        try {
            const parsed = JSON.parse(value);
            return typeof parsed === 'object' && parsed !== null;
        }
        catch {
            return false;
        }
    }
    isCodeString(value) {
        const trimmed = value.trim();
        const codePatterns = [
            /^(function|const|let|var|class|import|export)\s/,
            /^[a-zA-Z_$][\w$]*\s*\(.*\)\s*\{/,
        ];
        return codePatterns.some(pattern => pattern.test(trimmed));
    }
    convertArray(arr, depth) {
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
            }
            else {
                const itemStr = this.convertToMarkdown(item, depth + 1);
                result += `${indentStr}- ${itemStr}\n`;
            }
        });
        return result;
    }
    isTableData(arr) {
        if (arr.length === 0)
            return false;
        if (!arr.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
            return false;
        }
        const allKeys = new Set();
        arr.forEach(item => Object.keys(item).forEach(k => allKeys.add(k)));
        return arr.every(item => {
            const itemKeys = Object.keys(item);
            return allKeys.size === itemKeys.length && [...allKeys].every(key => itemKeys.includes(key));
        });
    }
    convertToTable(arr) {
        if (arr.length === 0)
            return '[]';
        const allKeys = new Set();
        arr.forEach(item => Object.keys(item).forEach(k => allKeys.add(k)));
        const keys = [...allKeys];
        const header = `| ${keys.join(' | ')} |`;
        const separator = `| ${keys.map(() => '---').join(' | ')} |`;
        const rows = arr.map(item => {
            const values = keys.map(key => {
                const value = item[key];
                if (value === null || value === undefined)
                    return '';
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
    convertObject(obj, depth) {
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
            }
            else {
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
exports.JsonToMarkdownConverter = JsonToMarkdownConverter;
function convert(jsonString, options = {}) {
    const converter = new JsonToMarkdownConverter(options);
    return converter.convert(jsonString);
}
function convertChat(jsonString, options = {}) {
    const converter = new JsonToMarkdownConverter();
    return converter.convertChat(jsonString, options);
}
