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
            .replace(/\r/g, '')
            .replace(/\\(?![u"]) /g, '\\\\')
            .replace(/([^\\])"/g, '$1\\"');
    }
    processContent(content) {
        if (!content)
            return '';
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
                throw new Error(`Invalid JSON: ${error.message}`);
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
                throw new Error(`Invalid JSON: ${error.message}`);
            }
        }
        if (!data.messages || !Array.isArray(data.messages)) {
            throw new Error('Invalid chat format: missing or invalid messages array');
        }
        return this.convertChatToMarkdown(data.messages, options);
    }
    convertChatToMarkdown(messages, options) {
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
    convertWithTemplate(data) {
        let templateContent;
        try {
            templateContent = fs.readFileSync(this.template, 'utf-8');
        }
        catch (error) {
            throw new Error(`Failed to read template file: ${error.message}`);
        }
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
        return `"${value}"`;
    }
    isJsonString(value) {
        try {
            JSON.parse(value);
            return true;
        }
        catch {
            return false;
        }
    }
    isCodeString(value) {
        const codePatterns = [
            /^(function|const|let|var|class|import|export)/,
            /^\s*\{.*\}\s*$/,
            /^\s*\[.*\]\s*$/
        ];
        return codePatterns.some(pattern => pattern.test(value.trim()));
    }
    convertArray(arr, depth) {
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
            }
            else {
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
        const keys = Object.keys(arr[0]);
        return arr.every(item => {
            const itemKeys = Object.keys(item);
            return itemKeys.length === keys.length && keys.every(key => itemKeys.includes(key));
        });
    }
    convertToTable(arr) {
        if (arr.length === 0)
            return '[]';
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
exports.JsonToMarkdownConverter = JsonToMarkdownConverter;
function convert(jsonString, options = {}) {
    const converter = new JsonToMarkdownConverter(options);
    return converter.convert(jsonString);
}
function convertChat(jsonString, options = {}) {
    const converter = new JsonToMarkdownConverter();
    return converter.convertChat(jsonString, options);
}
