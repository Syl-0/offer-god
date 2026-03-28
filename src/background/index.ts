/**
 * Background Service Worker
 * 处理消息通信、缓存管理、LLM 调用等核心逻辑
 */

import { djb2Hash } from '../lib/hash';
import { computeBaziSummary, formatBaziSummaryForLlm } from '../lib/baziProfile';
import {
  combineWeighted,
  computeMetaphysicsInitial,
  computeScienceScore,
  shortMetaphysicsHint,
  shortScienceHint,
  generateMatchAnalysis,
} from '../lib/matchScore';
import { buildDeepSystemPrompt, buildDeepUserPrompt, fallbackDeepAdvice } from '../lib/deepConsultPrompt';
import { buildRulesInsights, buildInsightsInputHash } from '../lib/userInsights';
import { callLlmForMatchAnalysis } from '../lib/llmMatchAnalysis';
import { searchCompanyInfo, clearCompanySearchCache, type CompanySearchResult } from '../lib/companySearch';
import { callLlm, callLlmForJson, parseLlmJson } from '../lib/llmUtils';
import type {
  DeepAdviceResult,
  JobContext,
  LlmConfig,
  MatchScoreResult,
  UserInsights,
  UserProfile,
  MatchAnalysisResult,
} from '../types/analysis';

// ==================== 常量定义 ====================

const MATCH_CACHE_PREFIX = 'jg_match_v3:';
const ANALYSIS_CACHE_PREFIX = 'jg_analysis_v1:';
const ADVICE_CACHE_PREFIX = 'jg_advice_v1:';
const PERSISTENT_CACHE_KEY = 'jg_persistent_cache_v1';
const MAX_CACHE = 100;
const MAX_PERSISTENT_CACHE = 200;

// ==================== 类型定义 ====================

type MatchCacheEntry = { result: MatchScoreResult; ts: number };
type AnalysisCacheEntry = { result: MatchAnalysisResult; ts: number };
type AdviceCacheEntry = { result: DeepAdviceResult; ts: number };

interface PersistentCacheEntry {
  key: string;
  companyName: string;
  jobTitle: string;
  combinedPercent: number;
  scienceScore: number;
  metaphysicsScore: number;
  analysis: MatchAnalysisResult | null;
  advice: DeepAdviceResult | null;
  ts: number;
}

interface PersistentCache {
  entries: PersistentCacheEntry[];
  order: string[];
}

// ==================== 内存缓存 ====================

const matchOrder: string[] = [];
const matchCache = new Map<string, MatchCacheEntry>();
const analysisOrder: string[] = [];
const analysisCache = new Map<string, AnalysisCacheEntry>();
const adviceOrder: string[] = [];
const adviceCache = new Map<string, AdviceCacheEntry>();

function touchMatchCache(key: string, entry: MatchCacheEntry): void {
  matchCache.set(key, entry);
  const i = matchOrder.indexOf(key);
  if (i >= 0) matchOrder.splice(i, 1);
  matchOrder.push(key);
  while (matchOrder.length > MAX_CACHE) {
    const k = matchOrder.shift();
    if (k) matchCache.delete(k);
  }
}

function touchAnalysisCache(key: string, entry: AnalysisCacheEntry): void {
  analysisCache.set(key, entry);
  const i = analysisOrder.indexOf(key);
  if (i >= 0) analysisOrder.splice(i, 1);
  analysisOrder.push(key);
  while (analysisOrder.length > MAX_CACHE) {
    const k = analysisOrder.shift();
    if (k) analysisCache.delete(k);
  }
}

function touchAdviceCache(key: string, entry: AdviceCacheEntry): void {
  adviceCache.set(key, entry);
  const i = adviceOrder.indexOf(key);
  if (i >= 0) adviceOrder.splice(i, 1);
  adviceOrder.push(key);
  while (adviceOrder.length > MAX_CACHE) {
    const k = adviceOrder.shift();
    if (k) adviceCache.delete(k);
  }
}

export function clearAllCaches(): void {
  matchCache.clear();
  analysisCache.clear();
  adviceCache.clear();
  matchOrder.length = 0;
  analysisOrder.length = 0;
  adviceOrder.length = 0;
  clearCompanySearchCache();
  console.log('[JobGod] All caches cleared');
}

// ==================== 持久化缓存 ====================

function generateJobCacheKey(companyName: string, jobTitle: string): string {
  return djb2Hash(`${companyName.trim().toLowerCase()}|${jobTitle.trim().toLowerCase()}`);
}

