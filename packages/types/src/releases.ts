import { z } from "zod";

// Approve-before-deploy releases (Admin → Releases). A tag names the same
// version of both images: "sha-<commit>" for builds from master, or a
// semantic version (1.2.3) for tagged releases.
export const RELEASE_TAG_RE = /^(sha-[0-9a-f]{7,40}|\d+\.\d+\.\d+)$/;

export const releaseAnnounceSchema = z.object({
  tag: z.string().regex(RELEASE_TAG_RE, "tag must look like sha-1a2b3c4 or 1.2.3"),
  commitSha: z.string().max(64).optional(),
  message: z.string().max(2000).optional(),
  author: z.string().max(200).optional(),
  url: z.string().url().max(500).optional(),
});
export type ReleaseAnnounceDto = z.infer<typeof releaseAnnounceSchema>;

export const RELEASE_STATUSES = ["AVAILABLE", "DEPLOYING", "DEPLOYED", "FAILED", "SKIPPED"] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];
