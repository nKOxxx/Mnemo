"""
Cognexia Correctness Benchmarks — Shared Test Fixtures
Manages server lifecycle, test data cleanup, and test projects
"""

import pytest
import requests
import subprocess
import time
import os
import json
import tempfile
import shutil
from pathlib import Path

# Repo root (parent of benchmarks/)
REPO_ROOT = str(Path(__file__).resolve().parent.parent)

# Server configuration
SERVER_HOST = "http://localhost:10000"
SERVER_PORT = 10000
MAX_STARTUP_RETRIES = 30
STARTUP_RETRY_DELAY = 1


@pytest.fixture(scope="session", autouse=True)
def cognexia_server():
    """Start Cognexia server once per session."""
    # Create a temp data directory for testing
    test_data_dir = tempfile.mkdtemp(prefix="cognexia-benchmark-")
    env = os.environ.copy()
    env["DATA_LAKE_PATH"] = test_data_dir

    print(f"\n📦 Starting Cognexia server on {SERVER_HOST}...")
    process = subprocess.Popen(
        ["node", "server.js"],
        cwd=REPO_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Wait for server to be ready
    for attempt in range(MAX_STARTUP_RETRIES):
        try:
            resp = requests.get(f"{SERVER_HOST}/health", timeout=2)
            if resp.status_code == 200:
                print(f"✓ Server ready after {attempt + 1} attempts")
                break
        except:
            if attempt == MAX_STARTUP_RETRIES - 1:
                process.terminate()
                stdout, stderr = process.communicate()
                print("STDOUT:", stdout.decode())
                print("STDERR:", stderr.decode())
                raise RuntimeError(f"Server failed to start after {MAX_STARTUP_RETRIES} retries")
            time.sleep(STARTUP_RETRY_DELAY)

    yield process

    # Cleanup
    print("\n🛑 Shutting down Cognexia server...")
    process.terminate()
    process.wait(timeout=5)
    shutil.rmtree(test_data_dir, ignore_errors=True)


@pytest.fixture
def test_project():
    """Create a unique test project for this test."""
    project_name = f"test-project-{int(time.time() * 1000)}"
    yield project_name

    # Cleanup: delete all memories in project
    try:
        requests.delete(f"{SERVER_HOST}/api/projects/{project_name}")
    except:
        pass


@pytest.fixture
def api_client():
    """HTTP client for API calls."""
    class APIClient:
        def __init__(self, base_url=SERVER_HOST):
            self.base_url = base_url
            self.session = requests.Session()

        def store(self, project, content, **kwargs):
            """Store a memory."""
            payload = {"content": content, "project": project, **kwargs}
            resp = self.session.post(
                f"{self.base_url}/api/memory/store",
                json=payload,
                timeout=10
            )
            return resp.json()

        def query(self, project, keywords, filters=None, **kwargs):
            """Query memories by keywords."""
            # API uses GET with query parameters, keyword is 'q' (space-separated)
            query_str = " ".join(keywords) if isinstance(keywords, list) else keywords
            params = {"project": project, "q": query_str, **kwargs}
            # Flatten filters dict into query parameters
            if filters:
                params.update(filters)
            resp = self.session.get(
                f"{self.base_url}/api/memory/query",
                params=params,
                timeout=10
            )
            result = resp.json()
            # Normalize response: wrap results in 'memories' key for test compatibility
            if result.get("success") and result.get("data"):
                result["memories"] = result["data"].get("results", [])
            else:
                result["memories"] = []
            return result

        def get_memory(self, project, memory_id):
            """Get a specific memory by ID."""
            resp = self.session.get(
                f"{self.base_url}/api/memory/{memory_id}",
                params={"project": project},
                timeout=10
            )
            return resp.json()

        def relate(self, project, memory_id_a, memory_id_b, relation_type="related"):
            """Create a relationship between two memories."""
            resp = self.session.post(
                f"{self.base_url}/api/graph/link",
                json={
                    "project": project,
                    "sourceId": memory_id_a,
                    "targetId": memory_id_b,
                    "linkType": relation_type,
                    "strength": 0.8,
                },
                timeout=10
            )
            return resp.json()

        def get_graph(self, project):
            """Get the memory graph for a project."""
            resp = self.session.get(
                f"{self.base_url}/api/graph",
                params={"project": project},
                timeout=10
            )
            result = resp.json()
            # Unwrap API response: move data to top level for test compatibility
            if result.get("success") and result.get("data"):
                return result["data"]
            return result

        def close(self):
            self.session.close()

    client = APIClient()
    yield client
    client.close()


@pytest.fixture
def enable_encryption():
    """Enable encryption for tests that need it."""
    os.environ["COGNEXIA_ENCRYPT"] = "1"
    yield
    del os.environ["COGNEXIA_ENCRYPT"]
