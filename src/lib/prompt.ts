import type { JobCardPayload } from '../types/analysis';
import type { BaziSummaryForPrompt } from './baziProfile';

export function buildSystemPrompt(): string {
  return [
    '你是资深职业规划顾问，并熟悉传统命理学表述（仅供文化参考，不构成命运或录用承诺）。',
    '请基于「科学匹配特征」与「八字/大运/流年结构化摘要」撰写专业、克制的分析。',
    '禁止断言吉凶、禁止医疗/法律建议；成功率请用「参考区间」表述。',
    '输出必须是单一 JSON 对象，不要 Markdown，不要代码块。',
    'JSON 字段：scienceAnalysis（字符串）、metaphysicsAnalysis（字符串）、successRateBand（字符串，如「中（参考）」）、actions（字符串数组，3-6 条可执行建议）、riskNotes（字符串数组，0-3 条风险或注意事项）。',
    '不要输出与录用相关的保证性语言。',
  ].join('\n');
}

export function buildUserPrompt(params: {
  job: JobCardPayload;
  resumeSnippet: string;
  baziBlock: string | null;
  scienceScore: number;
  metaphysicsScore: number;
  combinedPercent: number;
}): string {
  const { job, resumeSnippet, baziBlock, scienceScore, metaphysicsScore, combinedPercent } = params;
  return [
    `【职位】${job.jobTitle}`,
    `【公司】${job.companyName}`,
    job.salaryText ? `【薪资展示】${job.salaryText}` : '',
    job.experienceText ? `【经验要求】${job.experienceText}` : '',
    job.educationText ? `【学历要求】${job.educationText}` : '',
    `【JD 片段】${job.jdSnippet.slice(0, 3500)}`,
    '',
    `【简历摘要（已脱敏截断）】\n${resumeSnippet.slice(0, 8000)}`,
    '',
    baziBlock ? `【八字与运势摘要（结构化）】\n${baziBlock}` : '【八字与运势摘要】用户未填写出生信息，请仅从职业规划角度写 metaphysicsAnalysis 为文化性弱提示。',
    '',
    `【本地规则分（0-100，请与之保持一致叙述，勿大幅矛盾）】科学=${scienceScore}，玄学初分=${metaphysicsScore}，综合=${combinedPercent}。`,
  ]
    .filter((x) => x !== '')
    .join('\n');
}

export function fallbackAnalysis(params: {
  scienceScore: number;
  metaphysicsScore: number;
  combinedPercent: number;
  bazi: BaziSummaryForPrompt | null;
}): {
  scienceAnalysis: string;
  metaphysicsAnalysis: string;
  successRateBand: string;
  actions: string[];
  riskNotes: string[];
} {
  const band =
    params.combinedPercent >= 72 ? '中高（参考）' : params.combinedPercent >= 55 ? '中（参考）' : '偏低（参考）';
  return {
    scienceAnalysis: `根据简历关键词与职位描述的文本重叠度，本地科学匹配分约为 ${params.scienceScore}/100。建议你对照 JD 中的硬技能与项目经验，补充简历中的量化成果与关键词对齐。`,
    metaphysicsAnalysis: params.bazi
      ? `基于结构化排盘：当前大运「${params.bazi.currentDaYun ?? '—'}」、流年「${params.bazi.currentLiuNian ?? '—'}」。此为文化语境下的参考叙事，用于自我觉察与节奏安排，不代表结果预测。本地玄学初分约为 ${params.metaphysicsScore}/100。`
      : '未提供出生信息：以下为泛化的节奏建议（非命理断言）。建议关注投递节奏与面试准备，而非依赖运势判断。',
    successRateBand: band,
    actions: [
      '用 3-5 条要点把与岗位最相关的项目写在简历前半部分。',
      '针对该公司业务方向准备 2 个可追问的技术/业务问题。',
      '面试前复盘一段最能体现你方法论的案例（STAR）。',
    ],
    riskNotes: ['插件评分仅供参考，招聘结果以企业与岗位实际情况为准。'],
  };
}
