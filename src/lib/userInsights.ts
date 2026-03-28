import { djb2Hash } from './hash';
import { computeBaziSummary } from './baziProfile';
import type { UserInsights, UserProfile } from '../types/analysis';

// 985高校名录
const UNIVERSITY_985 = new Set([
  '北京大学', '清华大学', '中国人民大学', '北京师范大学', '北京航空航天大学',
  '北京理工大学', '中国农业大学', '中央民族大学', '南开大学', '天津大学',
  '大连理工大学', '东北大学', '吉林大学', '哈尔滨工业大学', '复旦大学',
  '同济大学', '上海交通大学', '华东师范大学', '南京大学', '东南大学',
  '浙江大学', '中国科学技术大学', '厦门大学', '山东大学', '中国海洋大学',
  '武汉大学', '华中科技大学', '中南大学', '湖南大学', '国防科技大学',
  '中山大学', '华南理工大学', '四川大学', '电子科技大学', '重庆大学',
  '西安交通大学', '西北工业大学', '西北农林科技大学', '兰州大学',
]);

// 211高校名录
const UNIVERSITY_211 = new Set([
  '北京大学', '清华大学', '中国人民大学', '北京师范大学', '北京航空航天大学',
  '北京理工大学', '中国农业大学', '中央民族大学', '北京交通大学', '北京工业大学',
  '北京科技大学', '北京化工大学', '北京邮电大学', '北京林业大学', '北京中医药大学',
  '北京外国语大学', '中国传媒大学', '中央财经大学', '对外经济贸易大学', '中国政法大学',
  '华北电力大学', '中国矿业大学（北京）', '中国石油大学（北京）', '中国地质大学（北京）',
  '北京体育大学', '中央音乐学院', '南开大学', '天津大学', '天津医科大学',
  '河北工业大学', '太原理工大学', '内蒙古大学', '辽宁大学', '大连理工大学',
  '东北大学', '大连海事大学', '吉林大学', '东北师范大学', '延边大学',
  '哈尔滨工业大学', '哈尔滨工程大学', '东北农业大学', '东北林业大学',
  '复旦大学', '同济大学', '上海交通大学', '华东师范大学', '华东理工大学',
  '东华大学', '上海外国语大学', '上海财经大学', '上海大学', '海军军医大学',
  '南京大学', '东南大学', '河海大学', '南京航空航天大学', '南京理工大学',
  '中国矿业大学', '南京农业大学', '南京师范大学', '江南大学', '中国药科大学',
  '苏州大学', '浙江大学', '中国科学技术大学', '合肥工业大学', '安徽大学',
  '厦门大学', '福州大学', '南昌大学', '山东大学', '中国海洋大学',
  '中国石油大学（华东）', '郑州大学', '武汉大学', '华中科技大学', '武汉理工大学',
  '华中师范大学', '华中农业大学', '中南财经政法大学', '中国地质大学（武汉）',
  '湖南大学', '中南大学', '湖南师范大学', '国防科技大学', '中山大学',
  '华南理工大学', '暨南大学', '华南师范大学', '广西大学', '海南大学',
  '重庆大学', '西南大学', '四川大学', '电子科技大学', '西南交通大学',
  '西南财经大学', '四川农业大学', '贵州大学', '云南大学', '西藏大学',
  '西安交通大学', '西北工业大学', '西北大学', '西安电子科技大学', '长安大学',
  '陕西师范大学', '西北农林科技大学', '空军军医大学', '兰州大学', '青海大学',
  '宁夏大学', '新疆大学', '石河子大学',
]);

// 学术/论文相关词汇（不应作为技能关键词）
const ACADEMIC_WORDS = new Set([
  '第一作者', '通讯作者', '合著', '论文', '学术', '会议', '期刊', '发表',
  'chi', 'ieee', 'acm', 'cvpr', 'icml', 'neurips', 'arxiv', 'doi',
  'abstract', 'paper', 'publication', 'citation', 'author',
  '投稿', '录用', '审稿', '参考文献',
]);

// 无意义的常见动词/形容词
const STOP_WORDS = new Set([
  // 中文
  '负责', '参与', '完成', '开发', '设计', '实现', '优化', '进行', '开展',
  '主导', '协助', '管理', '推动', '建立', '制定', '编写', '撰写',
  '能够', '可以', '需要', '要求', '具有', '拥有', '熟悉', '了解',
  '良好', '优秀', '较强', '强烈', '高度', '积极', '主动',
  '工作', '项目', '公司', '团队', '岗位', '职位', '内容', '描述',
  '以上', '如下', '通过', '根据', '按照', '依据',
  // 英文
  'based', 'using', 'via', 'with', 'from', 'into', 'during', 'before',
  'after', 'above', 'below', 'between', 'through', 'during',
  'and', 'or', 'but', 'for', 'nor', 'so', 'yet', 'both', 'either',
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'its',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'experience', 'year', 'years', 'etc', 'eg', 'ie', 'ability',
]);

