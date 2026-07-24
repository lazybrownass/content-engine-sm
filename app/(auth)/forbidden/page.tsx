import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignOutButton } from "./sign-out-button";

export default function ForbiddenPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <h1 className="sr-only">Access restricted</h1>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Access restricted</CardTitle>
          <CardDescription>
            This account isn&apos;t authorized to use this tool.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
