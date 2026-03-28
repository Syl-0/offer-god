import styles from './zhipin.css?inline';
import { extractJobPayload, findJobDetailAnchors, resolveCardRoot } from '../selectors/zhipin';
import { extractJobFromDetailPage, findDetailMountHost, isJobDetailPage } from '../selectors/zhipinDetail';
import type { JobContext, MatchScoreResult, DeepAdviceResult, MatchAnalysisResult } from '../types/analysis';

const MARK_LIST = 'data-jg-list';
const MARK_DETAIL = 'data-jg-detail';

function ensureGlobalStyle(): void {
  const id = 'jg-style';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = styles;
  (document.head || document.documentElement).appendChild(s);
}

let panel: HTMLDivElement | null = null;
let panelBody: HTMLDivElement | null = null;

function ensurePanel(): { panel: HTMLDivElement; body: HTMLDivElement } {
  if (panel && panelBody) return { panel, body: panelBody };
  ensureGlobalStyle();
  panel = document.createElement('div');
  panel.className = 'jg-root jg-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '深度求职建议');
  panel.innerHTML =
    '<button class="jg-close" type="button" aria-label="关闭">×</button><div class="jg-body"></div>';
  panelBody = panel.querySelector('.jg-body') as HTMLDivElement;
  document.documentElement.appendChild(panel);
  panel.querySelector('.jg-close')?.addEventListener('click', () => {
    panel?.classList.remove('jg-open');
  });
  return { panel, body: panelBody };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function mapError(code: string): string {
  if (code === 'PROFILE_INCOMPLETE') return '请先在扩展设置中上传简历并勾选免责声明。';
  if (code === 'DISABLED') return '你已在设置中关闭本站展示。';
  return code;
}

function renderDeepPanel(job: JobContext, analysis: MatchAnalysisResult, deep: DeepAdviceResult): void {
  const { panel: p, body } = ensurePanel();
  body.innerHTML = `
    <h4>深度求职建议</h4>
    <p class="jg-sub">${job.jobTitle} @ ${job.companyName}</p>
    <section>
      <h4>📋 综合分析</h4>
      <p>${escapeHtml(deep.summary)}</p>
    </section>
    <section>
      <h4>📝 简历优化建议</h4>
      <ul class="jg-list">${deep.resumeTips.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
    </section>
    <section>
      <h4>🎯 面试准备建议</h4>
      <ul class="jg-list">${deep.interviewTips.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
    </section>
    ${
      deep.notes?.length
        ? `<section><h4>⚠️ 注意</h4><ul class="jg-list">${deep.notes.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></section>`
        : ''
    }
  `;
  p.classList.add('jg-open');
}

async function fetchMatch(job: JobContext): Promise<MatchScoreResult> {
  console.log('[JobGod] fetchMatch called for:', job.jobTitle);
  try {
    const res = await chrome.runtime.sendMessage({ type: 'COMPUTE_MATCH', payload: job });
    console.log('[JobGod] fetchMatch response:', res);
    if (!res?.ok) throw new Error(res?.error ?? 'UNKNOWN');
    return res.result as MatchScoreResult;
  } catch (e) {
    console.error('[JobGod] fetchMatch error:', e);
    throw e;
  }
}

async function fetchDeep(job: JobContext, scores: MatchScoreResult): Promise<DeepAdviceResult> {
  console.log('[JobGod] fetchDeep called');
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'GET_DEEP_ADVICE',
      payload: { job, scores },
    });
    console.log('[JobGod] fetchDeep response:', res);
    if (!res?.ok) throw new Error(res?.error ?? 'UNKNOWN');
    return res.result as DeepAdviceResult;
  } catch (e) {
    console.error('[JobGod] fetchDeep error:', e);
    throw e;
  }
}

async function fetchAnalysis(job: JobContext): Promise<{ analysis: MatchAnalysisResult; fromCache: boolean }> {
  console.log('[JobGod] fetchAnalysis called');
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'GET_MATCH_ANALYSIS',
      payload: { job },
    });
    console.log('[JobGod] fetchAnalysis response:', res);
    if (!res?.ok) throw new Error(res?.error ?? 'UNKNOWN');
    return { analysis: res.result as MatchAnalysisResult, fromCache: res.fromCache ?? false };
  } catch (e) {
    console.error('[JobGod] fetchAnalysis error:', e);
    throw e;
  }
}

