"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AutomationProvider } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatEnumLabel } from "@/lib/utils";
import { createAutomationProvider, testAutomationProvider } from "@/features/publishing/actions";

export function ProviderSetupForm({ providers }: { providers: AutomationProvider[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [type, setType] = useState<"N8N" | "MAKE">("N8N");
  const [label, setLabel] = useState("");
  const [configRef, setConfigRef] = useState("");
  const [signingSecretRef, setSigningSecretRef] = useState("");
  const [creating, startCreating] = useTransition();
  const [testingId, setTestingId] = useState<string | null>(null);

  const configuredProviders = providers.filter((provider) => provider.type !== "MANUAL");

  function handleCreate() {
    startCreating(async () => {
      const result = await createAutomationProvider({ type, label, configRef, signingSecretRef });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Provider added — test it before scheduling with it");
      setLabel("");
      setConfigRef("");
      setSigningSecretRef("");
      router.refresh();
    });
  }

  async function handleTest(id: string) {
    setTestingId(id);
    const result = await testAutomationProvider({ id });
    setTestingId(null);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    if (result.data.lastTestOk) {
      toast.success("Test ping succeeded — provider is active");
    } else {
      toast.error("Test ping failed — check the webhook URL and signing secret");
    }
    router.refresh();
  }

  return (
    <div className="rounded-lg border p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between text-sm font-medium"
        aria-expanded={expanded}
        aria-controls="automation-providers-panel"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span>Automation providers</span>
        <span className="text-muted-foreground">{expanded ? "Hide" : "Manage"}</span>
      </button>

      {expanded && (
        <div id="automation-providers-panel" className="mt-4 flex flex-col gap-4">
          {configuredProviders.length > 0 && (
            <div className="flex flex-col gap-2">
              {configuredProviders.map((provider) => (
                <div
                  key={provider.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm"
                >
                  <span>
                    {provider.label} ({formatEnumLabel(provider.type)})
                    {provider.isActive
                      ? " — active"
                      : provider.lastTestOk === false
                        ? " — test failed"
                        : " — untested"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTest(provider.id)}
                    disabled={testingId === provider.id}
                  >
                    {testingId === provider.id ? "Testing..." : "Send test ping"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" htmlFor="provider-type">
                Type
              </label>
              <Select value={type} onValueChange={(value) => value && setType(value as "N8N" | "MAKE")}>
                <SelectTrigger id="provider-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="N8N">n8n</SelectItem>
                  <SelectItem value="MAKE">Make</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Input placeholder="Webhook URL" value={configRef} onChange={(e) => setConfigRef(e.target.value)} />
            <Input
              placeholder="Env var name (e.g. N8N_SIGNING_SECRET)"
              value={signingSecretRef}
              onChange={(e) => setSigningSecretRef(e.target.value)}
            />
            <Button size="sm" onClick={handleCreate} disabled={creating || !label || !configRef || !signingSecretRef}>
              {creating ? "Adding..." : "Add"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
