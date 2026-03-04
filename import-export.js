/**
 * Memory Import/Export Module for Mnemo
 * 
 * Features:
 * - Import from ChatGPT conversations (JSON export)
 * - Import from Claude conversations
 * - Export to Obsidian (Markdown)
 * - Export to Notion (CSV/JSON)
 * - Export to JSON (backup)
 */

const fs = require('fs');
const path = require('path');

// ============================================
// IMPORT FORMATS
// ============================================

/**
 * Import ChatGPT conversation export
 * @param {string} filePath - Path to JSON file
 * @returns {Array} Parsed memories
 */
function importChatGPT(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const memories = [];
  
  // ChatGPT export format has conversations array
  const conversations = data.conversations || data;
  
  for (const conv of conversations) {
    const title = conv.title || 'Untitled Conversation';
    const createTime = conv.create_time ? new Date(conv.create_time * 1000) : new Date();
    
    // Extract messages
    const messages = [];
    if (conv.mapping) {
      for (const nodeId in conv.mapping) {
        const node = conv.mapping[nodeId];
        if (node.message && node.message.content) {
          const role = node.message.author?.role || 'unknown';
          const content = extractContent(node.message.content);
          if (content) {
            messages.push({ role, content, time: node.message.create_time });
          }
        }
      }
    }
    
    // Create memory from conversation summary
    if (messages.length > 0) {
      const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
      const assistantMessages = messages.filter(m => m.role === 'assistant').map(m => m.content);
      
      memories.push({
        content: `ChatGPT conversation: ${title}\n\nUser asked: ${userMessages[0] || 'N/A'}\n\nKey response: ${(assistantMessages[0] || '').substring(0, 500)}`,
        type: 'insight',
        importance: 6,
        createdAt: createTime.toISOString(),
        metadata: {
          source: 'chatgpt_import',
          conversationTitle: title,
          messageCount: messages.length,
          importedAt: new Date().toISOString()
        }
      });
      
      // Also extract any decisions or preferences
      for (const msg of assistantMessages) {
        if (containsDecision(msg)) {
          memories.push({
            content: `Decision from "${title}": ${extractDecision(msg)}`,
            type: 'decision',
            importance: 8,
            createdAt: createTime.toISOString(),
            metadata: { source: 'chatgpt_import', parentConversation: title }
          });
        }
      }
    }
  }
  
  return memories;
}

/**
 * Import Claude conversation export
 * @param {string} filePath - Path to JSON file
 * @returns {Array} Parsed memories
 */
function importClaude(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const memories = [];
  
  // Claude export format
  const conversations = Array.isArray(data) ? data : [data];
  
  for (const conv of conversations) {
    const name = conv.name || 'Claude Conversation';
    const chatMessages = conv.chat_messages || [];
    
    if (chatMessages.length > 0) {
      const summary = chatMessages
        .filter(m => m.sender === 'human')
        .slice(0, 3)
        .map(m => m.text.substring(0, 200))
        .join('\n---\n');
      
      memories.push({
        content: `Claude conversation: ${name}\n\nTopics discussed:\n${summary}`,
        type: 'insight',
        importance: 6,
        createdAt: conv.created_at || new Date().toISOString(),
        metadata: {
          source: 'claude_import',
          conversationName: name,
          messageCount: chatMessages.length,
          importedAt: new Date().toISOString()
        }
      });
    }
  }
  
  return memories;
}

/**
 * Import from JSON backup (Mnemo format)
 * @param {string} filePath 
 */
function importJSON(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  if (data.memories && Array.isArray(data.memories)) {
    return data.memories.map(m => ({
      content: m.content,
      type: m.type || m.content_type || 'insight',
      importance: m.importance || 5,
      createdAt: m.created_at || m.createdAt || new Date().toISOString(),
      metadata: {
        ...m.metadata,
        source: 'json_import',
        importedAt: new Date().toISOString()
      }
    }));
  }
  
  return [];
}

/**
 * Import from Markdown files (Obsidian vault)
 * @param {string} dirPath 
 */
function importObsidian(dirPath) {
  const memories = [];
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    if (file.endsWith('.md')) {
      const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
      const { metadata, body } = parseMarkdownFrontmatter(content);
      
      memories.push({
        content: body.substring(0, 1000),
        type: mapObsidianType(metadata.type),
        importance: metadata.importance || 5,
        createdAt: metadata.created || new Date().toISOString(),
        metadata: {
          source: 'obsidian_import',
          originalFile: file,
          obsidianTags: metadata.tags || [],
          importedAt: new Date().toISOString()
        }
      });
    }
  }
  
  return memories;
}

