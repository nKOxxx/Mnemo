#!/usr/bin/env node

/**
 * Memory Bridge CLI
 * Command-line tool for managing agent memories
 */

const MemoryBridge = require('./index.js');
const fs = require('fs');
const path = require('path');

// Sanitize helper for CLI inputs
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
}

const args = process.argv.slice(2);
const command = args[0];

// Default config
const configPath = path.join(process.cwd(), '.memory-bridge.json');
let config = { storage: 'sqlite', path: './memory.db' };

if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

const memory = new MemoryBridge(config);

async function main() {
  try {
    switch (command) {
      case 'init':
        await init();
        break;
      case 'store':
        await store(args[1], args.slice(2));
        break;
      case 'query':
        await query(args[1]);
        break;
      case 'timeline':
        await timeline(args[1] || '7');
        break;
      case 'help':
      default:
        help();
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await memory.close();
  }
}

async function init() {
  const defaultConfig = {
    storage: 'sqlite',
    path: './data/memory.db',
    agentId: 'default'
  };
  
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log('✅ Memory Bridge initialized!');
  console.log('Config saved to:', configPath);
  console.log('\nNext steps:');
  console.log('  memory-bridge store "Your first memory"');
  console.log('  memory-bridge query "what to remember"');
}

async function store(content, flags) {
  if (!content) {
    console.error('Usage: memory-bridge store "content to remember" [--type=insight] [--importance=5]');
    return;
  }
  
  // Sanitize CLI input
  const sanitizedContent = sanitizeInput(content);
  
  const options = parseFlags(flags);
  const result = await memory.store(sanitizedContent, options);
  
  if (result.success) {
    console.log('✅ Memory stored:', result.id);
  }
}

async function query(queryString) {
  if (!queryString) {
    console.error('Usage: memory-bridge query "search terms"');
    return;
  }
  
  // Sanitize CLI input
  const sanitizedQuery = sanitizeInput(queryString);
  
  const results = await memory.query(sanitizedQuery, { limit: 10 });
  
  if (results.length === 0) {
    console.log('No memories found.');
    return;
  }
  
  console.log(`\nFound ${results.length} memories:\n`);
  
  results.forEach((m, i) => {
    const date = new Date(m.created_at).toLocaleDateString();
    console.log(`${i + 1}. [${m.content_type}] ${date}`);
    console.log(`   ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}`);
    console.log(`   Importance: ${m.importance}/10 | Relevance: ${Math.round(m.relevance * 100)}%`);
    console.log('');
  });
}

async function timeline(daysStr) {
  const days = parseInt(daysStr);
  const timeline = await memory.timeline(days);
  
  const dates = Object.keys(timeline).sort().reverse();
  
  if (dates.length === 0) {
    console.log('No memories in this timeframe.');
    return;
  }
  
  console.log(`\nMemory timeline (last ${days} days):\n`);
  
  dates.forEach(date => {
    const memories = timeline[date];
    console.log(`${date} (${memories.length} memories)`);
    memories.slice(0, 3).forEach(m => {
      console.log(`  • [${m.content_type}] ${m.content.slice(0, 60)}...`);
    });
    if (memories.length > 3) {
      console.log(`  ... and ${memories.length - 3} more`);
    }
    console.log('');
  });
}

function help() {
  console.log(`
Memory Bridge CLI - Long-term memory for AI agents

Usage:
  memory-bridge <command> [options]

Commands:
  init                    Initialize Memory Bridge in current directory
  store "content"         Store a new memory
  query "search"          Search memories
  timeline [days]         Show memory timeline (default: 7 days)
  help                    Show this help

Examples:
  memory-bridge init
  memory-bridge store "User prefers dark mode" --type=preference --importance=8
  memory-bridge query "what user prefers"
  memory-bridge timeline 30

Configuration:
  Edit .memory-bridge.json to change storage settings.
  
  SQLite (default, local):
    { "storage": "sqlite", "path": "./memory.db" }
  
  Supabase (cloud):
    { 
      "storage": "supabase",
      "supabaseUrl": "https://...",
      "supabaseKey": "..."
    }
`);
}

function parseFlags(flags) {
  const options = {};
  flags.forEach(flag => {
    if (flag.startsWith('--type=')) {
      options.type = flag.split('=')[1];
    } else if (flag.startsWith('--importance=')) {
      options.importance = parseInt(flag.split('=')[1]);
    } else if (flag.startsWith('--source=')) {
      options.source = flag.split('=')[1];
    }
  });
  return options;
}

main();
