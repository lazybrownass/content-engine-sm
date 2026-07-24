import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthButtons } from "./auth-buttons";

export const metadata: Metadata = {
  title: "Sign in — LinkedIn Content Engine",
  description: "Sign in with your owner email to access the content pipeline.",
};

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <h1 className="sr-only">Sign in — LinkedIn Content Engine</h1>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>LinkedIn Content Engine</CardTitle>
          <CardDescription>Sign in to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthButtons />
        </CardContent>
      </Card>
    </div>
  );
}
