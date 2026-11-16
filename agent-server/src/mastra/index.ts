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
import { initCrRegistry } from './lib/cr-registry';
import { initCrNames } from './lib/cr-names';
import { checkCrTool } from './tools/check-cr';
import { extractPagesTool } from './tools/extract-pages';
import { finalizeResultTool } from './tools/finalize-result';
import { findCompetitorsTool } from './tools/find-competitors';
import { identifyCandidatesTool } from './tools/identify-candidates';
import { searchCorpusTool } from './tools/search-corpus';
import { searchWebTool } from './tools/search-web';
import { validateCandidateTool } from './tools/validate-candidate';
import { predictSurvivalTool } from './tools/predict-survival';

// The Ministry of Commerce list of active registrations, held in memory for the CR check (Task 3).
await initCrRegistry();
// The company-name fingerprints, for the legal-name check (Task 8).
await initCrNames();

export const mastra = new Mastra({
  bundler: {
    externals: ['@duckdb/node-bindings'],
  },
  agents: { conversationalAgent, competitorAgent },
  // Listed here too, so each tool can be run by hand in Studio's Tools tab.
  // The tools of the earlier design (similarity_search, web_search, ...) are kept in src/mastra/tools but no
  // longer connected: the Competitor Agent is being rebuilt from the final design.
  tools: {
    checkCrTool,
    extractPagesTool,
    identifyCandidatesTool,
    searchCorpusTool,
    searchWebTool,
    validateCandidateTool,
    findCompetitorsTool,
    finalizeResultTool,
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
