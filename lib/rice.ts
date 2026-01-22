import type { BacklogInputItem, RICEOutput } from "@/lib/schema";

export function calculateRICE(reach: number, impact: number, confidencePct: number, effort: number): number {
  const c = Math.max(0, Math.min(100, confidencePct)) / 100;
  const e = Math.max(0.0001, effort);
  const score = (reach * impact * c) / e;
  return Math.round(score * 100) / 100;
}

export function rankItems(items: BacklogInputItem[], timeframe: "week" | "month" | "quarter") {
  const computed = items.map((it) => {
    const riceScore = calculateRICE(it.inputs.reach.value, it.inputs.impact, it.inputs.confidence, it.inputs.effort);
    return {
      ...it,
      inputs: { ...it.inputs, reach: { ...it.inputs.reach, timeframe } },
      computed: { riceScore, rank: 0 },
      rationale: { whyThisRank: "", keyAssumptions: [], evidenceGaps: [] },
      recommendedNextStep: { type: "research", suggestion: "", successMetric: "" },
    } as any;
  });

  computed.sort((a: any, b: any) => b.computed.riceScore - a.computed.riceScore);
  computed.forEach((it: any, idx: number) => (it.computed.rank = idx + 1));
  return computed as RICEOutput["items"];
}

export function calculateSensitivity(it: RICEOutput["items"][number]) {
  const r = it.inputs.reach.value;
  const i = it.inputs.impact;
  const c = it.inputs.confidence;
  const e = it.inputs.effort;

  const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));

  return {
    baseScore: it.computed.riceScore,
    confidenceMinus20: calculateRICE(r, i, clamp(c - 20, 0, 100), e),
    confidencePlus20: calculateRICE(r, i, clamp(c + 20, 0, 100), e),
    effortMinus20: calculateRICE(r, i, c, e * 0.8),
    effortPlus20: calculateRICE(r, i, c, e * 1.2),
    reachMinus20: calculateRICE(r * 0.8, i, c, e),
  };
}

export function buildSummary(items: RICEOutput["items"]) {
  const top3 = items.slice(0, 3).map((i) => i.itemId);
  const quickWins = items
    .filter((i) => i.computed.riceScore >= 20 && i.inputs.effort <= 8)
    .slice(0, 3)
    .map((i) => i.itemId);
  const highRiskHighReward = items
    .filter((i) => i.inputs.confidence <= 60 && i.inputs.impact >= 2)
    .slice(0, 3)
    .map((i) => i.itemId);

  return { top3, quickWins, highRiskHighReward };
}

export function buildExports(items: RICEOutput["items"], timeframe: "week" | "month" | "quarter", effortUnit: "days" | "points") {
  const markdownLines: string[] = [];
  markdownLines.push("# RICE Prioritization Results");
  markdownLines.push("");
  markdownLines.push(`Timeframe: ${timeframe}`);
  markdownLines.push(`Effort unit: ${effortUnit}`);
  markdownLines.push("");
  markdownLines.push("## Ranked Backlog");
  markdownLines.push("");

  for (const it of items) {
    markdownLines.push(`### ${it.computed.rank}. ${it.title} (Score: ${it.computed.riceScore})`);
    if (it.description) markdownLines.push(it.description);
    markdownLines.push("");
    markdownLines.push(`- Reach: ${it.inputs.reach.value} ${it.inputs.reach.unit}/${it.inputs.reach.timeframe}`);
    markdownLines.push(`- Impact: ${it.inputs.impact}`);
    markdownLines.push(`- Confidence: ${it.inputs.confidence}%`);
    markdownLines.push(`- Effort: ${it.inputs.effort} ${effortUnit}`);
    markdownLines.push("");
    markdownLines.push(`Rationale: ${it.rationale.whyThisRank}`);
    markdownLines.push(`Next step: ${it.recommendedNextStep.type} - ${it.recommendedNextStep.suggestion}`);
    markdownLines.push(`Success metric: ${it.recommendedNextStep.successMetric}`);
    markdownLines.push("");
  }

  const csvRows = items.map((it) => ({
    itemId: it.itemId,
    title: it.title,
    reach: `${it.inputs.reach.value} ${it.inputs.reach.unit}/${it.inputs.reach.timeframe}`,
    impact: String(it.inputs.impact),
    confidence: `${it.inputs.confidence}%`,
    effort: `${it.inputs.effort} ${effortUnit}`,
    riceScore: String(it.computed.riceScore),
    rank: String(it.computed.rank),
    note: it.recommendedNextStep.suggestion,
  }));

  return { markdown: markdownLines.join("\n"), csvRows };
}

export function sanitizeForModel(items: RICEOutput["items"]) {
  return items.map((it) => ({
    itemId: it.itemId,
    title: it.title,
    description: it.description,
    evidence: it.evidence ?? "",
    inputs: it.inputs,
    computed: it.computed,
  }));
}
