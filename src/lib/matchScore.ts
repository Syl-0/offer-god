import type { BaziSummaryForPrompt } from './baziProfile';
import type { JobContext, UserInsights, MatchAnalysisResult } from '../types/analysis';

const STOP = new Set(
  '的 了 和 与 或 及 在 是 有 为 以 及 等 中 对 一个 工作 负责 相关 经验 优先 熟悉 了解 掌握 使用 能力 团队 沟通 项目 公司 岗位 职位 任职 要求 任职 资格 描述 内容 我们 需要 以上 如下'
    .split(/\s+/),
);

function tokenize(text: string): Set<string> {
  const s = text.toLowerCase();
  const words = s.split(/[^\u4e00-\u9fff_a-z0-9+#./]+/i).filter((w) => w.length > 1);
  const out = new Set<string>();
  for (const w of words) {
    if (STOP.has(w)) continue;
    out.add(w);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter++;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function resumeTokenSet(resumeText: string, insights: UserInsights | null): Set<string> {
  const A = tokenize(resumeText);
  if (insights?.resumeKeywords?.length) {
    for (const k of insights.resumeKeywords) {
      if (k.length > 1) A.add(k.toLowerCase());
    }
  }
  return A;
}

/** 获取匹配的关键词 */
function getMatchedKeywords(resumeTokens: Set<string>, jdText: string): string[] {
  const jdTokens = tokenize(jdText);
  const matched: string[] = [];
  for (const t of resumeTokens) {
    if (jdTokens.has(t)) matched.push(t);
  }
  return matched.slice(0, 20);
}

/** 从JD中提取岗位要求关键词 */
function extractJobRequirements(jdText: string): string[] {
  const patterns = [
    /熟悉|掌握|精通|了解|具备|熟练|有.*经验/gi,
    /python|java|javascript|typescript|react|vue|node|go|rust|c\+\+/gi,
    /ai|机器学习|深度学习|算法|数据分析|产品设计|项目管理/gi,
    /本科|硕士|博士|学历|学位/gi,
    /\d+年|\d+-\d+年|经验/gi,
  ];
  const requirements: Set<string> = new Set();
  for (const p of patterns) {
    const matches = jdText.match(p) || [];
    for (const m of matches) {
      requirements.add(m);
    }
  }
  return [...requirements].slice(0, 15);
}

/** 0–100：简历与职位上下文重叠 + 关键词增强 */
export function computeScienceScore(
  resumeText: string,
  job: JobContext,
  userInsights: UserInsights | null,
): number {
  const jdParts = [
    job.jobTitle,
    job.companyName,
    job.jdFull ?? job.jdSnippet,
    job.salaryText ?? '',
    job.experienceText ?? '',
    job.educationText ?? '',
    job.industryLabel ?? '',
    job.companyStage ?? '',
    job.employeeScale ?? '',
    job.companyIntroSnippet ?? '',
  ];
  const jd = jdParts.join('\n');
  const A = resumeTokenSet(resumeText, userInsights);
  const B = tokenize(jd);
  const jac = jaccard(A, B);
  let score = Math.round(100 * Math.min(1, jac * 3.5));

  const titleHits = tokenize(job.jobTitle);
  let extra = 0;
  for (const t of titleHits) {
    if (A.has(t)) extra += 3;
  }
  score = Math.min(100, score + Math.min(15, extra));

  // 列表页信息不足时大幅降低分数，提示用户去详情页
  if (job.readiness === 'partial') {
    score = Math.max(5, Math.round(score * 0.5) - 5);
  }

  // 移除保底分数逻辑，让分数更真实
  return Math.max(0, score);
}

/** 判断是否应该显示匹配度（列表页信息不足时不显示） */
export function shouldShowScore(job: JobContext): boolean {
  // 详情页或JD内容足够时显示
  if (job.readiness === 'full') return true;
  if ((job.jdFull ?? job.jdSnippet).length > 200) return true;
  // 列表页但有足够的标签信息
  if (job.industryLabel && job.industryLabel.length > 20) return true;
  return false;
}

/** 行业/职位象意 → 五行标签（极简规则，供初值与 LLM 约束） */
const INDUSTRY_WUXING: { re: RegExp; wx: keyof BaziSummaryForPrompt['wuXingPower'] }[] = [
  { re: /互联网|软件|算法|数据|AI|人工智能|前端|后端|开发|测试|运维|IT/g, wx: '金' },
  { re: /教育|培训|老师|教研|课程/g, wx: '木' },
  { re: /能源|电力|餐饮|酒店|文化|传媒|直播|市场|品牌|广告/g, wx: '火' },
  { re: /金融|银行|投资|地产|建筑|物流|供应链|实|制造/g, wx: '土' },
  { re: /医疗|医药|生物|健康|护理/g, wx: '水' },
];

export function inferJobWxTags(job: JobContext): string[] {
  const blob = `${job.jobTitle} ${job.jdSnippet} ${job.jdFull ?? ''} ${job.companyName} ${job.industryLabel ?? ''} ${job.companyIntroSnippet ?? ''} ${job.companyStage ?? ''}`;
  const tags: string[] = [];
  for (const { re, wx } of INDUSTRY_WUXING) {
    re.lastIndex = 0;
    if (re.test(blob)) tags.push(wx);
  }
  if (/初创|天使|种子|早期|0-20人|融资/.test(blob)) tags.push('火');
  return tags.length ? [...new Set(tags)] : ['土'];
}

/** 结合日主五行与岗位象意，给玄学初分 0–100（非预测，仅作结构化参考） */
export function computeMetaphysicsInitial(
  bazi: BaziSummaryForPrompt | null,
  job: JobContext,
): number {
  const tags = inferJobWxTags(job);
  if (!bazi) {
    return 50 + Math.min(25, tags.length * 5);
  }

  const power = bazi.wuXingPower;
  const day = bazi.dayMaster;
  const dayWx = guessWuXingForGan(day);
  let base = 50;

  for (const wx of tags) {
    const p = power[wx] ?? 0;
    const rel = relate(dayWx, wx as '木' | '火' | '土' | '金' | '水');
    base += rel * 8 + Math.min(12, Math.round(p / 10));
  }

  if (bazi.currentLiuNian?.includes('冲') || bazi.xiYongShenHints.some((h) => h.includes('忌'))) {
    base -= 3;
  }

  if (job.readiness === 'partial') {
    base = Math.max(5, base - 4);
  }

  return Math.max(5, Math.min(95, Math.round(base)));
}

const GAN_WX: Record<string, '木' | '火' | '土' | '金' | '水'> = {
  甲: '木',
  乙: '木',
  丙: '火',
  丁: '火',
  戊: '土',
  己: '土',
  庚: '金',
  辛: '金',
  壬: '水',
  癸: '水',
};

function guessWuXingForGan(gan: string): '木' | '火' | '土' | '金' | '水' {
  return GAN_WX[gan] ?? '土';
}

/** 生克关系粗评分：同我、生我为正 */
const cycle: ('木' | '火' | '土' | '金' | '水')[] = ['木', '火', '土', '金', '水'];

function relate(a: '木' | '火' | '土' | '金' | '水', b: '木' | '火' | '土' | '金' | '水'): number {
  if (a === b) return 1;
  const ia = cycle.indexOf(a);
  const ib = cycle.indexOf(b);
  if (ib === (ia + 1) % 5) return 0.5; // 我生
  if (ia === (ib + 1) % 5) return -0.3; // 我克
  if (ib === (ia + 4) % 5) return 0.4; // 生我
  if (ia === (ib + 4) % 5) return -0.2; // 克我
  return 0;
}

export function combineWeighted(
  science: number,
  metaphysics: number,
  w: { science: number; metaphysics: number },
): number {
  const s = w.science + w.metaphysics;
  const ns = s === 0 ? 0.5 : w.science / s;
  const nm = s === 0 ? 0.5 : w.metaphysics / s;
  return Math.round(science * ns + metaphysics * nm);
}

export function shortScienceHint(score: number, readiness: 'full' | 'partial'): string {
  if (readiness === 'partial') {
    return '列表信息有限，请进入职位详情页查看准确匹配度';
  }
  return `科学匹配约 ${score}/100`;
}

export function shortMetaphysicsHint(score: number, hasBazi: boolean): string {
  if (!hasBazi) return `文化参考维度约 ${score}/100（未排盘）`;
  return `文化参考维度约 ${score}/100（已结合大运流年象意）`;
}

/** 生成匹配度深度分析 */
export function generateMatchAnalysis(
  resumeText: string,
  job: JobContext,
  userInsights: UserInsights | null,
  bazi: BaziSummaryForPrompt | null,
  scienceScore: number,
  metaphysicsScore: number,
): MatchAnalysisResult {
  // 科学维度分析
  const jdText = [job.jobTitle, job.jdFull ?? job.jdSnippet, job.industryLabel ?? ''].join('\n');
  const resumeTokens = resumeTokenSet(resumeText, userInsights);
  const matchedKeywords = getMatchedKeywords(resumeTokens, jdText);
  const jobRequirements = extractJobRequirements(jdText);

  // 找出简历中有但JD中没有的关键词（优势）
  const resumeKeywords = userInsights?.resumeKeywords || [];
  const yourStrengths = resumeKeywords.filter(k =>
    jdText.toLowerCase().includes(k.toLowerCase())
  ).slice(0, 10);

  // 找出JD中有但简历中没有的关键词（差距）
  const gaps: string[] = [];
  for (const req of jobRequirements) {
    if (!resumeText.toLowerCase().includes(req.toLowerCase()) && req.length > 1) {
      gaps.push(req);
    }
  }

  // 玄学维度分析
  const jobWxTags = inferJobWxTags(job);
  const dayWx = bazi ? guessWuXingForGan(bazi.dayMaster) : '土';
  const sortedWx = bazi ? Object.entries(bazi.wuXingPower).sort((a, b) => b[1] - a[1]) : [];
  const dominantWuxing = sortedWx[0]?.[0] ?? '土';

  // 五行匹配说明
  let wuxingMatch = '';
  if (bazi) {
    const relations: string[] = [];
    for (const tag of jobWxTags) {
      const rel = relate(dayWx, tag as '木' | '火' | '土' | '金' | '水');
      if (rel > 0) {
        relations.push(`岗位属${tag}，与日主${dayWx}相合，为有利`);
      } else if (rel < 0) {
        relations.push(`岗位属${tag}，与日主${dayWx}相克，需注意`);
      } else {
        relations.push(`岗位属${tag}，与日主${dayWx}中和`);
      }
    }
    wuxingMatch = relations.join('；') || '岗位五行属性待分析';
  } else {
    wuxingMatch = '未录入出生信息，无法进行五行匹配分析';
  }

  // 大运影响
  let dayunInfluence = '未提供大运信息';
  if (bazi?.currentDaYun) {
    const dyGan = bazi.currentDaYun[0];
    const dyWx = guessWuXingForGan(dyGan);
    dayunInfluence = `当前大运${bazi.currentDaYun}，天干${dyGan}属${dyWx}`;
    if (jobWxTags.includes(dyWx)) {
      dayunInfluence += '，与岗位五行相合，此运利于求职';
    }
  }

  // 流年影响
  let liuYearInfluence = '未提供流年信息';
  if (bazi?.currentLiuNian) {
    liuYearInfluence = `流年${bazi.currentLiuNian}，`;
    const yearMatch = bazi.currentLiuNian.match(/\d{4}/);
    if (yearMatch) {
      const year = parseInt(yearMatch[0]);
      if (year === 2025) {
        liuYearInfluence += '乙巳年，乙木生发，巳火得禄，适合创新突破';
      } else if (year === 2024) {
        liuYearInfluence += '甲辰年，甲木参天，辰土蓄水，适合稳中求进';
      } else {
        liuYearInfluence += '可根据流年干支判断吉凶';
      }
    }
  }

  return {
    scienceAnalysis: {
      score: scienceScore,
      matchedKeywords,
      missingKeywords: gaps.slice(0, 10),
      jobRequirements: jobRequirements.slice(0, 10),
      yourStrengths: yourStrengths.slice(0, 8),
      gaps: gaps.slice(0, 8),
      summary: scienceScore >= 60
        ? `您的技能与岗位要求匹配度较高，特别是在${matchedKeywords.slice(0, 5).join('、')}等方面。`
        : scienceScore >= 30
          ? `您的技能与岗位有部分匹配，建议加强${gaps.slice(0, 3).join('、')}等方面的能力。`
          : `您的技能与岗位匹配度较低，建议关注岗位核心要求${jobRequirements.slice(0, 5).join('、')}。`,
    },
    metaphysicsAnalysis: {
      score: metaphysicsScore,
      dayMaster: bazi?.dayMaster ?? '未知',
      dominantWuxing,
      jobWuxingTags: jobWxTags,
      wuxingMatch,
      dayunInfluence,
      liuYearInfluence,
      summary: metaphysicsScore >= 60
        ? `玄学维度匹配较好，${wuxingMatch.slice(0, 50)}`
        : metaphysicsScore >= 40
          ? `玄学维度中等，${wuxingMatch.slice(0, 50)}`
          : `玄学维度匹配一般，可结合个人情况参考。`,
    },
  };
}