async function loadPersistentCache(): Promise<PersistentCache> {
  try {
    const data = await chrome.storage.local.get(PERSISTENT_CACHE_KEY);
    return (data[PERSISTENT_CACHE_KEY] as PersistentCache) || { entries: [], order: [] };
  } catch {
    return { entries: [], order: [] };
  }
}

async function savePersistentCache(cache: PersistentCache): Promise<void> {
  await chrome.storage.local.set({ [PERSISTENT_CACHE_KEY]: cache });
}

async function getPersistentCacheEntry(companyName: string, jobTitle: string): Promise<PersistentCacheEntry | null> {
  const key = generateJobCacheKey(companyName, jobTitle);
  const cache = await loadPersistentCache();
  return cache.entries.find(e => e.key === key) || null;
}

async function updatePersistentCache(entry: PersistentCacheEntry): Promise<void> {
  const cache = await loadPersistentCache();
  const existingIdx = cache.entries.findIndex(e => e.key === entry.key);

  if (existingIdx >= 0) {
    cache.entries[existingIdx] = entry;
    const orderIdx = cache.order.indexOf(entry.key);
    if (orderIdx >= 0) cache.order.splice(orderIdx, 1);
    cache.order.push(entry.key);
  } else {
    cache.entries.push(entry);
    cache.order.push(entry.key);
    while (cache.order.length > MAX_PERSISTENT_CACHE) {
      const oldKey = cache.order.shift();
      if (oldKey) {
        cache.entries = cache.entries.filter(e => e.key !== oldKey);
      }
    }
  }

  await savePersistentCache(cache);
}

async function exportPersistentCache(): Promise<string> {
  const cache = await loadPersistentCache();
  return JSON.stringify(cache, null, 2);
}

async function importPersistentCache(jsonStr: string): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const cache = JSON.parse(jsonStr) as PersistentCache;
    if (!cache.entries || !Array.isArray(cache.entries)) {
      return { success: false, count: 0, error: '缓存格式无效' };
    }
    await savePersistentCache(cache);
    return { success: true, count: cache.entries.length };
  } catch (e) {
    return { success: false, count: 0, error: e instanceof Error ? e.message : '解析失败' };
  }
}

async function clearPersistentCache(): Promise<void> {
  await chrome.storage.local.remove(PERSISTENT_CACHE_KEY);
}

// ==================== 用户配置加载 ====================

async function loadUserProfile(): Promise<UserProfile | null> {
  const data = await chrome.storage.local.get([
    'resumeText', 'resumeHash', 'birth', 'weights', 'llm', 'disabledOnSite', 'disclaimerAccepted',
  ]);

  if (!data.disclaimerAccepted) {
    return null;
  }

  const weights = data.weights as { science?: number; metaphysics?: number } | undefined;
  const rawLlm = data.llm as { baseUrl?: string; apiKey?: string; model?: string } | undefined;
  const birth = data.birth as UserProfile['birth'];
  const hasLlm = rawLlm?.baseUrl && rawLlm?.apiKey && rawLlm?.model;

  return {
    resumeText: String(data.resumeText ?? ''),
    resumeHash: String(data.resumeHash ?? ''),
    birth: birth ?? null,
    weights: {
      science: Number(weights?.science ?? 0.5),
      metaphysics: Number(weights?.metaphysics ?? 0.5),
    },
    llm: hasLlm ? { baseUrl: rawLlm.baseUrl!, apiKey: rawLlm.apiKey!, model: rawLlm.model! } : null,
    disabledOnSite: Boolean(data.disabledOnSite),
    disclaimerAccepted: true,
  };
}

async function loadUserInsights(): Promise<UserInsights | null> {
  const { userInsights } = await chrome.storage.local.get(['userInsights']);
  return (userInsights as UserInsights) ?? null;
}

// ==================== 缓存键生成 ====================

function matchCacheKey(profile: UserProfile, job: JobContext, insights: UserInsights | null): string {
  const jdBlob = (job.jdFull ?? job.jdSnippet).slice(0, 4000);
  const base = [profile.resumeHash, insights?.insightsInputHash ?? 'no-insights', job.jobUrl, job.readiness, djb2Hash(jdBlob)].join('|');
  return `${MATCH_CACHE_PREFIX}${djb2Hash(base)}`;
}

function analysisCacheKey(profile: UserProfile, job: JobContext, insights: UserInsights | null): string {
  const jdBlob = (job.jdFull ?? job.jdSnippet).slice(0, 2000);
  const base = [profile.resumeHash, insights?.insightsInputHash ?? 'no-insights', job.jobUrl, djb2Hash(jdBlob)].join('|');
  return `${ANALYSIS_CACHE_PREFIX}${djb2Hash(base)}`;
}

