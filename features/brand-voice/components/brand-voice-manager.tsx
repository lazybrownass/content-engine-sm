"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BrandVoice } from "@prisma/client";
import { Plus, Star } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { deleteBrandVoice, setDefaultBrandVoice } from "@/features/brand-voice/actions";

import { BrandVoiceFormDrawer } from "./brand-voice-form-drawer";

type DrawerState = { mode: "create" } | { mode: "edit"; voice: BrandVoice };

export function BrandVoiceManager({ voices }: { voices: BrandVoice[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);

  function handleSuccess() {
    setDrawerState(null);
    router.refresh();
  }

  async function handleSetDefault(id: string) {
    const result = await setDefaultBrandVoice(id);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    router.refresh();
  }

  async function handleDelete(id: string) {
    const result = await deleteBrandVoice(id);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Brand voice deleted");
    router.refresh();
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="outline" size="sm" />}>
          Manage brand voices
        </SheetTrigger>
        <SheetContent className="flex flex-col gap-4 overflow-y-auto sm:max-w-md">
          <SheetHeader className="flex-row items-center justify-between">
            <SheetTitle>Brand voices</SheetTitle>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="New brand voice"
              onClick={() => setDrawerState({ mode: "create" })}
            >
              <Plus />
            </Button>
          </SheetHeader>

          {voices.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground">
              No brand voices yet. Create one to guide tone, forbidden words, and formatting.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 px-4">
              {voices.map((voice) => (
                <li
                  key={voice.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{voice.name}</span>
                      {voice.isDefault ? <Badge>Default</Badge> : null}
                    </div>
                    {voice.tone.length > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {voice.tone.join(", ")}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    {!voice.isDefault && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Set ${voice.name} as default`}
                        onClick={() => handleSetDefault(voice.id)}
                      >
                        <Star />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDrawerState({ mode: "edit", voice })}
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(voice.id)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SheetContent>
      </Sheet>

      <BrandVoiceFormDrawer
        open={drawerState !== null}
        onOpenChange={(next) => !next && setDrawerState(null)}
        voice={drawerState?.mode === "edit" ? drawerState.voice : undefined}
        onSuccess={handleSuccess}
      />
    </>
  );
}
