import type { MetadataRoute } from "next";

// Everything in this app is behind the owner-only auth gate — nothing here is
// meant to be publicly indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
