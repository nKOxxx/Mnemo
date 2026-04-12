#!/usr/bin/env node

/**
 * Cognexia CLI
 * Command-line interface for managing memories
 * Connects to: http://localhost:10000/api
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

class CognexiaCLI {
  constructor() {
    this.apiUrl = 'http://localhost:10000/api';
    this.configPath = path.join(os.homedir(), '.cognexia', 'cli-config.json');
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch (e) {
      // Ignore errors
    }
    return { project: 'general', apiUrl: this.apiUrl };
  }

  saveConfig() {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save config:', e.message);
    }
  }

  async request(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.apiUrl + endpoint);
      const opts = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        timeout: 5000
      };

      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.success === false) {
              reject(new Error(json.error || 'API error'));
            } else {
              resolve(json.data || json);
            }
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', (e) => {
        if (e.code === 'ECONNREFUSED') {
          reject(new Error('Cannot connect to Cognexia server (http://localhost:10000). Is it running?'));
        } else {
          reject(e);
        }
      });

      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  }

  log(message, style = '') {
    const prefix = `${colors.cyan}cognexia${colors.reset}`;
    if (style) {
      console.log(`${prefix} ${colors[style]}${message}${colors.reset}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  logSuccess(message) {
    console.log(`${colors.green}✓${colors.reset} ${message}`);
  }

  logError(message) {
    console.error(`${colors.red}✗${colors.reset} ${message}`);
  }

  logWarning(message) {
    console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
  }

  logTable(rows) {
    if (!rows.length) {
      this.logWarning('No results');
      return;
    }

    const columns = Object.keys(rows[0]);
    const widths = columns.map(col => col.length);

    rows.forEach(row => {
      columns.forEach((col, i) => {
        const val = String(row[col] || '').substring(0, 50);
        widths[i] = Math.max(widths[i], val.length);
      });
    });

    // Header
    const header = columns.map((col, i) => col.padEnd(widths[i])).join('  ');
    console.log(`${colors.bright}${colors.cyan}${header}${colors.reset}`);
    console.log(columns.map((_, i) => '─'.repeat(widths[i])).join('  '));

    // Rows
    rows.forEach(row => {
      const vals = columns.map((col, i) => {
        const val = String(row[col] || '').substring(0, 50);
        return val.padEnd(widths[i]);
      }).join('  ');
      console.log(vals);
    });
  }

  async store(content, options = {}) {
    try {
      const body = {
        project: options.project || this.config.project,
        content,
        type: options.type || 'insight',
        importance: parseInt(options.importance) || 5,
        agentId: 'cli'
      };

      const result = await this.request('/memory/store', {
        method: 'POST',
        body
      });

      this.logSuccess(`Memory stored (${result.id.slice(0, 8)})`);
      if (options.verbose) {
        console.log(`  Content: ${content.substring(0, 60)}...`);
        console.log(`  Type: ${body.type}`);
        console.log(`  Importance: ${body.importance}/10`);
      }
    } catch (e) {
      this.logError(`Failed to store memory: ${e.message}`);
      process.exit(1);
    }
  }

  async query(queryText, options = {}) {
    try {
      const result = await this.request(
        `/memory/query?project=${this.config.project}&q=${encodeURIComponent(queryText)}`
      );

      if (!result.results || !result.results.length) {
        this.logWarning(`No memories found matching "${queryText}"`);
        return;
      }

      this.logSuccess(`Found ${result.count} memory(ies)`);
      console.log('');

      const rows = result.results.map(m => ({
        ID: m.id.slice(0, 8),
        'CONTENT': m.content.substring(0, 50),
        'TYPE': m.content_type,
        '⭐': m.importance,
        'CREATED': new Date(m.created_at).toLocaleDateString()
      }));

      this.logTable(rows);
    } catch (e) {
      this.logError(`Search failed: ${e.message}`);
      process.exit(1);
    }
  }

  async list(options = {}) {
    try {
      const limit = parseInt(options.limit) || 10;
      const result = await this.request(`/memory/recent?project=${this.config.project}&limit=${limit}`);

      if (!result.results || !result.results.length) {
        this.logWarning(`No memories in "${this.config.project}" project`);
        return;
      }

      this.logSuccess(`Latest ${result.results.length} memories`);
      console.log('');

      const rows = result.results.map(m => ({
        ID: m.id.slice(0, 8),
        'CONTENT': m.content.substring(0, 45),
        'TYPE': m.content_type,
        '⭐': m.importance,
        'CREATED': new Date(m.created_at).toLocaleDateString()
      }));

      this.logTable(rows);
    } catch (e) {
      this.logError(`Failed to list memories: ${e.message}`);
      process.exit(1);
    }
  }

  async view(memoryId, options = {}) {
    try {
      const result = await this.request(`/memory/${memoryId}`);

      console.log('');
      console.log(`${colors.bright}${colors.cyan}Memory Details${colors.reset}`);
      console.log('─'.repeat(60));
      console.log(`${colors.bright}ID:${colors.reset}          ${result.id}`);
      console.log(`${colors.bright}Content:${colors.reset}     ${result.content}`);
      console.log(`${colors.bright}Type:${colors.reset}       ${result.content_type}`);
      console.log(`${colors.bright}Importance:${colors.reset} ${'⭐'.repeat(result.importance)} (${result.importance}/10)`);
      console.log(`${colors.bright}Agent:${colors.reset}      ${result.agent_id || 'default'}`);
      console.log(`${colors.bright}Created:${colors.reset}    ${new Date(result.created_at).toLocaleString()}`);
      console.log('');
    } catch (e) {
      this.logError(`Failed to view memory: ${e.message}`);
      process.exit(1);
    }
  }

  async delete(memoryId, options = {}) {
    try {
      if (!options.force) {
        process.stdout.write(`Delete memory ${memoryId.slice(0, 8)}? (y/N) `);
        // For CLI, we'll just require --force flag
        this.logWarning(`Use --force to confirm deletion`);
        return;
      }

      await this.request(`/memory/${memoryId}`, { method: 'DELETE' });
      this.logSuccess(`Memory deleted`);
    } catch (e) {
      this.logError(`Failed to delete memory: ${e.message}`);
      process.exit(1);
    }
  }

  async export(options = {}) {
    try {
      const result = await this.request(`/memory/recent?project=${this.config.project}&limit=1000`);
      const memories = result.results || [];

      const exportData = {
        project: this.config.project,
        exported: new Date().toISOString(),
        count: memories.length,
        memories: memories.map(m => ({
          id: m.id,
          content: m.content,
          type: m.content_type,
          importance: m.importance,
          createdAt: m.created_at,
          agentId: m.agent_id
        }))
      };

      const filename = options.file || `cognexia-export-${this.config.project}-${Date.now()}.json`;
      fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
      this.logSuccess(`Exported ${memories.length} memories to ${filename}`);
    } catch (e) {
      this.logError(`Export failed: ${e.message}`);
      process.exit(1);
    }
  }

  async projects() {
    try {
      const result = await this.request('/projects');
      const projects = result.projects || [];

      this.logSuccess(`Found ${projects.length} project(s)`);
      console.log('');

      projects.forEach(p => {
        const marker = p === this.config.project ? `${colors.green}●${colors.reset}` : ' ';
        console.log(`${marker} ${colors.cyan}${p}${colors.reset}`);
      });
      console.log('');
      console.log(`${colors.dim}Current: ${this.config.project}${colors.reset}`);
    } catch (e) {
      this.logError(`Failed to list projects: ${e.message}`);
      process.exit(1);
    }
  }

  async switchProject(projectName) {
    try {
      // Verify project exists
      const result = await this.request('/projects');
      const projects = result.projects || [];

      if (!projects.includes(projectName)) {
        this.logError(`Project "${projectName}" not found`);
        console.log(`Available projects: ${projects.join(', ')}`);
        process.exit(1);
      }

      this.config.project = projectName;
      this.saveConfig();
      this.logSuccess(`Switched to project: ${projectName}`);
    } catch (e) {
      this.logError(`Failed to switch project: ${e.message}`);
      process.exit(1);
    }
  }

  async status() {
    try {
      const health = await this.request('/health');
      console.log('');
      console.log(`${colors.bright}${colors.cyan}Cognexia Status${colors.reset}`);
      console.log('─'.repeat(40));
      console.log(`Status:       ${colors.green}✓ Online${colors.reset}`);
      console.log(`Version:      ${health.version}`);
      console.log(`Projects:     ${health.totalProjects || '?'}`);
      console.log(`Current:      ${this.config.project}`);
      console.log(`API:          ${this.config.apiUrl}`);
      console.log('');
    } catch (e) {
      console.log('');
      console.log(`${colors.bright}${colors.red}Cognexia Status${colors.reset}`);
      console.log('─'.repeat(40));
      console.log(`Status:       ${colors.red}✗ Offline${colors.reset}`);
      console.log(`Error:        ${e.message}`);
      console.log(`API:          ${this.config.apiUrl}`);
      console.log('');
      console.log(`${colors.dim}Try: npm start${colors.reset}`);
      console.log('');
    }
  }

  help() {
    console.log(`
${colors.bright}${colors.cyan}Cognexia CLI${colors.reset} — Manage your AI memory from the command line

${colors.bright}Usage:${colors.reset}
  cognexia <command> [options]

${colors.bright}Commands:${colors.reset}

  ${colors.cyan}store${colors.reset} <content>        Store a new memory
                           ${colors.dim}cognexia store "Remember this"${colors.reset}
                           ${colors.dim}cognexia store "Note" --type=note --importance=7${colors.reset}

  ${colors.cyan}query${colors.reset} <text>          Search memories by keyword
                           ${colors.dim}cognexia query "search term"${colors.reset}

  ${colors.cyan}list${colors.reset} [limit]          Show recent memories (default: 10)
                           ${colors.dim}cognexia list${colors.reset}
                           ${colors.dim}cognexia list --limit=20${colors.reset}

  ${colors.cyan}view${colors.reset} <id>             View full memory details
                           ${colors.dim}cognexia view a1b2c3d4${colors.reset}

  ${colors.cyan}delete${colors.reset} <id>           Delete a memory
                           ${colors.dim}cognexia delete a1b2c3d4 --force${colors.reset}

  ${colors.cyan}export${colors.reset}                Export all memories to JSON file
                           ${colors.dim}cognexia export${colors.reset}
                           ${colors.dim}cognexia export --file=backup.json${colors.reset}

  ${colors.cyan}projects${colors.reset}              List all projects
                           ${colors.dim}cognexia projects${colors.reset}

  ${colors.cyan}use${colors.reset} <project>        Switch current project
                           ${colors.dim}cognexia use research${colors.reset}

  ${colors.cyan}status${colors.reset}                Show connection status
                           ${colors.dim}cognexia status${colors.reset}

  ${colors.cyan}init${colors.reset}                  Initialize CLI config
                           ${colors.dim}cognexia init${colors.reset}

  ${colors.cyan}help${colors.reset}                  Show this help message
                           ${colors.dim}cognexia help${colors.reset}

${colors.bright}Options:${colors.reset}
  --project=name         Use specific project (default: general)
  --type=type            Memory type: insight, note, task, idea (default: insight)
  --importance=1-10      Importance level (default: 5)
  --limit=n              Number of results to show
  --file=path            Export destination file
  --force                Confirm destructive operations
  --verbose, -v          Show detailed output

${colors.bright}Examples:${colors.reset}
  # Store a memory
  cognexia store "Claude helped me fix the bug"

  # Search memories
  cognexia query "bug fix"

  # View latest 5 memories
  cognexia list --limit=5

  # Switch to a different project
  cognexia use research

  # Backup all memories
  cognexia export --file=backup.json

${colors.bright}Configuration:${colors.reset}
  Config file: ${this.configPath}
  Current project: ${this.config.project}
  API: ${this.config.apiUrl}

`);
  }

  async run(args) {
    if (!args.length) {
      this.help();
      return;
    }

    const [command, ...rest] = args;
    const options = this.parseOptions(rest);

    try {
      switch (command) {
        case 'store':
          await this.store(rest.join(' '), options);
          break;
        case 'query':
          await this.query(rest.join(' '), options);
          break;
        case 'list':
          await this.list(options);
          break;
        case 'view':
          await this.view(rest[0], options);
          break;
        case 'delete':
          await this.delete(rest[0], options);
          break;
        case 'export':
          await this.export(options);
          break;
        case 'projects':
          await this.projects();
          break;
        case 'use':
          await this.switchProject(rest[0]);
          break;
        case 'status':
          await this.status();
          break;
        case 'init':
          this.logSuccess('CLI already initialized at ' + this.configPath);
          break;
        case 'help':
        case '-h':
        case '--help':
          this.help();
          break;
        default:
          this.logError(`Unknown command: ${command}`);
          console.log(`Run ${colors.cyan}cognexia help${colors.reset} for usage information`);
          process.exit(1);
      }
    } catch (e) {
      this.logError(e.message);
      process.exit(1);
    }
  }

  parseOptions(args) {
    const options = {};
    let positional = [];

    for (const arg of args) {
      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=');
        options[key] = value || true;
      } else if (arg.startsWith('-')) {
        const key = arg.slice(1);
        options[key] = true;
      } else {
        positional.push(arg);
      }
    }

    return { ...options, _positional: positional };
  }
}

// Main execution
const cli = new CognexiaCLI();
cli.run(process.argv.slice(2)).catch(err => {
  cli.logError(err.message);
  process.exit(1);
});
