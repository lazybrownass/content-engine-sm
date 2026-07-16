export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowList = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowList.includes(email.toLowerCase());
}
