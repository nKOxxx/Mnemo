/**
 * OpenAI Assistant with Cognexia Memory
 * 
 * Example: Using Cognexia as long-term memory for OpenAI Assistants
 * Store function outputs and call results in Cognexia for future reference
 */

const OpenAI = require('openai');
const http = require('http');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class AssistantMemory {
  constructor(project = 'openai-assistant') {
    this.project = project;
    this.apiUrl = 'http://localhost:10000/api';
  }

  async request(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.apiUrl + endpoint);
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      if (options.body) req.write(JSON.stringify(options.body));
      req.end();
    });
  }

  async recordAction(action, result) {
    await this.request('/memory/store', {
      method: 'POST',
      body: {
        project: this.project,
        content: `Action: ${action}\nResult: ${JSON.stringify(result)}`,
        type: 'action',
        importance: 8,
        agentId: 'openai-assistant'
      }
    });
  }

  async getRecentActions(limit = 5) {
    const result = await this.request(`/memory/recent?project=${this.project}&limit=${limit}`);
    return result.data?.results || [];
  }
}

// Example usage
async function main() {
  const memory = new AssistantMemory('my-openai-assistant');

  console.log('🤖 OpenAI Assistant with Cognexia Memory\n');

  // Create thread
  const thread = await openai.beta.threads.create();
  console.log(`Created thread: ${thread.id}\n`);

  // User message
  const userMessage = 'Store my birthday: March 15, 1990';
  console.log(`User: ${userMessage}`);

  // Add message to thread
  await openai.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: userMessage
  });

  // Run assistant
  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: process.env.OPENAI_ASSISTANT_ID || 'asst_test'
  });

  // Poll for completion
  let completedRun = run;
  while (completedRun.status !== 'completed') {
    await new Promise(r => setTimeout(r, 1000));
    completedRun = await openai.beta.threads.runs.retrieve(thread.id, run.id);
  }

  // Get messages
  const messages = await openai.beta.threads.messages.list(thread.id);
  const assistantMessage = messages.data[0].content[0].text;

  console.log(`Assistant: ${assistantMessage}\n`);

  // Store in Cognexia
  await memory.recordAction('Store user birthday', {
    date: '1990-03-15',
    confirmed: true
  });

  // Show memory
  const actions = await memory.getRecentActions();
  console.log('📝 Memory Storage:');
  actions.forEach(a => console.log(`  - ${a.content.substring(0, 60)}...`));
}

main().catch(console.error);
