import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";

import {
  RICEInputSchema,
  RICEModelNotesSchema,
  RICEOutputSchema,
  type RICEOutput,
} from "@/lib/schema";
import { buildExports, buildSummary, rankItems, sanitizeForModel } from "@/lib/rice";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = RICEInputSchema.parse(body);

    // Deterministic math + ranking happens in code (fast, reliable)
    const ranked = rankItems(input.items, input.timeframe);

    // Keep the model job small: rationale + evidence gaps + next step + clarifying Qs
    const prompt = [
      "You are a senior product manager using the RICE framework.",
      "",
      "Rules:",
      "- Do NOT change ranks or scores. They are already computed.",
      "- Do NOT invent evidence. If evidence is empty, explicitly call it out as an evidence gap.",
      "- If inputs look unrealistic or incomplete, ask up to 6 clarifying questions in meta.clarifyingQuestions.",
      "- Keep whyThisRank specific and short (2-3 sentences).",
      "- recommendedNextStep.suggestion must be actionable and concrete.",
      "",
      `Timeframe: ${input.timeframe}`,
      `Effort unit: ${input.effortUnit}`,
      "",
      "Here are the backlog items (already ranked):",
      JSON.stringify(sanitizeForModel(ranked), null, 2),
    ].join("\n");

    const model = google("gemini-2.5-flash-lite");

    let notes: any;
    try {
      const res = await generateObject({
        model,
        schema: RICEModelNotesSchema,
        prompt,
        temperature: 0.2,
      });
      notes = res.object;
      notes.meta = notes.meta ?? {};
      notes.meta.confidenceNote = notes.meta.confidenceNote || "Rationale generated with AI (Gemini).";

    } catch (err) {
      // Gemini failed (bad key, quota, transient). Still return deterministic output.
      notes = {
        meta: {
          confidenceNote: "AI rationale unavailable. Using deterministic scoring only.",
          assumptions: [],
          clarifyingQuestions: [],
        },
        items: ranked.map((it) => ({
          itemId: it.itemId,
          rationale: {
            whyThisRank: "Ranked by deterministic RICE score from the provided inputs.",
            keyAssumptions: [],
            evidenceGaps: it.evidence?.trim() ? [] : ["No evidence provided."],
          },
          recommendedNextStep: {
            type: "research",
            suggestion: "Add evidence and validate reach/impact assumptions.",
            successMetric: "Validated improvement in a primary KPI.",
          },
        })),
      };
    }

    // Merge model notes into deterministic ranked items
    const mergedItems = ranked.map((it) => {
      const note = notes.items.find((x: any) => x.itemId === it.itemId);

      return {
        ...it,
        rationale: note?.rationale ?? {
          whyThisRank: "Ranked by RICE score using provided inputs.",
          keyAssumptions: [],
          evidenceGaps: it.evidence?.trim() ? [] : ["No evidence provided."],
        },
        recommendedNextStep: note?.recommendedNextStep ?? {
          type: "research",
          suggestion: "Gather missing evidence and validate reach/impact assumptions.",
          successMetric: "Validated impact on a primary KPI.",
        },
      };
    });

    const output: RICEOutput = {
      meta: {
        timeframe: input.timeframe,
        effortUnit: input.effortUnit,
        confidenceNote: notes.meta.confidenceNote,
        assumptions: notes.meta.assumptions ?? [],
        clarifyingQuestions: (notes.meta.clarifyingQuestions ?? []).slice(0, 6),
      },
      items: mergedItems,
      summary: buildSummary(mergedItems),
      exports: buildExports(mergedItems, input.timeframe, input.effortUnit),
    };

    // Final guardrail
    const validated = RICEOutputSchema.parse(output);
    return NextResponse.json(validated);
  } catch (error: any) {
    console.error("Scoring error:", error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to score items" },
      { status: 500 }
    );
  }
}
