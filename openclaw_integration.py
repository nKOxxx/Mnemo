# Mnemo OpenClaw Integration
# Auto-routes memories by project, provides session context

import json
import re
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime

MNEMO_URL = "http://localhost:10000"

class MnemoClient:
    """Client for Mnemo memory system with auto project routing"""
    
    def __init__(self, agent_id: str = "ares"):
        self.agent_id = agent_id
        self.current_project = "general"
        self.client = httpx.AsyncClient(timeout=10.0)
    
    async def health_check(self) -> bool:
        """Check if Mnemo server is running"""
        try:
            response = await self.client.get(f"{MNEMO_URL}/api/health")
            return response.status_code == 200
        except:
            return False
    
    def detect_project(self, text: str) -> Optional[str]:
        """Detect project mention in text"""
        text_lower = text.lower()
        
        # Common project patterns
        patterns = [
            r'(?:project|proj)\s*:?\s*(\w+)',
            r'(?:work on|working on)\s+(\w+)',
            r'(?:for|about)\s+(?:the\s+)?(\w+)\s+(?:project|app|product)',
            r'\b(2ndcto|agentvault|memorybridge|agentdiplomacy|agentmolt|gulf.watch)\b',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text_lower)
            if match:
                project = match.group(1).lower()
                # Normalize project names
                if project in ['gulfwatch', 'gulf-watch', 'gulf_watch']:
                    return 'gulfwatch'
                if project in ['2ndcto', '2nd_cto']:
                    return '2ndcto'
                return project
        
        return None
    
    def switch_project(self, project: str):
        """Switch to a different project context"""
        if project != self.current_project:
            self.current_project = project
            return True
        return False
    
    async def store(self, content: str, memory_type: str = "insight", 
                    importance: int = 5, project: Optional[str] = None) -> bool:
        """Store a memory to the current or specified project"""
        target_project = project or self.current_project
        
        try:
            response = await self.client.post(
                f"{MNEMO_URL}/api/memory/store",
                json={
                    "content": content,
                    "type": memory_type,
                    "importance": importance,
                    "project": target_project,
                    "agentId": self.agent_id,
                    "metadata": {
                        "stored_at": datetime.utcnow().isoformat(),
                        "auto_stored": True
                    }
                }
            )
            return response.status_code == 200
        except Exception as e:
            print(f"[Mnemo] Store failed: {e}")
            return False
    
    async def query(self, query_text: str, project: Optional[str] = None,
                    limit: int = 5, days: int = 30) -> List[Dict]:
        """Query memories from current or specified project"""
        target_project = project or self.current_project
        
        try:
            response = await self.client.get(
                f"{MNEMO_URL}/api/memory/query",
                params={
                    "q": query_text,
                    "project": target_project,
                    "limit": limit,
                    "days": days,
                    "agentId": self.agent_id
                }
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("memories", [])
            return []
        except Exception as e:
            print(f"[Mnemo] Query failed: {e}")
            return []
    
    async def query_all(self, query_text: str, limit: int = 10) -> List[Dict]:
        """Query memories across all projects"""
        try:
            response = await self.client.get(
                f"{MNEMO_URL}/api/memory/query-all",
                params={"q": query_text, "limit": limit}
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("results", [])
            return []
        except Exception as e:
            print(f"[Mnemo] Query-all failed: {e}")
            return []
    
    async def load_session_context(self, project: Optional[str] = None) -> Dict[str, Any]:
        """Load context at session start"""
        target_project = project or self.current_project
        
        # Get recent memories
        recent = await self.query("recent work progress", project=target_project, days=7, limit=5)
        
        # Get high importance items
        important = await self.query("goals priorities decisions", project=target_project, days=30, limit=3)
        
        # Get user preferences (from general)
        prefs = await self.query("preferences likes dislikes style", project="general", limit=5)
        
        return {
            "project": target_project,
            "recent": recent,
            "important": important,
            "preferences": prefs
        }
    
    def is_memory_worthy(self, text: str) -> bool:
        """Detect if a message is worth storing"""
        text_lower = text.lower()
        
        # Key indicators
        indicators = [
            r'\b(decided|decision|choose|chose)\b',
            r'\b(prefer|preference|like|dislike|want|need)\b',
            r'\b(goal|target|objective|aim)\b',
            r'\b(important|critical|priority|crucial)\b',
            r'\b(completed|done|finished|shipped|released)\b',
            r'\b(remember|don\'t forget|note that)\b',
            r'\b(issue|bug|problem|error|fix)\b',
            r'\b(success|achievement|milestone|launch)\b',
        ]
        
        for pattern in indicators:
            if re.search(pattern, text_lower):
                return True
        
        return False
    
    def detect_memory_type(self, text: str) -> str:
        """Auto-detect memory type from content"""
        text_lower = text.lower()
        
        if re.search(r'\b(security|secure|encrypt|password|key|credential)\b', text_lower):
            return "security"
        if re.search(r'\b(prefer|like|dislike|style|format)\b', text_lower):
            return "preference"
        if re.search(r'\b(goal|target|objective)\b', text_lower):
            return "goal"
        if re.search(r'\b(completed|shipped|released|launched|milestone)\b', text_lower):
            return "milestone"
        if re.search(r'\b(decided|decision|choose)\b', text_lower):
            return "decision"
        if re.search(r'\b(error|bug|issue|problem|fail)\b', text_lower):
            return "error"
        
        return "insight"
    
    def calculate_importance(self, text: str) -> int:
        """Calculate importance score 1-10"""
        score = 5  # Default
        text_lower = text.lower()
        
        # Boost for critical keywords
        critical = ['critical', 'urgent', 'important', 'security', 'password', 'api key']
        for kw in critical:
            if kw in text_lower:
                score += 2
        
        # Boost for decisions
        if re.search(r'\b(decided|decision|choose)\b', text_lower):
            score += 1
        
        # Boost for completion
        if re.search(r'\b(completed|shipped|released)\b', text_lower):
            score += 1
        
        # Boost for explicit importance
        if re.search(r'\b(very important|critical|crucial)\b', text_lower):
            score += 2
        
        return min(score, 10)
    
    async def auto_store(self, text: str) -> bool:
        """Auto-store if memory-worthy"""
        if not self.is_memory_worthy(text):
            return False
        
        memory_type = self.detect_memory_type(text)
        importance = self.calculate_importance(text)
        
        return await self.store(text, memory_type, importance)
    
    async def enrich_response(self, query_text: str, project: Optional[str] = None) -> str:
        """Get relevant memories to enrich response context"""
        target_project = project or self.current_project
        
        # Query current project
        relevant = await self.query(query_text, project=target_project, limit=3)
        
        # Also query general for user preferences
        if target_project != "general":
            prefs = await self.query(query_text, project="general", limit=2)
            relevant.extend(prefs)
        
        if not relevant:
            return ""
        
        # Format context
        context_parts = []
        for mem in relevant:
            content = mem.get("content", "")[:100]  # Truncate
            proj = mem.get("project", "general")
            if proj != "general":
                context_parts.append(f"[{proj}] {content}")
            else:
                context_parts.append(content)
        
        return "\n".join(context_parts)


# Singleton instance
_mnemo_client: Optional[MnemoClient] = None

def get_mnemo_client() -> MnemoClient:
    """Get or create Mnemo client singleton"""
    global _mnemo_client
    if _mnemo_client is None:
        _mnemo_client = MnemoClient(agent_id="ares")
    return _mneno_client


# Convenience functions for direct use
async def mnemo_store(content: str, memory_type: str = "insight", 
                      importance: int = 5, project: Optional[str] = None) -> bool:
    """Store memory (convenience function)"""
    client = get_mnemo_client()
    return await client.store(content, memory_type, importance, project)

async def mnemo_query(query_text: str, project: Optional[str] = None,
                      limit: int = 5, days: int = 30) -> List[Dict]:
    """Query memories (convenience function)"""
    client = get_mnemo_client()
    return await client.query(query_text, project, limit, days)

async def mnemo_load_context(project: Optional[str] = None) -> Dict[str, Any]:
    """Load session context (convenience function)"""
    client = get_mnemo_client()
    return await client.load_session_context(project)

async def mnemo_auto_store(text: str) -> bool:
    """Auto-store if memory-worthy (convenience function)"""
    client = get_mnemo_client()
    return await client.auto_store(text)
