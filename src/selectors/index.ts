/**
 * 平台适配器注册中心
 * 自动检测当前平台并返回对应的适配器
 */

import type { PlatformAdapter } from './types';

// 导入各平台适配器
import { zhipinAdapter } from './zhipin';
import { shixisengAdapter } from './shixiseng';
import { liepinAdapter } from './liepin';
import { job51Adapter } from './job51';
import { zhaopinAdapter } from './zhaopin';

/**
 * 平台 ID 常量
 */
export const PLATFORM_IDS = {
  ZHIPIN: 'zhipin',
  SHIXISENG: 'shixiseng',
  LIEPIN: 'liepin',
  JOB51: 'job51',
  ZHAOPIN: 'zhaopin',
} as const;

export type PlatformId = typeof PLATFORM_IDS[keyof typeof PLATFORM_IDS];

/**
 * 平台信息（用于设置页面显示）
 */
export const PLATFORM_INFO: { id: PlatformId; name: string; domain: string; supportsListPage: boolean }[] = [
  { id: PLATFORM_IDS.ZHIPIN, name: 'BOSS直聘', domain: 'zhipin.com', supportsListPage: true },
  { id: PLATFORM_IDS.SHIXISENG, name: '实习僧', domain: 'shixiseng.com', supportsListPage: false },
  { id: PLATFORM_IDS.LIEPIN, name: '猎聘', domain: 'liepin.com', supportsListPage: false },
  { id: PLATFORM_IDS.JOB51, name: '前程无忧', domain: '51job.com', supportsListPage: false },
  { id: PLATFORM_IDS.ZHAOPIN, name: '智联招聘', domain: 'zhaopin.com', supportsListPage: false },
];

/**
 * 已注册的平台适配器列表
 */
const adapters: PlatformAdapter[] = [
  zhipinAdapter,
  shixisengAdapter,
  liepinAdapter,
  job51Adapter,
  zhaopinAdapter,
];

/**
 * 获取平台 ID
 */
export function getPlatformId(adapter: PlatformAdapter): PlatformId | null {
  const nameToId: Record<string, PlatformId> = {
    'BOSS直聘': PLATFORM_IDS.ZHIPIN,
    '实习僧': PLATFORM_IDS.SHIXISENG,
    '猎聘': PLATFORM_IDS.LIEPIN,
    '前程无忧': PLATFORM_IDS.JOB51,
    '智联招聘': PLATFORM_IDS.ZHAOPIN,
  };
  return nameToId[adapter.name] ?? null;
}

/**
 * 检测当前页面的平台
 * @returns 匹配的适配器，如果没有匹配则返回 null
 */
export function detectPlatform(): PlatformAdapter | null {
  const host = location.hostname;

  for (const adapter of adapters) {
    if (adapter.hostPattern.test(host)) {
      console.log(`[JobGod] Detected platform: ${adapter.name}`);
      return adapter;
    }
  }

  console.log('[JobGod] No matching platform detected for:', host);
  return null;
}

/**
 * 获取所有已注册的平台名称
 */
export function getSupportedPlatforms(): string[] {
  return adapters.map(a => a.name);
}

/**
 * 根据名称获取适配器
 */
export function getAdapterByName(name: string): PlatformAdapter | undefined {
  return adapters.find(a => a.name === name);
}

export { adapters };
