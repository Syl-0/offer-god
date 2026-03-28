---
name: bazi-job-advisor
description: 八字（含大运流年）与求职场景结合的文案、提示词与合规边界；用于「玄学求职」Chrome 插件 v2（预生成画像 + 本地匹配分 + 可选深度建议）。
---

# 八字求职顾问（项目 Skill）

## 适用范围

- 在 BOSS 直聘等场景下，将**简历科学匹配**与**传统命理文化表述**分层输出。
- **v2 架构**：`scienceScore`、`metaphysicsScore` 由**本地规则**在 `COMPUTE_MATCH` 中计算，**不调用 LLM**。用户上传简历/八字后，后台预生成 `userInsights`（`REBUILD_INSIGHTS`），用于关键词增强与后续深度建议输入。
- **深度求职建议**（`GET_DEEP_ADVICE`）单独调用 LLM，使用 [deepConsultPrompt.ts](src/lib/deepConsultPrompt.ts)，与分数展示解耦。

## 合规与措辞

- 明确为**文化参考 / 自我觉察**，不构成命运断言、录用承诺或投资建议。
- 「成功率」统一用 **成功率区间（参考）** 或 **参考区间**，避免「一定」「必然」。
- 医疗、法律、财务决策不在本 Skill 讨论范围内。

## 大运、流年（简述）

- **大运**：十年为段的大周期，用于描述中长期节奏与重心迁移（叙事层面）。
- **流年**：当年干支与运势语境，用于与「当前求职窗口」对齐讨论（叙事层面）。
- 分析时应引用结构化摘要中的 `currentDaYun`、`currentLiuNian` 字段，与日主、五行力量叙述一致。

## 行业与五行（简化映射表，可改代码常量）

| 关键词线索 | 映射五行（象意） |
|-----------|------------------|
| 互联网、软件、算法、数据、AI、开发、测试、运维 | 金 |
| 教育、教研、课程、内容创作 | 木 |
| 能源、餐饮、酒店、传媒、直播、市场、品牌 | 火 |
| 金融、地产、建筑、物流、供应链、制造 | 土 |
| 医疗、医药、生物、健康 | 水 |

## 预生成画像 `userInsights`（存储键）

- `resumeKeywords`、`resumeSummaryLine`、`baziCareerLine`、`insightsInputHash`、`source: 'llm' | 'rules'`。
- 实现见 [userInsights.ts](src/lib/userInsights.ts)、后台 [background/index.ts](src/background/index.ts) 中 `rebuildUserInsights`。

## 历史：旧版全文分析 JSON（已弃用为默认路径）

若仍维护 [prompt.ts](src/lib/prompt.ts) 中模板，字段：`scienceAnalysis`、`metaphysicsAnalysis`、`successRateBand`、`actions`、`riskNotes`。v2 默认不再为每个职位调用该路径。

## 免责声明（产品文案）

内容仅供个人学习与职业规划参考，不构成录用承诺或命运断言。