function adviceCacheKey(profile: UserProfile, job: JobContext): string {
  const jdBlob = (job.jdFull ?? job.jdSnippet).slice(0, 2000);
  const base = [profile.resumeHash, job.jobUrl, djb2Hash(jdBlob)].join('|');
  return `${ADVICE_CACHE_PREFIX}${djb2Hash(base)}`;
}

// ==================== 用户画像生成 ====================

interface ScienceInsightsResponse {
  resumeKeywords?: string[];
  resumeSummaryLine?: string;
  hardTraits?: string[];
  softTraits?: string[];
}

interface BaziInsightsResponse {
  baziCareerLine?: string;
}

async function generateUserInsights(profile: UserProfile, llm: LlmConfig): Promise<UserInsights> {
  const preservedHash = buildInsightsInputHash(profile);

  // 准备八字信息
  let baziDetail = '';
  if (profile.birth) {
    try {
      const b = computeBaziSummary(profile.birth);
      const sortedWx = Object.entries(b.wuXingPower).sort((a, c) => c[1] - a[1]);
      const wxDesc = sortedWx.map(([k, v]) => {
        const level = v >= 35 ? '旺' : v >= 25 ? '相' : v >= 15 ? '休' : '弱';
        return `${k}${v}%(${level})`;
      }).join('、');

      baziDetail = [
        `【排盘信息】日主：${b.dayMaster}，四柱：${b.pillars}`,
        `年柱 ${b.yearPillar.gan}${b.yearPillar.zhi} | 月柱 ${b.monthPillar.gan}${b.monthPillar.zhi} | 日柱 ${b.dayPillar.gan}${b.dayPillar.zhi} | 时柱 ${b.hourPillar.gan}${b.hourPillar.zhi}`,
        b.birthPlace ? `出生地：${b.birthPlace}` : '',
        b.solarTimeCorrection ? `真太阳时：${b.solarTimeCorrection}` : '',
        `【五行力量】${wxDesc}`,
        b.currentDaYun ? `【运程】大运：${b.currentDaYun}` : '',
        b.currentLiuNian ? `流年：${b.currentLiuNian}` : '',
        b.xiYongShenHints.length > 0 ? `【喜用神】${b.xiYongShenHints.join('；')}` : '',
      ].filter(Boolean).join('\n');
    } catch {
      baziDetail = '';
    }
  }

  // 科学画像
  const sciencePrompt = `你是资深职业规划顾问，请根据简历提取核心信息。
输出 JSON 对象，包含：
- resumeKeywords（数组，最多18个）：核心技能关键词
- resumeSummaryLine（字符串，200-400字）：职业总结
- hardTraits（数组）：硬性特质（学历、学校背景、毕业年份、工作年限等）
- softTraits（数组）：软性特质（技能方向、项目经验、管理经验等）

注意：识别985/211院校，标注应届生或工作年限。只输出JSON。`;

  const scienceResult = await callLlmForJson<ScienceInsightsResponse>(llm, sciencePrompt, `简历：\n${profile.resumeText.slice(0, 8000)}`, { maxTokens: 900 });

  const resumeKeywords = scienceResult?.resumeKeywords?.slice(0, 24) ?? [];
  const hardTraits = scienceResult?.hardTraits?.slice(0, 10) ?? [];
  const softTraits = scienceResult?.softTraits?.slice(0, 10) ?? [];
  const resumeSummaryLine = scienceResult?.resumeSummaryLine?.slice(0, 800) ?? '';

  // 玄学画像
  let baziCareerLine = '未录入出生信息，无法提供玄学维度的职业参考。';
  if (baziDetail) {
    const baziPrompt = `你是精通命理文化的职业顾问。根据八字生成职业分析。
输出 JSON：{"baziCareerLine": "分析内容（包含【排盘信息】【五行力量】【运程】【职业分析】【求职建议】，结尾注明仅供参考）"}`;

    const baziResult = await callLlmForJson<BaziInsightsResponse>(llm, baziPrompt, `八字：\n${baziDetail}`, { maxTokens: 1000 });
    baziCareerLine = baziResult?.baziCareerLine?.slice(0, 1500) || baziDetail;
  }

  return {
    resumeKeywords,
    resumeSummaryLine,
    baziCareerLine,
    hardTraits,
    softTraits,
    insightsInputHash: preservedHash,
    insightsUpdatedAt: Date.now(),
    source: 'llm',
  };
}

