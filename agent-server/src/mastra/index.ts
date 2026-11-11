import { Mastra } from '@mastra/core/mastra';
import { DuckDBStore } from '@mastra/duckdb';
import { MastraCompositeStore } from '@mastra/core/storage';
import {
  MastraStorageExporter,
  MastraPlatformExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';
import { competitorAgent } from './agents/competitor-agent';
import { conversationalAgent } from './agents/conversational-agent';
import { darbStore } from './lib/storage';
import { authMiddleware } from './server/auth';
import { finalizeResultTool } from './tools/finalize-result';
import { judgeCandidatesTool } from './tools/judge-candidates';
import { predictSurvivalTool } from './tools/predict-survival';

export const mastra = new Mastra({
  bundler: {
    externals: ['@duckdb/node-bindings'],
  },
  agents: { conversationalAgent, competitorAgent },
  // Listed here too, so each tool can be run by hand in Studio's Tools tab.
  // The tools of the earlier design (similarity_search, web_search, ...) are kept in src/mastra/tools but no
  // longer connected: the Competitor Agent is being rebuilt from the final design.
  tools: {
    finalizeResultTool,
    judgeCandidatesTool,
    predictSurvivalTool,
  },
  // Mastra's own data lives in Postgres (the "mastra" schema), so it survives restarts on the host.
  // During development, traces go to a local file instead, to keep test runs out of the database.
  storage:
    process.env.NODE_ENV === 'production'
      ? darbStore
      : new MastraCompositeStore({
          id: 'composite-storage',
          default: darbStore,
          domains: { observability: await new DuckDBStore().getStore('observability') },
        }),
  server: {
    // Every API request is checked first: the founder's id comes from their Supabase login (server/auth.ts).
    middleware: [{ path: '/api/*', handler: authMiddleware }],
    // Live, only the Darb website may call the server.
    ...(process.env.WEBSITE_ORIGIN
      ? {
          cors: {
            origin: process.env.WEBSITE_ORIGIN.split(',').map((o) => o.trim()),
            allowMethods: ['GET', 'POST', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization'],
            credentials: false,
          },
        }
      : {}),
  },
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [new MastraStorageExporter(), new MastraPlatformExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
