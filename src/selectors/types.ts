/**
 * 平台适配器接口
 * 用于支持多个招聘网站的数据提取
 */

import type { JobContext } from '../types/analysis';

/**
 * 平台适配器接口
 */
export interface PlatformAdapter {
  /** 平台名称 */
  name: string;

  /** 匹配域名的正则 */
  hostPattern: RegExp;

  /** 详情页 URL 特征正则 */
  detailUrlPattern: RegExp;

  /**
   * 判断当前是否为详情页
   */
  isDetailPage(): boolean;

  /**
   * 从详情页提取职位信息
   */
  extractFromDetail(): JobContext;

  /**
   * 找到详情页挂载按钮的锚点元素
   */
  findDetailMountHost(): HTMLElement | null;

  /**
   * 在列表页查找所有职位链接
   */
  findJobAnchors(root?: ParentNode): HTMLAnchorElement[];

  /**
   * 从列表页卡片提取职位信息
   */
  extractFromCard(anchor: HTMLAnchorElement): JobContext;

  /**
   * 根据链接找到卡片容器
   */
  resolveCardRoot(anchor: HTMLAnchorElement): HTMLElement;
}

/**
 * 平台适配器配置（用于简化创建适配器）
 */
export interface PlatformConfig {
  name: string;
  hostPattern: RegExp;
  detailUrlPattern: RegExp;

  // 详情页选择器
  detailSelectors: {
    title: string[];
    company: string[];
    salary: string[];
    jd: string[];
    companyInfo: string[];
    mountHost: string[];
  };

  // 列表页配置
  listConfig: {
    anchorSelector: string;
    urlPattern: RegExp;
    cardSelectors: {
      title: string[];
      company: string[];
      salary: string[];
      tags: string[];
    };
    cardRootHint: string[];
  };
}
