/** 列表/详情统一职位上下文（在 JobCardPayload 基础上扩展） */
export interface JobCardPayload {
  jobUrl: string;
  jobTitle: string;
  companyName: string;
  jdSnippet: string;
  salaryText?: string;
  experienceText?: string;
  educationText?: string;
}

export interface JobContext extends JobCardPayload {
  source: 'list' | 'detail';
  /** full：详情页已抓到较长 JD/公司信息；partial：列表卡片信息有限 */
  readiness: 'full' | 'partial';
  companyStage?: string;
  employeeScale?: string;
  industryLabel?: string;
  companyIntroSnippet?: string;
  /** 详情页优先；与 jdSnippet 并存供计分合并 */
  jdFull?: string;
}

/** 预生成用户画像（简历+八字），用于匹配增强与深度建议，避免每次塞全文简历 */
export interface UserInsights {
  resumeKeywords: string[];
  resumeSummaryLine: string;
  baziCareerLine: string;
  /** 硬性特质（学历、学校背景等） */
  hardTraits: string[];
  /** 软性特质（技能、经验等） */
  softTraits: string[];
  insightsInputHash: string;
  insightsUpdatedAt: number;
  source: 'llm' | 'rules';
}

export interface MatchScoreResult {
  cacheKey: string;
  scienceScore: number;
  metaphysicsScore: number;
  combinedPercent: number;
  readiness: 'full' | 'partial';
  /** 极短本地说明，无 LLM */
  scienceHint: string;
  metaphysicsHint: string;
}

/** 匹配度深度分析结果 */
export interface MatchAnalysisResult {
  scienceAnalysis: {
    score: number;
    matchedKeywords: string[];
    missingKeywords: string[];
    jobRequirements: string[];
    yourStrengths: string[];
    gaps: string[];
    summary: string;
  };
  metaphysicsAnalysis: {
    score: number;
    dayMaster: string;
    dominantWuxing: string;
    jobWuxingTags: string[];
    wuxingMatch: string;
    dayunInfluence: string;
    liuYearInfluence: string;
    summary: string;
  };
}

export interface DeepAdviceResult {
  summary: string;
  resumeTips: string[];
  interviewTips: string[];
  notes: string[];
  rawText?: string;
}

/** @deprecated 保留兼容；深度面板改用 DeepAdviceResult + MatchScoreResult */
export interface AnalyzeResult {
  cacheKey: string;
  scienceScore: number;
  metaphysicsScore: number;
  combinedPercent: number;
  scienceAnalysis: string;
  metaphysicsAnalysis: string;
  successRateBand: string;
  actions: string[];
  riskNotes: string[];
  rawModelJson?: unknown;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface UserProfile {
  resumeText: string;
  resumeHash: string;
  birth: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    /** 1 男 0 女（与 mystilight 约定一致） */
    gender: 0 | 1;
    sect: 1 | 2;
    yunSect: 1 | 2;
    /** 出生地（用于真太阳时校正） */
    birthPlace?: {
      province: string;
      city: string;
    };
  } | null;
  weights: { science: number; metaphysics: number };
  llm: LlmConfig | null;
  disabledOnSite: boolean;
  disclaimerAccepted: boolean;
}