// 岗位-技能映射（更精确的匹配）
const ROLE_SKILL_MAP: Record<string, {
  keywords: string[];
  industries: string[];
  titles: string[];
  description: string;
}> = {
  'ai_product_manager': {
    keywords: ['ai产品', 'ai产品经理', '产品经理', '产品设计', '用户研究', '需求分析', '原型', 'prd', 'roadmap', 'ai原生', 'ai游戏'],
    industries: ['互联网科技', 'AI/人工智能', '游戏娱乐'],
    titles: ['AI产品经理', '产品经理', '游戏产品经理'],
    description: 'AI产品方向，负责AI原生产品或功能的规划与设计',
  },
  'product_manager': {
    keywords: ['产品经理', '产品设计', '用户研究', '需求分析', '原型设计', 'prd', '用户增长', '数据分析'],
    industries: ['互联网科技', '移动互联网'],
    titles: ['产品经理', '高级产品经理', '产品总监'],
    description: '产品规划、需求分析、用户研究',
  },
  'ai_researcher': {
    keywords: ['机器学习', '深度学习', '算法', '模型训练', '神经网络', '论文', '研究', '科研'],
    industries: ['AI/人工智能', '科研机构', '互联网科技'],
    titles: ['AI研究员', '算法研究员', '研究科学家'],
    description: 'AI算法研究，需要扎实的数学和编程基础',
  },
  'ml_engineer': {
    keywords: ['机器学习', '模型部署', 'tensorflow', 'pytorch', 'cuda', 'gpu', '特征工程', '模型优化'],
    industries: ['AI/人工智能', '互联网科技'],
    titles: ['机器学习工程师', '算法工程师'],
    description: '机器学习模型开发与部署',
  },
  'frontend': {
    keywords: ['前端', 'react', 'vue', 'javascript', 'typescript', 'css', 'html', 'webpack', 'node'],
    industries: ['互联网科技', '软件开发'],
    titles: ['前端工程师', '全栈工程师'],
    description: 'Web前端开发',
  },
  'backend': {
    keywords: ['后端', 'java', 'python', 'golang', '数据库', '微服务', '分布式', 'api设计'],
    industries: ['互联网科技', '软件开发'],
    titles: ['后端工程师', '服务端工程师'],
    description: '服务端开发，系统架构',
  },
  'fullstack': {
    keywords: ['全栈', '前端', '后端', 'react', 'node', 'python', '数据库'],
    industries: ['互联网科技', '软件开发'],
    titles: ['全栈工程师'],
    description: '前后端都能独立完成',
  },
  'vr_developer': {
    keywords: ['vr', 'ar', 'xr', 'unity', 'unreal', '虚拟现实', '增强现实', '元宇宙', 'oculus', 'hololens'],
    industries: ['VR/AR行业', '游戏娱乐', '数字创意'],
    titles: ['VR开发工程师', 'XR开发工程师', 'Unity开发工程师'],
    description: 'VR/AR应用开发',
  },
  'game_developer': {
    keywords: ['游戏开发', 'unity', 'unreal', 'game', '游戏引擎', '游戏策划', '游戏设计'],
    industries: ['游戏行业', '数字娱乐'],
    titles: ['游戏开发工程师', '游戏程序员'],
    description: '游戏软件开发',
  },
  'game_designer': {
    keywords: ['游戏策划', '游戏设计', '关卡设计', '数值策划', '玩法设计', '游戏机制'],
    industries: ['游戏行业', '数字娱乐'],
    titles: ['游戏策划', '游戏设计师', '关卡设计师'],
    description: '游戏玩法与机制设计',
  },
  'ux_designer': {
    keywords: ['ux', 'ui', '用户体验', '交互设计', '用户研究', '原型', 'figma', 'sketch'],
    industries: ['互联网科技', '设计创意'],
    titles: ['UX设计师', '交互设计师', 'UI设计师'],
    description: '用户体验设计',
  },
  'data_analyst': {
    keywords: ['数据分析', 'sql', 'excel', 'bi', '可视化', '报表', '统计', 'python'],
    industries: ['数据分析', '互联网科技'],
    titles: ['数据分析师', '商业分析师'],
    description: '数据分析与商业洞察',
  },
};

