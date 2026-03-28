/**
 * 公司搜索模块
 * 通过 LLM 获取公司信息，用于补充职位详情页中缺失的公司介绍
 */

import type { LlmConfig } from '../types/analysis';

export interface CompanySearchResult {
  companyName: string;
  description: string;      // 公司简介
  mainBusiness: string[];   // 主营业务关键词
  industry: string;         // 所属行业
  scale?: string;           // 公司规模
  funding?: string;         // 融资情况
  confidence: number;       // 置信度 (0-1)
}

// 内存缓存
const companyInfoCache = new Map<string, { info: CompanySearchResult; ts: number }>();
const CACHE_TTL = 3600000; // 1小时缓存

/**
 * 使用 LLM 获取公司信息
 */
export async function searchCompanyInfo(companyName: string, llm: LlmConfig): Promise<CompanySearchResult | null> {
  if (!companyName || companyName.length < 2) {
    return null;
  }

  // 1. 检查缓存
  const cached = companyInfoCache.get(companyName);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log('[JobGod] searchCompanyInfo - cache hit for:', companyName);
    return cached.info;
  }

  console.log('[JobGod] searchCompanyInfo - searching for:', companyName);

  try {
    // 2. 使用 LLM 查询公司信息
    const result = await queryCompanyInfoFromLLM(companyName, llm);

    if (!result || result.confidence < 0.5) {
      console.log('[JobGod] searchCompanyInfo - low confidence or not found');
      return null;
    }

    // 3. 缓存并返回
    companyInfoCache.set(companyName, { info: result, ts: Date.now() });
    console.log('[JobGod] searchCompanyInfo - found:', result.description.slice(0, 100));
    return result;
  } catch (e) {
    console.error('[JobGod] searchCompanyInfo - error:', e);
    return null;
  }
}

/**
 * 通过 LLM 查询公司信息
 */
async function queryCompanyInfoFromLLM(companyName: string, llm: LlmConfig): Promise<CompanySearchResult | null> {
  // 保存参数值，避免压缩器 catch 块变量遮蔽
  const companyNameFallback = companyName;

  const systemPrompt = `你是一个企业信息查询助手。请根据公司名称，提供该公司的基本信息。

如果你确定知道这家公司，请输出一个 JSON 对象：
{
  "companyName": "公司全称",
  "description": "公司简介（50-100字）",
  "mainBusiness": ["主营业务1", "主营业务2"],
  "industry": "所属行业",
  "scale": "公司规模（如已知）",
  "funding": "融资情况（如已知）",
  "confidence": 0.9
}

如果你不确定或不了解这家公司，请输出：
{
  "companyName": "${companyNameFallback}",
  "confidence": 0.3
}

注意：
- confidence 表示你对该信息的确定程度（0-1）
- 如果有多家同名公司，请选择最知名或最可能的一家，并说明
- 不要编造信息，不确定的内容可以留空`;

  const userPrompt = `请查询"${companyNameFallback}"这家公司的信息：`;

  let parsed: Record<string, unknown> | null = null;
  let llmSuccess = false;

  try {
    const response = await callLlm(llm, systemPrompt, userPrompt, 500);
    parsed = parseJsonObject(response);
    llmSuccess = true;
  } catch (err) {
    console.error('[JobGod] queryCompanyInfoFromLLM - error:', err);
    llmSuccess = false;
  }

  if (!llmSuccess || !parsed) {
    return null;
  }

  const confidence = Number(parsed.confidence) || 0;

  return {
    companyName: String(parsed.companyName || companyNameFallback),
    description: String(parsed.description || ''),
    mainBusiness: Array.isArray(parsed.mainBusiness) ? parsed.mainBusiness.map(String) : [],
    industry: String(parsed.industry || ''),
    scale: parsed.scale ? String(parsed.scale) : undefined,
    funding: parsed.funding ? String(parsed.funding) : undefined,
    confidence,
  };
}

/**
 * 调用 LLM API
 */
async function callLlm(llm: LlmConfig, system: string, user: string, maxTokens = 500): Promise<string> {
  let baseUrl = llm.baseUrl.replace(/\/$/, '');
  if (!baseUrl.includes('/v') && !baseUrl.includes('openai.com')) {
    if (baseUrl.includes('bigmodel.cn')) {
      baseUrl = baseUrl + '/api/paas/v4';
    } else {
      baseUrl = baseUrl + '/v1';
    }
  }

  const url = `${baseUrl}/chat/completions`;
  const body = {
    model: llm.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.1, // 低温度，更确定性的回答
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
 * 解析 JSON 响应
 */
function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const block = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = block ? block[1]!.trim() : trimmed;
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * 清除公司搜索缓存
 */
export function clearCompanySearchCache(): void {
  companyInfoCache.clear();
  console.log('[JobGod] Company search cache cleared');
}
