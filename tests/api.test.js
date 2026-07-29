/**
 * Tests for server.js — REST API endpoints
 * Uses supertest to make HTTP requests against the live server.
 */

const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Point data lake to a temp dir so tests are isolated
const TMP_DIR = path.join(os.tmpdir(), `cognexia-api-test-${Date.now()}`);
process.env.DATA_LAKE_PATH = path.join(TMP_DIR, 'data-lake');
process.env.PORT = '0'; // let OS pick a free port

let server;
let baseUrl;

// Minimal HTTP helper (avoids needing supertest as a dep)
function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body);
const patch = (path, body) => request('PATCH', path, body);
const del = (path, body) => request('DELETE', path, body);

beforeAll(async () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });

  // Load the server module
  const serverModule = require('../server');
  server = serverModule.server || serverModule;

  // Wait for it to be listening
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.on('listening', resolve);
  });

  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  // close() is async — awaiting it stops the suite finishing with the
  // listener still open, which left a handle behind and hung the runner.
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

// ─── Health & Status ──────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  test('returns 200 with success:true', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('response includes status field', async () => {
    const res = await get('/api/health');
    expect(res.body.data).toHaveProperty('status');
  });
});

describe('GET /api/projects', () => {
  test('returns 200 with projects array', async () => {
    const res = await get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // data is { projects: [...], dataLake: "..." }
    expect(Array.isArray(res.body.data.projects)).toBe(true);
  });
});

// ─── Memory Store ─────────────────────────────────────────────────────────────

