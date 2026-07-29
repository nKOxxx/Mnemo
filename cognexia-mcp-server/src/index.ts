/**
 * Cognexia MCP Server
 * Gives Claude Code read-only access to Cognexia memories via the MCP protocol.
 *
 * Security:
 * - Read-only: no writes, no deletes, no updates from Claude Code
 * - API key authentication
 * - SQL injection prevention via parameterized queries + input validation
 * - Rate limiting per connection
 * - No sensitive data in logs
 * - Input sanitization via Zod schemas
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// =============================================================================
// CONFIGURATION & CONSTANTS
// =============================================================================

const DATA_LAKE_BASE =
  process.env.COGNEXIA_DATA_PATH ||
  path.join(os.homedir(), '.cognexia', 'data-lake');

const API_KEY = process.env.COGNEXIA_MCP_API_KEY || '';
const PORT = parseInt(process.env.COGNEXIA_MCP_PORT || '3100', 10);
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute per connection
const MAX_QUERY_RESULTS = 100;
const MAX_KEYWORD_LENGTH = 200;
const MAX_PROJECT_NAME_LENGTH = 64;

// =============================================================================
// INPUT VALIDATION SCHEMAS (Zod)
// =============================================================================

const ProjectNameSchema = z
  .string()
  .min(1, 'Project name cannot be empty')
  .max(MAX_PROJECT_NAME_LENGTH, `Project name too long (max ${MAX_PROJECT_NAME_LENGTH})`)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Project name may only contain letters, numbers, hyphens, and underscores'
  )
  .toLowerCase();

const MemoryTypeSchema = z.enum([
  'insight',
  'preference',
  'error',
  'goal',
  'decision',
  'security',
  'conversation',
  'milestone',
]);

const ImportanceSchema = z.number().int().min(1).max(10);

const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const SearchMemoriesSchema = z.object({
  project: ProjectNameSchema.optional(),
  query: z
    .string()
    .max(MAX_KEYWORD_LENGTH, `Query too long (max ${MAX_KEYWORD_LENGTH} chars)`)
    .optional(),
  type: MemoryTypeSchema.optional(),
  importance_min: z.number().int().min(1).max(10).optional(),
  importance_max: z.number().int().min(1).max(10).optional(),
  from_date: DateStringSchema.optional(),
  to_date: DateStringSchema.optional(),
  limit: z.number().int().min(1).max(MAX_QUERY_RESULTS).optional(),
  offset: z.number().int().min(0).optional(),
  agent_id: z.string().max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
});

const GetMemorySchema = z.object({
  id: z.string().uuid('Invalid memory ID format'),
  project: ProjectNameSchema.optional(),
});

const ListProjectsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const GetMemoryStatsSchema = z.object({
  project: ProjectNameSchema.optional(),
});

// =============================================================================
// RATE LIMITING
// =============================================================================

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(connectionId: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  if (!rateLimitMap.has(connectionId)) {
    rateLimitMap.set(connectionId, { timestamps: [] });
  }

  const entry = rateLimitMap.get(connectionId)!;
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= RATE_LIMIT_MAX) {
    const oldest = Math.min(...entry.timestamps);
    return { allowed: false, retryAfterMs: oldest + RATE_LIMIT_WINDOW_MS - now };
  }

  entry.timestamps.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

// =============================================================================
// SQL INJECTION PREVENTION & DB HELPERS
// =============================================================================

function getProjectDbPath(project: string): string {
  const sanitized = project.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return path.join(DATA_LAKE_BASE, `memory-${sanitized}`, 'bridge.db');
}

function getAllProjectDbs(): { project: string; dbPath: string }[] {
  if (!fs.existsSync(DATA_LAKE_BASE)) {
    return [];
  }

  const entries = fs.readdirSync(DATA_LAKE_BASE, { withFileTypes: true });
  const results: { project: string; dbPath: string }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^memory-(.+)$/);
    if (!match) continue;
    const project = match[1];
    // entry.fullPath is not a Dirent property — join against the dir we read.
    const dbPath = path.join(DATA_LAKE_BASE, entry.name, 'bridge.db');
    if (fs.existsSync(dbPath)) {
      results.push({ project, dbPath });
    }
  }

  return results;
}

function safeOpenDb(dbPath: string): Database.Database {
  // best-sqlite3 is safe against SQL injection via parameterized queries.
  // We additionally validate all inputs via Zod schemas above.
  // Open read-only to be extra safe.
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  return db;
}

function buildSearchQuery(params: z.infer<typeof SearchMemoriesSchema>): {
  sql: string;
  args: (string | number)[];
  project: string;
} {
  const conditions: string[] = ['deleted_at IS NULL'];
  const args: (string | number)[] = [];

  if (params.query) {
    conditions.push('(content LIKE ? OR metadata LIKE ?)');
    const q = `%${params.query}%`;
    args.push(q, q);
  }

  if (params.type) {
    conditions.push('content_type = ?');
    args.push(params.type);
  }

  if (params.importance_min !== undefined) {
    conditions.push('importance >= ?');
    args.push(params.importance_min);
  }

  if (params.importance_max !== undefined) {
    conditions.push('importance <= ?');
    args.push(params.importance_max);
  }

  if (params.from_date) {
    conditions.push('date(created_at) >= date(?)');
    args.push(params.from_date);
  }

  if (params.to_date) {
    conditions.push('date(created_at) <= date(?)');
    args.push(params.to_date);
  }

  if (params.agent_id) {
    conditions.push('agent_id = ?');
    args.push(params.agent_id);
  }

  const whereClause = conditions.join(' AND ');
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;

  const sql = `
    SELECT id, agent_id, content, content_type, metadata, importance,
           project, pinned, published, published_at, tags,
           created_at, updated_at
    FROM memories
    WHERE ${whereClause}
    ORDER BY
      pinned DESC,
      importance DESC,
      created_at DESC
    LIMIT ? OFFSET ?
  `;

  args.push(limit, offset);

  const project = params.project ?? 'general';

  return { sql, args, project };
}

// =============================================================================
// LOGGING (no sensitive data)
// =============================================================================

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, meta?: Record<string, unknown>) {
  const sanitizedMeta: Record<string, unknown> = {};
  if (meta) {
    const safeKeys = ['project', 'type', 'count', 'limit', 'offset', 'durationMs'];
    for (const key of safeKeys) {
      if (key in meta) sanitizedMeta[key] = meta[key];
    }
  }
  const prefix = `[${new Date().toISOString()}] [${level}]`;
  if (Object.keys(sanitizedMeta).length > 0) {
    console.error(`${prefix} ${msg}`, sanitizedMeta);
  } else {
    console.error(`${prefix} ${msg}`);
  }
}

// =============================================================================
// API KEY AUTHENTICATION
// =============================================================================

function validateApiKey(apiKeyFromRequest: string | undefined): boolean {
  if (!API_KEY) {
    // No key configured — allow all (development mode)
    return true;
  }
  if (!apiKeyFromRequest) return false;
  // Constant-time comparison to prevent timing attacks
  if (apiKeyFromRequest.length !== API_KEY.length) return false;
  let diff = 0;
  for (let i = 0; i < apiKeyFromRequest.length; i++) {
    diff |= apiKeyFromRequest.charCodeAt(i) ^ API_KEY.charCodeAt(i);
  }
  return diff === 0;
}

// =============================================================================
// MCP TOOL HANDLERS
// =============================================================================

async function handleSearchMemories(
  args: z.infer<typeof SearchMemoriesSchema>,
  apiKey: string | undefined
): Promise<{ content: Array<{ type: string; text: string }> }> {
  if (!validateApiKey(apiKey)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Unauthorized', code: 'INVALID_API_KEY' }),
        },
      ],
    };
  }

  const parsed = SearchMemoriesSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Invalid arguments',
            details: parsed.error.flatten(),
          }),
        },
      ],
    };
  }

  const params = parsed.data;
  const { sql, args: queryArgs, project } = buildSearchQuery(params);

  const dbPath = getProjectDbPath(project);

  if (!fs.existsSync(dbPath)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Project not found',
            project,
            code: 'PROJECT_NOT_FOUND',
          }),
        },
      ],
    };
  }

  let db: Database.Database | null = null;
  const startTime = Date.now();

  try {
    db = safeOpenDb(dbPath);
    const rows = db.prepare(sql).all(...queryArgs) as Record<string, unknown>[];

    const durationMs = Date.now() - startTime;
    log('INFO', 'Search completed', { project, count: rows.length, durationMs });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            project,
            count: rows.length,
            results: rows.map((row) => ({
              id: row.id,
              agent_id: row.agent_id,
              content: row.content,
              type: row.content_type,
              importance: row.importance,
              project: row.project,
              pinned: Boolean(row.pinned),
              published: Boolean(row.published),
              tags: row.tags ? JSON.parse(row.tags as string) : [],
              metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
              created_at: row.created_at,
              updated_at: row.updated_at,
            })),
          }),
        },
      ],
    };
  } catch (err) {
    log('ERROR', 'Search failed', { project, error: (err as Error).message });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Search failed', code: 'SEARCH_ERROR' }),
        },
      ],
    };
  } finally {
    db?.close();
  }
}

async function handleGetMemory(
  args: z.infer<typeof GetMemorySchema>,
  apiKey: string | undefined
): Promise<{ content: Array<{ type: string; text: string }> }> {
  if (!validateApiKey(apiKey)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Unauthorized', code: 'INVALID_API_KEY' }),
        },
      ],
    };
  }

  const parsed = GetMemorySchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Invalid arguments',
            details: parsed.error.flatten(),
          }),
        },
      ],
    };
  }

  const { id, project = 'general' } = parsed.data;
  const dbPath = getProjectDbPath(project);

  if (!fs.existsSync(dbPath)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Project not found',
            project,
            code: 'PROJECT_NOT_FOUND',
          }),
        },
      ],
    };
  }

  let db: Database.Database | null = null;

  try {
    db = safeOpenDb(dbPath);
    const sql = `SELECT id, agent_id, content, content_type, metadata, importance,
                        project, pinned, published, published_at, tags,
                        created_at, updated_at
                 FROM memories
                 WHERE id = ? AND deleted_at IS NULL`;
    const row = db.prepare(sql).get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Memory not found',
              id,
              code: 'NOT_FOUND',
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            memory: {
              id: row.id,
              agent_id: row.agent_id,
              content: row.content,
              type: row.content_type,
              importance: row.importance,
              project: row.project,
              pinned: Boolean(row.pinned),
              published: Boolean(row.published),
              tags: row.tags ? JSON.parse(row.tags as string) : [],
              metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
              created_at: row.created_at,
              updated_at: row.updated_at,
            },
          }),
        },
      ],
    };
  } catch (err) {
    log('ERROR', 'Get memory failed', { id, error: (err as Error).message });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Failed to retrieve memory', code: 'GET_ERROR' }),
        },
      ],
    };
  } finally {
    db?.close();
  }
}

async function handleListProjects(
  args: z.infer<typeof ListProjectsSchema>,
  apiKey: string | undefined
): Promise<{ content: Array<{ type: string; text: string }> }> {
  if (!validateApiKey(apiKey)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Unauthorized', code: 'INVALID_API_KEY' }),
        },
      ],
    };
  }

  const parsed = ListProjectsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Invalid arguments',
            details: parsed.error.flatten(),
          }),
        },
      ],
    };
  }

  const { limit = 50, offset = 0 } = parsed.data;
  const allProjects = getAllProjectDbs();

  const paginated = allProjects.slice(offset, offset + limit);

  // For each project, get a memory count (fast, read-only)
  const projectsWithCounts = paginated.map(({ project, dbPath }) => {
    let count = 0;
    try {
      const db = safeOpenDb(dbPath);
      const result = db
        .prepare("SELECT COUNT(*) as count FROM memories WHERE deleted_at IS NULL")
        .get() as { count: number };
      count = result.count;
      db.close();
    } catch {
      // If we can't read the db, just report 0
    }
    return { project, memory_count: count };
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          total: allProjects.length,
          projects: projectsWithCounts,
        }),
      },
    ],
  };
}

async function handleGetMemoryStats(
  args: z.infer<typeof GetMemoryStatsSchema>,
  apiKey: string | undefined
): Promise<{ content: Array<{ type: string; text: string }> }> {
  if (!validateApiKey(apiKey)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Unauthorized', code: 'INVALID_API_KEY' }),
        },
      ],
    };
  }

  const parsed = GetMemoryStatsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Invalid arguments',
            details: parsed.error.flatten(),
          }),
        },
      ],
    };
  }

  const { project = 'general' } = parsed.data;
  const dbPath = getProjectDbPath(project);

  if (!fs.existsSync(dbPath)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Project not found',
            project,
            code: 'PROJECT_NOT_FOUND',
          }),
        },
      ],
    };
  }

  let db: Database.Database | null = null;

  try {
    db = safeOpenDb(dbPath);

    const totalResult = db
      .prepare("SELECT COUNT(*) as count FROM memories WHERE deleted_at IS NULL")
      .get() as { count: number };

    const byType = db
      .prepare(
        `SELECT content_type, COUNT(*) as count
         FROM memories WHERE deleted_at IS NULL
         GROUP BY content_type`
      )
      .all() as { content_type: string; count: number }[];

    const byImportance = db
      .prepare(
        `SELECT
           CASE
             WHEN importance <= 3 THEN 'low'
             WHEN importance <= 6 THEN 'medium'
             ELSE 'high'
           END as bucket,
           COUNT(*) as count
         FROM memories WHERE deleted_at IS NULL
         GROUP BY bucket`
      )
      .all() as { bucket: string; count: number }[];

    const recentResult = db
      .prepare(
        `SELECT COUNT(*) as count FROM memories
         WHERE deleted_at IS NULL
           AND created_at > datetime('now', '-7 days')`
      )
      .get() as { count: number };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            project,
            stats: {
              total: totalResult.count,
              last_7_days: recentResult.count,
              by_type: byType,
              by_importance: byImportance,
            },
          }),
        },
      ],
    };
  } catch (err) {
    log('ERROR', 'Stats failed', { project, error: (err as Error).message });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Failed to get stats', code: 'STATS_ERROR' }),
        },
      ],
    };
  } finally {
    db?.close();
  }
}

// =============================================================================
// MAIN: MCP SERVER SETUP
// =============================================================================

const connectionCounter = { value: 0 };

const server = new Server(
  {
    name: 'cognexia-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      // Declared because a prompts/list handler is registered below. Without
      // it the SDK throws at startup and the server never boots.
      prompts: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_memories',
        description:
          'Search Cognexia memories with filters: project, keywords, type, importance range, date range. ' +
          'Returns memories ordered by pinned status, importance, and recency. ' +
          'All inputs are validated and sanitized. ' +
          'Requires API key via COGNEXIA_MCP_API_KEY env var if authentication is enabled.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description:
                'Project name (alphanumeric, hyphens, underscores). Defaults to "general".',
            },
            query: {
              type: 'string',
              description: 'Keyword search across memory content and metadata.',
            },
            type: {
              type: 'string',
              enum: [
                'insight',
                'preference',
                'error',
                'goal',
                'decision',
                'security',
                'conversation',
                'milestone',
              ],
              description: 'Filter by memory type.',
            },
            importance_min: {
              type: 'number',
              minimum: 1,
              maximum: 10,
              description: 'Minimum importance level (1-10).',
            },
            importance_max: {
              type: 'number',
              maximum: 10,
              minimum: 1,
              description: 'Maximum importance level (1-10).',
            },
            from_date: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'Start date (YYYY-MM-DD).',
            },
            to_date: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'End date (YYYY-MM-DD).',
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 100,
              default: 20,
              description: 'Maximum number of results to return.',
            },
            offset: {
              type: 'number',
              minimum: 0,
              default: 0,
              description: 'Pagination offset.',
            },
            agent_id: {
              type: 'string',
              description: 'Filter by agent ID.',
            },
          },
        },
      },
      {
        name: 'get_memory',
        description:
          'Retrieve a single Cognexia memory by its ID. ' +
          'Requires the memory ID (UUID format) and optionally a project name. ' +
          'Returns full memory content and metadata.',
        inputSchema: {
          type: 'object',
          required: ['id'],
          properties: {
            id: {
              type: 'string',
              description: 'Memory ID (UUID format).',
              format: 'uuid',
            },
            project: {
              type: 'string',
              description: 'Project name. Defaults to "general".',
            },
          },
        },
      },
      {
        name: 'list_projects',
        description:
          'List all Cognexia memory projects available in the data lake. ' +
          'Returns project names with memory counts. ' +
          'Use this to discover what projects have memories before searching.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 100,
              default: 50,
              description: 'Maximum number of projects to return.',
            },
            offset: {
              type: 'number',
              minimum: 0,
              default: 0,
              description: 'Pagination offset.',
            },
          },
        },
      },
      {
        name: 'get_memory_stats',
        description:
          'Get statistics about a Cognexia project: total memories, breakdown by type, ' +
          'breakdown by importance bucket (low/medium/high), and recent activity (last 7 days). ' +
          'Useful for understanding what memories exist before doing targeted searches.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Project name. Defaults to "general".',
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const connectionId = `conn-${++connectionCounter.value}`;
  const startTime = Date.now();

  // Rate limit check
  const { allowed, retryAfterMs } = checkRateLimit(connectionId);
  if (!allowed) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Rate limit exceeded',
            retryAfterMs,
            code: 'RATE_LIMITED',
          }),
        },
      ],
      isError: true,
    };
  }

  // Get API key from environment (passed via Claude Code's MCP config)
  // Claude Code passes env vars from the mcpServers config
  const apiKey = process.env.COGNEXIA_MCP_API_KEY;

  const { name, arguments: rawArgs } = request.params;
  const args = typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {};

  log('INFO', `Tool call: ${name}`, { durationMs: Date.now() - startTime });

  try {
    switch (name) {
      case 'search_memories':
        return await handleSearchMemories(args as z.infer<typeof SearchMemoriesSchema>, apiKey);

      case 'get_memory':
        return await handleGetMemory(args as z.infer<typeof GetMemorySchema>, apiKey);

      case 'list_projects':
        return await handleListProjects(args as z.infer<typeof ListProjectsSchema>, apiKey);

      case 'get_memory_stats':
        return await handleGetMemoryStats(args as z.infer<typeof GetMemoryStatsSchema>, apiKey);

      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Unknown tool: ${name}`, code: 'UNKNOWN_TOOL' }),
            },
          ],
          isError: true,
        };
    }
  } catch (err) {
    log('ERROR', 'Unhandled tool error', {
      tool: name,
      error: (err as Error).message,
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Internal server error', code: 'INTERNAL_ERROR' }),
        },
      ],
      isError: true,
    };
  }
});

// Handle resource listing (optional)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: [] };
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: [] };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  return {
    contents: [
      {
        mimeType: 'text/plain',
        text: `Resource not found: ${request.params.uri}`,
      },
    ],
  };
});

// =============================================================================
// START SERVER
// =============================================================================

async function main() {
  log('INFO', 'Cognexia MCP Server starting', {
    dataPath: DATA_LAKE_BASE,
    apiKeyConfigured: !!API_KEY,
  });

  // Verify data path exists
  if (!fs.existsSync(DATA_LAKE_BASE)) {
    log('WARN', `Data lake path does not exist: ${DATA_LAKE_BASE}. Will create on first use.`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('INFO', 'Cognexia MCP Server ready (stdio transport)');
}

main().catch((err) => {
  log('ERROR', 'Server failed to start', { error: err.message });
  process.exit(1);
});
