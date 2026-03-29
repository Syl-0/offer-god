/**
 * 前程无忧平台适配器
 * 支持 51job.com 域名
 * 详情页 URL 格式: https://jobs.51job.com/xxx/xxx.html
 */

import type { PlatformAdapter } from './types';
import type { JobContext } from '../types/analysis';

// ==================== 选择器配置 ====================

const DETAIL_TITLE_SELECTORS = [
  '.job-name',
  '.tHjob h1',
  '.jadd h1',
  '.jtop h1',
  '.job-header h1',
  'h1.job-name',
  'h1.title',
  'h1',
];

const DETAIL_COMPANY_SELECTORS = [
  '.company-name',
  '.cname a',
  '.tHjob .cname',
  '.jadd .cname',
  '.company-name a',
  '.com-info a',
  '[class*="company"] a',
];

const DETAIL_SALARY_SELECTORS = [
  '.job-salary',
  '.tHjob .sal',
  '.jadd .sal',
  '.ltype .sal',
  '[class*="salary"]',
  '.salary',
];

const DETAIL_JD_SELECTORS = [
  '.job-des',
  '.tmsg',
  '.bmsg',
  '.job-desc',
  '.cn',
  '.job-description',
  '[class*="description"]',
  '[class*="detail"]',
];

const DETAIL_COMPANY_INFO_SELECTORS = [
  '.company-box',
  '.tCompany',
  '.com-info',
  '.company-info',
  '.company',
];

const LIST_ANCHOR_SELECTOR = 'a[href*="jobs.51job.com/"]';

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
 * 51job 标题格式: "职位名-公司名招聘-前程无忧"
 */
function parseFromDocTitle(): { jobTitle: string; companyName: string } {
  const docTitle = document.title;
  // 尝试匹配 "职位名-公司名招聘" 或 "职位名_公司名招聘"
  const match = docTitle.match(/(.+?)[-_](.+?)招聘/);
  if (match) {
    return {
      jobTitle: match[1].trim(),
      companyName: match[2].trim(),
    };
  }
  // 回退：取第一个分隔符前的内容
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
  // 1. 首先尝试找到主职位容器（排除推荐区域）
  const mainJobSelectors = ['.tHjob', '.jadd', '.jtop', '.job-header'];

  for (const sel of mainJobSelectors) {
    const elements = document.querySelectorAll(sel);
    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue;
      const rect = el.getBoundingClientRect();
      // 主职位区域通常在页面顶部（Y < 400）
      if (rect.width > 100 && rect.height > 0 && rect.top < 400) {
        return el;
      }
    }
  }

  // 2. 查找职位标题元素
  for (const sel of DETAIL_TITLE_SELECTORS) {
    const elements = document.querySelectorAll(sel);
    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 0 && rect.top < 400) {
        return el;
      }
    }
  }

  // 3. 查找第一个 h1 元素
  const h1Elements = document.querySelectorAll('h1');
  for (const h1 of h1Elements) {
    if (!(h1 instanceof HTMLElement)) continue;
    const rect = h1.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 0 && rect.top < 400) {
      return h1;
    }
  }

  // 4. 最后手段：在主内容区域顶部创建挂载点
  const mountPoint = document.createElement('div');
  mountPoint.className = 'jg-51job-mount';
  mountPoint.style.cssText = 'padding: 12px; margin: 10px 0; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px;';
  const mainContent = document.querySelector('main') || document.querySelector('.main') || document.body;
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
    // 确保是有效的职位详情链接（URL 中包含数字 ID）
    if (!href.match(/jobs\.51job\.com\/[^/]+\/\d+\.html/)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(a);
  }

  return out;
}

function resolveCardRoot(anchor: HTMLAnchorElement): HTMLElement {
  let el: HTMLElement | null = anchor;
  for (let i = 0; i < 8 && el; i++) {
    // 51job 常见的卡片容器类名
    if (el.classList.contains('el') ||
        el.classList.contains('job-item') ||
        el.classList.contains('e') ||
        el.hasAttribute('data-job-id') ||
        el.classList.contains('joblist-item')) {
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

const DETAIL_MOUNT_HOSTS = [
  '.tHjob',
  '.jadd',
  '.jtop',
  '.job-header',
  '.tHeader',
  '.job-title-box',
  '.job_header',
  '[class*="job-header"]',
];

export const job51Adapter: PlatformAdapter = {
  name: '前程无忧',
  hostPattern: /51job\.com$/,
  detailUrlPattern: /jobs\.51job\.com/,

  isDetailPage: () => /jobs\.51job\.com/.test(location.hostname),
  extractFromDetail,
  findDetailMountHost,
  findJobAnchors,
  extractFromCard,
  resolveCardRoot,
};
