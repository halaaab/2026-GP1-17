// The one Postgres connection Mastra uses for its own data: conversation memory, threads, and live traces.
// Everything goes in the "mastra" schema of the Darb database, away from our public tables.
// Hosting providers wipe local files on every restart, so nothing Mastra needs may live in a local file.
import { PostgresStore } from '@mastra/pg';

// Dev hot-reload re-runs this file, so the store is kept on globalThis to avoid opening a new connection each time.
const globalForStorage = globalThis as unknown as { darbStore?: PostgresStore };

export const darbStore =
  globalForStorage.darbStore ??
  new PostgresStore({
    id: 'darb-storage',
    connectionString: process.env.DATABASE_URL!,
    schemaName: 'mastra',
  });
globalForStorage.darbStore = darbStore;
