import type { NextRequest } from "next/server";

import { handlePublishingCallback } from "@/lib/publishing/handle-callback";

export async function POST(request: NextRequest) {
  return handlePublishingCallback(request, "MAKE");
}
