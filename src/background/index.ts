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
import type {
  DeepAdviceResult,
  JobContext,
  LlmConfig,
  MatchScoreResult,
  UserInsights,
  UserProfile,
  MatchAnalysisResult,
} from '../types/analysis';

const MATCH_CACHE_PREFIX = 'jg_match_v3:';
const ANALYSIS_CACHE_PREFIX = 'jg_analysis_v1:';
const ADVICE_CACHE_PREFIX = 'jg_advice_v1:';
const PERSISTENT_CACHE_KEY = 'jg_persistent_cache_v1';
const MAX_CACHE = 100;
const MAX_PERSISTENT_CACHE = 200;

type MatchCacheEntry = { result: MatchScoreResult; ts: number };
type AnalysisCacheEntry = { result: MatchAnalysisResult; ts: number };
type AdviceCacheEntry = { result: DeepAdviceResult; ts: number };

// 持久化缓存条目
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

// 持久化缓存存储
interface PersistentCache {
  entries: PersistentCacheEntry[];
  order: string[]; // LRU 顺序
}

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

// ==================== 持久化缓存函数 ====================

/**
 * 生成基于公司名+职位名的缓存键
 */
function generateJobCacheKey(companyName: string, jobTitle: string): string {
  return djb2Hash(`${companyName.trim().toLowerCase()}|${jobTitle.trim().toLowerCase()}`);
}

/**
 * 加载持久化缓存
 */
async function loadPersistentCache(): Promise<PersistentCache> {
  try {
    const data = await chrome.storage.local.get(PERSISTENT_CACHE_KEY);
    return (data[PERSISTENT_CACHE_KEY] as PersistentCache) || { entries: [], order: [] };
  } catch {
    return { entries: [], order: [] };
  }
}

/**
 * 保存持久化缓存
 */
async function savePersistentCache(cache: PersistentCache): Promise<void> {
  await chrome.storage.local.set({ [PERSISTENT_CACHE_KEY]: cache });
}

/**
 * 查询持久化缓存
 */
async function getPersistentCacheEntry(companyName: string, jobTitle: string): Promise<PersistentCacheEntry | null> {
  const key = generateJobCacheKey(companyName, jobTitle);
  const cache = await loadPersistentCache();
  const entry = cache.entries.find(e => e.key === key);
  return entry || null;
}

/**
 * 更新持久化缓存
 */
async function updatePersistentCache(entry: PersistentCacheEntry): Promise<void> {
  const cache = await loadPersistentCache();
  const existingIdx = cache.entries.findIndex(e => e.key === entry.key);

  if (existingIdx >= 0) {
    // 更新现有条目
    cache.entries[existingIdx] = entry;
    // 更新 LRU 顺序
    const orderIdx = cache.order.indexOf(entry.key);
    if (orderIdx >= 0) cache.order.splice(orderIdx, 1);
    cache.order.push(entry.key);
  } else {
    // 添加新条目
    cache.entries.push(entry);
    cache.order.push(entry.key);

    // LRU 清理
    while (cache.order.length > MAX_PERSISTENT_CACHE) {
      const oldKey = cache.order.shift();
      if (oldKey) {
        cache.entries = cache.entries.filter(e => e.key !== oldKey);
      }
    }
  }

  await savePersistentCache(cache);
}

/**
 * 导出缓存为 JSON
 */
async function exportPersistentCache(): Promise<string> {
  const cache = await loadPersistentCache();
  return JSON.stringify(cache, null, 2);
}

/**
 * 导入缓存
 */
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

/**
 * 清空持久化缓存
 */
async function clearPersistentCache(): Promise<void> {
  await chrome.storage.local.remove(PERSISTENT_CACHE_KEY);
}