export async function rebuildUserInsights(): Promise<{ ok: boolean; source?: string; error?: string }> {
  const profile = await loadUserProfile();
  if (!profile || profile.resumeText.length < 20) {
    return { ok: false, error: 'NO_RESUME' };
  }

  const hash = buildInsightsInputHash(profile);
  let insights: UserInsights;

  if (profile.llm?.apiKey && profile.llm.baseUrl && profile.llm.model) {
    try {
      insights = await generateUserInsights(profile, profile.llm);
    } catch {
      insights = buildRulesInsights(profile, hash);
    }
  } else {
    insights = buildRulesInsights(profile, hash);
  }

  await chrome.storage.local.set({ userInsights: insights, insightsInputHash: hash, insightsUpdatedAt: insights.insightsUpdatedAt });
  return { ok: true, source: insights.source };
}

// ==================== 匹配计算 ====================

async function computeMatch(job: JobContext): Promise<MatchScoreResult> {
  const profile = await loadUserProfile();
  if (!profile || profile.resumeText.length < 20) throw new Error('PROFILE_INCOMPLETE');
  if (profile.disabledOnSite) throw new Error('DISABLED');

  const insights = await loadUserInsights();
  const key = matchCacheKey(profile, job, insights);
  const hit = matchCache.get(key);
  if (hit) return hit.result;

  let bazi = null;
  if (profile.birth) {
    try { bazi = computeBaziSummary(profile.birth); } catch { /* ignore */ }
  }

  const scienceScore = computeScienceScore(profile.resumeText, job, insights);
  const metaphysicsScore = computeMetaphysicsInitial(bazi, job);
  const combinedPercent = combineWeighted(scienceScore, metaphysicsScore, profile.weights);

  const result: MatchScoreResult = {
    cacheKey: key,
    scienceScore,
    metaphysicsScore,
    combinedPercent,
    readiness: job.readiness,
    scienceHint: shortScienceHint(scienceScore, job.readiness),
    metaphysicsHint: shortMetaphysicsHint(metaphysicsScore, Boolean(profile.birth)),
  };

  touchMatchCache(key, { result, ts: Date.now() });
  return result;
}

// ==================== 深度建议 ====================

interface DeepAdviceResponse {
  summary?: string;
  resumeTips?: string[];
  interviewTips?: string[];
  notes?: string[];
}

async function deepAdvice(job: JobContext, scores: MatchScoreResult): Promise<DeepAdviceResult> {
  const profile = await loadUserProfile();
  if (!profile || profile.resumeText.length < 20) throw new Error('PROFILE_INCOMPLETE');
  if (profile.disabledOnSite) throw new Error('DISABLED');

  // 检查缓存
  const persistentEntry = await getPersistentCacheEntry(job.companyName, job.jobTitle);
  if (persistentEntry?.advice) return persistentEntry.advice;

  const cacheKey = adviceCacheKey(profile, job);
  const cached = adviceCache.get(cacheKey);
  if (cached) return cached.result;

  const insights = await loadUserInsights();
  const llm = profile.llm;

  if (!llm?.apiKey || !llm.baseUrl || !llm.model) {
    const fallback = { ...fallbackDeepAdvice(job) };
    touchAdviceCache(cacheKey, { result: fallback, ts: Date.now() });
    return fallback;
  }

  // 搜索公司信息
  let companySearchResult: CompanySearchResult | null = null;
  if ((!job.companyIntroSnippet || job.companyIntroSnippet.length < 100) && job.companyName) {
    try { companySearchResult = await searchCompanyInfo(job.companyName, llm); } catch { /* ignore */ }
  }

  try {
    const user = buildDeepUserPrompt({ job, userInsights: insights, scores, companySearchResult });
    const result = await callLlmForJson<DeepAdviceResponse>(llm, buildDeepSystemPrompt(), user, { maxTokens: 1200, retries: 1 });

    const fallback = fallbackDeepAdvice(job);
    const advice: DeepAdviceResult = {
      summary: result?.summary ?? fallback.summary,
      resumeTips: (result?.resumeTips?.length ? result.resumeTips : fallback.resumeTips).map(String),
      interviewTips: (result?.interviewTips?.length ? result.interviewTips : fallback.interviewTips).map(String),
      notes: result?.notes?.map(String) ?? [],
    };

    touchAdviceCache(cacheKey, { result: advice, ts: Date.now() });
    await updatePersistentCache({
      key: generateJobCacheKey(job.companyName, job.jobTitle),
      companyName: job.companyName,
      jobTitle: job.jobTitle,
      combinedPercent: scores.combinedPercent,
      scienceScore: scores.scienceScore,
      metaphysicsScore: scores.metaphysicsScore,
      analysis: null,
      advice,
      ts: Date.now(),
    });

    return advice;
  } catch {
    const fallback = { ...fallbackDeepAdvice(job) };
    touchAdviceCache(cacheKey, { result: fallback, ts: Date.now() });
    return fallback;
  }
}

