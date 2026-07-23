import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportDataButton } from "@/features/settings/components/export-data-button";

export const metadata: Metadata = {
  title: "Settings — LinkedIn Content Engine",
  description: "Export your data.",
};

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export your data</CardTitle>
          <CardDescription>
            Download a JSON archive of your knowledge base, posts, topics, brand voices, and
            pipeline/model-routing history. This is your business data — it&apos;s never locked
            into this app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExportDataButton />
        </CardContent>
      </Card>
    </div>
  );
}
