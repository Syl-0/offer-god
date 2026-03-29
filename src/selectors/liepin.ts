/**
 * 猎聘平台适配器
 * 支持 liepin.com 域名
 * 详情页 URL 格式: https://www.liepin.com/job/xxx.shtml
 */

import type { PlatformAdapter } from './types';
import type { JobContext } from '../types/analysis';

// ==================== 选择器配置 ====================

const DETAIL_TITLE_SELECTORS = [
  '.job-title',
  '.title-info h1',
  '.job-title-left',
  '.job-detail-title',
  '[class*="job-title"]',
  '.sojob-title h1',
  'h1',
];

const DETAIL_COMPANY_SELECTORS = [
  '.company-name',
  '.company-name-link',
  '.name a',
  '.employer-info h2',
  '[class*="company-name"]',
  '.company a',
  '.ccompany-name',
];

const DETAIL_SALARY_SELECTORS = [
  '.job-salary',
  '.text-warning',
  '.salary',
  '[class*="salary"]',
  '.job-main-title .salary',
];

const DETAIL_JD_SELECTORS = [
  '.job-description',
  '.content',
  '.job-detail-content',
  '.job-item .content',
  '[class*="description"]',
  '.job-desc',
];

const DETAIL_COMPANY_INFO_SELECTORS = [
  '.company-info',
  '.sojob-item-company',
  '.company-sidebar',
  '.company-box',
];

const DETAIL_MOUNT_HOSTS = [
  '.title-info',
  '.job-header',
  '.sojob-title',
  '.job-title-box',
  '.job-detail-header',
  '[class*="job-header"]',
  '.job-main-title',
];

const LIST_ANCHOR_SELECTOR = 'a[href*="/job/"][href$=".shtml"]';

// ==================== 工具函数 ====================

function pickText(selectors: string[], root: ParentNode = document): string {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    const t = el?.textContent?.trim();
    if (t) return t;
  }
  return '';
}

function pickTextFromElement(el: Element | null, selectors: string[]): string {
  if (!el) return '';
  for (const sel of selectors) {
    const n = el.querySelector(sel);
    if (n?.textContent?.trim()) return n.textContent.trim();
  }
  return el.textContent?.trim() ?? '';
}

/**
 * 从页面标题解析职位和公司名
 * 猎聘标题格式: "职位名-公司名-猎聘"
 */
function parseFromDocTitle(): { jobTitle: string; companyName: string } {
  const docTitle = document.title;
  // 尝试匹配 "职位名-公司名-猎聘"
  const match = docTitle.match(/(.+?)[-_|](.+?)[-_|]猎聘/);
  if (match) {
    return {
      jobTitle: match[1].trim(),
      companyName: match[2].trim(),
    };
  }
  // 回退：取前两个部分
  const parts = docTitle.split(/[-_|]/);
  return {
    jobTitle: parts[0]?.trim() || '',
    companyName: parts[1]?.trim() || '',
  };
}

// ==================== 详情页逻辑 ====================

function extractFromDetail(): JobContext {
  const jobUrl = `${location.origin}${location.pathname}`.split('?')[0] ?? location.href;

  let title = pickText(DETAIL_TITLE_SELECTORS);
  let companyName = pickText(DETAIL_COMPANY_SELECTORS);
  const salaryText = pickText(DETAIL_SALARY_SELECTORS);
  const jdBlock = pickText(DETAIL_JD_SELECTORS);
  const companyInfo = pickText(DETAIL_COMPANY_INFO_SELECTORS);

  // 如果选择器没找到，从页面标题解析
  if (!title || !companyName) {
    const parsed = parseFromDocTitle();
    title = title || parsed.jobTitle;
    companyName = companyName || parsed.companyName;
  }

  const jdFull = (jdBlock || document.body.innerText || '').slice(0, 12000);
  const jdSnippet = jdFull.slice(0, 6000);
  const readiness: 'full' | 'partial' = jdFull.length > 400 ? 'full' : 'partial';

  return {
    jobUrl,
    jobTitle: (title || document.title || '职位').slice(0, 200),
    companyName: (companyName || '公司').slice(0, 120),
    jdSnippet,
    jdFull: jdFull.length > 0 ? jdFull : undefined,
    salaryText: salaryText || undefined,
    source: 'detail',
    readiness,
    companyIntroSnippet: companyInfo?.slice(0, 2000),
  };
}