function renderAnalysisPanel(job: JobContext, analysis: MatchAnalysisResult, fromCache: boolean): void {
  const { panel: p, body } = ensurePanel();
  const sci = analysis.scienceAnalysis;
  const meta = analysis.metaphysicsAnalysis;

  body.innerHTML = `
    <h4>匹配度深度分析 ${fromCache ? '<span style="color:#888;font-size:12px">(已缓存)</span>' : ''}</h4>
    <p class="jg-sub">${job.jobTitle} @ ${job.companyName}</p>

    <section>
      <h4>🧪 科学维度 (${sci.score}分)</h4>
      <p><strong>匹配分析：</strong>${sci.summary}</p>
      ${sci.matchedKeywords.length > 0 ? `<p><strong>匹配关键词：</strong>${sci.matchedKeywords.slice(0, 10).map(k => escapeHtml(k)).join('、')}</p>` : ''}
      ${sci.yourStrengths.length > 0 ? `<p><strong>您的优势：</strong>${sci.yourStrengths.map(k => escapeHtml(k)).join('、')}</p>` : ''}
      ${sci.gaps.length > 0 ? `<p><strong>需加强：</strong>${sci.gaps.slice(0, 5).map(k => escapeHtml(k)).join('、')}</p>` : ''}
    </section>

    <section>
      <h4>🔮 玄学维度 (${meta.score}分)</h4>
      <p><strong>日主：</strong>${meta.dayMaster}${meta.dominantWuxing ? `，五行最旺：${meta.dominantWuxing}` : ''}</p>
      ${meta.jobWuxingTags.length > 0 ? `<p><strong>岗位五行：</strong>${meta.jobWuxingTags.join('、')}</p>` : ''}
      ${meta.wuxingMatch ? `<p><strong>五行匹配：</strong>${escapeHtml(meta.wuxingMatch)}</p>` : ''}
      ${meta.dayunInfluence ? `<p><strong>大运影响：</strong>${escapeHtml(meta.dayunInfluence)}</p>` : ''}
      ${meta.liuYearInfluence ? `<p><strong>流年影响：</strong>${escapeHtml(meta.liuYearInfluence)}</p>` : ''}
      <p><strong>综合：</strong>${escapeHtml(meta.summary)}</p>
    </section>
  `;
  p.classList.add('jg-open');
}

// 用户权重缓存
let cachedWeights = { science: 0.5, metaphysics: 0.5 };

// 加载用户权重设置
async function loadUserWeights(): Promise<{ science: number; metaphysics: number }> {
  try {
    const data = await chrome.storage.local.get(['weights']);
    const weights = data.weights as { science?: number; metaphysics?: number } | undefined;
    cachedWeights = {
      science: Number(weights?.science ?? 0.5),
      metaphysics: Number(weights?.metaphysics ?? 0.5),
    };
    return cachedWeights;
  } catch {
    return cachedWeights;
  }
}

// 计算综合匹配度百分比
function calcCombinedPercent(science: number, metaphysics: number): number {
  const sciW = cachedWeights.science;
  const metaW = cachedWeights.metaphysics;
  const total = sciW + metaW || 1;
  return Math.round((science * sciW + metaphysics * metaW) / total);
}

