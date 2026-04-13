import { timingSafeEqual } from "node:crypto";

const BEARER_PREFIX = /^Bearer\s+/i;

/**
 * Constant-time comparison for UTF-8 secrets from Authorization or header fallback.
 */
export function verifySecret(
  authorizationHeader: string | null,
  stevedoreSecretHeader: string | null,
  expectedSecret: string,
): boolean {
  const provided = extractProvidedSecret(authorizationHeader, stevedoreSecretHeader);
  if (provided === undefined) return false;
  return constantTimeEqualUtf8(provided, expectedSecret);
}

function extractProvidedSecret(
  authorizationHeader: string | null,
  stevedoreSecretHeader: string | null,
): string | undefined {
  if (authorizationHeader) {
    const trimmed = authorizationHeader.trim();
    if (BEARER_PREFIX.test(trimmed)) {
      return trimmed.replace(BEARER_PREFIX, "").trim();
    }
  }
  if (stevedoreSecretHeader && stevedoreSecretHeader.trim() !== "") {
    return stevedoreSecretHeader.trim();
  }
  return undefined;
}

function constantTimeEqualUtf8(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  const maxLen = Math.max(bufA.length, bufB.length, 1);
  const padA = Buffer.alloc(maxLen);
  const padB = Buffer.alloc(maxLen);
  bufA.copy(padA);
  bufB.copy(padB);
  const sameLength = bufA.length === bufB.length;
  return sameLength && timingSafeEqual(padA, padB);
}
