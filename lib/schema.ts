import { z } from "zod";

export const TimeframeSchema = z.enum(["week", "month", "quarter"]);
export const EffortUnitSchema = z.enum(["days", "points"]);
export const ReachUnitSchema = z.enum(["users", "accounts", "events"]);

export const BacklogInputItemSchema = z.object({
  itemId: z.string(),
  title: z.string(),
  description: z.string().default(""),
  evidence: z.string().optional().default(""),
  inputs: z.object({
    reach: z.object({
      value: z.number(),
      unit: ReachUnitSchema.default("users"),
      timeframe: TimeframeSchema,
    }),
    impact: z.number(),
    confidence: z.number(),
    effort: z.number(),
  }),
});

export type BacklogInputItem = z.infer<typeof BacklogInputItemSchema>;

export const RICEInputSchema = z.object({
  timeframe: TimeframeSchema,
  effortUnit: EffortUnitSchema,
  items: z.array(BacklogInputItemSchema).max(10),
});

// Model returns ONLY notes (we compute ranking + exports deterministically).
export const RICEModelNotesSchema = z.object({
  meta: z.object({
    confidenceNote: z.string(),
    assumptions: z.array(z.string()).default([]),
    clarifyingQuestions: z.array(z.string()).default([]),
  }),
  items: z.array(
    z.object({
      itemId: z.string(),
      rationale: z.object({
        whyThisRank: z.string(),
        keyAssumptions: z.array(z.string()).default([]),
        evidenceGaps: z.array(z.string()).default([]),
      }),
      recommendedNextStep: z.object({
        type: z.enum(["experiment", "research", "ship", "defer"]),
        suggestion: z.string(),
        successMetric: z.string(),
      }),
    })
  ),
});

export const RICEOutputSchema = z.object({
  meta: z.object({
    timeframe: TimeframeSchema,
    effortUnit: EffortUnitSchema,
    confidenceNote: z.string(),
    assumptions: z.array(z.string()),
    clarifyingQuestions: z.array(z.string()),
  }),
  items: z.array(
    z.object({
      itemId: z.string(),
      title: z.string(),
      description: z.string(),
      evidence: z.string().optional(),
      inputs: z.object({
        reach: z.object({
          value: z.number(),
          unit: ReachUnitSchema,
          timeframe: TimeframeSchema,
        }),
        impact: z.number(),
        confidence: z.number(),
        effort: z.number(),
      }),
      computed: z.object({
        riceScore: z.number(),
        rank: z.number(),
      }),
      rationale: z.object({
        whyThisRank: z.string(),
        keyAssumptions: z.array(z.string()),
        evidenceGaps: z.array(z.string()),
      }),
      recommendedNextStep: z.object({
        type: z.enum(["experiment", "research", "ship", "defer"]),
        suggestion: z.string(),
        successMetric: z.string(),
      }),
    })
  ),
  summary: z.object({
    top3: z.array(z.string()),
    quickWins: z.array(z.string()),
    highRiskHighReward: z.array(z.string()),
  }),
  exports: z.object({
    markdown: z.string(),
    csvRows: z.array(
      z.object({
        itemId: z.string(),
        title: z.string(),
        reach: z.string(),
        impact: z.string(),
        confidence: z.string(),
        effort: z.string(),
        riceScore: z.string(),
        rank: z.string(),
        note: z.string(),
      })
    ),
  }),
});

export type RICEOutput = z.infer<typeof RICEOutputSchema>;
