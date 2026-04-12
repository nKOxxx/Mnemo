/**
 * Claude AI Agent with Cognexia Memory
 * 
 * Example: Using Cognexia to store and retrieve conversation context
 * Makes Claude remember previous conversations across sessions
 */

const Anthropic = require('@anthropic-ai/sdk');
const http = require('http');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

class MemoryAgent {
  constructor(project = 'claude-agent') {
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

  async storeMemory(content, type = 'conversation') {
    const result = await this.request('/memory/store', {
      method: 'POST',
      body: {
        project: this.project,
        content,
        type,
        importance: 7,
        agentId: 'claude-agent'
      }
    });
    return result.data;
  }

  async loadContext() {
    const result = await this.request(`/memory/recent?project=${this.project}&limit=5`);
    return (result.data?.results || [])
      .map(m => `[${m.content_type}] ${m.content}`)
      .join('\n');
  }

  async chat(userMessage) {
    // Load previous context
    const context = await this.loadContext();
    
    const systemPrompt = `You are a helpful AI assistant with memory. 
Previous context:
${context || 'No previous conversations'}

Remember to:
- Refer to previous conversations when relevant
- Be consistent with past decisions
- Build on accumulated knowledge`;

    // Call Claude
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    const assistantMessage = response.content[0].text;

    // Store conversation in memory
    await this.storeMemory(
      `User: ${userMessage}\nAssistant: ${assistantMessage}`,
      'conversation'
    );

    return assistantMessage;
  }
}

// Example usage
async function main() {
  const agent = new MemoryAgent('my-claude-agent');

  console.log('🤖 Claude Agent with Memory\n');

  const responses = [
    'My favorite color is blue and my name is Alex',
    'What color did I say I like?',
    'Remember my name for next time'
  ];

  for (const message of responses) {
    console.log(`You: ${message}`);
    const response = await agent.chat(message);
    console.log(`Claude: ${response}\n`);
  }
}

main().catch(console.error);
