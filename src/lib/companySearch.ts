/**
 * 公司搜索模块
 * 通过 LLM 获取公司信息，用于补充职位详情页中缺失的公司介绍
 */

import type { LlmConfig } from '../types/analysis';
import { callLlmForJson } from './llmUtils';

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

interface CompanyInfoResponse {
  companyName?: string;
  description?: string;
  mainBusiness?: string[];
  industry?: string;
  scale?: string;
  funding?: string;
  confidence?: number;
}

/**
 * 通过 LLM 查询公司信息
 */
async function queryCompanyInfoFromLLM(companyName: string, llm: LlmConfig): Promise<CompanySearchResult | null> {
  const systemPrompt = `你是一个企业信息查询助手。请根据公司名称，提供该公司的基本信息。

如果你知道这家公司，请输出一个 JSON 对象：
{
  "companyName": "公司全称",
  "description": "公司简介（50-100字）",
  "mainBusiness": ["主营业务1", "主营业务2"],
  "industry": "所属行业",
  "confidence": 0.9
}

如果你不确定或不了解这家公司，请输出：
{
  "companyName": "${companyName}",
  "confidence": 0.3
}

注意：
- confidence 表示你对该信息的确定程度（0-1）
- 不要编造信息，不确定的内容可以留空
- 只输出 JSON 对象，不要有其他文字`;

  const userPrompt = `请查询"${companyName}"这家公司的信息：`;

  const result = await callLlmForJson<CompanyInfoResponse>(llm, systemPrompt, userPrompt, {
    maxTokens: 500,
    temperature: 0.1,
    retries: 1,
  });

  if (!result) {
    return null;
  }

  const confidence = Number(result.confidence) || 0;

  return {
    companyName: String(result.companyName || companyName),
    description: String(result.description || ''),
    mainBusiness: Array.isArray(result.mainBusiness) ? result.mainBusiness.map(String) : [],
    industry: String(result.industry || ''),
    scale: result.scale ? String(result.scale) : undefined,
    funding: result.funding ? String(result.funding) : undefined,
    confidence,
  };
}

/**
 * 清除公司搜索缓存
 */
export function clearCompanySearchCache(): void {
  companyInfoCache.clear();
  console.log('[JobGod] Company search cache cleared');
}
