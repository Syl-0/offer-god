import { describe, expect, it } from 'vitest';
import { computeScienceScore, combineWeighted, jaccard } from './matchScore';
import type { JobContext } from '../types/analysis';

describe('matchScore', () => {
  it('jaccard works', () => {
    const a = new Set(['java', 'spring', 'mysql']);
    const b = new Set(['java', 'redis', 'mysql']);
    expect(jaccard(a, b)).toBeGreaterThan(0);
  });

  it('computeScienceScore returns 0-100', () => {
    const resume =
      'Java Spring 微服务 三年经验 高并发 MySQL Redis Kafka';
    const job: JobContext = {
      jobUrl: 'https://www.zhipin.com/job_detail/x',
      jobTitle: 'Java 后端开发',
      companyName: '某科技公司',
      jdSnippet: '熟悉 Java Spring 微服务 MySQL Redis 三年以上经验',
      source: 'list',
      readiness: 'partial',
    };
    const s = computeScienceScore(resume, job, null);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it('combineWeighted', () => {
    expect(combineWeighted(80, 60, { science: 0.5, metaphysics: 0.5 })).toBe(70);
  });
});
