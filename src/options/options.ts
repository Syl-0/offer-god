import './options.css';
import { extractTextFromPdfArrayBuffer, setPdfWorkerUrl, summarizeResume } from '../lib/pdfResume';
import { djb2Hash } from '../lib/hash';
import { LLM_PRESETS, getPresetByBaseUrl } from '../lib/llmPresets';
import type { LlmConfig, UserInsights, UserProfile } from '../types/analysis';

const app = document.getElementById('app')!;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function load(): Promise<Partial<UserProfile>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        'resumeText',
        'resumeHash',
        'birth',
        'weights',
        'llm',
        'disabledOnSite',
        'disclaimerAccepted',
      ],
      (r) => resolve(r as Partial<UserProfile>),
    );
  });
}

function showProgress(container: HTMLElement, message: string, percent: number): void {
  const bar = container.querySelector('.progress-bar') as HTMLElement | null;
  const text = container.querySelector('.progress-text') as HTMLElement | null;
  if (bar) bar.style.width = `${percent}%`;
  if (text) text.textContent = `${message} (${percent}%)`;
}

function createProgressHtml(): string {
  return `
    <div class="progress-container">
      <div class="progress-track">
        <div class="progress-bar" style="width: 0%"></div>
      </div>
      <p class="progress-text">准备中... (0%)</p>
    </div>
  `;
}

// 省份列表（简化版）
const PROVINCES = [
  '北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南',
  '广东', '广西', '海南', '四川', '贵州', '云南', '西藏', '陕西', '甘肃',
  '青海', '宁夏', '新疆', '内蒙古', '香港', '澳门', '台湾', '海外',
];

