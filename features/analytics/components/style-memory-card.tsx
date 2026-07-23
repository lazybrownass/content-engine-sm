import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsOverview } from "@/features/analytics/queries";
import type { StyleMemoryForPrompt } from "@/features/generation/prompt";

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function BadgeGroup({ label, values, variant }: {
  label: string;
  values: string[];
  variant?: "default" | "secondary" | "destructive" | "outline";
}) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <Badge key={value} variant={variant}>
            {value}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function StyleMemoryCard({
  styleMemory,
  sampleGate,
}: {
  styleMemory: StyleMemoryForPrompt | null;
  sampleGate: AnalyticsOverview["sampleGate"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Style Memory</CardTitle>
        <CardDescription>
          {styleMemory
            ? "Learned from the author's highest-performing published posts."
            : `Style memory hasn't learned anything yet — needs ${sampleGate.scoredPostCount}/${sampleGate.threshold} published posts with logged metrics.`}
        </CardDescription>
      </CardHeader>
      {styleMemory && (
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {styleMemory.avgSentenceLength !== null && (
              <StatRow label="Avg sentence length" value={`${Math.round(styleMemory.avgSentenceLength)} words`} />
            )}
            {styleMemory.emojiUsageRate !== null && (
              <StatRow label="Emoji usage" value={`${styleMemory.emojiUsageRate.toFixed(1)} per 100 words`} />
            )}
          </div>
          <BadgeGroup
            label="Top-performing hooks"
            values={styleMemory.hookPatterns.map((h) => h.pattern)}
            variant="secondary"
          />
          <BadgeGroup label="Favorite vocabulary" values={styleMemory.favoriteVocabulary} variant="outline" />
          <BadgeGroup label="Avoided phrases" values={styleMemory.avoidedPhrases} variant="destructive" />
        </CardContent>
      )}
    </Card>
  );
}
