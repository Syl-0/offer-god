/**
 * BOSS 直聘平台适配器
 * 支持 zhipin.com 域名
 */

import type { PlatformAdapter } from './types';
import type { JobContext } from '../types/analysis';

// ==================== 选择器配置 ====================

const TITLE_SELECTORS = ['.job-name', '.job-title', '[class*="job-name"]', 'span.job-name'];
const COMPANY_SELECTORS = ['.company-name', '.name a', '[class*="company-name"]'];
const SALARY_SELECTORS = ['.salary', '.job-limit .red', '[class*="salary"]'];
const TAG_SELECTORS = ['.tags span', '.tag-list span', '.job-card-footer span'];

const DETAIL_MOUNT_HOSTS = [
  '.job-info .name',
  '.job-banner .name',
  '.info-primary .name',
  '.job-box .job-info',
  '.job-detail-header',
  '.job-info',
];

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

function firstMatch(re: RegExp, text: string): string | undefined {
  const m = text.match(re);
  return m?.[0]?.trim();
}

// ==================== 详情页逻辑 ====================

function tryExtractJobFromPageState(): Partial<JobContext> | null {
  try {
    const w = window as unknown as { __INITIAL_STATE__?: { job?: { job?: Record<string, unknown> } } };
    const job = w.__INITIAL_STATE__?.job?.job;
    if (job && typeof job === 'object') {
      const name = String(job.name ?? job.jobName ?? '');
      const brand = String(job.brandName ?? '');
      const jd = String(job.postDescription ?? job.description ?? '');
      if (name || jd) {
        return {
          jobTitle: name,
          companyName: brand,
          jdFull: jd,
          jdSnippet: jd.slice(0, 8000),
        };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function extractFromDetail(): JobContext {
  const jobUrl = `${location.origin}${location.pathname}`.split('?')[0] ?? location.href;
  const state = tryExtractJobFromPageState();

  const title =
    state?.jobTitle ||
    pickText([
      '.job-info .name h1',
      '.job-info .name',
      '.job-banner .name',
      '.info-primary .name',
      'h1.name',
      '.job-name',
    ]);

  const companyName =
    state?.companyName ||
    pickText([
      '.company-info .name',
      '.sider-company .company-name',
      'a.company-name',
      '.company .name',
    ]);

  const jdBlock =
    state?.jdFull ||
    pickText([
      '.job-sec-text',
      '.job-detail .job-sec-text',
      '.detail-text',
      '[ka="detail"] .job-sec-text',
    ]);

  const companySider = pickText(['.sider-company', '.company-info', 'aside .company-card']);
  const blob = `${companySider}\n${title}\n${companyName}`;

  const companyStage = firstMatch(/未融资|天使轮|A轮|B轮|C轮|D轮|已上市|不需要融资|战略融资|股权融资|Pre-[A-Z]轮/g, blob) || undefined;
  const employeeScale = firstMatch(/\d+-\d+人|10000人以上|1000-9999人|500-999人|150-500人|50-150人|0-20人/g, blob) || undefined;
  const industryLabel = pickText(['.sider-company .company-tag a', '.company-tag-list', '.industry']) || undefined;
  const companyIntroSnippet = pickText(['.sider-company .company-desc', '.company-desc', '.job-detail-company .fold-text']) || companySider.slice(0, 1200);

  const salaryText = pickText(['.job-info .salary', '.job-banner .salary', '.salary']);
  const expEd = pickText(['.job-info .job-limit', '.job-banner .job-limit']);

  let experienceText: string | undefined;
  let educationText: string | undefined;
  if (expEd) {
    const parts = expEd.split(/\s+/);
    experienceText = parts.find((p) => /年|经验|应届|实习/.test(p)) ?? expEd;
    educationText = parts.find((p) => /本科|硕士|博士|大专|学历/.test(p));
  }

  const jdFull = (state?.jdFull || jdBlock || document.body.innerText || '').slice(0, 12000);
  const jdSnippet = jdFull.slice(0, 6000);
  const readiness: 'full' | 'partial' = jdFull.length > 400 ? 'full' : 'partial';

  return {
    jobUrl,
    jobTitle: (title || document.title || '职位').slice(0, 200),
    companyName: (companyName || '公司').slice(0, 120),
    jdSnippet,
    jdFull: jdFull.length > 0 ? jdFull : undefined,
    salaryText: salaryText || undefined,
    experienceText,
    educationText,
    source: 'detail',
    readiness,
    companyStage,
    employeeScale,
    industryLabel: industryLabel || undefined,
    companyIntroSnippet: companyIntroSnippet?.slice(0, 2000),
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
  const list = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/job_detail/"]'));
  const seen = new Set<string>();
  const out: HTMLAnchorElement[] = [];

  for (const a of list) {
    const href = a.href.split('?')[0] ?? a.href;
    if (seen.has(href)) continue;
    seen.add(href);
    if (href.includes('/job_detail/')) out.push(a);
  }

  return out;
}

function resolveCardRoot(anchor: HTMLAnchorElement): HTMLElement {
  let el: HTMLElement | null = anchor;
  for (let i = 0; i < 8 && el; i++) {
    if (el.classList.toString().includes('job-card')) return el;
    if (el.getAttribute('data-job-id')) return el;
    el = el.parentElement;
  }
  return anchor.parentElement ?? anchor;
}

function pickTags(card: HTMLElement): string {
  const parts: string[] = [];
  for (const sel of TAG_SELECTORS) {
    card.querySelectorAll(sel).forEach((n) => {
      const t = n.textContent?.trim();
      if (t) parts.push(t);
    });
  }
  return [...new Set(parts)].join(' ');
}

function extractFromCard(anchor: HTMLAnchorElement): JobContext {
  const card = resolveCardRoot(anchor);
  const jobUrl = anchor.href.split('?')[0] ?? anchor.href;
  const jobTitle = anchor.textContent?.trim() || pickTextFromElement(card, TITLE_SELECTORS) || document.title;
  const companyName = pickTextFromElement(card, COMPANY_SELECTORS) || pickTextFromElement(card.closest('li') ?? card, COMPANY_SELECTORS);
  const salaryText = pickTextFromElement(card, SALARY_SELECTORS) || undefined;
  const tags = pickTags(card);
  const industryLabel = tags ? tags.slice(0, 200) : undefined;
  const jdSnippet = `${jobTitle}\n${companyName}\n${tags}\n${card.innerText ?? ''}`.slice(0, 6000);

  return {
    jobUrl,
    jobTitle: jobTitle.slice(0, 200),
    companyName: companyName.slice(0, 120),
    jdSnippet,
    salaryText,
    source: 'list',
    readiness: 'partial',
    industryLabel,
    companyIntroSnippet: undefined,
    jdFull: undefined,
    companyStage: undefined,
    employeeScale: undefined,
  };
}

// ==================== 适配器导出 ====================

export const zhipinAdapter: PlatformAdapter = {
  name: 'BOSS直聘',
  hostPattern: /zhipin\.com$/,
  detailUrlPattern: /\/job_detail\//,

  isDetailPage: () => /\/job_detail\//.test(location.pathname),
  extractFromDetail,
  findDetailMountHost,
  findJobAnchors,
  extractFromCard,
  resolveCardRoot,
};
