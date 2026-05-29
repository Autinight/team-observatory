// Usage entry normalization, grouping, summation, and formatting.
import { numberOf, toIso, toTime } from "./utils.js";

/**
 * Normalize raw usage entries into a consistent shape.
 */
export function normalizeUsage(entries) {
  return [...entries]
    .map((entry) => {
      const usage = entry.usage || entry;
      const attribution = entry.attribution || entry.source?.attribution || {};
      return {
        id: entry.id || entry.ts || Math.random().toString(36).slice(2),
        ts: toIso(entry.ts || entry.createdAt || entry.time || Date.now()),
        agentId: entry.agentId || attribution.agentId || entry.source?.agentId || null,
        sessionPath: entry.sessionPath || attribution.sessionPath || null,
        modelId: entry.modelId || entry.model || null,
        provider: entry.provider || entry.modelProvider || null,
        inputTokens: numberOf(usage.inputTokens ?? usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens),
        outputTokens: numberOf(usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens),
        totalTokens: numberOf(usage.totalTokens ?? usage.total_tokens ?? usage.tokens),
        cost: numberOf(entry.cost ?? entry.estimatedCost ?? usage.cost),
      };
    })
    .map((item) => ({
      ...item,
      totalTokens: item.totalTokens || item.inputTokens + item.outputTokens,
    }))
    .sort((a, b) => toTime(b.ts) - toTime(a.ts));
}

/**
 * Group normalized entries by agentId, aggregating token counts.
 */
export function groupUsageByAgent(entries) {
  const map = new Map();
  for (const entry of entries) {
    const key = entry.agentId || "unknown";
    if (!map.has(key)) map.set(key, emptyUsageBucket(key));
    const bucket = map.get(key);
    bucket.inputTokens += entry.inputTokens;
    bucket.outputTokens += entry.outputTokens;
    bucket.totalTokens += entry.totalTokens;
    bucket.estimatedCost += entry.cost;
    bucket.calls += 1;
  }
  return map;
}

export function emptyUsageBucket(agentId) {
  return { agentId, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0, calls: 0 };
}

/**
 * Sum an array of normalized usage entries into a single bucket.
 */
export function sumUsage(entries) {
  return entries.reduce((acc, entry) => {
    acc.inputTokens += entry.inputTokens;
    acc.outputTokens += entry.outputTokens;
    acc.totalTokens += entry.totalTokens;
    acc.estimatedCost += entry.cost;
    acc.calls += 1;
    return acc;
  }, emptyUsageBucket("all"));
}
