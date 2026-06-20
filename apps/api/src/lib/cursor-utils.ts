import type { CursorParts } from "@pocketvault/db";

export function parseCursor(cursor: string): CursorParts | null {
  const parts = cursor.split("_");
  if (parts.length !== 2) return null;

  const [createdAt, id] = parts;
  if (!createdAt || !id) return null;

  try {
    new Date(createdAt);
    return { createdAt, id };
  } catch {
    return null;
  }
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