async function loadUserProfile(): Promise<UserProfile | null> {
  const data = await chrome.storage.local.get([
    'resumeText',
    'resumeHash',
    'birth',
    'weights',
    'llm',
    'disabledOnSite',
    'disclaimerAccepted',
  ]);
  console.log('[JobGod] loadUserProfile - raw data:', {
    hasResume: Boolean(data.resumeText),
    resumeLen: (data.resumeText as string)?.length ?? 0,
    disclaimerAccepted: data.disclaimerAccepted,
    disabledOnSite: data.disabledOnSite,
    llm: data.llm,
  });

  if (!data.disclaimerAccepted) {
    console.log('[JobGod] loadUserProfile - disclaimer not accepted');
    return null;
  }
  const weights = data.weights as { science?: number; metaphysics?: number } | undefined;
  const rawLlm = data.llm as { baseUrl?: string; apiKey?: string; model?: string } | undefined;
  const birth = data.birth as UserProfile['birth'];

  // 检查 LLM 配置是否完整
  const hasLlm = rawLlm?.baseUrl && rawLlm?.apiKey && rawLlm?.model;
  console.log('[JobGod] loadUserProfile - LLM check:', {
    baseUrl: rawLlm?.baseUrl,
    hasApiKey: Boolean(rawLlm?.apiKey),
    model: rawLlm?.model,
    hasLlm,
  });

  const llm: LlmConfig | null =
    hasLlm
      ? { baseUrl: rawLlm.baseUrl!, apiKey: rawLlm.apiKey!, model: rawLlm.model! }
      : null;

  console.log('[JobGod] loadUserProfile - final llm:', llm ? { baseUrl: llm.baseUrl, model: llm.model } : null);

  return {
    resumeText: String(data.resumeText ?? ''),
    resumeHash: String(data.resumeHash ?? ''),
    birth: birth ?? null,
    weights: {
      science: Number(weights?.science ?? 0.5),
      metaphysics: Number(weights?.metaphysics ?? 0.5),
    },
    llm,
    disabledOnSite: Boolean(data.disabledOnSite),
    disclaimerAccepted: true,
  };
}

async function loadUserInsights(): Promise<UserInsights | null> {
  const { userInsights } = await chrome.storage.local.get(['userInsights']);
  return (userInsights as UserInsights) ?? null;
}

function matchCacheKey(profile: UserProfile, job: JobContext, insights: UserInsights | null): string {
  const jdBlob = (job.jdFull ?? job.jdSnippet).slice(0, 4000);
  const base = [
    profile.resumeHash,
    insights?.insightsInputHash ?? 'no-insights',
    job.jobUrl,
    job.readiness,
    djb2Hash(jdBlob),
  ].join('|');
  return `${MATCH_CACHE_PREFIX}${djb2Hash(base)}`;
}

function analysisCacheKey(profile: UserProfile, job: JobContext, insights: UserInsights | null): string {
  const jdBlob = (job.jdFull ?? job.jdSnippet).slice(0, 2000);
  const base = [
    profile.resumeHash,
    insights?.insightsInputHash ?? 'no-insights',
    job.jobUrl,
    djb2Hash(jdBlob),
  ].join('|');
  return `${ANALYSIS_CACHE_PREFIX}${djb2Hash(base)}`;
}

function adviceCacheKey(profile: UserProfile, job: JobContext): string {
  const jdBlob = (job.jdFull ?? job.jdSnippet).slice(0, 2000);
  const base = [
    profile.resumeHash,
    job.jobUrl,
    djb2Hash(jdBlob),
  ].join('|');
  return `${ADVICE_CACHE_PREFIX}${djb2Hash(base)}`;
}

let lastLlmCall = 0;
const MIN_GAP_MS = 400;