// 五行职业对应（更详细）
const WUXING_CAREERS: Record<string, {
  industries: string[];
  roles: string[];
  traits: string;
  detail: string;
}> = {
  '木': {
    industries: ['教育', '文化', '出版', '林业', '服装', '医药', '农业', '环保'],
    roles: ['教师', '培训师', '编辑', '医生', '设计师', '园林师'],
    traits: '成长型、创新型、开拓型',
    detail: '木主生发，适合需要创造力、成长性的行业。木旺之人适合从事教育培养、文化创意、医疗健康等以人为本、注重成长的领域。',
  },
  '火': {
    industries: ['互联网', '电子', '能源', '餐饮', '娱乐', '传媒', '营销', '直播'],
    roles: ['产品经理', '运营', '主播', '营销策划', '电子工程师'],
    traits: '表现型、热情型、传播型',
    detail: '火主光明，适合需要表达、传播、创新的行业。火旺之人适合互联网、传媒营销、电子科技等需要热情和影响力的领域。',
  },
  '土': {
    industries: ['房地产', '建筑', '农业', '仓储', '行政', '人力资源', '顾问', '保险'],
    roles: ['行政经理', 'HR', '项目经理', '建筑设计师', '顾问'],
    traits: '稳定型、管理型、服务型',
    detail: '土主承载，适合需要稳定性、管理能力的行业。土旺之人适合房地产、行政管理、人力资源等需要协调和承载的领域。',
  },
  '金': {
    industries: ['金融', '银行', '法律', '机械', '汽车', '珠宝', '军工', '审计'],
    roles: ['金融分析师', '律师', '审计师', '机械工程师'],
    traits: '决策型、执行型、分析型',
    detail: '金主决断，适合需要决策力、执行力的行业。金旺之人适合金融投资、法律审计、机械制造等需要精准判断的领域。',
  },
  '水': {
    industries: ['物流', '贸易', '旅游', '饮品', '渔业', '咨询', '科研', 'IT软件'],
    roles: ['咨询师', '研究员', '物流经理', '软件工程师', '数据分析师'],
    traits: '流动型、智慧型、沟通型',
    detail: '水主智慧，适合需要灵活性、沟通力的行业。水旺之人适合科研咨询、物流贸易、IT软件等需要智力和灵活应变的领域。',
  },
};

// 十神职业含义
const SHISHEN_CAREER: Record<string, string> = {
  '比肩': '适合独立创业、合伙人模式，有竞争意识',
  '劫财': '适合销售、市场开拓，善于资源整合',
  '食神': '适合创意、艺术、教育，有表达能力',
  '伤官': '适合创新、技术研发、艺术创作，有突破精神',
  '正财': '适合稳定职业、财务管理，踏实可靠',
  '偏财': '适合投资、创业、营销，善于把握机会',
  '正官': '适合管理、公务员、大型企业，有责任感',
  '七杀': '适合挑战性工作、军警、创业，有魄力',
  '正印': '适合教育、研究、医疗，有贵人运',
  '偏印': '适合研究、玄学、特殊技能，有独特见解',
};

function isMeaningfulSkill(word: string): boolean {
  const w = word.toLowerCase();
  if (word.length < 2) return false;
  if (STOP_WORDS.has(w) || STOP_WORDS.has(word)) return false;
  if (ACADEMIC_WORDS.has(w) || ACADEMIC_WORDS.has(word)) return false;
  // 过滤纯数字
  if (/^\d+$/.test(word)) return false;
  // 过滤年份
  if (/^(19|20)\d{2}$/.test(word)) return false;
  return true;
}

/**
 * 智能提取简历中的技能关键词
 * 不使用简单的词频统计，而是基于语义理解
 */
