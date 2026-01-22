"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { BacklogInputItem, RICEOutput } from "@/lib/schema";
import { sampleConsumer, sampleSaaS } from "@/lib/samples";
import { calculateSensitivity, rankItems } from "@/lib/rice";

import { z } from "zod";
import { Sparkles, Download, Copy, FileText, ChevronDown, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const LS_KEY = "rice_gpt_prioritizer_vfinal";

const defaultItem = (id: number): BacklogInputItem => ({
  itemId: `I${id}`,
  title: "",
  description: "",
  evidence: "",
  inputs: {
    reach: { value: 100, unit: "users", timeframe: "month" },
    impact: 1,
    confidence: 50,
    effort: 5,
  },
});

function truncate(s: string, max: number) {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim();
}

function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Record<string, string>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: string) => `"${(v ?? "").replaceAll('"', '""')}"`;
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(String(r[h] ?? ""))).join(","))];
  return lines.join("\n");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === "," || ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur.trim());
      cur = "";
      if (ch === "\n" || ch === "\r") {
        if (row.some((c) => c.length > 0)) rows.push(row);
        row = [];
      }
      continue;
    }

    cur += ch;
  }

  row.push(cur.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);

  return rows;
}

function toNumber(v: string, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function LoadingBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="mt-3 h-2 w-full overflow-hidden rounded-full border bg-muted">
      <div className="h-full w-1/3 animate-[loading_1.2s_ease-in-out_infinite] rounded-full bg-foreground/80" />
      <style jsx>{`
        @keyframes loading {
          0% {
            transform: translateX(-120%);
          }
          50% {
            transform: translateX(120%);
          }
          100% {
            transform: translateX(320%);
          }
        }
      `}</style>
    </div>
  );
}

