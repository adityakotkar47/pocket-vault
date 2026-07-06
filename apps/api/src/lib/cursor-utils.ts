import type { CursorParts } from "@pocketvault/db";

export function parseCursor(cursor: string): CursorParts | null {
  // Split on the first underscore only so CUID2 ids containing underscores are preserved
  const separatorIndex = cursor.indexOf("_");
  if (separatorIndex === -1) return null;

  const createdAt = cursor.slice(0, separatorIndex);
  const id = cursor.slice(separatorIndex + 1);

  if (!createdAt || !id) return null;

  // new Date() never throws — it returns an Invalid Date instead, so we must check isNaN
  const parsed = new Date(createdAt);
  if (isNaN(parsed.getTime())) return null;

  return { createdAt, id };
}

export function buildCursorCondition(cursor: string) {
  const parsed = parseCursor(cursor);
  if (!parsed) return {};

  return {
    OR: [
      { createdAt: { lt: new Date(parsed.createdAt) } },
      {
        createdAt: new Date(parsed.createdAt),
        id: { lt: parsed.id },
      },
    ],
  };
}

export function createCursor(createdAt: Date | string, id: string): string {
  const timestamp =
    createdAt instanceof Date ? createdAt.toISOString() : createdAt;
  return `${timestamp}_${id}`;
}