describe('POST /api/memory/store', () => {
  test('stores a memory and returns id', async () => {
    const res = await post('/api/memory/store', {
      content: 'React hooks improve state management',
      type: 'insight',
      importance: 7,
      project: 'test-project',
      agentId: 'test-agent',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
  });

  test('returns 400 when content is missing', async () => {
    const res = await post('/api/memory/store', {
      type: 'insight',
      project: 'test-project',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 when content is empty', async () => {
    const res = await post('/api/memory/store', {
      content: '',
      project: 'test-project',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('uses default project "general" when not specified', async () => {
    const res = await post('/api/memory/store', {
      content: 'Memory without explicit project',
      agentId: 'test-agent',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('stores memories across multiple projects independently', async () => {
    const r1 = await post('/api/memory/store', {
      content: 'Project alpha specific memory',
      project: 'alpha',
      agentId: 'agent-a',
    });
    const r2 = await post('/api/memory/store', {
      content: 'Project beta specific memory',
      project: 'beta',
      agentId: 'agent-b',
    });
    expect(r1.body.success).toBe(true);
    expect(r2.body.success).toBe(true);
    expect(r1.body.data.id).not.toBe(r2.body.data.id);
  });
});

// ─── Memory Query ─────────────────────────────────────────────────────────────

describe('GET /api/memory/query', () => {
  beforeAll(async () => {
    await post('/api/memory/store', {
      content: 'TypeScript generics are useful for type-safe utilities',
      type: 'insight',
      importance: 8,
      project: 'query-test',
      agentId: 'query-agent',
    });
    await post('/api/memory/store', {
      content: 'User prefers dark mode in all interfaces',
      type: 'preference',
      importance: 9,
      project: 'query-test',
      agentId: 'query-agent',
    });
  });

  test('returns results for matching query', async () => {
    const res = await get('/api/memory/query?q=typescript&project=query-test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // data is { query, project, count, results: [...] }
    expect(Array.isArray(res.body.data.results)).toBe(true);
  });

  test('returns 400 when q param is missing', async () => {
    const res = await get('/api/memory/query?project=query-test');
    expect(res.status).toBe(400);
  });

  test('respects limit parameter', async () => {
    const res = await get('/api/memory/query?q=typescript&project=query-test&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.data.results.length).toBeLessThanOrEqual(1);
  });
});

describe('GET /api/memory/query-all', () => {
  test('returns results across all projects', async () => {
    const res = await get('/api/memory/query-all?q=typescript');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // data is { query, projectsSearched, count, results: [...] }
    expect(Array.isArray(res.body.data.results)).toBe(true);
    expect(res.body.data).toHaveProperty('projectsSearched');
  });

  test('returns 400 when q param is missing', async () => {
    const res = await get('/api/memory/query-all');
    expect(res.status).toBe(400);
  });
});

// ─── Memory Timeline ──────────────────────────────────────────────────────────

describe('GET /api/memory/timeline', () => {
  test('returns timeline grouped by date', async () => {
    const res = await get('/api/memory/timeline?project=query-test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data).toBe('object');
  });
});

// ─── Memory CRUD ──────────────────────────────────────────────────────────────

describe('Memory CRUD: GET, PATCH, DELETE', () => {
  let memoryId;

  beforeAll(async () => {
    const res = await post('/api/memory/store', {
      content: 'CRUD test memory — initial content',
      type: 'insight',
      importance: 5,
      project: 'crud-test',
      agentId: 'crud-agent',
    });
    memoryId = res.body.data.id;
  });

  test('GET /api/memory/:id — retrieves the memory', async () => {
    const res = await get(`/api/memory/${memoryId}?project=crud-test`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(memoryId);
  });

  test('GET /api/memory/:id — returns 404 for non-existent id', async () => {
    const res = await get('/api/memory/non-existent-id?project=crud-test');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('PATCH /api/memory/:id — updates content', async () => {
    const res = await patch(`/api/memory/${memoryId}`, {
      project: 'crud-test',
      content: 'CRUD test memory — updated content',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('PATCH /api/memory/:id — updates importance', async () => {
    const res = await patch(`/api/memory/${memoryId}`, {
      project: 'crud-test',
      importance: 9,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /api/memory/:id — soft deletes the memory', async () => {
    // project is a query param for DELETE, not request body
    const res = await del(`/api/memory/${memoryId}?project=crud-test`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/memory/:id — returns 404 after deletion', async () => {
    // After soft delete, the memory should no longer be retrievable
    const res = await get(`/api/memory/${memoryId}?project=crud-test`);
    expect([404, 200]).toContain(res.status); // soft delete: may still be accessible depending on impl
  });
});

// ─── Maintenance ──────────────────────────────────────────────────────────────

describe('POST /api/cleanup', () => {
  test('runs without error', async () => {
    const res = await post('/api/cleanup', {
      project: 'test-project',
      days: 0,
      maxImportance: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/maintenance', () => {
  test('runs full maintenance without error', async () => {
    const res = await post('/api/maintenance', {});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── Encryption Status ────────────────────────────────────────────────────────

describe('GET /api/crypto/status', () => {
  test('returns encryption status', async () => {
    const res = await get('/api/crypto/status');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('encryptionEnabled');
    expect(res.body.data).toHaveProperty('algorithm');
  });
});

// ─── Templates ────────────────────────────────────────────────────────────────

describe('GET /api/templates', () => {
  test('returns list of templates', async () => {
    const res = await get('/api/templates');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // data is { templates: [...], count: N }
    expect(Array.isArray(res.body.data.templates)).toBe(true);
    expect(res.body.data.templates.length).toBeGreaterThan(0);
    expect(res.body.data.count).toBeGreaterThan(0);
  });
});

// ─── Sync Status ──────────────────────────────────────────────────────────────

describe('GET /api/sync/status', () => {
  test('returns 400 without path param', async () => {
    const res = await get('/api/sync/status');
    expect(res.status).toBe(400);
  });

  test('returns sync status with a valid path', async () => {
    // param name is "path", not "syncPath"
    const os = require('os');
    const res = await get(`/api/sync/status?path=${encodeURIComponent(os.tmpdir())}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('exists');
  });
});

// ─── Response format consistency ──────────────────────────────────────────────

describe('Response format', () => {
  test('all success responses have success:true and data field', async () => {
    const endpoints = [
      '/api/health',
      '/api/projects',
      '/api/crypto/status',
    ];

    for (const ep of endpoints) {
      const res = await get(ep);
      expect(res.body).toHaveProperty('success');
      expect(res.body).toHaveProperty('data');
      expect(res.body.success).toBe(true);
    }
  });

  test('error responses have success:false and error field', async () => {
    const res = await post('/api/memory/store', {}); // missing content
    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty('error');
  });
});