export function extractResumeSignals(resumeText: string, maxKw = 30): string[] {
  const text = resumeText.toLowerCase();
  const keywords: string[] = [];

  // 1. 提取明确的技术栈关键词
  const techPatterns = [
    // 编程语言
    /\b(python|java|javascript|typescript|go|rust|c\+\+|c#|swift|kotlin|ruby|php)\b/gi,
    // AI/ML
    /\b(ai|机器学习|深度学习|神经网络|nlp|cv|计算机视觉|自然语言处理|llm|gpt|transformer|pytorch|tensorflow)\b/gi,
    // 前端
    /\b(react|vue|angular|next\.js|webpack|vite|css|html|typescript)\b/gi,
    // 后端
    /\b(node\.js|django|flask|spring|kubernetes|docker|mysql|postgresql|mongodb|redis)\b/gi,
    // VR/AR/游戏
    /\b(unity|unreal|vr|ar|xr|虚拟现实|增强现实|元宇宙|游戏开发|游戏设计)\b/gi,
    // 产品
    /\b(产品经理|产品设计|用户研究|需求分析|原型设计|prd|roadmap|敏捷|scrum)\b/gi,
    // 设计
    /\b(figma|sketch|photoshop|illustrator|ui|ux|交互设计|视觉设计)\b/gi,
  ];

  for (const pattern of techPatterns) {
    const matches = text.match(pattern) || [];
    for (const m of matches) {
      const normalized = m.toLowerCase();
      if (isMeaningfulSkill(normalized) && !keywords.includes(normalized)) {
        keywords.push(normalized);
      }
    }
  }

  // 2. 提取职位相关词汇
  const rolePatterns = [
    /(产品经理|项目经理|运营经理|技术经理|设计总监|数据分析师|算法工程师|前端工程师|后端工程师|全栈工程师|游戏策划|游戏设计师)/gi,
    /(ai产品经理|游戏产品经理|vr产品经理|数据产品经理)/gi,
  ];

  for (const pattern of rolePatterns) {
    const matches = text.match(pattern) || [];
    for (const m of matches) {
      if (!keywords.includes(m)) {
        keywords.push(m);
      }
    }
  }

  // 3. 提取行业相关词汇
  const industryPatterns = [
    /(互联网|人工智能|ai|游戏|vr|ar|电商|金融|教育|医疗|区块链)/gi,
  ];

  for (const pattern of industryPatterns) {
    const matches = text.match(pattern) || [];
    for (const m of matches) {
      const normalized = m.toLowerCase();
      if (!keywords.includes(normalized) && isMeaningfulSkill(normalized)) {
        keywords.push(normalized);
      }
    }
  }

  return keywords.slice(0, maxKw);
}

/**
 * 提取硬性特质（学历、学校背景等）
 */
function extractHardTraits(resumeText: string): string[] {
  const traits: string[] = [];
  const text = resumeText.toLowerCase();
  const currentYear = new Date().getFullYear();

  // 1. 识别985/211高校
  for (const uni of UNIVERSITY_985) {
    if (text.includes(uni.toLowerCase()) || resumeText.includes(uni)) {
      traits.push(`985院校(${uni})`);
      break; // 只标记一次
    }
  }
  if (traits.length === 0) {
    for (const uni of UNIVERSITY_211) {
      if (text.includes(uni.toLowerCase()) || resumeText.includes(uni)) {
        traits.push(`211院校(${uni})`);
        break;
      }
    }
  }

  // 2. 识别学历
  if (/博士|ph\.?d|博士研究生/.test(text)) {
    traits.push('博士学历');
  } else if (/硕士|研究生|master|硕士研究生/.test(text)) {
    traits.push('硕士学历');
  } else if (/本科|学士|bachelor/.test(text)) {
    traits.push('本科学历');
  }

  // 3. 识别英语水平
  if (/cet-?6|六级|英语六级|ielts|托福|toefl/.test(text)) {
    traits.push('英语六级/雅思/托福');
  } else if (/cet-?4|四级|英语四级/.test(text)) {
    traits.push('英语四级');
  }

  // 4. 智能分析工作年限和毕业时间
  const workExp = analyzeWorkExperience(resumeText);

  // 显示毕业年份（关键信息）
  if (workExp.graduateYear) {
    if (workExp.graduateYear === currentYear || workExp.graduateYear === currentYear + 1) {
      traits.push(`${workExp.graduateYear}届毕业生`);
    } else {
      traits.push(`${workExp.graduateYear}年毕业`);
    }
  }

  // 显示工作年限
  if (workExp.isFreshGraduate) {
    traits.push('应届生');
  } else if (workExp.totalYears > 0) {
    traits.push(`${workExp.totalYears}年工作经验`);
  }

  if (workExp.hasInternship && !workExp.hasFormalWork) {
    traits.push('有实习经验');
  }

  return traits;
}

/**
 * 智能分析工作经历
 */
interface WorkExperienceAnalysis {
  totalYears: number;           // 实际工作年限
  graduateYear: number | null;  // 最新学历毕业年份
  experienceLevel: '应届生' | '1-3年' | '3-5年' | '5-10年' | '10年以上';
  hasInternship: boolean;       // 是否有实习经历
  hasFormalWork: boolean;       // 是否有正式工作经历
  isFreshGraduate: boolean;     // 是否应届生
}

function analyzeWorkExperience(resumeText: string): WorkExperienceAnalysis {
  const currentYear = new Date().getFullYear();
  const text = resumeText;

  // 1. 提取最新学历毕业年份
  const graduateYear = extractLatestGraduateYear(text, currentYear);

  // 2. 提取工作经历时间段
  const workPeriods = extractWorkPeriods(text);

  // 3. 分析实习 vs 正式工作
  let totalFormalYears = 0;
  let hasInternship = false;
  let hasFormalWork = false;

  for (const period of workPeriods) {
    const isIntern = period.isInternship ||
      (graduateYear && period.endYear <= graduateYear && !period.isCurrent);

    if (isIntern) {
      hasInternship = true;
    } else {
      hasFormalWork = true;
      totalFormalYears += period.years;
    }
  }

  // 4. 判断应届生（当年或次年毕业，且无正式工作）
  const isFreshGraduate = graduateYear !== null &&
    (graduateYear === currentYear || graduateYear === currentYear + 1) &&
    !hasFormalWork;

  // 5. 计算工作年限
  // 如果没有明确的工作经历，但有毕业年份，则用当前年份减去毕业年份估算
  if (!hasFormalWork && graduateYear && graduateYear <= currentYear) {
    totalFormalYears = currentYear - graduateYear;
  }

  // 6. 计算工作年限等级
  let experienceLevel: WorkExperienceAnalysis['experienceLevel'];
  if (isFreshGraduate) {
    experienceLevel = '应届生';
  } else if (totalFormalYears < 3) {
    experienceLevel = '1-3年';
  } else if (totalFormalYears < 5) {
    experienceLevel = '3-5年';
  } else if (totalFormalYears < 10) {
    experienceLevel = '5-10年';
  } else {
    experienceLevel = '10年以上';
  }

  return {
    totalYears: Math.round(totalFormalYears),
    graduateYear,
    experienceLevel,
    hasInternship,
    hasFormalWork,
    isFreshGraduate,
  };
}

/**
 * 提取最新学历毕业年份
 */
function extractLatestGraduateYear(text: string, currentYear: number): number | null {
  let latestYear: number | null = null;

  // 1. 匹配时间段模式（如 2020.09-2024.06、2020.09-2024、2020年9月-2024年6月）
  // 按学历优先级：博士 > 硕士 > 本科
  const degreePatterns = [
    /博士[（(]?\s*(\d{4})[.\-年/][^\-]*[-~至]\s*(\d{4})/,
    /博士[（(]?\s*(\d{4})\s*[-~至]\s*(\d{4})/,
    /硕士[（(]?\s*(\d{4})[.\-年/][^\-]*[-~至]\s*(\d{4})/,
    /硕士[（(]?\s*(\d{4})\s*[-~至]\s*(\d{4})/,
    /研究生[（(]?\s*(\d{4})[.\-年/][^\-]*[-~至]\s*(\d{4})/,
    /研究生[（(]?\s*(\d{4})\s*[-~至]\s*(\d{4})/,
    /本科[（(]?\s*(\d{4})[.\-年/][^\-]*[-~至]\s*(\d{4})/,
    /本科[（(]?\s*(\d{4})\s*[-~至]\s*(\d{4})/,
    /大学[（(]?\s*(\d{4})[.\-年/][^\-]*[-~至]\s*(\d{4})/,
    /大学[（(]?\s*(\d{4})\s*[-~至]\s*(\d{4})/,
  ];

  for (const pattern of degreePatterns) {
    const match = text.match(pattern);
    if (match) {
      const endYear = parseInt(match[2]);
      if (endYear >= currentYear - 10 && endYear <= currentYear + 1) {
        latestYear = endYear;
        break;
      }
    }
  }

  // 2. 匹配 XX届 毕业生
  if (!latestYear) {
    const jieMatch = text.match(/(\d{4})\s*届/);
    if (jieMatch) {
      const year = parseInt(jieMatch[1]);
      if (year >= currentYear - 5 && year <= currentYear + 1) {
        latestYear = year;
      }
    }
  }

  // 3. 匹配毕业年份
  if (!latestYear) {
    const gradMatch = text.match(/(?:毕业|毕业于)[：:\s]*(\d{4})/);
    if (gradMatch) {
      const year = parseInt(gradMatch[1]);
      if (year >= currentYear - 10 && year <= currentYear + 1) {
        latestYear = year;
      }
    }
  }

  // 4. 匹配教育经历中的时间段（通用模式）
  if (!latestYear) {
    // 查找教育经历段落
    const eduSectionMatch = text.match(/(?:教育背景|教育经历|学历)[\s\S]{0,500}/i);
    if (eduSectionMatch) {
      const eduSection = eduSectionMatch[0];
      // 匹配时间段
      const periodMatch = eduSection.match(/(\d{4})\s*[.\-年/]\s*(?:0?[1-9]|1[0-2])?\s*[-~至]\s*(\d{4})/);
      if (periodMatch) {
        const endYear = parseInt(periodMatch[2]);
        if (endYear >= currentYear - 10 && endYear <= currentYear + 1) {
          latestYear = endYear;
        }
      }
    }
  }

  return latestYear;
}

/**
 * 工作时间段
 */
interface WorkPeriod {
  startYear: number;
  endYear: number;
  years: number;
  isCurrent: boolean;
  isInternship: boolean;
}

/**
 * 提取工作经历时间段
 */
function extractWorkPeriods(text: string): WorkPeriod[] {
  const periods: WorkPeriod[] = [];
  const currentYear = new Date().getFullYear();

  // 匹配工作时间段的各种格式
  // 2020.06-2023.08, 2020.06-至今, 2020年6月-2023年8月
  const patterns = [
    // 2020.06-2023.08 或 2020/06-2023/08
    /(\d{4})\s*[.\/\-]\s*(?:0?[1-9]|1[0-2])\s*[-~至]\s*(\d{4})\s*[.\/\-]?\s*(?:0?[1-9]|1[0-2])?/g,
    // 2020.06-至今/现在/今
    /(\d{4})\s*[.\/\-]\s*(?:0?[1-9]|1[0-2])\s*[-~至]\s*(?:至今|现在|今|present|current)/gi,
    // 2020年-2023年
    /(\d{4})\s*年\s*[-~至]\s*(\d{4})\s*年?/g,
  ];

  // 提取所有匹配
  const matches = text.matchAll(/(\d{4})\s*[.\/\-年]\s*(?:0?[1-9]|1[0-2])?\s*[-~至]\s*(\d{4}|至今|现在|present)/gi);

  for (const match of matches) {
    const startYear = parseInt(match[1]);
    let endYear: number;
    let isCurrent = false;

    if (/至今|现在|present/i.test(match[2])) {
      endYear = currentYear;
      isCurrent = true;
    } else {
      endYear = parseInt(match[2]);
    }

    // 验证年份合理性
    if (startYear < 1990 || startYear > currentYear || endYear < startYear) {
      continue;
    }

    const years = endYear - startYear + (isCurrent ? 0.5 : 0);

    // 判断是否是实习（通常在工作经历段落中出现"实习"字样）
    const contextStart = Math.max(0, text.indexOf(match[0]) - 100);
    const contextEnd = Math.min(text.length, text.indexOf(match[0]) + match[0].length + 50);
    const context = text.slice(contextStart, contextEnd);
    const isInternship = /实习|intern/i.test(context);

    periods.push({
      startYear,
      endYear,
      years,
      isCurrent,
      isInternship,
    });
  }

  return periods;
}

/**
 * 提取软性特质（技能、项目经验等）
 */
function extractSoftTraits(resumeText: string, keywords: string[]): string[] {
  const traits: string[] = [];
  const text = resumeText.toLowerCase();

  // 1. 根据关键词判断技能方向
  if (/ai|人工智能|机器学习|深度学习|llm|gpt|大模型/.test(text)) {
    traits.push('AI/大模型经验');
  }
  if (/产品经理|产品设计|需求分析|prd/.test(text)) {
    traits.push('产品规划能力');
  }
  if (/项目管理|项目经理|scrum|敏捷/.test(text)) {
    traits.push('项目管理经验');
  }
  if (/创业|联合创始人|合伙人/.test(text)) {
    traits.push('创业经历');
  }
  if (/大厂|bat|字节|阿里|腾讯|美团|京东|百度|微软|谷歌|meta|google|microsoft/.test(text)) {
    traits.push('大厂背景');
  }
  if (/团队管理|带团队|管理.*人|leader|负责人/.test(text)) {
    traits.push('团队管理经验');
  }
  if (/论文|专利|著作|发表|citation/.test(text)) {
    traits.push('学术产出');
  }
  if (/海外|留学|出国|外企|global/.test(text)) {
    traits.push('海外/国际化背景');
  }

  // 2. 根据岗位角色添加特质
  if (keywords.some(k => /产品|product/i.test(k))) {
    if (!traits.includes('产品规划能力')) traits.push('产品经验');
  }
  if (keywords.some(k => /设计|design|ui|ux/i.test(k))) {
    traits.push('设计能力');
  }
  if (keywords.some(k => /前端|后端|开发|工程师/i.test(k))) {
    traits.push('技术开发能力');
  }
  if (keywords.some(k => /数据|分析/i.test(k))) {
    traits.push('数据分析能力');
  }

  return traits.slice(0, 8);
}

/**
 * 基于简历内容匹配合适的岗位
 */
function matchRoles(resumeText: string, keywords: string[]): Array<{
  role: string;
  score: number;
  match: typeof ROLE_SKILL_MAP[string];
}> {
  const text = resumeText.toLowerCase();
  const results: Array<{ role: string; score: number; match: typeof ROLE_SKILL_MAP[string] }> = [];

  for (const [roleKey, roleInfo] of Object.entries(ROLE_SKILL_MAP)) {
    let score = 0;

    // 检查关键词匹配
    for (const kw of roleInfo.keywords) {
      if (text.includes(kw.toLowerCase())) {
        score += 2;
      }
      if (keywords.some(k => k.toLowerCase().includes(kw.toLowerCase()))) {
        score += 1;
      }
    }

    // 检查是否明确表示有过这个职位
    const titlePatterns = roleInfo.titles.map(t => new RegExp(t, 'gi'));
    for (const pattern of titlePatterns) {
      if (pattern.test(text)) {
        score += 5; // 明确的职位匹配加分更高
      }
    }

    if (score > 0) {
      results.push({ role: roleKey, score, match: roleInfo });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * 提取简历中的主要经历（用于总结）
 */
function extractKeyExperiences(resumeText: string): string[] {
  const lines = resumeText.split(/[\n]/);
  const experiences: string[] = [];

  // 查找工作经历段落
  const expPatterns = /(负责|主导|参与|完成|设计|开发|实现|管理|推动)/;
  const avoidPatterns = /(任职要求|岗位职责|职位描述|我们需要|希望你)/;

  for (const line of lines) {
    const trimmed = line.trim();
    // 跳过太短或太长的行
    if (trimmed.length < 15 || trimmed.length > 150) continue;
    // 跳过JD风格的行
    if (avoidPatterns.test(trimmed)) continue;
    // 保留有实质性内容的行
    if (expPatterns.test(trimmed) || /\d{4}/.test(trimmed)) {
      experiences.push(trimmed);
    }
  }

  return experiences.slice(0, 6);
}

export function buildInsightsInputHash(profile: Pick<UserProfile, 'resumeHash' | 'birth'>): string {
  return djb2Hash(`${profile.resumeHash}|${profile.birth ? JSON.stringify(profile.birth) : 'no-birth'}`);
}

/**
 * 生成详细的八字职业分析（完全基于八字，不依赖简历）
 */
function generateBaziCareerDetail(profile: Pick<UserProfile, 'birth'>): string {
  if (!profile.birth) {
    return '未录入出生信息，无法提供玄学维度的职业参考。请在设置中填写出生年月日时。';
  }

  try {
    const bazi = computeBaziSummary(profile.birth);
    const wx = bazi.wuXingPower;

    // 五行排序
    const sortedWx = Object.entries(wx).sort((a, b) => b[1] - a[1]);
    const dominant = sortedWx[0]?.[0] ?? '土';
    const secondary = sortedWx[1]?.[0];

    const parts: string[] = [];

    // ==================== 固定排盘信息 ====================
    parts.push(`【排盘信息】`);
    parts.push(`日主：${bazi.dayMaster}`);
    parts.push(`四柱：${bazi.pillars}`);
    parts.push(`年柱 ${bazi.yearPillar.gan}${bazi.yearPillar.zhi} | 月柱 ${bazi.monthPillar.gan}${bazi.monthPillar.zhi} | 日柱 ${bazi.dayPillar.gan}${bazi.dayPillar.zhi} | 时柱 ${bazi.hourPillar.gan}${bazi.hourPillar.zhi}`);
    if (bazi.birthPlace) {
      parts.push(`出生地：${bazi.birthPlace}`);
    }
    if (bazi.solarTimeCorrection) {
      parts.push(`真太阳时：${bazi.solarTimeCorrection}`);
    }
    if (bazi.correctedTime) {
      parts.push(`校正后时辰：${bazi.correctedTime}`);
    }

    // 五行力量
    const wxDesc = sortedWx.map(([k, v]) => {
      const level = v >= 35 ? '旺' : v >= 25 ? '相' : v >= 15 ? '休' : '弱';
      return `${k}${v}%(${level})`;
    }).join('、');
    parts.push(`【五行力量】${wxDesc}`);

    // 大运流年
    if (bazi.currentDaYun || bazi.currentLiuNian) {
      parts.push(`【运程】`);
      if (bazi.currentDaYun) parts.push(`大运：${bazi.currentDaYun}`);
      if (bazi.currentLiuNian) parts.push(`流年：${bazi.currentLiuNian}`);
    }

    // 喜用神
    if (bazi.xiYongShenHints.length > 0) {
      parts.push(`【喜用神】${bazi.xiYongShenHints.join('；')}`);
    }

    // 起运时间
    if (bazi.yunStart) {
      parts.push(`【起运时间】${bazi.yunStart}`);
    }

    parts.push(''); // 空行分隔

    // ==================== 职业分析（纯八字角度） ====================
    parts.push(`【职业分析】`);

    // 主旺五行分析
    const mainCareer = WUXING_CAREERS[dominant];
    if (mainCareer) {
      parts.push(`五行${dominant}旺，${mainCareer.detail}`);
      parts.push(`适合行业：${mainCareer.industries.join('、')}`);
      parts.push(`适合岗位：${mainCareer.roles.join('、')}等${mainCareer.traits}工作`);
    }

    // 次旺五行
    if (secondary && WUXING_CAREERS[secondary]) {
      const secCareer = WUXING_CAREERS[secondary];
      parts.push(`次旺五行${secondary}，也可考虑${secCareer.industries.slice(0, 3).join('、')}等领域`);
    }

    // 大运影响
    if (bazi.currentDaYunGanZhi) {
      const dyGan = bazi.currentDaYunGanZhi[0];
      const dyWx = GAN_TO_WUXING[dyGan] || '土';
      parts.push(`【大运影响】当前大运${bazi.currentDaYunGanZhi}，天干${dyGan}属${dyWx}`);
      if (WUXING_CAREERS[dyWx]) {
        parts.push(`此运利于${WUXING_CAREERS[dyWx].industries.slice(0, 3).join('、')}领域发展`);
      }
    }

    // 流年影响
    if (bazi.currentLiuNianGanZhi) {
      parts.push(`【流年影响】流年${bazi.currentLiuNianGanZhi}`);
      const yearMatch = bazi.currentLiuNian?.match(/\d{4}/);
      if (yearMatch) {
        const year = parseInt(yearMatch[0]);
        if (year === 2025) {
          parts.push(`乙巳年，乙木生发，巳火得禄，适合创新突破、新项目启动，求职宜选择有成长空间的团队`);
        } else if (year === 2026) {
          parts.push(`丙午年，丙火透出，午火为阳，适合展现能力、争取晋升机会`);
        } else if (year === 2024) {
          parts.push(`甲辰年，甲木参天，辰土蓄水，适合稳中求进、积累资源，求职宜选择有实力的大平台`);
        }
      }
    }

    // 综合建议
    parts.push(`【求职建议】`);
    parts.push(`结合命盘特点，建议优先考虑${mainCareer?.industries.slice(0, 3).join('、') || '适合自己'}领域`);
    parts.push(`面试时可展现${mainCareer?.traits || '自身优势'}方面的特质`);
    parts.push(`命理内容为传统文化语境下的自我参考，不构成命运或录用承诺`);

    return parts.join('\n');
  } catch (e) {
    console.error('[JobGod] Bazi analysis error:', e);
    return '八字分析出错，请检查出生时间是否正确。';
  }
}

// 天干转五行映射
const GAN_TO_WUXING: Record<string, string> = {
  '甲': '木', '乙': '木',
  '丙': '火', '丁': '火',
  '戊': '土', '己': '土',
  '庚': '金', '辛': '金',
  '壬': '水', '癸': '水',
};

export function buildRulesInsights(
  profile: Pick<UserProfile, 'resumeText' | 'birth'>,
  hash: string,
): UserInsights {
  const keywords = extractResumeSignals(profile.resumeText);
  const matchedRoles = matchRoles(profile.resumeText, keywords);
  const experiences = extractKeyExperiences(profile.resumeText);

  // 提取硬性特质和软性特质
  const hardTraits = extractHardTraits(profile.resumeText);
  const softTraits = extractSoftTraits(profile.resumeText, keywords);

  // 构建科学维度总结
  let resumeSummaryLine = '';

  // 硬性特质部分
  if (hardTraits.length > 0) {
    resumeSummaryLine += `【硬性特质】${hardTraits.join('、')}`;
  }

  // 软性特质部分
  if (softTraits.length > 0) {
    resumeSummaryLine += hardTraits.length > 0 ? '；' : '';
    resumeSummaryLine += `【软性特质】${softTraits.join('、')}`;
  }

  resumeSummaryLine += '。';

  // 经历总结
  if (matchedRoles.length > 0) {
    const topRoles = matchedRoles.slice(0, 3);
    const roleNames = topRoles.flatMap(r => r.match.titles.slice(0, 2));
    const industries = [...new Set(topRoles.flatMap(r => r.match.industries))].slice(0, 4);

    resumeSummaryLine += `经历领域：${industries.join('、')}。`;

    if (keywords.length > 0) {
      resumeSummaryLine += `核心技能：${keywords.slice(0, 6).join('、')}。`;
    }

    resumeSummaryLine += `适合岗位：${[...new Set(roleNames)].slice(0, 4).join('、')}.`;

    if (experiences.length > 0) {
      const expText = experiences.slice(0, 2).join('；');
      resumeSummaryLine += ` 主要经历：${expText.slice(0, 150)}`;
    }
  } else {
    // 没有匹配到明确岗位时的处理
    resumeSummaryLine = keywords.length > 0
      ? `根据简历分析，您的技能方向涉及${keywords.slice(0, 8).join('、')}等领域。建议补充更多项目经历和职位信息以获得更精准的岗位匹配。`
      : '简历内容较少，建议补充更多项目经历、技能描述和职位信息。';
  }

  // 玄学维度
  const baziCareerLine = generateBaziCareerDetail(profile);

  return {
    resumeKeywords: keywords,
    resumeSummaryLine,
    baziCareerLine,
    hardTraits,
    softTraits,
    insightsInputHash: hash,
    insightsUpdatedAt: Date.now(),
    source: 'rules',
  };
}
