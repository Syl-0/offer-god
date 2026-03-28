import type { JobContext, MatchScoreResult, UserInsights } from '../types/analysis';
import type { CompanySearchResult } from './companySearch';

export function buildDeepSystemPrompt(): string {
  return [
    '你是资深职业规划与面试策略顾问，熟悉不同公司阶段（初创/成长期/上市）对候选人的期待差异。',
    '输出单一 JSON 对象，不要 Markdown，不要代码块。',
    '',
    '必须包含以下字段：',
    '1. summary（字符串，100-200字）：综合分析，概括岗位匹配度、公司特点、求职策略方向',
    '2. resumeTips（字符串数组，3-5条）：简历优化建议，针对这个岗位如何调整简历内容',
    '3. interviewTips（字符串数组，3-5条）：面试准备建议，具体到这个岗位的面试策略',
    '4. notes（字符串数组，0-3条）：注意事项，需要特别留意的问题',
    '',
    '要求：',
    '- 简历优化建议要具体，比如"在项目经历中突出XX技能的使用"、"调整技能顺序，把XX放在前面"',
    '- 面试准备建议要可执行，比如"准备一个XX项目的STAR案例"、"了解公司的XX业务方向"',
    '- 不要重复解释匹配分数本身',
    '- 不要命理吉凶断言，传统文化语境仅作参考',
  ].join('\n');
}

export function buildDeepUserPrompt(params: {
  job: JobContext;
  userInsights: UserInsights | null;
  scores: Pick<MatchScoreResult, 'scienceScore' | 'metaphysicsScore' | 'combinedPercent'>;
  companySearchResult?: CompanySearchResult | null;
}): string {
  const { job, userInsights, scores, companySearchResult } = params;
  const insightBlock = userInsights
    ? `【用户画像】\n${userInsights.resumeSummaryLine}`
    : '【用户画像】未生成，请基于职位与通用策略建议。';

  // 构建公司介绍部分
  let companyIntro = '';
  if (job.companyIntroSnippet && job.companyIntroSnippet.length > 50) {
    companyIntro = `【公司介绍】\n${job.companyIntroSnippet.slice(0, 1500)}`;
  } else if (companySearchResult && companySearchResult.confidence > 0.5) {
    // 使用搜索结果
    companyIntro = `【公司介绍】（来自网络搜索）\n${companySearchResult.description}`;
    if (companySearchResult.mainBusiness.length > 0) {
      companyIntro += `\n主营业务：${companySearchResult.mainBusiness.join('、')}`;
    }
    if (companySearchResult.industry) {
      companyIntro += `\n所属行业：${companySearchResult.industry}`;
    }
  }

  return [
    insightBlock,
    '',
    `【职位】${job.jobTitle}`,
    `【公司】${job.companyName}`,
    job.companyStage ? `【融资阶段】${job.companyStage}` : '',
    job.employeeScale ? `【公司规模】${job.employeeScale}` : '',
    job.industryLabel ? `【行业】${job.industryLabel}` : '',
    job.salaryText ? `【薪资范围】${job.salaryText}` : '',
    '',
    `【职位描述】\n${(job.jdFull ?? job.jdSnippet).slice(0, 5000)}`,
    '',
    companyIntro,
    '',
    `【匹配参考】科学匹配 ${scores.scienceScore}分，玄学匹配 ${scores.metaphysicsScore}分，综合 ${scores.combinedPercent}分`,
    '',
    '请针对这个具体岗位，给出简历优化和面试准备的具体建议。',
  ]
    .filter((x) => x !== '')
    .join('\n');
}

export function fallbackDeepAdvice(job: JobContext): {
  summary: string;
  resumeTips: string[];
  interviewTips: string[];
  notes: string[];
} {
  const startup = /初创|天使|种子|早期|A轮|未融资|0-20人|20-99人/.test(
    `${job.companyStage ?? ''}${job.employeeScale ?? ''}${job.jdSnippet}`,
  );

  return {
    summary: `${job.companyName}招聘${job.jobTitle}，公司处于${startup ? '初创/成长阶段' : '成熟发展阶段'}。根据岗位要求，建议重点突出相关项目经验和技术能力。${startup ? '初创团队更看重综合能力和执行力。' : '成熟企业更看重专业深度和团队协作。'}`,
    resumeTips: [
      '在项目经历中突出与该岗位相关的技术栈和业务场景',
      '量化项目成果，用具体数据说明贡献（如性能提升X%、用户增长Y%）',
      '调整技能关键词顺序，把JD中强调的技能放在显眼位置',
      startup ? '增加独立负责项目的经历描述' : '强调跨部门协作和流程优化的经验',
    ],
    interviewTips: [
      '准备2-3个STAR案例，说明如何解决复杂问题和达成目标',
      '提前了解公司主营业务和行业趋势，准备相关问题',
      startup ? '准备说明如何在资源有限的情况下推进项目' : '准备说明如何在规范流程下保证质量和效率',
      '梳理自己的职业规划，说明为什么选择这家公司和这个岗位',
    ],
    notes: [
      '以上为通用建议；配置模型API后可获得更个性化的深度建议',
    ],
  };
}
