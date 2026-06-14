export interface DmLogEntry {
  executorId: string;
  executorTag: string;
  message: string;
  targetRole: string | null;
  excludedRole: string | null;
  sent: number;
  failed: number;
  timestamp: Date;
}

const MAX_ENTRIES = 3;

const store = new Map<string, DmLogEntry[]>();

export function addLog(guildId: string, entry: DmLogEntry): void {
  const entries = store.get(guildId) ?? [];
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  store.set(guildId, entries);
}

export function getLogs(guildId: string): DmLogEntry[] {
  return store.get(guildId) ?? [];
}
