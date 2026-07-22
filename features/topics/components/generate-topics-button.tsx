"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { generateTopicSuggestions } from "@/features/topics/actions";

export function GenerateTopicsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await generateTopicSuggestions();
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Generated ${result.data.length} topic suggestion${result.data.length === 1 ? "" : "s"}`);
      router.refresh();
    });
  }

  return (
    <Button onClick={handleClick} disabled={pending}>
      <Sparkles className="size-4" />
      {pending ? "Generating..." : "Generate suggestions"}
    </Button>
  );
}
