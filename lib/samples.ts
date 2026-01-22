import type { BacklogInputItem } from "@/lib/schema";

export const sampleSaaS: BacklogInputItem[] = [
  {
    itemId: "I1",
    title: "Onboarding checklist",
    description: "Interactive first-run experience to reduce drop-off after signup.",
    evidence: "40% drop-off after signup",
    inputs: { reach: { value: 5000, unit: "users", timeframe: "month" }, impact: 1, confidence: 95, effort: 3 },
  },
  {
    itemId: "I2",
    title: "Slack integration",
    description: "Post notifications to Slack channels for teams.",
    evidence: "Top requested feature in survey (23 votes)",
    inputs: { reach: { value: 3000, unit: "users", timeframe: "month" }, impact: 2, confidence: 85, effort: 10 },
  },
  {
    itemId: "I3",
    title: "2FA authentication",
    description: "Add two-factor authentication for enterprise customers.",
    evidence: "3 enterprise clients requested this",
    inputs: { reach: { value: 500, unit: "accounts", timeframe: "month" }, impact: 3, confidence: 90, effort: 13 },
  },
  {
    itemId: "I4",
    title: "API rate limit dashboard",
    description: "Show real-time API usage and limits.",
    evidence: "",
    inputs: { reach: { value: 1200, unit: "users", timeframe: "month" }, impact: 1, confidence: 70, effort: 5 },
  },
  {
    itemId: "I5",
    title: "Bulk email templates",
    description: "Allow users to create and save reusable email templates.",
    evidence: "",
    inputs: { reach: { value: 2000, unit: "users", timeframe: "month" }, impact: 2, confidence: 80, effort: 8 },
  },
  {
    itemId: "I6",
    title: "Advanced analytics",
    description: "Custom reports and data export features.",
    evidence: "",
    inputs: { reach: { value: 800, unit: "users", timeframe: "month" }, impact: 3, confidence: 60, effort: 21 },
  },
  {
    itemId: "I7",
    title: "Team collaboration",
    description: "Real-time co-editing and commenting.",
    evidence: "",
    inputs: { reach: { value: 600, unit: "users", timeframe: "month" }, impact: 3, confidence: 40, effort: 21 },
  },
  {
    itemId: "I8",
    title: "Mobile app (iOS)",
    description: "Native iOS app for on-the-go access.",
    evidence: "",
    inputs: { reach: { value: 1500, unit: "users", timeframe: "month" }, impact: 2, confidence: 50, effort: 34 },
  },
];

export const sampleConsumer: BacklogInputItem[] = [
  {
    itemId: "I1",
    title: "Push notifications",
    description: "Engagement alerts and updates.",
    evidence: "Similar apps see 2x retention",
    inputs: { reach: { value: 20000, unit: "users", timeframe: "month" }, impact: 2, confidence: 85, effort: 8 },
  },
  {
    itemId: "I2",
    title: "Social sharing",
    description: "Share to Instagram, TikTok, Twitter.",
    evidence: "",
    inputs: { reach: { value: 12000, unit: "users", timeframe: "month" }, impact: 2, confidence: 80, effort: 8 },
  },
  {
    itemId: "I3",
    title: "Dark mode",
    description: "System-wide dark theme toggle.",
    evidence: "Reddit thread with 500+ upvotes",
    inputs: { reach: { value: 8000, unit: "users", timeframe: "month" }, impact: 1, confidence: 90, effort: 5 },
  },
  {
    itemId: "I4",
    title: "AI photo filters",
    description: "ML-powered aesthetic filters.",
    evidence: "Competitor feature driving 30% engagement",
    inputs: { reach: { value: 15000, unit: "users", timeframe: "month" }, impact: 3, confidence: 60, effort: 21 },
  },
  {
    itemId: "I5",
    title: "Offline mode",
    description: "Cache content for offline viewing.",
    evidence: "",
    inputs: { reach: { value: 3000, unit: "users", timeframe: "month" }, impact: 2, confidence: 70, effort: 13 },
  },
  {
    itemId: "I6",
    title: "Referral program",
    description: "Invite friends, earn rewards.",
    evidence: "",
    inputs: { reach: { value: 5000, unit: "users", timeframe: "month" }, impact: 3, confidence: 75, effort: 13 },
  },
];
