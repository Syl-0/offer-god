/** BOSS 直聘 DOM 策略：多版本选择器 + 宽松降级（站点改版时需更新） */
import type { JobContext } from '../types/analysis';

export const ZHIPIN_SELECTOR_VERSION = 1;

const TITLE_SELECTORS = ['.job-name', '.job-title', '[class*="job-name"]', 'span.job-name'];
const COMPANY_SELECTORS = ['.company-name', '.name a', '[class*="company-name"]'];
const SALARY_SELECTORS = ['.salary', '.job-limit .red', '[class*="salary"]'];
const TAG_SELECTORS = ['.tags span', '.tag-list span', '.job-card-footer span'];

export function findJobDetailAnchors(root: ParentNode = document): HTMLAnchorElement[] {
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

export function pickText(el: Element | null, selectors: string[]): string {
  if (!el) return '';
  for (const sel of selectors) {
    const n = el.querySelector(sel);
    if (n?.textContent?.trim()) return n.textContent.trim();
  }
  return el.textContent?.trim() ?? '';
}

export function resolveCardRoot(anchor: HTMLAnchorElement): HTMLElement {
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

export function extractJobPayload(anchor: HTMLAnchorElement): JobContext {
  const card = resolveCardRoot(anchor);
  const jobUrl = anchor.href.split('?')[0] ?? anchor.href;
  const jobTitle =
    anchor.textContent?.trim() ||
    pickText(card, TITLE_SELECTORS) ||
    document.title;

  const companyName = pickText(card, COMPANY_SELECTORS) || pickText(card.closest('li') ?? card, COMPANY_SELECTORS);
  const salaryText = pickText(card, SALARY_SELECTORS) || undefined;
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