async function callLlmRaw(
  llm: LlmConfig,
  system: string,
  user: string,
  maxTokens = 900,
): Promise<string> {
  const now = Date.now();
  const wait = Math.max(0, MIN_GAP_MS - (now - lastLlmCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastLlmCall = Date.now();

  // 确保 URL 格式正确
  let baseUrl = llm.baseUrl.replace(/\/$/, '');
  // 如果 URL 不包含 /v1 或 /paas/v4 等版本路径，且不是 OpenAI 官方 URL，添加 /v1
  if (!baseUrl.includes('/v') && !baseUrl.includes('openai.com')) {
    // 智谱 GLM 使用 /api/paas/v4
    if (baseUrl.includes('bigmodel.cn')) {
      baseUrl = baseUrl.replace(/\/$/, '') + '/api/paas/v4';
    } else {
      baseUrl = baseUrl + '/v1';
    }
  }

  const url = `${baseUrl}/chat/completions`;
  console.log('[JobGod] callLlmRaw - URL:', url, 'Model:', llm.model);

  const body = {
    model: llm.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.4,
    max_tokens: maxTokens,
  };

  console.log('[JobGod] callLlmRaw - sending request...');

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
    console.error('[JobGod] callLlmRaw - HTTP error:', res.status, t);
    throw new Error(`LLM_HTTP_${res.status}:${t.slice(0, 200)}`);
  }
  console.log('[JobGod] callLlmRaw - response OK');
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? '';
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const block = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = block ? block[1]!.trim() : trimmed;
  return JSON.parse(raw) as Record<string, unknown>;
}

async function callLlmForUserInsights(profile: UserProfile, llm: LlmConfig): Promise<UserInsights> {
  // 计算并保存 insightsInputHash，必须在所有异步调用之前完成
  // 使用对象包装确保压缩器不会重用此变量
  const preservedHash = { value: buildInsightsInputHash(profile) };
  let baziBlock = '';
  let baziDetail = '';
  if (profile.birth) {
    try {
      const b = computeBaziSummary(profile.birth);
      baziBlock = formatBaziSummaryForLlm(b);
      // 构建详细的排盘信息（供LLM参考格式）
      const sortedWx = Object.entries(b.wuXingPower).sort((a, c) => c[1] - a[1]);
      const wxDesc = sortedWx.map(([k, v]) => {
        const level = v >= 35 ? '旺' : v >= 25 ? '相' : v >= 15 ? '休' : '弱';
        return `${k}${v}%(${level})`;
      }).join('、');

      baziDetail = [
        `【排盘信息】`,
        `日主：${b.dayMaster}`,
        `四柱：${b.pillars}`,
        `年柱 ${b.yearPillar.gan}${b.yearPillar.zhi} | 月柱 ${b.monthPillar.gan}${b.monthPillar.zhi} | 日柱 ${b.dayPillar.gan}${b.dayPillar.zhi} | 时柱 ${b.hourPillar.gan}${b.hourPillar.zhi}`,
        b.birthPlace ? `出生地：${b.birthPlace}` : '',
        b.solarTimeCorrection ? `真太阳时：${b.solarTimeCorrection}` : '',
        b.correctedTime ? `校正后时辰：${b.correctedTime}` : '',
        `【五行力量】${wxDesc}`,
        b.currentDaYun ? `【运程】\n大运：${b.currentDaYun}` : '',
        b.currentLiuNian ? `流年：${b.currentLiuNian}` : '',
        b.xiYongShenHints.length > 0 ? `【喜用神】${b.xiYongShenHints.join('；')}` : '',
        b.yunStart ? `【起运时间】${b.yunStart}` : '',
      ].filter(Boolean).join('\n');
    } catch {
      baziBlock = '';
      baziDetail = '';
    }
  }

  // 玄学画像的系统提示 - 强调只基于八字
  const baziSystemPrompt = [
    '你是精通中国传统命理文化的职业顾问，专门根据八字命盘进行职业分析。',
    '你的任务是根据用户提供的八字信息，生成详细的职业分析文本。',
    '注意：你的分析完全基于八字命理，不需要参考用户的简历内容。',
    '',
    '你必须输出一个JSON对象，格式如下：',
    '{"baziCareerLine": "你的分析内容（纯文本，用换行符分隔各部分）"}',
    '',
    'baziCareerLine 字符串必须包含以下部分：',
    '【排盘信息】日主、四柱、年月日时柱',
    '【五行力量】五行百分比和旺相休弱状态',
    '【运程】大运和流年（如有）',
    '【职业分析】适合的行业和岗位类型',
    '【大运影响】当前大运对职业的影响（如有）',
    '【流年影响】当年流年对求职的影响',
    '【求职建议】综合建议，结尾必须加上"命理内容为传统文化语境下的自我参考，不构成命运或录用承诺"',
    '',
    '重要：只输出JSON对象，不要有任何其他文字或解释。',
  ].join('\n');

  // 科学画像的系统提示 - 只基于简历
  const scienceSystemPrompt = [
    '你是资深职业规划顾问，专门根据简历内容进行职业分析。',
    '请根据用户简历提取核心技能关键词，并生成职业总结。',
    '输出单一 JSON 对象，不要 Markdown，不要代码块。',
    '',
    '必须包含以下字段：',
    '1. resumeKeywords（字符串数组，最多18个）：提取简历中的核心技能关键词',
    '2. resumeSummaryLine（字符串，200-400字）：用自然语言详细总结用户的经历、技能特长、适合的岗位方向',
    '3. hardTraits（字符串数组）：硬性特质，如学历（本科/硕士/博士）、学校背景（985/211）、毕业年份、工作年限、英语等级等',
    '4. softTraits（字符串数组）：软性特质，如技能方向、项目经验、管理经验、大厂背景等',
    '',
    '注意：',
    '- hardTraits 要识别学校是否为985或211（如"985院校(北京大学)"、"211院校"）',
    '- hardTraits 要提取毕业年份（如"2024届毕业生"、"2020年毕业"）',
    '- hardTraits 要判断工作年限（应届生标注"应届生"，否则标注"X年工作经验"）',
    '- softTraits 要识别技能方向（如"AI/大模型经验"、"产品规划能力"）',
    '- 如果简历中提到985/211学校，必须在hardTraits中标注',
  ].join('\n');

  // 先调用科学画像（基于简历）
  const scienceUser = [
    `【简历内容】\n${profile.resumeText.slice(0, 8000)}`,
    '',
    '请提取核心技能关键词并生成职业总结：',
  ].join('\n');

  const scienceText = await callLlmRaw(llm, scienceSystemPrompt, scienceUser, 900);
  const scienceObj = parseJsonObject(scienceText);
  const resumeKeywords = Array.isArray(scienceObj.resumeKeywords)
    ? scienceObj.resumeKeywords.map(String).slice(0, 24)
    : [];
  const hardTraits = Array.isArray(scienceObj.hardTraits)
    ? scienceObj.hardTraits.map(String).slice(0, 10)
    : [];
  const softTraits = Array.isArray(scienceObj.softTraits)
    ? scienceObj.softTraits.map(String).slice(0, 10)
    : [];

  // 再调用玄学画像（只基于八字）
  // 使用明确的常量名避免压缩器变量名冲突
  const baziDetailFallback = baziDetail;
  let baziCareerLine = '';

  if (baziDetailFallback) {
    const baziUser = [
      `【八字信息】`,
      baziDetailFallback,
      '',
      '请根据以上八字信息，生成详细的职业分析（baziCareerLine）：',
    ].join('\n');

    // 在 try 外部声明并初始化
    let rawResponse = '';
    let parsedObj: { baziCareerLine?: string } | null = null;
    let llmSuccess = false;

    try {
      rawResponse = await callLlmRaw(llm, baziSystemPrompt, baziUser, 1000);
      parsedObj = parseJsonObject(rawResponse) as { baziCareerLine?: string };
      llmSuccess = true;
    } catch {
      // LLM 调用或解析失败
      llmSuccess = false;
    }

    // 根据 LLM 调用结果决定使用哪个值
    if (llmSuccess && parsedObj && parsedObj.baziCareerLine) {
      baziCareerLine = String(parsedObj.baziCareerLine).slice(0, 1500);
    } else if (llmSuccess && rawResponse) {
      baziCareerLine = rawResponse.slice(0, 1500);
    } else {
      // LLM 失败时使用规则生成的结果
      baziCareerLine = baziDetailFallback;
    }
  } else {
    baziCareerLine = '未录入出生信息，无法提供玄学维度的职业参考。请在设置中填写出生年月日时。';
  }

  return {
    resumeKeywords,
    resumeSummaryLine: String(scienceObj.resumeSummaryLine ?? '').slice(0, 800),
    baziCareerLine,
    hardTraits,
    softTraits,
    insightsInputHash: preservedHash.value,
    insightsUpdatedAt: Date.now(),
    source: 'llm',
  };
}

export async function rebuildUserInsights(): Promise<{ ok: boolean; source?: string; error?: string }> {
  console.log('[JobGod] rebuildUserInsights - starting');
  const profile = await loadUserProfile();
  if (!profile || profile.resumeText.length < 20) {
    console.log('[JobGod] rebuildUserInsights - no profile or resume too short');
    return { ok: false, error: 'NO_RESUME' };
  }
  const hash = buildInsightsInputHash(profile);
  const llm = profile.llm;

  console.log('[JobGod] rebuildUserInsights - profile loaded, llm:', llm ? { baseUrl: llm.baseUrl, model: llm.model } : null);

  let insights: UserInsights;
  if (llm?.apiKey && llm.baseUrl && llm.model) {
    console.log('[JobGod] rebuildUserInsights - calling LLM for insights');
    try {
      insights = await callLlmForUserInsights(profile, llm);
      console.log('[JobGod] rebuildUserInsights - LLM insights generated');
    } catch (e) {
      console.error('[JobGod] rebuildUserInsights - LLM failed, using rules:', e);
      insights = buildRulesInsights(profile, hash);
    }
  } else {
    console.log('[JobGod] rebuildUserInsights - no LLM config, using rules');
    insights = buildRulesInsights(profile, hash);
  }

  await chrome.storage.local.set({
    userInsights: insights,
    insightsInputHash: hash,
    insightsUpdatedAt: insights.insightsUpdatedAt,
  });
  console.log('[JobGod] rebuildUserInsights - done, source:', insights.source);
  return { ok: true, source: insights.source };
}

async function computeMatch(job: JobContext): Promise<MatchScoreResult> {
  const profile = await loadUserProfile();
  if (!profile || profile.resumeText.length < 20) {
    throw new Error('PROFILE_INCOMPLETE');
  }
  if (profile.disabledOnSite) {
    throw new Error('DISABLED');
  }

  const insights = await loadUserInsights();
  console.log('[JobGod] computeMatch - insights:', insights ? { source: insights.source, kwCount: insights.resumeKeywords.length } : null);

  const key = matchCacheKey(profile, job, insights);
  const hit = matchCache.get(key);
  if (hit) return hit.result;

  let bazi = null;
  if (profile.birth) {
    try {
      bazi = computeBaziSummary(profile.birth);
    } catch {
      bazi = null;
    }
  }

  const scienceScore = computeScienceScore(profile.resumeText, job, insights);
  console.log('[JobGod] computeMatch - scienceScore:', scienceScore, 'resumeLen:', profile.resumeText.length);

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

async function deepAdvice(job: JobContext, scores: MatchScoreResult): Promise<DeepAdviceResult> {
  const profile = await loadUserProfile();
  if (!profile || profile.resumeText.length < 20) {
    throw new Error('PROFILE_INCOMPLETE');
  }
  if (profile.disabledOnSite) {
    throw new Error('DISABLED');
  }

  // 先检查持久化缓存
  const persistentEntry = await getPersistentCacheEntry(job.companyName, job.jobTitle);
  if (persistentEntry?.advice) {
    console.log('[JobGod] deepAdvice - persistent cache hit');
    return persistentEntry.advice;
  }

  // 检查内存缓存
  const cacheKey = adviceCacheKey(profile, job);
  const cached = adviceCache.get(cacheKey);
  if (cached) {
    console.log('[JobGod] deepAdvice - memory cache hit');
    return cached.result;
  }

  const insights = await loadUserInsights();
  const llm = profile.llm;

  console.log('[JobGod] deepAdvice - llm config:', llm ? { baseUrl: llm.baseUrl, model: llm.model, hasKey: Boolean(llm.apiKey) } : null);

  if (!llm?.apiKey || !llm.baseUrl || !llm.model) {
    console.log('[JobGod] deepAdvice - LLM not configured, using fallback');
    const fallback = { ...fallbackDeepAdvice(job), rawText: undefined };
    touchAdviceCache(cacheKey, { result: fallback, ts: Date.now() });
    return fallback;
  }

  // 如果公司介绍不足，搜索公司信息
  let companySearchResult: CompanySearchResult | null = null;
  if ((!job.companyIntroSnippet || job.companyIntroSnippet.length < 100) && job.companyName) {
    try {
      companySearchResult = await searchCompanyInfo(job.companyName, llm);
      console.log('[JobGod] deepAdvice - company search result:', companySearchResult ? 'found' : 'not found');
    } catch (e) {
      console.error('[JobGod] deepAdvice - company search error:', e);
    }
  }

  try {
    const user = buildDeepUserPrompt({
      job,
      userInsights: insights,
      scores: {
        scienceScore: scores.scienceScore,
        metaphysicsScore: scores.metaphysicsScore,
        combinedPercent: scores.combinedPercent,
      },
      companySearchResult,
    });
    console.log('[JobGod] deepAdvice - calling LLM...');
    const text = await callLlmRaw(llm, buildDeepSystemPrompt(), user, 1200);
    const obj = parseJsonObject(text);
    console.log('[JobGod] deepAdvice - LLM response OK');

    // 解析各字段，为空时使用 fallback
    const fallback = fallbackDeepAdvice(job);
    const resumeTips = Array.isArray(obj.resumeTips) && obj.resumeTips.length > 0
      ? obj.resumeTips.map(String)
      : fallback.resumeTips;
    const interviewTips = Array.isArray(obj.interviewTips) && obj.interviewTips.length > 0
      ? obj.interviewTips.map(String)
      : fallback.interviewTips;
    const notes = Array.isArray(obj.notes) ? obj.notes.map(String) : [];

    const result: DeepAdviceResult = {
      summary: String(obj.summary ?? fallback.summary),
      resumeTips,
      interviewTips,
      notes,
      rawText: text,
    };
    touchAdviceCache(cacheKey, { result, ts: Date.now() });

    // 保存到持久化缓存
    await updatePersistentCache({
      key: generateJobCacheKey(job.companyName, job.jobTitle),
      companyName: job.companyName,
      jobTitle: job.jobTitle,
      combinedPercent: scores.combinedPercent,
      scienceScore: scores.scienceScore,
      metaphysicsScore: scores.metaphysicsScore,
      analysis: null,
      advice: result,
      ts: Date.now(),
    });

    return result;
  } catch (e) {
    console.error('[JobGod] deepAdvice - LLM error:', e);
    const fallback = { ...fallbackDeepAdvice(job) };
    touchAdviceCache(cacheKey, { result: fallback, ts: Date.now() });
    return fallback;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log('[JobGod] Received message:', msg?.type);

  if (msg?.type === 'COMPUTE_MATCH' && msg.payload) {
    console.log('[JobGod] Processing COMPUTE_MATCH');
    computeMatch(msg.payload as JobContext)
      .then((r) => {
        console.log('[JobGod] COMPUTE_MATCH result:', r);
        sendResponse({ ok: true, result: r });
      })
      .catch((e) => {
        console.error('[JobGod] COMPUTE_MATCH error:', e);
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
    return true;
  }
  if (msg?.type === 'GET_DEEP_ADVICE' && msg.payload?.job && msg.payload?.scores) {
    console.log('[JobGod] Processing GET_DEEP_ADVICE');
    deepAdvice(msg.payload.job as JobContext, msg.payload.scores as MatchScoreResult)
      .then((r) => {
        console.log('[JobGod] GET_DEEP_ADVICE result');
        sendResponse({ ok: true, result: r });
      })
      .catch((e) => {
        console.error('[JobGod] GET_DEEP_ADVICE error:', e);
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
    return true;
  }
  if (msg?.type === 'REBUILD_INSIGHTS') {
    console.log('[JobGod] Processing REBUILD_INSIGHTS');
    rebuildUserInsights()
      .then((r) => {
        console.log('[JobGod] REBUILD_INSIGHTS result:', r);
        sendResponse(r);
      })
      .catch((e) => {
        console.error('[JobGod] REBUILD_INSIGHTS error:', e);
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
    return true;
  }
  if (msg?.type === 'PING') {
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === 'TEST_LLM' && msg.payload) {
    console.log('[JobGod] Processing TEST_LLM');
    const llm = msg.payload as LlmConfig;
    callLlmRaw(llm, '你是一个测试助手。', '请回复"连接成功"两个字。', 20)
      .then((text) => {
        console.log('[JobGod] TEST_LLM success:', text);
        sendResponse({ ok: true, response: text });
      })
      .catch((e) => {
        console.error('[JobGod] TEST_LLM error:', e);
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
    return true;
  }
  if (msg?.type === 'GET_MATCH_ANALYSIS' && msg.payload?.job) {
    console.log('[JobGod] Processing GET_MATCH_ANALYSIS');
    (async () => {
      try {
        const job = msg.payload.job as JobContext;
        const profile = await loadUserProfile();
        if (!profile) {
          sendResponse({ ok: false, error: 'PROFILE_INCOMPLETE' });
          return;
        }

        // 先检查持久化缓存
        const persistentEntry = await getPersistentCacheEntry(job.companyName, job.jobTitle);
        if (persistentEntry?.analysis) {
          console.log('[JobGod] GET_MATCH_ANALYSIS - persistent cache hit');
          sendResponse({ ok: true, result: persistentEntry.analysis, fromCache: true });
          return;
        }

        const insights = await loadUserInsights();
        const cacheKey = analysisCacheKey(profile, job, insights);

        // 检查内存缓存
        const cached = analysisCache.get(cacheKey);
        if (cached) {
          console.log('[JobGod] GET_MATCH_ANALYSIS - memory cache hit');
          sendResponse({ ok: true, result: cached.result, fromCache: true });
          return;
        }

        let bazi = null;
        if (profile.birth) {
          try {
            bazi = computeBaziSummary(profile.birth);
          } catch {
            bazi = null;
          }
        }

        // 如果有LLM配置，使用LLM进行分析
        if (profile.llm?.apiKey && profile.llm.baseUrl && profile.llm.model) {
          console.log('[JobGod] GET_MATCH_ANALYSIS - using LLM');
          try {
            const llmResult = await callLlmForMatchAnalysis({
              job,
              userInsights: insights,
              bazi,
              llm: profile.llm,
            });
            touchAnalysisCache(cacheKey, { result: llmResult, ts: Date.now() });

            // 保存到持久化缓存
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

            sendResponse({ ok: true, result: llmResult, fromCache: false });
            return;
          } catch (e) {
            console.error('[JobGod] GET_MATCH_ANALYSIS - LLM error:', e);
            // LLM失败，使用规则分析
          }
        }

        // 规则分析
        console.log('[JobGod] GET_MATCH_ANALYSIS - using rules');
        const scienceScore = computeScienceScore(profile.resumeText, job, insights);
        const metaphysicsScore = computeMetaphysicsInitial(bazi, job);
        const analysis = generateMatchAnalysis(
          profile.resumeText,
          job,
          insights,
          bazi,
          scienceScore,
          metaphysicsScore,
        );
        touchAnalysisCache(cacheKey, { result: analysis, ts: Date.now() });
        sendResponse({ ok: true, result: analysis, fromCache: false });
      } catch (e) {
        console.error('[JobGod] GET_MATCH_ANALYSIS error:', e);
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'TEST_COMPANY_SEARCH' && msg.payload) {
    console.log('[JobGod] Processing TEST_COMPANY_SEARCH');
    const llm = msg.payload as LlmConfig;
    // 使用一个知名公司测试公司搜索功能
    searchCompanyInfo('腾讯', llm)
      .then((result) => {
        console.log('[JobGod] TEST_COMPANY_SEARCH result:', result);
        if (result && result.confidence > 0.5) {
          sendResponse({
            ok: true,
            supported: true,
            companyName: result.companyName,
            description: result.description.slice(0, 100),
          });
        } else {
          sendResponse({
            ok: true,
            supported: false,
            reason: '模型无法返回有效的公司信息，可能不支持知识检索',
          });
        }
      })
      .catch((e) => {
        console.error('[JobGod] TEST_COMPANY_SEARCH error:', e);
        sendResponse({
          ok: false,
          supported: false,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    return true;
  }
  // 持久化缓存相关消息
  if (msg?.type === 'GET_PERSISTENT_CACHE') {
    console.log('[JobGod] Processing GET_PERSISTENT_CACHE');
    (async () => {
      try {
        const { companyName, jobTitle } = msg.payload || {};
        if (!companyName || !jobTitle) {
          sendResponse({ ok: false, error: '缺少参数' });
          return;
        }
        const entry = await getPersistentCacheEntry(companyName, jobTitle);
        sendResponse({ ok: true, entry });
      } catch (e) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'EXPORT_CACHE') {
    console.log('[JobGod] Processing EXPORT_CACHE');
    exportPersistentCache()
      .then((json) => {
        sendResponse({ ok: true, data: json });
      })
      .catch((e) => {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
    return true;
  }
  if (msg?.type === 'IMPORT_CACHE') {
    console.log('[JobGod] Processing IMPORT_CACHE');
    importPersistentCache(msg.payload?.json || '')
      .then((result) => {
        sendResponse(result);
      })
      .catch((e) => {
        sendResponse({ success: false, count: 0, error: e instanceof Error ? e.message : String(e) });
      });
    return true;
  }
  if (msg?.type === 'CLEAR_CACHE') {
    console.log('[JobGod] Processing CLEAR_CACHE');
    clearAllCaches();
    clearPersistentCache()
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((e) => {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
    return true;
  }
  return false;
});
