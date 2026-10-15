import type { Proposal } from "./memory.ts";

export interface ConversationSummary {
  path: string;
  title: string;
  status: "Not extracted" | "Extracted" | "Updated";
}

export interface ReviewStats {
  reviewed: number;
  filtered: number;
  duplicates: number;
}

export interface ExtractionTask {
  id: string;
  name: string;
  sourcePath: string;
  agentDir: string;
  memoryDir?: string;
  model: { provider: string; id: string; contextWindow?: number };
  phase: "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  pid?: number;
  progress: string;
  error?: string;
  candidates: Proposal[];
  applied?: number;
  savedIds?: string[];
  quality?: ReviewStats;
  usage?: { input: number; output: number; cost: number };
}
export const TASK_LABELS = {
  running: "⏳ Running",
  completed: "✅ Done",
  failed: "⚠️ Failed",
  cancelled: "⏹ Cancelled",
} as const;
