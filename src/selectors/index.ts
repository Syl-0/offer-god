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
