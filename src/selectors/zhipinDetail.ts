import type { JobContext } from '../types/analysis';

export const ZHIPIN_DETAIL_SELECTOR_VERSION = 1;

export function isJobDetailPage(): boolean {
  return /\/job_detail\//.test(location.pathname);
}

function pickText(selectors: string[], root: ParentNode = document): string {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    const t = el?.textContent?.trim();
    if (t) return t;
  }
  return '';
}

function firstMatch(re: RegExp, text: string): string | undefined {
  const m = text.match(re);
  return m?.[0]?.trim();
}

/** 从页面 script / 全局变量尝试取职位 JSON（失败返回 null） */
export function tryExtractJobFromPageState(): Partial<JobContext> | null {
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

/**
 * 职位详情页：抓取标题、JD、侧栏公司信息（选择器需随站更新）
 */
export function extractJobFromDetailPage(): JobContext {
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
  const companyStage =
    firstMatch(
      /未融资|天使轮|A轮|B轮|C轮|D轮|已上市|不需要融资|战略融资|股权融资|Pre-[A-Z]轮/g,
      blob,
    ) || undefined;
  const employeeScale =
    firstMatch(/\d+-\d+人|10000人以上|1000-9999人|500-999人|150-500人|50-150人|0-20人/g, blob) ||
    undefined;

  const industryLabel =
    pickText(['.sider-company .company-tag a', '.company-tag-list', '.industry']) || undefined;

  const companyIntroSnippet =
    pickText(['.sider-company .company-desc', '.company-desc', '.job-detail-company .fold-text']) ||
    companySider.slice(0, 1200);

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

/** 在详情页挂载标签的锚点（标题行附近） */
export function findDetailMountHost(): HTMLElement | null {
  const candidates = [
    '.job-info .name',
    '.job-banner .name',
    '.info-primary .name',
    '.job-box .job-info',
    '.job-detail-header',
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) return el;
  }
  return document.querySelector('.job-info') as HTMLElement | null;
}
