// SQLite (via Prisma) ne supporte pas le type Json natif : les champs
// "liste"/"objet" sont stockes en base comme des colonnes String contenant
// du JSON serialise. Ces helpers centralisent la (de)serialisation.

export function toJsonString(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function asStringArray(value: unknown): string[] {
  const parsed = typeof value === "string" ? safeParse(value) : value;
  if (Array.isArray(parsed)) {
    return parsed.filter((v): v is string => typeof v === "string");
  }
  return [];
}

export function asObject<T>(value: unknown, fallback: T): T {
  const parsed = typeof value === "string" ? safeParse(value) : value;
  if (parsed && typeof parsed === "object") {
    return parsed as T;
  }
  return fallback;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
