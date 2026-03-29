/**
 * LLM 工具模块 - 统一处理 LLM 调用和 JSON 解析
 */

import type { LlmConfig } from '../types/analysis';

/**
 * 格式化 LLM API URL
 */
export function formatLlmUrl(baseUrl: string): string {
  let url = baseUrl.replace(/\/$/, '');
  if (!url.includes('/v') && !url.includes('openai.com')) {
    if (url.includes('bigmodel.cn')) {
      url = url + '/api/paas/v4';
    } else {
      url = url + '/v1';
    }
  }
  return url;
}

/**
 * 调用 LLM API
 */
export async function callLlm(
  llm: LlmConfig,
  system: string,
  user: string,
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const { maxTokens = 900, temperature = 0.3 } = options;
  const url = `${formatLlmUrl(llm.baseUrl)}/chat/completions`;

  const body = {
    model: llm.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM_HTTP_${res.status}:${t.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? '';
}

/**
 * 从 LLM 响应中提取 JSON
 */
function extractJsonFromText(text: string): string {
  const trimmed = text.trim();

  // 1. 尝试提取 ```json ... ``` 或 ``` ... ``` 代码块
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }

  // 2. 尝试提取 { ... } 对象
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0];
  }

  // 3. 尝试提取 [ ... ] 数组
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return arrayMatch[0];
  }

  return trimmed;
}

/**
 * 清理并修复 JSON 字符串
 * 处理 LLM 返回的各种异常情况
 */
function repairJson(text: string): string {
  let cleaned = text;

  // 1. 移除不可见控制字符
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 2. 尝试直接解析
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    // 继续修复
  }

  // 3. 深度修复：逐字符处理，修复字符串值内部的问题
  cleaned = deepRepairJson(cleaned);

  return cleaned;
}

/**
 * 深度修复 JSON：处理字符串值内部的各种问题
 *
 * 主要处理：
 * 1. 字符串值内的未转义换行符
 * 2. 字符串值内的中文引号
 * 3. 字符串值内的其他特殊字符
 */
function deepRepairJson(json: string): string {
  let result = '';
  let i = 0;

  while (i < json.length) {
    const char = json[i];

    // 处理字符串值
    if (char === '"') {
      result += char;
      i++;

      // 收集整个字符串内容
      let stringContent = '';
      let escaped = false;

      while (i < json.length) {
        const c = json[i];

        if (escaped) {
          stringContent += c;
          escaped = false;
          i++;
          continue;
        }

        if (c === '\\') {
          stringContent += c;
          escaped = true;
          i++;
          continue;
        }

        // 遇到结束引号
        if (c === '"') {
          result += repairStringValue(stringContent);
          result += c;
          i++;
          break;
        }

        stringContent += c;
        i++;
      }
      continue;
    }

    // 非字符串内容直接保留
    result += char;
    i++;
  }

  return result;
}

/**
 * 修复 JSON 字符串值内部的问题
 */
function repairStringValue(content: string): string {
  let result = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const code = content.charCodeAt(i);

    // 处理未转义的换行符
    if (char === '\n') {
      result += '\\n';
      continue;
    }
    if (char === '\r') {
      result += '\\r';
      continue;
    }
    if (char === '\t') {
      result += '\\t';
      continue;
    }

    // 处理中文引号：替换为安全的中文括号
    // 中文双引号: "" (U+201C, U+201D)
    if (code === 0x201c) {
      result += '「';
      continue;
    }
    if (code === 0x201d) {
      result += '」';
      continue;
    }
    // 中文单引号: '' (U+2018, U+2019)
    if (code === 0x2018) {
      result += '『';
      continue;
    }
    if (code === 0x2019) {
      result += '』';
      continue;
    }

    // 处理其他可能有问题的全角字符
    // 全角引号「」『』【】（这些是安全的，保留）
    // 但要处理可能被误认为引号的字符

    // 确保反斜杠后面跟着有效的转义字符
    if (char === '\\' && i + 1 < content.length) {
      const nextChar = content[i + 1];
      // 有效的转义序列
      if (['n', 'r', 't', '\\', '"', '/', 'u', 'b', 'f'].includes(nextChar)) {
        result += char;
        continue;
      }
      // 无效的转义，双写反斜杠
      result += '\\\\';
      continue;
    }

    result += char;
  }

  return result;
}

/**
 * 解析 LLM 返回的 JSON（增强版，处理各种异常情况）
 */
export function parseLlmJson<T = Record<string, unknown>>(text: string): T | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  try {
    // 1. 提取 JSON 内容
    const extracted = extractJsonFromText(text);

    // 2. 修复并解析
    const repaired = repairJson(extracted);

    // 3. 尝试解析
    return JSON.parse(repaired) as T;
  } catch (e) {
    console.error('[JobGod] parseLlmJson - failed:', e);

    // 打印更详细的调试信息
    const extracted = extractJsonFromText(text);
    console.error('[JobGod] parseLlmJson - extracted length:', extracted.length);

    // 找到错误位置附近的内容
    const errorMsg = String(e);
    const posMatch = errorMsg.match(/position\s+(\d+)/i);
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const start = Math.max(0, pos - 50);
      const end = Math.min(extracted.length, pos + 50);
      console.error(`[JobGod] parseLlmJson - context around error (pos ${pos}):`, extracted.slice(start, end));
      console.error(`[JobGod] parseLlmJson - character at position: "${extracted[pos]}" (code: ${extracted.charCodeAt(pos)})`);
    }

    console.error('[JobGod] parseLlmJson - original text (first 500 chars):', text.slice(0, 500));
    return null;
  }
}

/**
 * 安全解析 LLM 返回的 JSON，失败时返回默认值
 */
export function parseLlmJsonSafe<T>(text: string, defaultValue: T): T {
  const result = parseLlmJson<T>(text);
  return result !== null ? result : defaultValue;
}

/**
 * 带重试的 LLM JSON 调用
 */
export async function callLlmForJson<T>(
  llm: LlmConfig,
  system: string,
  user: string,
  options: { maxTokens?: number; temperature?: number; retries?: number } = {}
): Promise<T | null> {
  const { retries = 1, ...callOptions } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const text = await callLlm(llm, system, user, callOptions);
      const result = parseLlmJson<T>(text);
      if (result !== null) {
        return result;
      }

      // JSON 解析失败，如果还有重试机会，继续
      if (attempt < retries) {
        console.log(`[JobGod] callLlmForJson - attempt ${attempt + 1} failed, retrying...`);
      }
    } catch (e) {
      console.error(`[JobGod] callLlmForJson - attempt ${attempt + 1} error:`, e);
      if (attempt >= retries) {
        throw e;
      }
    }
  }

  return null;
}
