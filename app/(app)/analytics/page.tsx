import { requireOwner } from "@/lib/auth/require-owner";
import { getAnalyticsOverview, getRecentAnalyticsSnapshots, getStyleMemoryForPrompt } from "@/features/analytics/queries";
import { AnalyticsOverviewCards } from "@/features/analytics/components/analytics-overview-cards";
import { StyleMemoryCard } from "@/features/analytics/components/style-memory-card";
import { PerformanceSnapshotTable } from "@/features/analytics/components/performance-snapshot-table";

export default async function AnalyticsPage() {
  const ownerId = await requireOwner();

  const [overview, styleMemory, recentSnapshots] = await Promise.all([
    getAnalyticsOverview(),
    getStyleMemoryForPrompt(ownerId),
    getRecentAnalyticsSnapshots(20),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Performance history and the learned style profile driving new drafts and topic suggestions.
        </p>
      </div>

      <AnalyticsOverviewCards overview={overview} />
      <StyleMemoryCard styleMemory={styleMemory} sampleGate={overview.sampleGate} />
      <PerformanceSnapshotTable snapshots={recentSnapshots} />
    </div>
  );
}