function createDualRow(): {
  root: HTMLSpanElement;
  setScoresFromAnalysis: (science: number, metaphysics: number) => void;
  getDeepButton: () => HTMLButtonElement;
  getAnalysisButton: () => HTMLButtonElement;
  showDeepLoading: () => void;
  hideDeepLoading: (success?: boolean) => void;
  showAnalysisLoading: () => void;
  hideAnalysisLoading: (success?: boolean) => void;
} {
  const root = document.createElement('span');
  root.className = 'jg-dual-row';
  root.innerHTML = `
    <span class="jg-tag jg-tag-combined" style="display:none" title="综合匹配度"><span class="jg-tag-val">--%</span></span>
    <button type="button" class="jg-analysis-btn">匹配度分析</button>
    <button type="button" class="jg-deep-btn">深度建议</button>
  `;
  const setScoresFromAnalysis = (science: number, metaphysics: number) => {
    const tag = root.querySelector('.jg-tag-combined') as HTMLElement;
    const val = root.querySelector('.jg-tag-combined .jg-tag-val') as HTMLElement;
    const combined = calcCombinedPercent(science, metaphysics);
    if (tag) tag.style.display = 'inline-flex';
    if (val) val.textContent = `${combined}%`;
  };
  const getDeepButton = () => root.querySelector('.jg-deep-btn') as HTMLButtonElement;
  const getAnalysisButton = () => root.querySelector('.jg-analysis-btn') as HTMLButtonElement;
  const showDeepLoading = () => {
    const btn = getDeepButton();
    if (btn) {
      btn.textContent = '分析中...';
      btn.disabled = true;
    }
  };
  const hideDeepLoading = (success?: boolean) => {
    const btn = getDeepButton();
    if (btn) {
      btn.textContent = '深度建议';
      btn.disabled = false;
      if (success === true) {
        btn.classList.add('jg-success');
        setTimeout(() => btn.classList.remove('jg-success'), 2000);
      } else if (success === false) {
        btn.classList.add('jg-error');
        setTimeout(() => btn.classList.remove('jg-error'), 2000);
      }
    }
  };
  const showAnalysisLoading = () => {
    const btn = getAnalysisButton();
    if (btn) {
      btn.textContent = '分析中...';
      btn.disabled = true;
    }
  };
  const hideAnalysisLoading = (success?: boolean) => {
    const btn = getAnalysisButton();
    if (btn) {
      btn.textContent = '匹配度分析';
      btn.disabled = false;
      if (success === true) {
        btn.classList.add('jg-success');
        setTimeout(() => btn.classList.remove('jg-success'), 2000);
      } else if (success === false) {
        btn.classList.add('jg-error');
        setTimeout(() => btn.classList.remove('jg-error'), 2000);
      }
    }
  };
  return { root, setScoresFromAnalysis, getDeepButton, getAnalysisButton, showDeepLoading, hideDeepLoading, showAnalysisLoading, hideAnalysisLoading };
}

function attachDeepHandler(
  btn: HTMLButtonElement,
  getJob: () => JobContext,
  showLoading: () => void,
  hideLoading: (success?: boolean) => void,
): void {
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.disabled = true;
    showLoading();
    try {
      const j = getJob();
      // 先获取匹配分析（如果还没缓存的话会计算）
      const { analysis } = await fetchAnalysis(j);
      const deep = await fetchDeep(j, {
        scienceScore: analysis.scienceAnalysis.score,
        metaphysicsScore: analysis.metaphysicsAnalysis.score,
        combinedPercent: Math.round((analysis.scienceAnalysis.score + analysis.metaphysicsAnalysis.score) / 2),
        cacheKey: '',
        readiness: 'full',
        scienceHint: '',
        metaphysicsHint: '',
      });
      renderDeepPanel(j, analysis, deep);
      hideLoading(true);
    } catch (err) {
      const { panel: p, body } = ensurePanel();
      body.innerHTML = `<p class="jg-err">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
      p.classList.add('jg-open');
      hideLoading(false);
    } finally {
      btn.disabled = false;
    }
  });
}

function attachAnalysisHandler(
  btn: HTMLButtonElement,
  getJob: () => JobContext,
  showLoading: () => void,
  hideLoading: (success?: boolean) => void,
  onScoresLoaded: (science: number, metaphysics: number) => void,
): void {
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.disabled = true;
    showLoading();
    try {
      const j = getJob();
      const { analysis, fromCache } = await fetchAnalysis(j);
      // 更新标签分数
      onScoresLoaded(analysis.scienceAnalysis.score, analysis.metaphysicsAnalysis.score);
      renderAnalysisPanel(j, analysis, fromCache);
      hideLoading(true);
    } catch (err) {
      const { panel: p, body } = ensurePanel();
      body.innerHTML = `<p class="jg-err">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
      p.classList.add('jg-open');
      hideLoading(false);
    } finally {
      btn.disabled = false;
    }
  });
}

const ioMap = new WeakMap<HTMLElement, IntersectionObserver>();

function observeWhenVisible(host: HTMLElement, run: () => void): void {
  if (ioMap.has(host)) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          io.disconnect();
          ioMap.delete(host);
          run();
          break;
        }
      }
    },
    { root: null, rootMargin: '80px', threshold: 0.01 },
  );
  io.observe(host);
  ioMap.set(host, io);
}