// ============================================
// EXPORT FORMATS
// ============================================

/**
 * Export memories to Obsidian-compatible Markdown
 * @param {Array} memories 
 * @param {string} outputDir 
 */
function exportToObsidian(memories, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  for (const memory of memories) {
    const date = new Date(memory.createdAt).toISOString().split('T')[0];
    const filename = `${date}_${sanitizeFilename(memory.content.substring(0, 50))}.md`;
    
    const frontmatter = `---
type: ${memory.type}
importance: ${memory.importance}
created: ${memory.createdAt}
source: mnemo
---

`;
    
    const body = memory.content;
    const tags = extractTags(memory.content);
    const tagLine = tags.length > 0 ? `\n\n${tags.map(t => `#${t}`).join(' ')}` : '';
    
    fs.writeFileSync(
      path.join(outputDir, filename),
      frontmatter + body + tagLine
    );
  }
  
  return memories.length;
}

/**
 * Export memories to Notion CSV format
 * @param {Array} memories 
 * @param {string} outputPath 
 */
function exportToNotionCSV(memories, outputPath) {
  const headers = ['Name', 'Type', 'Importance', 'Created', 'Content', 'Tags'];
  
  const rows = memories.map(m => {
    const date = new Date(m.createdAt).toISOString().split('T')[0];
    const tags = extractTags(m.content).join(', ');
    const title = m.content.substring(0, 100).replace(/,/g, ';');
    
    return [
      `"${title}"`,
      m.type,
      m.importance,
      date,
      `"${m.content.replace(/"/g, '""').substring(0, 2000)}"`,
      `"${tags}"`
    ].join(',');
  });
  
  const csv = [headers.join(','), ...rows].join('\n');
  fs.writeFileSync(outputPath, csv);
  
  return memories.length;
}

/**
 * Export to JSON backup
 * @param {Array} memories 
 * @param {string} outputPath 
 */
function exportToJSON(memories, outputPath) {
  const exportData = {
    exportDate: new Date().toISOString(),
    version: '2.3.0',
    source: 'mnemo',
    memoryCount: memories.length,
    memories: memories.map(m => ({
      id: m.id,
      content: m.content,
      content_type: m.type,
      importance: m.importance,
      created_at: m.createdAt,
      metadata: m.metadata
    }))
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  return memories.length;
}

/**
 * Export to plain text (simple backup)
 * @param {Array} memories 
 * @param {string} outputPath 
 */
function exportToText(memories, outputPath) {
  const lines = memories.map(m => {
    const date = new Date(m.createdAt).toLocaleDateString();
    return `[${date}] [${m.type}] [${m.importance}/10]\n${m.content}\n${'='.repeat(50)}\n`;
  });
  
  fs.writeFileSync(outputPath, lines.join('\n'));
  return memories.length;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function extractContent(contentObj) {
  if (typeof contentObj === 'string') return contentObj;
  if (contentObj.parts) return contentObj.parts.map(p => p.text || '').join('');
  if (contentObj.text) return contentObj.text;
  return '';
}

function containsDecision(text) {
  const decisionPatterns = [
    /decided to/i,
    /we should/i,
    /let's go with/i,
    /choose.*option/i,
    /going with/i,
    /settled on/i,
    /final decision/i
  ];
  return decisionPatterns.some(p => p.test(text));
}

function extractDecision(text) {
  // Simple extraction - get the sentence containing a decision
  const sentences = text.split(/[.!?]+/);
  for (const sentence of sentences) {
    if (containsDecision(sentence)) {
      return sentence.trim();
    }
  }
  return text.substring(0, 200);
}

function parseMarkdownFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (match) {
    const frontmatter = {};
    match[1].split('\n').forEach(line => {
      const [key, value] = line.split(':').map(s => s.trim());
      if (key && value) {
        frontmatter[key] = value;
      }
    });
    return { metadata: frontmatter, body: match[2].trim() };
  }
  
  return { metadata: {}, body: content };
}

function mapObsidianType(type) {
  const typeMap = {
    'idea': 'insight',
    'decision': 'decision',
    'goal': 'goal',
    'milestone': 'milestone',
    'preference': 'preference',
    'security': 'security'
  };
  return typeMap[type] || 'insight';
}

function sanitizeFilename(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

function extractTags(text) {
  const tagMatches = text.match(/#\w+/g) || [];
  return [...new Set(tagMatches.map(t => t.substring(1)))].slice(0, 10);
}

module.exports = {
  importChatGPT,
  importClaude,
  importJSON,
  importObsidian,
  exportToObsidian,
  exportToNotionCSV,
  exportToJSON,
  exportToText
};