async function render(): Promise<void> {
  try {
    const s = await load();
    const extra = await new Promise<Record<string, unknown>>((resolve) => {
      chrome.storage.local.get(['userInsights'], (items) => resolve(items as Record<string, unknown>));
    });
    const ui = extra.userInsights as UserInsights | undefined;
    const insightLine = ui
      ? `画像：${ui.source === 'llm' ? '模型生成' : '规则生成'} · ${new Date(ui.insightsUpdatedAt).toLocaleString()}`
      : '画像：保存简历并勾选免责声明后将自动生成';
    const weights = s.weights ?? { science: 0.5, metaphysics: 0.5 };
    const llm = s.llm ?? { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' };
    const birth = s.birth;

    // 匹配当前 LLM 预设
    const currentPreset = getPresetByBaseUrl(llm.baseUrl) || LLM_PRESETS[LLM_PRESETS.length - 1]; // 默认自定义
    const presetOptions = LLM_PRESETS.map(p =>
      `<option value="${p.id}" ${p.id === currentPreset.id ? 'selected' : ''}>${p.name}</option>`
    ).join('');
    const modelOptions = currentPreset.models.length > 0
      ? currentPreset.models.map(m =>
          `<option value="${m}" ${m === llm.model ? 'selected' : ''}>${m}</option>`
        ).join('')
      : `<option value="${escapeAttr(llm.model)}">${escapeHtml(llm.model) || '请输入模型名'}</option>`;

    // 出生地选项
    const provinceOptions = PROVINCES.map(p =>
      `<option value="${p}" ${birth?.birthPlace?.province === p ? 'selected' : ''}>${p}</option>`
    ).join('');

    // 构建用户画像显示区域
    let profileDisplayHtml = '';
    if (ui) {
      const scienceKeywords = ui.resumeKeywords.slice(0, 15).map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join(' ');

      // 硬性特质
      const hardTraitsHtml = (ui.hardTraits || []).map(t => `<span class="trait-tag trait-hard">${escapeHtml(t)}</span>`).join(' ');
      // 软性特质
      const softTraitsHtml = (ui.softTraits || []).map(t => `<span class="trait-tag trait-soft">${escapeHtml(t)}</span>`).join(' ');

      // 玄学画像按换行分割，保留完整段落
      const baziParagraphs = ui.baziCareerLine.split('\n').filter(l => l.trim()).map(l => {
        const line = l.trim();
        // 标题行（如【排盘信息】）用高亮样式
        if (line.startsWith('【') && line.endsWith('】')) {
          return `<h4 class="bazi-title">${escapeHtml(line)}</h4>`;
        }
        return `<p>${escapeHtml(line)}</p>`;
      }).join('');

      profileDisplayHtml = `
        <div class="profile-section">
          <h3>🧪 科学维度</h3>
          ${hardTraitsHtml ? `<div class="traits-block"><span class="traits-label">硬性特质：</span>${hardTraitsHtml}</div>` : ''}
          ${softTraitsHtml ? `<div class="traits-block"><span class="traits-label">软性特质：</span>${softTraitsHtml}</div>` : ''}
          <p class="profile-desc">${escapeHtml(ui.resumeSummaryLine)}</p>
          <div class="keywords">${scienceKeywords || '<span class="note">暂无关键词</span>'}</div>
        </div>
        <div class="profile-section">
          <h3>🔮 玄学维度</h3>
          <div class="bazi-content">${baziParagraphs || `<p class="note">${escapeHtml(ui.baziCareerLine)}</p>`}</div>
          <p class="note">${birth ? '以上为基于八字命盘的分析参考' : '未录入出生信息，请填写出生年月日时'}</p>
        </div>
      `;
    } else {
      profileDisplayHtml = '<p class="note">上传简历并勾选免责声明后，将自动生成用户画像</p>';
    }

    app.innerHTML = `
      <h1>Offer 来了 — BOSS 直聘求职助手</h1>
      <div class="copyright-notice">
        <p><strong>📜 权限声明</strong></p>
        <p>本插件完全开源免费，禁止商用。解释权归作者所有。如有发现付费出售，请举报。</p>
        <p>作者邮箱：<a href="mailto:fujiaying7@gmail.com">fujiaying7@gmail.com</a></p>
      </div>
      <p class="note">
        本扩展仅在本地解析简历与八字信息，向模型发送的是<strong>脱敏摘要</strong>。命理内容为传统文化语境下的自我参考，不构成命运或录用承诺。
      </p>

      <section>
        <label><input type="checkbox" id="disclaimer" ${s.disclaimerAccepted ? 'checked' : ''} /> 我已阅读并理解上述说明</label>
        <label><input type="checkbox" id="disabled" ${s.disabledOnSite ? 'checked' : ''} /> 暂停在 zhipin.com 显示标签</label>
      </section>

      <section>
        <h2>简历 PDF</h2>
        <input type="file" id="pdf" accept="application/pdf" />
        <p class="note">当前已缓存文本长度：${(s.resumeText ?? '').length} 字；hash：${(s.resumeHash ?? '').slice(0, 12) || '—'}</p>
        <p id="pdfStatus" class="ok"></p>
      </section>

      <section>
        <h2>出生信息（用于大运 / 流年）</h2>
        <div class="row">
          <div><label>年</label><input type="number" id="y" value="${birth?.year ?? 1995}" /></div>
          <div><label>月</label><input type="number" id="mo" value="${birth?.month ?? 6}" /></div>
          <div><label>日</label><input type="number" id="d" value="${birth?.day ?? 15}" /></div>
          <div><label>时（0-23）</label><input type="number" id="h" value="${birth?.hour ?? 10}" /></div>
          <div><label>分</label><input type="number" id="mi" value="${birth?.minute ?? 0}" /></div>
        </div>
        <div class="row">
          <div><label>性别（排大运）</label>
            <select id="gender">
              <option value="0" ${birth?.gender === 0 ? 'selected' : ''}>女</option>
              <option value="1" ${birth?.gender === 1 ? 'selected' : ''}>男</option>
            </select>
          </div>
          <div><label>出生省份</label>
            <select id="birthProvince">
              <option value="">选择省份</option>
              ${provinceOptions}
            </select>
          </div>
          <div><label>出生城市</label>
            <input type="text" id="birthCity" value="${escapeAttr(birth?.birthPlace?.city || '')}" placeholder="城市名" />
          </div>
        </div>
        <p class="note">出生地用于真太阳时校正，影响八字排盘的时辰准确性。</p>
      </section>

      <section>
        <h2>匹配权重</h2>
        <div class="row">
          <div><label>科学</label><input type="number" step="0.05" min="0" max="1" id="ws" value="${weights.science}" /></div>
          <div><label>玄学</label><input type="number" step="0.05" min="0" max="1" id="wm" value="${weights.metaphysics}" /></div>
        </div>
      </section>

      <section>
        <h2>大模型配置</h2>
        <label>模型服务商</label>
        <select id="llmPreset">${presetOptions}</select>

        <label>API 地址 (Base URL)</label>
        <input type="text" id="baseUrl" value="${escapeAttr(llm.baseUrl)}" placeholder="如: https://api.openai.com/v1" />

        <label>API Key</label>
        <input type="password" id="apiKey" value="${escapeAttr(llm.apiKey)}" placeholder="sk-... 或 API Key" />

        <label>模型</label>
        <div class="row" style="gap: 8px;">
          <select id="modelSelect" style="flex: 1;">${modelOptions}</select>
          <input type="text" id="modelInput" value="" placeholder="自定义模型名（可覆盖）" style="flex: 1;" />
        </div>
        <p class="note">选择预设模型或在输入框中填写自定义模型名</p>

        <p class="note">密钥仅存于本机浏览器存储；若留空，将使用本地规则生成画像。</p>

        <div class="row" style="gap: 8px; margin-top: 8px;">
          <button type="button" id="testLlm" class="secondary">测试连接</button>
          <button type="button" id="testCompanySearch" class="secondary">测试公司搜索</button>
        </div>
        <p id="testLlmStatus" class="note"></p>
        <p id="testCompanySearchStatus" class="note"></p>
      </section>

      <section>
        <h2>缓存管理</h2>
        <p class="note">分析结果会自动缓存，刷新页面后仍可使用。</p>
        <div class="row" style="gap: 8px;">
          <button type="button" id="exportCache" class="secondary">导出缓存</button>
          <button type="button" id="importCache" class="secondary">导入缓存</button>
          <button type="button" id="clearCache" class="secondary">清空缓存</button>
        </div>
        <input type="file" id="importCacheFile" accept=".json" style="display: none;" />
        <p id="cacheStatus" class="note"></p>
      </section>

      <button class="primary" id="save" type="button">保存</button>
      <div id="progressArea"></div>
      <p id="saveStatus"></p>

      <section id="profileSection">
        <h2>用户画像</h2>
        <p class="note" id="insightNote">${insightLine}</p>
        <div id="profileDisplay">${profileDisplayHtml}</div>
      </section>
    `;

    setPdfWorkerUrl(chrome.runtime.getURL('pdf.worker.mjs'));
    setupEventListeners();
  } catch (e) {
    app.innerHTML = `<p class="err">渲染失败：${e instanceof Error ? e.message : String(e)}</p>`;
    console.error('[JobGod] render error:', e);
  }
}

function setupEventListeners(): void {
  // LLM 预设切换
  const presetSelect = document.getElementById('llmPreset') as HTMLSelectElement;
  const baseUrlInput = document.getElementById('baseUrl') as HTMLInputElement;
  const modelSelect = document.getElementById('modelSelect') as HTMLSelectElement;
  const modelInput = document.getElementById('modelInput') as HTMLInputElement;

  presetSelect?.addEventListener('change', () => {
    const preset = LLM_PRESETS.find(p => p.id === presetSelect.value);
    if (preset) {
      baseUrlInput.value = preset.baseUrl;
      // 更新模型下拉框
      if (preset.models.length > 0) {
        modelSelect.innerHTML = preset.models.map(m => `<option value="${m}">${m}</option>`).join('');
        modelSelect.style.display = 'block';
      } else {
        modelSelect.style.display = 'none';
      }
      // 自定义输入框始终显示
      modelInput.style.display = 'block';
    }
  });

  // PDF 上传
  document.getElementById('pdf')?.addEventListener('change', async (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    const status = document.getElementById('pdfStatus')!;
    if (!f) return;
    status.textContent = '解析中…';
    try {
      const buf = await f.arrayBuffer();
      const { text } = await extractTextFromPdfArrayBuffer(buf);
      const summarized = summarizeResume(text);
      const resumeHash = djb2Hash(summarized);
      await chrome.storage.local.set({ resumeText: summarized, resumeHash });
      status.textContent = `已保存，约 ${summarized.length} 字。点击"保存"按钮以更新求职画像。`;
      status.className = 'ok';
    } catch (e) {
      status.textContent = `解析失败：${e instanceof Error ? e.message : String(e)}`;
      status.className = 'err';
    }
  });

  // 保存按钮
  document.getElementById('save')?.addEventListener('click', async () => {
    const status = document.getElementById('saveStatus')!;
    const progressArea = document.getElementById('progressArea')!;
    status.textContent = '';
    status.className = 'ok';

    const disclaimerAccepted = (document.getElementById('disclaimer') as HTMLInputElement).checked;
    const disabledOnSite = (document.getElementById('disabled') as HTMLInputElement).checked;

    // 获取模型名（优先使用自定义输入）
    const modelName = modelInput.value.trim() || modelSelect.value;

    const birthNext = {
      year: Number((document.getElementById('y') as HTMLInputElement).value),
      month: Number((document.getElementById('mo') as HTMLInputElement).value),
      day: Number((document.getElementById('d') as HTMLInputElement).value),
      hour: Number((document.getElementById('h') as HTMLInputElement).value),
      minute: Number((document.getElementById('mi') as HTMLInputElement).value),
      second: 0,
      gender: Number((document.getElementById('gender') as HTMLSelectElement).value) as 0 | 1,
      sect: 2 as 1 | 2,
      yunSect: 2 as 1 | 2,
      birthPlace: {
        province: (document.getElementById('birthProvince') as HTMLSelectElement).value,
        city: (document.getElementById('birthCity') as HTMLInputElement).value.trim(),
      },
    };
    const llmNext: LlmConfig = {
      baseUrl: baseUrlInput.value.trim(),
      apiKey: (document.getElementById('apiKey') as HTMLInputElement).value.trim(),
      model: modelName,
    };
    const weightsNext = {
      science: Number((document.getElementById('ws') as HTMLInputElement).value),
      metaphysics: Number((document.getElementById('wm') as HTMLInputElement).value),
    };

    // 显示进度条
    progressArea.innerHTML = createProgressHtml();
    const progressContainer = progressArea;
    showProgress(progressContainer, '保存基础配置', 10);

    await chrome.storage.local.set({
      disclaimerAccepted,
      disabledOnSite,
      birth: birthNext,
      llm: llmNext,
      weights: weightsNext,
    });

    showProgress(progressContainer, '基础配置已保存', 30);

    // 更新求职画像
    if (disclaimerAccepted) {
      showProgress(progressContainer, '正在生成求职画像', 50);
      try {
        const ins = await chrome.runtime.sendMessage({ type: 'REBUILD_INSIGHTS' });
        showProgress(progressContainer, '求职画像生成完成', 90);

        if (ins?.ok) {
          showProgress(progressContainer, '完成', 100);
          status.textContent = `已保存。求职画像：${ins.source === 'llm' ? '模型已生成' : '规则已生成'}`;

          // 重新渲染页面以显示用户画像
          setTimeout(() => {
            render();
          }, 500);
        } else {
          status.textContent = `已保存。求职画像：${ins?.error ?? '未生成'}`;
          showProgress(progressContainer, '画像生成失败', 100);
        }
      } catch (e) {
        status.textContent = `保存成功，但画像生成失败：${e instanceof Error ? e.message : String(e)}`;
        status.className = 'err';
      }
    } else {
      showProgress(progressContainer, '完成（未勾选免责声明，跳过画像生成）', 100);
      status.textContent = '已保存。请勾选免责声明以生成求职画像。';
    }
  });

  // 测试 LLM 连接
  document.getElementById('testLlm')?.addEventListener('click', async () => {
    const status = document.getElementById('testLlmStatus')!;
    const baseUrl = baseUrlInput.value.trim();
    const apiKey = (document.getElementById('apiKey') as HTMLInputElement).value.trim();

    // 获取模型名（优先使用自定义输入）
    const model = modelInput.value.trim() || modelSelect.value;

    if (!baseUrl || !apiKey || !model) {
      status.textContent = '请填写完整的 Base URL、API Key 和 Model。';
      status.className = 'note err';
      return;
    }

    status.textContent = '正在测试连接...';
    status.className = 'note';

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'TEST_LLM',
        payload: { baseUrl, apiKey, model },
      });

      if (result?.ok) {
        status.textContent = `✅ 连接成功！模型响应: ${result.response}`;
        status.className = 'note ok';
      } else {
        status.textContent = `❌ 连接失败: ${result?.error ?? '未知错误'}`;
        status.className = 'note err';
      }
    } catch (e) {
      status.textContent = `❌ 连接失败: ${e instanceof Error ? e.message : String(e)}`;
      status.className = 'note err';
    }
  });

  // 测试公司搜索功能
  document.getElementById('testCompanySearch')?.addEventListener('click', async () => {
    const status = document.getElementById('testCompanySearchStatus')!;
    const baseUrl = baseUrlInput.value.trim();
    const apiKey = (document.getElementById('apiKey') as HTMLInputElement).value.trim();

    const model = modelInput.value.trim() || modelSelect.value;

    if (!baseUrl || !apiKey || !model) {
      status.textContent = '请先填写完整的 LLM 配置并测试连接。';
      status.className = 'note err';
      return;
    }

    status.textContent = '正在测试公司搜索功能...';
    status.className = 'note';

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'TEST_COMPANY_SEARCH',
        payload: { baseUrl, apiKey, model },
      });

      if (result?.ok && result.supported) {
        status.textContent = `✅ 公司搜索支持正常！测试结果: ${result.companyName} - ${result.description}`;
        status.className = 'note ok';
      } else if (result?.ok && !result.supported) {
        status.textContent = `⚠️ 当前模型不支持公司搜索（可能缺少知识库）。原因: ${result.reason}`;
        status.className = 'note';
        status.style.color = '#b45309';
      } else {
        status.textContent = `❌ 测试失败: ${result?.error ?? '未知错误'}`;
        status.className = 'note err';
      }
    } catch (e) {
      status.textContent = `❌ 测试失败: ${e instanceof Error ? e.message : String(e)}`;
      status.className = 'note err';
    }
  });

  // 导出缓存
  document.getElementById('exportCache')?.addEventListener('click', async () => {
    const status = document.getElementById('cacheStatus')!;
    status.textContent = '正在导出...';

    try {
      const result = await chrome.runtime.sendMessage({ type: 'EXPORT_CACHE' });
      if (result?.ok && result.data) {
        // 创建下载
        const blob = new Blob([result.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `offer-cache-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        status.textContent = '✅ 缓存已导出';
        status.className = 'note ok';
      } else {
        status.textContent = `❌ 导出失败: ${result?.error ?? '未知错误'}`;
        status.className = 'note err';
      }
    } catch (e) {
      status.textContent = `❌ 导出失败: ${e instanceof Error ? e.message : String(e)}`;
      status.className = 'note err';
    }
  });

  // 导入缓存
  const importCacheFile = document.getElementById('importCacheFile') as HTMLInputElement;
  document.getElementById('importCache')?.addEventListener('click', () => {
    importCacheFile?.click();
  });

  importCacheFile?.addEventListener('change', async (ev) => {
    const status = document.getElementById('cacheStatus')!;
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;

    status.textContent = '正在导入...';

    try {
      const text = await file.text();
      const result = await chrome.runtime.sendMessage({
        type: 'IMPORT_CACHE',
        payload: { json: text },
      });

      if (result.success) {
        status.textContent = `✅ 已导入 ${result.count} 条缓存记录`;
        status.className = 'note ok';
      } else {
        status.textContent = `❌ 导入失败: ${result.error}`;
        status.className = 'note err';
      }
    } catch (e) {
      status.textContent = `❌ 导入失败: ${e instanceof Error ? e.message : String(e)}`;
      status.className = 'note err';
    }

    // 重置 input 以便再次选择同一文件
    (ev.target as HTMLInputElement).value = '';
  });

  // 清空缓存
  document.getElementById('clearCache')?.addEventListener('click', async () => {
    const status = document.getElementById('cacheStatus')!;
    if (!confirm('确定要清空所有缓存吗？这将删除所有已分析的数据。')) {
      return;
    }

    status.textContent = '正在清空...';

    try {
      const result = await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
      if (result?.ok) {
        status.textContent = '✅ 缓存已清空';
        status.className = 'note ok';
      } else {
        status.textContent = `❌ 清空失败: ${result?.error ?? '未知错误'}`;
        status.className = 'note err';
      }
    } catch (e) {
      status.textContent = `❌ 清空失败: ${e instanceof Error ? e.message : String(e)}`;
      status.className = 'note err';
    }
  });
}

void render();
