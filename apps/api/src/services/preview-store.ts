import { randomBytes } from 'crypto';
import { ProcessedLead, ImportSummary } from '@prospector/types';

interface PreviewEntry {
  createdAt: number;
  filename: string;
  source: 'CSV' | 'PASTE' | 'XLSX' | 'TEST';
  summary: ImportSummary;
  processed: ProcessedLead[];
}

const TTL_MS = 60 * 60 * 1000; // 1 hora
const MAX_ENTRIES = 200;

const store = new Map<string, PreviewEntry>();

export function createPreviewId(): string {
  return `imp_${randomBytes(8).toString('hex')}`;
}

export function savePreview(entry: Omit<PreviewEntry, 'createdAt'>): string {
  prune();
  const id = createPreviewId();
  store.set(id, { ...entry, createdAt: Date.now() });
  return id;
}

export function getPreview(id: string): PreviewEntry | null {
  const entry = store.get(id);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(id);
    return null;
  }
  return entry;
}

export function deletePreview(id: string): void {
  store.delete(id);
}

function prune(): void {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.createdAt > TTL_MS) store.delete(id);
  }
  if (store.size > MAX_ENTRIES) {
    const sorted = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    const overflow = store.size - MAX_ENTRIES;
    for (let i = 0; i < overflow; i += 1) store.delete(sorted[i][0]);
  }
}
