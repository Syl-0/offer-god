---
name: deep-job-consultation
description: 「深度求职建议」LLM 提示词与输出约定：公司阶段/行业偏好、面试策略，与本地匹配分数解耦；用于 BOSS 插件 GET_DEEP_ADVICE。
---

# 深度求职咨询 Skill

## 触发时机

- 仅在用户点击职位卡片上的 **「深度建议」** 时触发（`GET_DEEP_ADVICE`）。
- 输入包含：`JobContext`（含 JD、公司介绍片段、融资/规模/行业等）、`MatchScoreResult`（仅作语境，不要求模型复述算术）、`userInsights`（短画像）。

## 与匹配分的区分

- **不要做**：重复解释「为什么是 73%」、复述科学/玄学算法。
- **要做**：结合**公司阶段**（初创 / 成长期 / 上市）、**规模**、**行业**，给出可执行的面试表达与策略（如初创重视 owner 与闭环，大厂重视规范与影响面）。

## 输出 JSON Schema（与实现对齐）

见 [deepConsultPrompt.ts](src/lib/deepConsultPrompt.ts)：

- `angles`: string[]（3–5 条策略角度）
- `companyFit`: string（一段公司与岗位适配叙事）
- `interviewFocus`: string[]（3–6 条面试表达重点）
- `risks`: string[]（0–3 条注意点）

## System 要点

- 角色：资深职业规划与面试策略顾问。
- 禁止命理吉凶断言；传统文化表述仅可出现在「自我觉察」语境。
- 单一 JSON 对象，无 Markdown 围栏。

## 失败降级

- 无 API Key 或请求失败时使用 [fallbackDeepAdvice](src/lib/deepConsultPrompt.ts) 短模板。
