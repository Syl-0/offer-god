import type { BaziSummaryForPrompt } from './baziProfile';
import type { JobContext, UserInsights, MatchAnalysisResult, LlmConfig } from '../types/analysis';
import { searchCompanyInfo, type CompanySearchResult } from './companySearch';

export interface LlmMatchAnalysisResult extends MatchAnalysisResult {
  scienceScore: number;
  metaphysicsScore: number;
}

export interface LlmMatchAnalysisPayload {
  job: JobContext;
  userInsights: UserInsights | null;
  bazi: BaziSummaryForPrompt | null;
  llm: LlmConfig;
}

interface JobRequirements {
  hardRequirements: string[];   // 硬性要求（必须满足）
  softRequirements: string[];   // 软性要求（加分项）
  niceToHave: string[];         // 加分项
  dealBreakers: string[];       // 一票否决项
}

/**
 * 第一步：让LLM分析岗位，提取硬性要求和软性要求
 */
async function analyzeJobRequirements(job: JobContext, llm: LlmConfig): Promise<JobRequirements> {
  // 如果公司介绍不足，尝试搜索公司信息
  let companyInfo = job.companyIntroSnippet || '';
  if ((!companyInfo || companyInfo.length < 100) && job.companyName) {
    try {
      const searchResult = await searchCompanyInfo(job.companyName, llm);
      if (searchResult && searchResult.confidence > 0.5) {
        companyInfo = searchResult.description;
        if (searchResult.mainBusiness.length > 0) {
          companyInfo += `\n主营：${searchResult.mainBusiness.join('、')}`;
        }
        if (searchResult.industry) {
          companyInfo += `\n行业：${searchResult.industry}`;
        }
      }
    } catch (e) {
      console.error('[JobGod] Company search failed:', e);
    }
  }

  const jdInfo = [
    `【岗位名称】${job.jobTitle}`,
    `【公司名称】${job.companyName}`,
    job.salaryText ? `【薪资范围】${job.salaryText}` : '',
    job.experienceText ? `【经验要求】${job.experienceText}` : '',
    job.educationText ? `【学历要求】${job.educationText}` : '',
    job.industryLabel ? `【行业标签】${job.industryLabel}` : '',
    job.companyStage ? `【公司阶段】${job.companyStage}` : '',
    job.employeeScale ? `【公司规模】${job.employeeScale}` : '',
    companyInfo ? `【公司介绍】${companyInfo}` : '',
    `【职位描述】`,
    job.jdFull || job.jdSnippet || '暂无详细描述',
  ].filter(Boolean).join('\n');

  const systemPrompt = `你是一位资深的HR和招聘专家，擅长分析岗位需求。

请分析以下岗位信息，提取出岗位要求，分为四类：

1. hardRequirements（硬性要求）：必须满足的条件，不满足则无法胜任
   - 如：必须会的编程语言、必须的工作年限、必须的学历
   - 例如：["本科及以上学历", "3年以上产品经验", "熟悉AI产品"]

2. softRequirements（软性要求）：重要但可商榷的条件
   - 如：优先有某行业经验、熟悉某些工具
   - 例如：["有AI行业经验优先", "有大厂背景优先"]

3. niceToHave（加分项）：有则更好，没有也行
   - 例如：["有创业经验", "有团队管理经验"]

4. dealBreakers（一票否决项）：绝对不能有的情况
   - 例如：["无相关经验", "学历不符硬性要求"]

输出JSON格式：
{
  "hardRequirements": ["..."],
  "softRequirements": ["..."],
  "niceToHave": ["..."],
  "dealBreakers": ["..."]
}

注意：
- 不要把JD里的废话如"熟悉、了解、具备"当作要求
- 要理解岗位的核心职责，提取真正重要的要求
- AI产品经理岗位的核心是"产品经理经验"+"AI相关经验"，不要把"熟悉"当成硬性要求`;

  const userPrompt = `请分析以下岗位的要求：\n\n${jdInfo}`;

  const response = await callLlm(llm, systemPrompt, userPrompt, 800);
  const parsed = parseJsonObject(response);

  return {
    hardRequirements: Array.isArray(parsed.hardRequirements) ? parsed.hardRequirements.map(String).slice(0, 10) : [],
    softRequirements: Array.isArray(parsed.softRequirements) ? parsed.softRequirements.map(String).slice(0, 8) : [],
    niceToHave: Array.isArray(parsed.niceToHave) ? parsed.niceToHave.map(String).slice(0, 5) : [],
    dealBreakers: Array.isArray(parsed.dealBreakers) ? parsed.dealBreakers.map(String).slice(0, 5) : [],
  };
}

/**
 * 第二步：让LLM对比用户画像与岗位要求，给出匹配分数和分析
 */