function findDetailMountHost(): HTMLElement | null {
  // 猎聘详情页主要结构：
  // 主职位区域通常在 .job-detail-info 或 .job-summary 中
  // 推荐职位区域通常在 .recommend-jobs 或类似的侧边栏

  // 1. 首先尝试找到主职位容器（排除推荐区域）
  const mainJobSelectors = [
    '.job-detail-info .job-title-box',
    '.job-summary .job-title-box',
    '.sojob-main .job-title-box',
    '.job-main .job-title-box',
    '.detail-content .job-title-box',
  ];

  for (const sel of mainJobSelectors) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 0) {
        return el;
      }
    }
  }

  // 2. 如果精确选择器没找到，尝试找所有 .job-title-box，选择位置最靠前且最大的
  const allTitleBoxes = document.querySelectorAll('.job-title-box');
  if (allTitleBoxes.length > 0) {
    let bestElement: HTMLElement | null = null;
    let minY = Infinity;

    for (const el of allTitleBoxes) {
      if (!(el instanceof HTMLElement)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 0 && rect.top > 0) {
        if (rect.top < minY && rect.top < 500) {
          minY = rect.top;
          bestElement = el;
        }
      }
    }

    if (bestElement) return bestElement;
  }

  // 3. 尝试查找职位标题 h1
  const h1 = document.querySelector('h1');
  if (h1 instanceof HTMLElement) {
    const rect = h1.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 0 && rect.top < 500) {
      return h1;
    }
  }

  // 4. 尝试查找薪资区域
  const salarySelectors = ['.job-salary', '.text-warning', '[class*="salary"]'];
  for (const sel of salarySelectors) {
    const elements = document.querySelectorAll(sel);
    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.top < 500) {
        return el;
      }
    }
  }

  // 5. 最后手段：在主内容区域顶部创建挂载点
  const mountPoint = document.createElement('div');
  mountPoint.className = 'jg-liepin-mount';
  mountPoint.style.cssText = 'padding: 12px; margin: 10px 0; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px;';
  const mainContent = document.querySelector('main') || document.querySelector('.main-content') || document.body;
  mainContent.insertBefore(mountPoint, mainContent.firstChild);
  return mountPoint;
}

// ==================== 列表页逻辑 ====================

function findJobAnchors(root: ParentNode = document): HTMLAnchorElement[] {
  const list = Array.from(root.querySelectorAll<HTMLAnchorElement>(LIST_ANCHOR_SELECTOR));
  const seen = new Set<string>();
  const out: HTMLAnchorElement[] = [];

  for (const a of list) {
    const href = a.href.split('?')[0] ?? a.href;
    // 确保是有效的职位详情链接
    if (!href.match(/\/job\/\d+\.shtml/)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(a);
  }

  return out;
}

function resolveCardRoot(anchor: HTMLAnchorElement): HTMLElement {
  let el: HTMLElement | null = anchor;
  for (let i = 0; i < 8 && el; i++) {
    // 猎聘常见的卡片容器类名
    if (el.classList.contains('sojob-item') ||
        el.classList.contains('job-item') ||
        el.classList.contains('job-card') ||
        el.hasAttribute('data-job-id') ||
        el.classList.contains('list-item')) {
      return el;
    }
    el = el.parentElement;
  }
  return anchor.parentElement ?? anchor;
}

function extractFromCard(anchor: HTMLAnchorElement): JobContext {
  const card = resolveCardRoot(anchor);
  const jobUrl = anchor.href.split('?')[0] ?? anchor.href;
  const jobTitle = anchor.textContent?.trim() || pickTextFromElement(card, DETAIL_TITLE_SELECTORS) || document.title;
  const companyName = pickTextFromElement(card, DETAIL_COMPANY_SELECTORS);
  const salaryText = pickTextFromElement(card, DETAIL_SALARY_SELECTORS) || undefined;
  const jdSnippet = `${jobTitle}\n${companyName}\n${card.innerText ?? ''}`.slice(0, 6000);

  return {
    jobUrl,
    jobTitle: jobTitle.slice(0, 200),
    companyName: companyName.slice(0, 120),
    jdSnippet,
    salaryText,
    source: 'list',
    readiness: 'partial',
  };
}

// ==================== 适配器导出 ====================

export const liepinAdapter: PlatformAdapter = {
  name: '猎聘',
  hostPattern: /liepin\.com$/,
  detailUrlPattern: /\/job\/.*\.shtml$/,

  isDetailPage: () => /\/job\/.*\.shtml$/.test(location.pathname),
  extractFromDetail,
  findDetailMountHost,
  findJobAnchors,
  extractFromCard,
  resolveCardRoot,
};
