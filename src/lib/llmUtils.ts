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
 * 清理 JSON 字符串中的控制字符
 */
function cleanJsonString(text: string): string {
  // 移除控制字符（除了 \n, \r, \t）
  let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 处理 JSON 字符串中未转义的换行符
  // 在 JSON 字符串值内，换行符应该是 \n 而不是实际换行
  try {
    // 尝试直接解析
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    // 如果失败，尝试修复常见问题
  }

  // 尝试提取 JSON 对象
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  return cleaned;
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
 * 解析 LLM 返回的 JSON（增强版，处理各种异常情况）
 */
export function parseLlmJson<T = Record<string, unknown>>(text: string): T | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  try {
    // 1. 提取 JSON 内容
    const extracted = extractJsonFromText(text);

    // 2. 清理控制字符
    const cleaned = cleanJsonString(extracted);

    // 3. 尝试解析
    return JSON.parse(cleaned) as T;
  } catch (e) {
    console.error('[JobGod] parseLlmJson - failed:', e);
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