export default function Page() {
  const [timeframe, setTimeframe] = useState<"week" | "month" | "quarter">("month");
  const [effortUnit, setEffortUnit] = useState<"days" | "points">("days");
  const [items, setItems] = useState<BacklogInputItem[]>(() => Array.from({ length: 5 }, (_, i) => defaultItem(i + 1)));

  const [mode, setMode] = useState<"numeric" | "safeDefaults">("numeric");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RICEOutput | null>(null);
  const [error, setError] = useState<string>("");

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.items) setItems(parsed.items);
      if (parsed?.timeframe) setTimeframe(parsed.timeframe);
      if (parsed?.effortUnit) setEffortUnit(parsed.effortUnit);
      if (parsed?.mode) setMode(parsed.mode);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ timeframe, effortUnit, items, mode }));
    } catch {}
  }, [timeframe, effortUnit, items, mode]);

  const hasAnyTitled = useMemo(() => items.some((i) => i.title.trim().length > 0), [items]);
  const rankedLocal = useMemo(() => rankItems(items.filter((i) => i.title.trim().length > 0), timeframe), [items, timeframe]);
  const isScored = Boolean(result);

  function updateItem(idx: number, patch: Partial<BacklogInputItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? ({ ...it, ...patch } as BacklogInputItem) : it)));
    setResult(null);
  }

  function ensureRows(n: number) {
    setItems((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(defaultItem(next.length + 1));
      return next.slice(0, 10);
    });
  }

  function useSample(type: "saas" | "consumer") {
    const sample = type === "saas" ? sampleSaaS : sampleConsumer;
    setItems(sample.map((it, idx) => ({ ...it, itemId: `I${idx + 1}`, inputs: { ...it.inputs, reach: { ...it.inputs.reach, timeframe } } })));
    setResult(null);
    setError("");

    const firstId = "I1";
    setExpanded((prev) => ({ ...prev, [firstId]: true }));
  }

  function parseTextarea(text: string) {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 10);

    const parsed = lines.map((line, idx) => {
      const [title, description = "", evidence = ""] = line.split("|").map((s) => s.trim());
      return {
        ...defaultItem(idx + 1),
        title: title ?? "",
        description,
        evidence,
        inputs: { ...defaultItem(idx + 1).inputs, reach: { ...defaultItem(idx + 1).inputs.reach, timeframe } },
      };
    });

    setItems(parsed.length ? parsed : Array.from({ length: 5 }, (_, i) => defaultItem(i + 1)));
    setResult(null);
    setError("");
  }

  function toggleExpand(itemId: string) {
    setExpanded((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  async function onUploadCsv(file: File) {
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) return;

      const header = rows[0].map((h) => h.trim().toLowerCase());
      const dataRows = rows.slice(1);

      const idx = (name: string) => header.indexOf(name.toLowerCase());

      const titleI = idx("title");
      const descI = idx("description");
      const evidenceI = idx("evidence");
      const reachI = idx("reach");
      const reachUnitI = idx("reachunit");
      const impactI = idx("impact");
      const confidenceI = idx("confidence");
      const effortI = idx("effort");

      const built: BacklogInputItem[] = dataRows
        .filter((r) => r.some((c) => c.trim().length > 0))
        .slice(0, 10)
        .map((r, i) => {
          const title = titleI >= 0 ? r[titleI] : r[0] ?? "";
          const description = descI >= 0 ? r[descI] : r[1] ?? "";
          const evidence = evidenceI >= 0 ? r[evidenceI] : r[2] ?? "";

          const reach = reachI >= 0 ? toNumber(r[reachI], 100) : toNumber(r[3] ?? "", 100);
          const impact = impactI >= 0 ? toNumber(r[impactI], 1) : toNumber(r[4] ?? "", 1);
          const confidence = confidenceI >= 0 ? toNumber(r[confidenceI], 50) : toNumber(r[5] ?? "", 50);
          const effort = effortI >= 0 ? toNumber(r[effortI], 5) : toNumber(r[6] ?? "", 5);
          const reachUnit = reachUnitI >= 0 ? (r[reachUnitI] as any) : "users";

          return {
            ...defaultItem(i + 1),
            title,
            description,
            evidence,
            inputs: {
              reach: { value: reach, unit: reachUnit || "users", timeframe },
              impact,
              confidence,
              effort,
            },
          };
        });

      if (built.length) {
        setItems(built);
        setResult(null);
        setError("");
        setExpanded((prev) => ({ ...prev, I1: true }));
      }
    } catch (e: any) {
      setError(e?.message ?? "CSV parse failed");
    }
  }

  async function scoreWithLLM() {
    setLoading(true);
    setError("");
    setResult(null);

    const cleaned: BacklogInputItem[] = items
      .map((it, idx) => {
        const base = { ...it, itemId: it.itemId || `I${idx + 1}` };

        const title = truncate(base.title ?? "", 90);
        const description = truncate(base.description ?? "", 400);
        const evidence = truncate(base.evidence ?? "", 400);

        const impact =
          Number.isFinite(base.inputs.impact) && base.inputs.impact > 0 ? base.inputs.impact : mode === "safeDefaults" ? 1 : 0;
        const confidence =
          Number.isFinite(base.inputs.confidence) ? base.inputs.confidence : mode === "safeDefaults" ? 50 : 0;
        const effort =
          Number.isFinite(base.inputs.effort) && base.inputs.effort > 0 ? base.inputs.effort : mode === "safeDefaults" ? 5 : 0;
        const reachValue =
          Number.isFinite(base.inputs.reach.value) ? base.inputs.reach.value : mode === "safeDefaults" ? 100 : 0;

        return {
          ...base,
          title,
          description,
          evidence,
          inputs: {
            ...base.inputs,
            reach: { ...base.inputs.reach, value: reachValue, timeframe },
            impact,
            confidence,
            effort,
          },
        };
      })
      .filter((it) => it.title.length > 0)
      .slice(0, 10);

    if (!cleaned.length) {
      setLoading(false);
      setError("Add at least 1 item title to score.");
      return;
    }

    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeframe, effortUnit, items: cleaned }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ? JSON.stringify(j.error) : "Scoring failed");
      }

      const data = (await res.json()) as unknown;
      const parsed = z.any().safeParse(data);
      if (!parsed.success) throw new Error("Invalid response");
      setResult(data as RICEOutput);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const viewItems = result?.items ?? rankedLocal;
  const hasPreviewRows = viewItems.length > 0;

  const missingEvidence = useMemo(() => {
    if (!result) return [];
    return result.items
      .filter((it) => (it.rationale.evidenceGaps ?? []).length > 0)
      .map((it) => ({ itemId: it.itemId, title: it.title, gaps: it.rationale.evidenceGaps }));
  }, [result]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-foreground">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="mb-5 text-center">
          <h1 className="text-3xl font-semibold">
  <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
    RICE AI Prioritizer
  </span>
</h1>

          <p className="mt-2 text-xs sm:text-sm text-slate-600 px-2">
            Preview calculations update instantly. Click Generate to produce rationale, evidence gaps, next steps, and exports.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-2">
          {/* Left column */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base">Controls</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Set your timeframe, import items, then generate rationale.</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Select value={timeframe} onValueChange={(v: any) => setTimeframe(v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue placeholder="Timeframe" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">week</SelectItem>
                      <SelectItem value="month">month</SelectItem>
                      <SelectItem value="quarter">quarter</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={effortUnit} onValueChange={(v: any) => setEffortUnit(v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue placeholder="Effort unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="days">days</SelectItem>
                      <SelectItem value="points">points</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue placeholder="Scoring mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="numeric">Strict numeric</SelectItem>
                      <SelectItem value="safeDefaults">Safe defaults</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Button
                    variant="outline"
                    onClick={() => useSample("saas")}
                    className="w-full h-10 text-xs sm:text-sm whitespace-nowrap active:scale-[0.98]"
                  >
                    SaaS Sample (8)
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => useSample("consumer")}
                    className="w-full h-10 text-xs sm:text-sm whitespace-nowrap active:scale-[0.98]"
                  >
                    Consumer Sample (6)
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={() => {
                      const template =
                        "title,description,evidence,reach,reachUnit,impact,confidence,effort\n" +
                        "SSO,SAML for enterprise,3 deals blocked,500,accounts,3,80,8\n";
                      downloadText("rice_template.csv", template, "text/csv");
                    }}
                    className="w-full h-10 text-xs sm:text-sm whitespace-nowrap active:scale-[0.98]"
                  >
                    <Download className="mr-1 h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                    CSV template
                  </Button>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs sm:text-sm font-medium">Quick import</div>
                    <Textarea
                      className="text-xs sm:text-sm min-h-[80px]"
                      placeholder={"Title | Description | Evidence\nExample: SSO | SAML for enterprise | 3 deals blocked"}
                      onBlur={(e) => {
                        if (e.target.value.trim()) parseTextarea(e.target.value);
                      }}
                    />
                    <div className="text-[10px] sm:text-xs text-muted-foreground">Paste lines, then click outside to parse.</div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs sm:text-sm font-medium">Upload CSV</div>
                    <Input
                      type="file"
                      accept=".csv,text/csv"
                      className="text-xs sm:text-sm"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUploadCsv(f);
                        e.currentTarget.value = "";
                      }}
                    />
                    <div className="text-[10px] sm:text-xs text-muted-foreground">
                      Columns: title, description, evidence, reach, reachUnit, impact, confidence, effort.
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2">
    <Button
  onClick={scoreWithLLM}
  disabled={loading || !hasAnyTitled}
  className={[
    "w-full sm:w-auto active:scale-[0.98] text-xs sm:text-sm text-white",
    "transition-all duration-200",
    loading || !hasAnyTitled ? "opacity-60" : "",
    isScored
      ? "bg-green-600 hover:bg-green-700"
      : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700",
  ].join(" ")}
>
  {loading ? (
    "Generating analysis..."
  ) : (
    <>
      <Sparkles className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
      Generate RICE analysis
    </>
  )}
</Button>


                  <Button
                    variant="outline"
                    onClick={() => {
                      setItems(Array.from({ length: 5 }, (_, i) => defaultItem(i + 1)));
                      setResult(null);
                      setError("");
                      setExpanded({});
                    }}
                    disabled={loading}
                    className="w-full sm:w-auto active:scale-[0.98] text-xs sm:text-sm"
                  >
                    Reset
                  </Button>

                  <div className="text-[10px] sm:text-xs text-muted-foreground w-full sm:w-auto">
                    {!hasAnyTitled ? "Add at least one item title to enable Generate." : 
                    !result ? "Preview ranks are instant. Generate adds AI rationale and exports." : 
                    "Output generated."}
                  </div>
                </div>

                <LoadingBar active={loading} />

                {error ? (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs sm:text-sm break-words">{error}</AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Backlog input (up to 10)</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Expand only what you need. Preview badges update instantly.</CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {items.map((it, idx) => {
                  const id = it.itemId || `I${idx + 1}`;
                  const isOpen = expanded[id] ?? false;

                  return (
                    <div key={id} className="rounded-lg border bg-white">
                      <div className="flex items-start justify-between gap-2 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs sm:text-sm font-medium break-words">
                            {id}{" "}
                            {it.title?.trim() ? (
                              <span className="text-muted-foreground">- {it.title}</span>
                            ) : (
                              <span className="text-muted-foreground">- (untitled)</span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1 sm:gap-2">
                            <Badge variant="secondary" className="text-[10px] sm:text-xs">Reach {it.inputs.reach.value}</Badge>
                            <Badge variant="secondary" className="text-[10px] sm:text-xs">Impact {it.inputs.impact}</Badge>
                            <Badge variant="secondary" className="text-[10px] sm:text-xs">Conf {it.inputs.confidence}%</Badge>
                            <Badge variant="secondary" className="text-[10px] sm:text-xs">Eff {it.inputs.effort}</Badge>
                          </div>
                        </div>

                        <div className="flex flex-none items-center gap-1 sm:gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => toggleExpand(id)}
                            className="h-8 w-8 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-[0.96]"
                            title={isOpen ? "Collapse" : "Expand"}
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>

                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                            disabled={items.length <= 1 || loading}
                            className="h-8 w-8 rounded-full bg-red-50 text-red-700 hover:bg-red-100 active:scale-[0.96]"
                            title="Remove"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {isOpen ? (
                        <div className="border-t p-3">
                          <div className="grid grid-cols-1 gap-2">
                            <Input 
                              placeholder="Title" 
                              value={it.title} 
                              onChange={(e) => updateItem(idx, { title: e.target.value })}
                              className="text-xs sm:text-sm"
                            />
                            <Textarea
                              placeholder="Description"
                              value={it.description}
                              onChange={(e) => updateItem(idx, { description: e.target.value })}
                              className="text-xs sm:text-sm min-h-[60px]"
                            />
                            <Textarea
                              placeholder="Evidence (optional) - links, notes, data."
                              value={it.evidence ?? ""}
                              onChange={(e) => updateItem(idx, { evidence: e.target.value })}
                              className="text-xs sm:text-sm min-h-[60px]"
                            />
                          </div>

                          <Separator className="my-3" />

                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                            <div className="space-y-1">
                              <div className="text-[10px] sm:text-xs text-muted-foreground">Reach</div>
                              <Input
                                type="number"
                                value={it.inputs.reach.value}
                                onChange={(e) =>
                                  updateItem(idx, {
                                    inputs: { ...it.inputs, reach: { ...it.inputs.reach, value: Number(e.target.value), timeframe } },
                                  })
                                }
                                className="text-xs sm:text-sm"
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="text-[10px] sm:text-xs text-muted-foreground">Reach unit</div>
                              <Select
                                value={it.inputs.reach.unit}
                                onValueChange={(v: any) =>
                                  updateItem(idx, { inputs: { ...it.inputs, reach: { ...it.inputs.reach, unit: v } } })
                                }
                              >
                                <SelectTrigger className="text-xs sm:text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="users">users</SelectItem>
                                  <SelectItem value="accounts">accounts</SelectItem>
                                  <SelectItem value="events">events</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1">
                              <div className="text-[10px] sm:text-xs text-muted-foreground">Impact</div>
                              <Input
                                type="number"
                                step="0.25"
                                value={it.inputs.impact}
                                onChange={(e) => updateItem(idx, { inputs: { ...it.inputs, impact: Number(e.target.value) } })}
                                className="text-xs sm:text-sm"
                              />
                              <div className="text-[9px] sm:text-[10px] text-muted-foreground">0.25-3</div>
                            </div>

                            <div className="space-y-1">
                              <div className="text-[10px] sm:text-xs text-muted-foreground">Confidence %</div>
                              <Input
                                type="number"
                                value={it.inputs.confidence}
                                onChange={(e) => updateItem(idx, { inputs: { ...it.inputs, confidence: Number(e.target.value) } })}
                                className="text-xs sm:text-sm"
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="text-[10px] sm:text-xs text-muted-foreground">Effort ({effortUnit})</div>
                              <Input
                                type="number"
                                value={it.inputs.effort}
                                onChange={(e) => updateItem(idx, { inputs: { ...it.inputs, effort: Number(e.target.value) } })}
                                className="text-xs sm:text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <div className="pt-2">
                  <Button
                    variant="secondary"
                    onClick={() => ensureRows(Math.min(10, items.length + 1))}
                    disabled={items.length >= 10 || loading}
                    className="w-full active:scale-[0.98] text-xs sm:text-sm"
                  >
                    + Add row ({items.length}/10)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <Tabs defaultValue="ranked">
              <TabsList className="grid w-full grid-cols-5 text-[10px] sm:text-xs">
                <TabsTrigger value="ranked">Ranked</TabsTrigger>
                <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
                <TabsTrigger value="sensitivity">Sensitivity</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
                <TabsTrigger value="export">Export</TabsTrigger>
              </TabsList>

              <TabsContent value="ranked" className="space-y-3">
                <Card className={isScored ? "border-green-200 bg-green-50" : ""}>
                  <CardHeader>
                    <CardTitle className="text-base">{isScored ? "Ranked backlog" : "Preview ranked backlog"}</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {isScored ? "Rationale is generated with AI." : "Preview = deterministic RICE math on your inputs."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!hasAnyTitled ? (
                      <div className="rounded-lg border bg-white p-3 text-xs sm:text-sm text-muted-foreground break-words">
                        Add items on the left. Preview ranks appear instantly once you add titles.
                      </div>
                    ) : null}

                    {hasAnyTitled && !hasPreviewRows ? (
                      <div className="rounded-lg border bg-white p-3 text-xs sm:text-sm text-muted-foreground">
                        Preview Rank | Preview Score | Confidence | Effort | Title
                      </div>
                    ) : null}

                    {viewItems.map((it) => (
                      <div key={it.itemId} className="rounded-lg border bg-white p-3">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-900 text-sm sm:text-base break-words">{it.title}</div>
                            <div className="text-[10px] sm:text-xs text-muted-foreground">{it.itemId}</div>
                          </div>

                          <div className="flex flex-wrap gap-1 sm:gap-2">
  <Badge
    className={
      isScored
        ? "bg-green-600 text-white text-[10px] sm:text-xs"
        : "text-[10px] sm:text-xs"
    }
  >
    Rank {it.computed.rank}
  </Badge>

  <Badge variant="secondary" className="text-[10px] sm:text-xs">
    Score {Number(it.computed.riceScore).toFixed(2)}
  </Badge>

  <Badge variant="outline" className="text-[10px] sm:text-xs">
    Conf {it.inputs.confidence}%
  </Badge>

  <Badge variant="outline" className="text-[10px] sm:text-xs">
    Eff {it.inputs.effort}
  </Badge>
</div>

                        </div>

                        {result ? (
                          <div className="mt-2 text-xs sm:text-sm text-slate-700">
                            <div className="text-slate-700 break-words">{it.rationale.whyThisRank}</div>
                            <div className="mt-2 flex flex-wrap gap-1 sm:gap-2">
                              <Badge variant="outline" className="text-[10px] sm:text-xs">{it.recommendedNextStep.type}</Badge>
                              <Badge variant="secondary" className="text-[10px] sm:text-xs break-words max-w-full">
                                {it.recommendedNextStep.successMetric}
                              </Badge>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="breakdown" className="space-y-3">
                <Card className={isScored ? "border-green-200 bg-green-50" : ""}>
                  <CardHeader>
                    <CardTitle className="text-base">{isScored ? "Score breakdown" : "Preview score breakdown"}</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">See the inputs behind each rank.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!hasAnyTitled ? (
                      <div className="rounded-lg border bg-white p-3 text-xs sm:text-sm text-muted-foreground">
                        Item | Reach | Impact | Confidence | Effort | Preview Score
                      </div>
                    ) : null}

                    {viewItems.map((it) => (
                      <div key={it.itemId} className="rounded-lg border bg-white p-3">
                        <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
                          <div className="font-medium text-xs sm:text-sm break-words">
                            {it.itemId} - {it.title}
                          </div>
                          <Badge variant="secondary" className="text-[10px] sm:text-xs">
                            {isScored ? `Score ${it.computed.riceScore}` : `Preview ${it.computed.riceScore}`}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px] sm:text-xs">
                          <div className="break-words">
                            Reach: {it.inputs.reach.value} {it.inputs.reach.unit}/{it.inputs.reach.timeframe}
                          </div>
                          <div>Impact: {it.inputs.impact}</div>
                          <div>Confidence: {it.inputs.confidence}%</div>
                          <div>
                            Effort: {it.inputs.effort} {effortUnit}
                          </div>
                        </div>

                        {result && it.rationale.keyAssumptions.length ? (
                          <div className="mt-3">
                            <div className="text-[10px] sm:text-xs font-medium text-slate-600">Key assumptions</div>
                            <ul className="mt-1 list-disc pl-5 text-[10px] sm:text-xs text-slate-700 space-y-1">
                              {it.rationale.keyAssumptions.slice(0, 4).map((a, i) => (
                                <li key={i} className="break-words">{a}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="sensitivity" className="space-y-3">
                <Card className={isScored ? "border-green-200 bg-green-50" : ""}>
                  <CardHeader>
                    <CardTitle className="text-base">{isScored ? "Sensitivity" : "Preview sensitivity"}</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">What changes if confidence drops or effort increases? (+/- 20%)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!hasAnyTitled ? (
                      <div className="rounded-lg border bg-white p-3 text-xs sm:text-sm text-muted-foreground">Add items first.</div>
                    ) : null}

                    {viewItems.map((it) => {
                      const s = calculateSensitivity(it);
                      return (
                        <div key={it.itemId} className="rounded-lg border bg-white p-3">
                          <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
                            <div className="font-medium text-xs sm:text-sm break-words">
                              {it.itemId} - {it.title}
                            </div>
                            <Badge className={isScored ? "bg-green-600 text-white text-[10px] sm:text-xs" : "text-[10px] sm:text-xs"}>
                              {isScored ? `Rank ${it.computed.rank}` : `Preview ${it.computed.rank}`}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px] sm:text-xs md:grid-cols-3">
                            <div className="flex items-center justify-between rounded border p-2">
                              <span className="text-muted-foreground truncate">Base</span>
                              <span className="font-medium ml-1">{s.baseScore}</span>
                            </div>
                            <div className="flex items-center justify-between rounded border p-2">
                              <span className="text-muted-foreground truncate">Conf -20%</span>
                              <span className="ml-1">{s.confidenceMinus20}</span>
                            </div>
                            <div className="flex items-center justify-between rounded border p-2">
                              <span className="text-muted-foreground truncate">Conf +20%</span>
                              <span className="ml-1">{s.confidencePlus20}</span>
                            </div>
                            <div className="flex items-center justify-between rounded border p-2">
                              <span className="text-muted-foreground truncate">Eff -20%</span>
                              <span className="ml-1">{s.effortMinus20}</span>
                            </div>
                            <div className="flex items-center justify-between rounded border p-2">
                              <span className="text-muted-foreground truncate">Eff +20%</span>
                              <span className="ml-1">{s.effortPlus20}</span>
                            </div>
                            <div className="flex items-center justify-between rounded border p-2">
                              <span className="text-muted-foreground truncate">Reach -20%</span>
                              <span className="ml-1">{s.reachMinus20}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="evidence" className="space-y-3">
                <Card className={isScored ? "border-green-200 bg-green-50" : ""}>
                  <CardHeader>
                    <CardTitle className="text-base">Missing evidence</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">{result ? "AI flagged weak inputs and evidence gaps." : "Generate to get evidence gaps."}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!result ? (
                      <div className="rounded-lg border bg-white p-3 text-xs sm:text-sm text-muted-foreground">
                        Preview: add evidence notes. Generate to get evidence gaps.
                      </div>
                    ) : null}

                    {result && missingEvidence.length === 0 ? (
                      <div className="rounded-lg border bg-white p-3 text-xs sm:text-sm text-green-700">No major evidence gaps flagged.</div>
                    ) : null}

                    {missingEvidence.map((it) => (
                      <div key={it.itemId} className="rounded-lg border bg-white p-3">
                        <div className="font-medium text-xs sm:text-sm break-words">
                          {it.itemId} - {it.title}
                        </div>
                        <ul className="mt-2 list-disc pl-5 text-[10px] sm:text-xs text-slate-700 space-y-1">
                          {it.gaps.map((g: string, i: number) => (
                            <li key={i} className="break-words">{g}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="export" className="space-y-3">
                <Card className={isScored ? "border-green-200 bg-green-50" : ""}>
                  <CardHeader>
                    <CardTitle className="text-base">Export</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">{result ? "Copy or download your results." : "Generate to enable exports."}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!result ? (
                      <div className="rounded-lg border bg-white p-3 text-xs sm:text-sm text-muted-foreground">
                        Preview: exports are available after Generate rationale + exports.
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={async () => {
                              await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
                            }}
                            className="active:scale-[0.98] text-xs sm:text-sm"
                          >
                            <Copy className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                            Copy JSON
                          </Button>
                          <Button
                            variant="outline"
                            onClick={async () => {
                              await navigator.clipboard.writeText(result.exports.markdown);
                            }}
                            className="active:scale-[0.98] text-xs sm:text-sm"
                          >
                            <FileText className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                            Copy Markdown
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              const csv = toCsv(result.exports.csvRows as any);
                              downloadText("rice_export.csv", csv, "text/csv");
                            }}
                            className="active:scale-[0.98] text-xs sm:text-sm"
                          >
                            <Download className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                            Download CSV
                          </Button>
                        </div>

                        <Separator />

                        <div>
                          <div className="mb-2 text-xs sm:text-sm font-medium">Markdown preview</div>
                          <pre className="whitespace-pre-wrap break-words rounded-lg border bg-white p-3 text-[10px] sm:text-xs overflow-x-auto">
                            {result.exports.markdown}
                          </pre>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="mt-8 text-[10px] sm:text-xs text-slate-500 text-center px-2">
          Preview = instant deterministic math. Generate = AI rationale, evidence gaps, next steps, exports.
        </div>
      </div>
    </div>
  );
}