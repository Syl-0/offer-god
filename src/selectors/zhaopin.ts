/**
 * 智联招聘平台适配器
 * 支持 zhaopin.com 域名
 *
 * TODO: 需要填充实际的选择器
 */

import type { PlatformAdapter } from './types';
import type { JobContext } from '../types/analysis';

// ==================== 选择器配置（需要填充） ====================

const DETAIL_TITLE_SELECTORS = [
  '.job-info h1',
  '.summaryplane__title',
  'h1',
];

const DETAIL_COMPANY_SELECTORS = [
  '.company-info a',
  '.summaryplane__company',
  '.company-name',
];

const DETAIL_SALARY_SELECTORS = [
  '.job-info .salary',
  '.summaryplane__salary',
  '.itemwarn',
];

const DETAIL_JD_SELECTORS = [
  '.job-description',
  '.describtion__detail-content',
  '.job-detail',
];

const DETAIL_COMPANY_INFO_SELECTORS = [
  '.company-box',
  '.company__base-detail',
];

const DETAIL_MOUNT_HOSTS = [
  '.job-info',
  '.summaryplane',
  '.job__summary',
];

const LIST_ANCHOR_SELECTOR = 'a[href*="/jobdetail/"]';

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

// ==================== 详情页逻辑 ====================

function extractFromDetail(): JobContext {
  const jobUrl = `${location.origin}${location.pathname}`.split('?')[0] ?? location.href;

  const title = pickText(DETAIL_TITLE_SELECTORS);
  const companyName = pickText(DETAIL_COMPANY_SELECTORS);
  const salaryText = pickText(DETAIL_SALARY_SELECTORS);
  const jdBlock = pickText(DETAIL_JD_SELECTORS);
  const companyInfo = pickText(DETAIL_COMPANY_INFO_SELECTORS);

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
  for (const sel of DETAIL_MOUNT_HOSTS) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

// ==================== 列表页逻辑 ====================

function findJobAnchors(root: ParentNode = document): HTMLAnchorElement[] {
  const list = Array.from(root.querySelectorAll<HTMLAnchorElement>(LIST_ANCHOR_SELECTOR));
  const seen = new Set<string>();
  const out: HTMLAnchorElement[] = [];

  for (const a of list) {
    const href = a.href.split('?')[0] ?? a.href;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(a);
  }

  return out;
}

function resolveCardRoot(anchor: HTMLAnchorElement): HTMLElement {
  let el: HTMLElement | null = anchor;
  for (let i = 0; i < 8 && el; i++) {
    if (el.classList.contains('job-item') || el.classList.contains('positionlist__item')) return el;
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

export const zhaopinAdapter: PlatformAdapter = {
  name: '智联招聘',
  hostPattern: /zhaopin\.com$/,
  detailUrlPattern: /\/jobdetail\//,

  isDetailPage: () => /\/jobdetail\//.test(location.pathname),
  extractFromDetail,
  findDetailMountHost,
  findJobAnchors,
  extractFromCard,
  resolveCardRoot,
};