// ==================== 匹配分析 ====================

async function getMatchAnalysis(job: JobContext): Promise<{ result: MatchAnalysisResult; fromCache: boolean }> {
  const profile = await loadUserProfile();
  if (!profile) throw new Error('PROFILE_INCOMPLETE');

  // 检查缓存
  const persistentEntry = await getPersistentCacheEntry(job.companyName, job.jobTitle);
  if (persistentEntry?.analysis) {
    return { result: persistentEntry.analysis, fromCache: true };
  }

  const insights = await loadUserInsights();
  const cacheKey = analysisCacheKey(profile, job, insights);
  const cached = analysisCache.get(cacheKey);
  if (cached) {
    return { result: cached.result, fromCache: true };
  }

  let bazi = null;
  if (profile.birth) {
    try { bazi = computeBaziSummary(profile.birth); } catch { /* ignore */ }
  }

  // 尝试 LLM 分析
  if (profile.llm?.apiKey && profile.llm.baseUrl && profile.llm.model) {
    try {
      const llmResult = await callLlmForMatchAnalysis({ job, userInsights: insights, bazi, llm: profile.llm });
      touchAnalysisCache(cacheKey, { result: llmResult, ts: Date.now() });

      await updatePersistentCache({
        key: generateJobCacheKey(job.companyName, job.jobTitle),
        companyName: job.companyName,
        jobTitle: job.jobTitle,
        combinedPercent: Math.round((llmResult.scienceAnalysis.score + llmResult.metaphysicsAnalysis.score) / 2),
        scienceScore: llmResult.scienceAnalysis.score,
        metaphysicsScore: llmResult.metaphysicsAnalysis.score,
        analysis: llmResult,
        advice: persistentEntry?.advice || null,
        ts: Date.now(),
      });

      return { result: llmResult, fromCache: false };
    } catch {
      // LLM 失败，使用规则分析
    }
  }

  // 规则分析
  const scienceScore = computeScienceScore(profile.resumeText, job, insights);
  const metaphysicsScore = computeMetaphysicsInitial(bazi, job);
  const analysis = generateMatchAnalysis(profile.resumeText, job, insights, bazi, scienceScore, metaphysicsScore);
  touchAnalysisCache(cacheKey, { result: analysis, ts: Date.now() });

  return { result: analysis, fromCache: false };
}

// ==================== 消息处理 ====================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handlers: Record<string, () => Promise<unknown>> = {
    COMPUTE_MATCH: () => computeMatch(msg.payload as JobContext),
    GET_DEEP_ADVICE: () => deepAdvice(msg.payload.job as JobContext, msg.payload.scores as MatchScoreResult),
    REBUILD_INSIGHTS: () => rebuildUserInsights(),
    GET_MATCH_ANALYSIS: () => getMatchAnalysis(msg.payload.job as JobContext),
    GET_PERSISTENT_CACHE: async () => {
      const { companyName, jobTitle } = msg.payload || {};
      if (!companyName || !jobTitle) throw new Error('缺少参数');
      return getPersistentCacheEntry(companyName, jobTitle);
    },
    EXPORT_CACHE: () => exportPersistentCache(),
    IMPORT_CACHE: async () => importPersistentCache(msg.payload?.json || ''),
    CLEAR_CACHE: async () => { clearAllCaches(); await clearPersistentCache(); return { ok: true }; },
    TEST_LLM: async () => {
      const text = await callLlm(msg.payload as LlmConfig, '你是一个测试助手。', '请回复"连接成功"。', { maxTokens: 20 });
      return { ok: true, response: text };
    },
    TEST_COMPANY_SEARCH: async () => {
      const result = await searchCompanyInfo('腾讯', msg.payload as LlmConfig);
      if (result && result.confidence > 0.5) {
        return { ok: true, supported: true, companyName: result.companyName, description: result.description.slice(0, 100) };
      }
      return { ok: true, supported: false, reason: '模型无法返回有效的公司信息' };
    },
  };

  if (msg?.type === 'PING') {
    sendResponse({ ok: true });
    return false;
  }

  const handler = handlers[msg?.type as string];
  if (!handler) {
    sendResponse({ ok: false, error: 'Unknown message type' });
    return false;
  }

  handler()
    .then(result => sendResponse(result))
    .catch(e => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));

  return true;
});
