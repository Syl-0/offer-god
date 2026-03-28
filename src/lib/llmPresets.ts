/**
 * 大模型预设配置
 */

export interface LlmPreset {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  requiresApiKey: boolean;
  note?: string;
}

export const LLM_PRESETS: LlmPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    requiresApiKey: true,
  },
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
    requiresApiKey: true,
    note: '需要确保 API 格式兼容',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4', 'glm-4-plus', 'glm-4-air'],
    requiresApiKey: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder'],
    requiresApiKey: true,
  },
  {
    id: 'qwen',
    name: '阿里千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext'],
    requiresApiKey: true,
  },
  {
    id: 'baidu',
    name: '百度文心',
    baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat',
    models: ['ernie-4.0-8k', 'ernie-3.5-8k', 'ernie-speed-8k'],
    requiresApiKey: true,
    note: 'API 格式可能需要额外适配',
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    requiresApiKey: true,
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    models: ['abab6.5-chat', 'abab5.5-chat'],
    requiresApiKey: true,
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
    models: [],
    requiresApiKey: true,
    note: '输入自定义的 Base URL 和模型名称',
  },
];

/**
 * 根据 ID 获取预设
 */
export function getPresetById(id: string): LlmPreset | undefined {
  return LLM_PRESETS.find(p => p.id === id);
}

/**
 * 根据 baseUrl 匹配预设
 */
export function getPresetByBaseUrl(baseUrl: string): LlmPreset | undefined {
  const normalized = baseUrl.replace(/\/$/, '').toLowerCase();
  return LLM_PRESETS.find(p => p.baseUrl.replace(/\/$/, '').toLowerCase() === normalized);
}