async function evaluateUserJobMatch(
  job: JobContext,
  requirements: JobRequirements,
  userInsights: UserInsights | null,
  bazi: BaziSummaryForPrompt | null,
  llm: LlmConfig,
): Promise<LlmMatchAnalysisResult> {
  const jdInfo = [
    `【岗位名称】${job.jobTitle}`,
    `【公司名称】${job.companyName}`,
    job.industryLabel ? `【行业】${job.industryLabel}` : '',
  ].filter(Boolean).join('\n');

  // 用户技能画像
  const userSkills = userInsights?.resumeKeywords?.slice(0, 15).join('、') || '暂无';
  const userSummary = userInsights?.resumeSummaryLine || '暂无简历信息';

  // 八字信息
  let baziInfo = '未提供八字信息';
  if (bazi) {
    const sortedWx = Object.entries(bazi.wuXingPower).sort((a, b) => b[1] - a[1]);
    const wxDesc = sortedWx.map(([k, v]) => {
      const level = v >= 35 ? '旺' : v >= 25 ? '相' : v >= 15 ? '休' : '弱';
      return `${k}${v}%(${level})`;
    }).join('、');

    baziInfo = [
      `日主：${bazi.dayMaster}`,
      `五行力量：${wxDesc}`,
      bazi.currentDaYun ? `当前大运：${bazi.currentDaYun}` : '',
      bazi.currentLiuNian ? `流年：${bazi.currentLiuNian}` : '',
      bazi.xiYongShenHints.length > 0 ? `喜用神：${bazi.xiYongShenHints.join('；')}` : '',
    ].filter(Boolean).join('\n');
  }

  const systemPrompt = `你是一位资深的职业规划顾问，同时精通中国传统命理文化。

你已获得岗位的硬性要求和软性要求，现在需要：
1. 对比用户画像与岗位要求，给出科学维度的匹配分数
2. 结合用户八字，给出玄学维度的匹配分析

## 科学维度打分规则：
- 如果用户的经历完全匹配岗位硬性要求：70-85分
- 如果用户的经历匹配且超出硬性要求：85-100分
- 如果用户部分匹配硬性要求：40-70分
- 如果用户完全不匹配硬性要求：0-40分
- 软性要求和加分项可以额外加分（最多+10分）

重要：严格按照用户画像和岗位要求的实际内容进行分析，不要臆造或添加任何画像和JD中没有的信息！

## 玄学维度分析规则：
- 分析岗位所属五行（根据行业和职位判断）
- 分析日主与岗位五行的生克关系
- 结合大运流年判断求职运势
- 要给出具体的分析，不能泛泛而谈

输出JSON格式，只输出JSON，不要有其他文字：
{
  "scienceScore": 数字,
  "metaphysicsScore": 数字,
  "scienceAnalysis": {
    "matchedSkills": ["从用户画像中提取的实际匹配的技能"],
    "gaps": ["根据岗位要求分析的实际差距，如果都满足可以为空数组"],
    "summary": "基于用户画像和岗位要求的分析"
  },
  "metaphysicsAnalysis": {
    "dayMaster": "日主",
    "jobWuxing": ["岗位五行"],
    "wuxingRelation": "五行关系分析",
    "dayunInfluence": "大运影响",
    "summary": "玄学维度分析总结"
  }
}`;

  const userPrompt = `## 岗位信息
${jdInfo}

## 岗位要求分析
硬性要求：${requirements.hardRequirements.join('、') || '无特殊硬性要求'}
软性要求：${requirements.softRequirements.join('、') || '无'}
加分项：${requirements.niceToHave.join('、') || '无'}
一票否决：${requirements.dealBreakers.join('、') || '无'}

## 用户画像
核心技能：${userSkills}
职业总结：${userSummary}

## 用户八字信息
${baziInfo}

请给出匹配度分析：`;

  const response = await callLlm(llm, systemPrompt, userPrompt, 1200);
  const parsed = parseJsonObject(response);

  const scienceScore = Math.min(100, Math.max(0, Number(parsed.scienceScore) || 50));
  const metaphysicsScore = Math.min(100, Math.max(0, Number(parsed.metaphysicsScore) || 50));

  return {
    scienceScore,
    metaphysicsScore,
    scienceAnalysis: {
      score: scienceScore,
      matchedKeywords: Array.isArray(parsed.scienceAnalysis?.matchedSkills)
        ? parsed.scienceAnalysis.matchedSkills.map(String).slice(0, 8)
        : [],
      missingKeywords: Array.isArray(parsed.scienceAnalysis?.gaps)
        ? parsed.scienceAnalysis.gaps.map(String).slice(0, 5)
        : [],
      jobRequirements: [...requirements.hardRequirements, ...requirements.softRequirements].slice(0, 10),
      yourStrengths: Array.isArray(parsed.scienceAnalysis?.matchedSkills)
        ? parsed.scienceAnalysis.matchedSkills.map(String).slice(0, 5)
        : [],
      gaps: Array.isArray(parsed.scienceAnalysis?.gaps)
        ? parsed.scienceAnalysis.gaps.map(String).slice(0, 5)
        : [],
      summary: String(parsed.scienceAnalysis?.summary || '').slice(0, 500),
    },
    metaphysicsAnalysis: {
      score: metaphysicsScore,
      dayMaster: String(parsed.metaphysicsAnalysis?.dayMaster || bazi?.dayMaster || '未知'),
      dominantWuxing: '',
      jobWuxingTags: Array.isArray(parsed.metaphysicsAnalysis?.jobWuxing)
        ? parsed.metaphysicsAnalysis.jobWuxing.map(String)
        : [],
      wuxingMatch: String(parsed.metaphysicsAnalysis?.wuxingRelation || ''),
      dayunInfluence: String(parsed.metaphysicsAnalysis?.dayunInfluence || ''),
      liuYearInfluence: '',
      summary: String(parsed.metaphysicsAnalysis?.summary || '').slice(0, 500),
    },
  };
}

/**
 * 使用LLM进行深度匹配分析（两步法）
 */
export async function callLlmForMatchAnalysis(payload: LlmMatchAnalysisPayload): Promise<LlmMatchAnalysisResult> {
  const { job, userInsights, bazi, llm } = payload;

  // 第一步：分析岗位要求
  const requirements = await analyzeJobRequirements(job, llm);

  // 第二步：评估用户与岗位的匹配度
  const result = await evaluateUserJobMatch(job, requirements, userInsights, bazi, llm);

  return result;
}

async function callLlm(llm: LlmConfig, system: string, user: string, maxTokens = 900): Promise<string> {
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
    temperature: 0.3,
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

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const block = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = block ? block[1]!.trim() : trimmed;
  return JSON.parse(raw) as Record<string, unknown>;
}
