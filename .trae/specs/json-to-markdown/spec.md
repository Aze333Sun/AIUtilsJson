# JSON转Markdown工具 - 产品需求文档

## Overview

* **Summary**: 开发一个将JSON数据转换为结构化Markdown格式的工具，同时支持命令行界面和简约的图形用户界面（GUI），支持文件拖拽识别。

* **Purpose**: 解决JSON数据难以阅读和分享的问题，将复杂的JSON结构转换为人类可读的Markdown格式，便于文档编写、API文档生成和数据展示。

* **Target Users**: 开发者、技术文档编写者、数据分析师

## Goals

* 支持将任意JSON数据转换为结构化Markdown格式

* 支持命令行界面操作

* 支持简约图形用户界面（GUI）操作

* 支持文件拖拽识别

* 支持从文件读取和输出到文件

* 支持格式化选项（缩进、排序等）

## Non-Goals (Out of Scope)

* 不支持Markdown转JSON

* 不支持复杂的模板自定义

## Background & Context

* JSON是开发者常用的数据交换格式，但阅读体验不佳

* Markdown是广泛使用的文档格式，便于阅读和分享

* 需要一个轻量级工具快速完成转换

## Functional Requirements

* **FR-1**: 支持从命令行参数接收JSON字符串

* **FR-2**: 支持从文件读取JSON内容

* **FR-3**: 支持将转换结果输出到控制台

* **FR-4**: 支持将转换结果保存到文件

* **FR-5**: 支持自定义缩进级别

* **FR-6**: 支持对JSON键进行排序

## Non-Functional Requirements

* **NFR-1**: 支持嵌套JSON结构（至少支持5层嵌套）

* **NFR-2**: 转换性能：10KB JSON在1秒内完成转换

* **NFR-3**: 错误处理：对无效JSON提供清晰的错误提示

## Constraints

* **Technical**: 使用Node.js开发，TypeScript语言

* **Dependencies**: 使用commander.js作为CLI框架

## Assumptions

* 用户已安装Node.js环境（>=18.0.0）

* 用户熟悉基本的命令行操作

## Acceptance Criteria

### AC-1: 命令行参数接收JSON字符串

* **Given**: 用户在命令行输入json2md命令并附带--json参数

* **When**: 用户执行 `json2md --json '{"name":"test"}'`

* **Then**: 控制台输出格式化的Markdown内容

* **Verification**: `programmatic`

### AC-2: 从文件读取JSON

* **Given**: 用户有一个包含有效JSON的文件

* **When**: 用户执行 `json2md --input data.json`

* **Then**: 控制台输出转换后的Markdown内容

* **Verification**: `programmatic`

### AC-3: 输出到文件

* **Given**: 用户执行转换命令并指定输出文件

* **When**: 用户执行 `json2md --input data.json --output result.md`

* **Then**: 转换结果保存到result.md文件

* **Verification**: `programmatic`

### AC-4: 自定义缩进

* **Given**: 用户指定缩进选项

* **When**: 用户执行 `json2md --json '{"a":1}' --indent 4`

* **Then**: Markdown输出使用4空格缩进

* **Verification**: `programmatic`

### AC-5: 键排序

* **Given**: 用户启用排序选项

* **When**: 用户执行 `json2md --json '{"b":1,"a":2}' --sort`

* **Then**: Markdown输出中的键按字母顺序排列

* **Verification**: `programmatic`

### AC-6: 无效JSON处理

* **Given**: 用户提供无效的JSON内容

* **When**: 用户执行 `json2md --json 'invalid'`

* **Then**: 控制台显示清晰的错误提示信息

* **Verification**: `programmatic`

### AC-7: 嵌套结构支持

* **Given**: JSON包含5层嵌套结构

* **When**: 执行转换命令

* **Then**: 正确转换所有层级，Markdown格式清晰可读

* **Verification**: `human-judgment`

### AC-8: GUI启动

* **Given**: 用户运行GUI启动命令

* **When**: 用户执行 `json2md --gui`

* **Then**: GUI窗口在2秒内启动并显示

* **Verification**: `programmatic`

### AC-9: 文件拖拽识别

* **Given**: GUI窗口已打开

* **When**: 用户将JSON文件拖拽到窗口中

* **Then**: 文件内容自动加载并显示在输入区域

* **Verification**: `human-judgment`

### AC-10: GUI实时预览

* **Given**: GUI窗口已打开，输入区域有JSON内容

* **When**: 用户输入或修改JSON内容

* **Then**: 输出区域实时显示转换后的Markdown

* **Verification**: `human-judgment`

### AC-11: GUI一键复制

* **Given**: GUI窗口已打开，输出区域有Markdown内容

* **When**: 用户点击复制按钮

* **Then**: 转换结果复制到剪贴板，显示成功提示

* **Verification**: `human-judgment`

### AC-12: GUI导出Markdown文件

* **Given**: GUI窗口已打开，输出区域有Markdown内容

* **When**: 用户点击导出按钮并选择保存路径

* **Then**: 转换结果保存为.md文件，显示成功提示

* **Verification**: `human-judgment`

### AC-13: 表格格式转换

* **Given**: JSON包含数组，且数组元素为结构一致的对象

* **When**: 执行转换命令

* **Then**: 转换结果使用Markdown表格格式展示

* **Verification**: `programmatic`

### AC-14: 代码块格式转换

* **Given**: JSON值包含JSON字符串或代码内容

* **When**: 执行转换命令

* **Then**: 转换结果使用Markdown代码块格式展示

* **Verification**: `programmatic`

### AC-15: 标题格式转换

* **Given**: JSON包含多层嵌套对象

* **When**: 执行转换命令

* **Then**: 不同嵌套层级使用不同级别的Markdown标题

* **Verification**: `human-judgment`

### AC-16: 列表格式转换

* **Given**: JSON包含数组

* **When**: 执行转换命令

* **Then**: 数组内容使用Markdown无序列表格式展示

* **Verification**: `programmatic`

### AC-17: 自定义模板文件支持

* **Given**: 用户提供自定义模板文件

* **When**: 用户执行 `json2md --input data.json --template custom.hbs`

* **Then**: 转换结果按照自定义模板生成Markdown

* **Verification**: `programmatic`

### AC-18: 模板变量替换

* **Given**: 模板中包含{{variable}}语法

* **When**: 执行转换命令

* **Then**: 变量被JSON中对应的值替换

* **Verification**: `programmatic`

### AC-19: 模板条件判断

* **Given**: 模板中包含{{#if}}{{/if}}语法

* **When**: 执行转换命令

* **Then**: 根据JSON数据条件决定是否渲染内容

* **Verification**: `programmatic`

### AC-20: 模板循环遍历

* **Given**: 模板中包含{{#each}}{{/each}}语法

* **When**: 执行转换命令

* **Then**: 遍历JSON数组并渲染每个元素

* **Verification**: `programmatic`

### AC-21: 默认模板使用

* **Given**: 用户未指定自定义模板

* **When**: 执行转换命令

* **Then**: 使用默认模板生成Markdown

* **Verification**: `programmatic`

## Open Questions

* [ ] 是否需要支持YAML格式的输入/输出？