function mountListCard(anchor: HTMLAnchorElement): void {
  if (anchor.getAttribute(MARK_LIST) === '1') return;
  anchor.setAttribute(MARK_LIST, '1');

  const getJob = (): JobContext => extractJobPayload(anchor);
  const { root, setScoresFromAnalysis, getDeepButton, getAnalysisButton, showDeepLoading, hideDeepLoading, showAnalysisLoading, hideAnalysisLoading } = createDualRow();

  // 找到卡片容器，将按钮放在右下角
  const card = resolveCardRoot(anchor);
  // 确保卡片容器有定位
  const cardStyle = window.getComputedStyle(card);
  if (cardStyle.position === 'static') {
    card.style.position = 'relative';
  }
  root.classList.add('jg-list-card-actions');
  card.appendChild(root);

  // 加载权重并尝试从持久化缓存获取结果
  const checkCache = async () => {
    await loadUserWeights();
    try {
      const j = getJob();
      // 先尝试持久化缓存
      const cachedResult = await chrome.runtime.sendMessage({
        type: 'GET_PERSISTENT_CACHE',
        payload: { companyName: j.companyName, jobTitle: j.jobTitle },
      });
      if (cachedResult?.ok && cachedResult.entry) {
        const entry = cachedResult.entry;
        setScoresFromAnalysis(entry.scienceScore, entry.metaphysicsScore);
        console.log('[JobGod] mountListCard - persistent cache hit:', j.companyName, j.jobTitle);
      } else {
        // 没有持久化缓存，尝试获取分析结果
        const { analysis, fromCache } = await fetchAnalysis(j);
        if (fromCache) {
          setScoresFromAnalysis(analysis.scienceAnalysis.score, analysis.metaphysicsAnalysis.score);
        }
      }
    } catch {
      // 没有缓存，静默失败
    }
  };

  observeWhenVisible(root, checkCache);
  attachAnalysisHandler(getAnalysisButton(), getJob, showAnalysisLoading, hideAnalysisLoading, setScoresFromAnalysis);
  attachDeepHandler(getDeepButton(), getJob, showDeepLoading, hideDeepLoading);
}

function scanList(): void {
  const anchors = findJobDetailAnchors();
  console.log('[JobGod] Found', anchors.length, 'job detail anchors');
  for (const a of anchors) mountListCard(a);
}

function mountDetailBlock(): void {
  if (document.documentElement.getAttribute(MARK_DETAIL) === '1') return;
  const host = findDetailMountHost();
  if (!host) return;
  document.documentElement.setAttribute(MARK_DETAIL, '1');

  const { root, setScoresFromAnalysis, getDeepButton, getAnalysisButton, showDeepLoading, hideDeepLoading, showAnalysisLoading, hideAnalysisLoading } = createDualRow();

  host.insertAdjacentElement('afterend', root);

  const getJob = (): JobContext => extractJobFromDetailPage();

  // 尝试获取缓存的分析结果
  void (async () => {
    try {
      const j = getJob();
      const { analysis, fromCache } = await fetchAnalysis(j);
      if (fromCache) {
        setScoresFromAnalysis(analysis.scienceAnalysis.score, analysis.metaphysicsAnalysis.score);
      }
    } catch {
      // 没有缓存，静默失败
    }
  })();

  attachAnalysisHandler(getAnalysisButton(), getJob, showAnalysisLoading, hideAnalysisLoading, setScoresFromAnalysis);
  attachDeepHandler(getDeepButton(), getJob, showDeepLoading, hideDeepLoading);
}

const listObs = new MutationObserver(() => {
  window.requestAnimationFrame(() => {
    if (isJobDetailPage()) mountDetailBlock();
    else scanList();
  });
});

function start(): void {
  console.log('[JobGod] Starting content script...');
  ensureGlobalStyle();
  if (isJobDetailPage()) {
    console.log('[JobGod] Detected job detail page');
    mountDetailBlock();
    listObs.observe(document.documentElement, { childList: true, subtree: true });
  } else {
    console.log('[JobGod] Detected list page, scanning...');
    scanList();
    listObs.observe(document.documentElement, { childList: true, subtree: true });
  }
}

chrome.storage.local.get(['disabledOnSite', 'disclaimerAccepted', 'resumeText'], (r) => {
  console.log('[JobGod] Storage state:', {
    disabledOnSite: r.disabledOnSite,
    disclaimerAccepted: r.disclaimerAccepted,
    hasResume: Boolean(r.resumeText && (r.resumeText as string).length > 20),
  });
  if (r.disabledOnSite) {
    console.log('[JobGod] Disabled on site, exiting.');
    return;
  }
  if (!r.disclaimerAccepted) {
    console.log('[JobGod] Disclaimer not accepted, exiting.');
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.disabledOnSite || changes.disclaimerAccepted) {
    location.reload();
  }
});
