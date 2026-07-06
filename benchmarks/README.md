# Cognexia Correctness Benchmarks

Comprehensive test suite proving Cognexia is production-ready for its intended purpose: persistent, encrypted, searchable memory for AI agents with project isolation.

## What These Tests Validate

### 1. **Encryption Round-Trip** (`test_correctness_encryption.py`)
- ✓ Data encrypted and decrypted correctly (plaintext in = plaintext out)
- ✓ Unicode, long content, special characters handled safely
- ✓ Metadata (type, importance, agentId) preserved through encryption
- ✓ Different encryptions of same content produce different ciphertexts (random IVs)
- ✓ No sensitive data leaks in plaintext

**Success Criteria**: 100% pass rate. Any failure = data corruption risk.

### 2. **Search Accuracy** (`test_correctness_search.py`)
- ✓ Searches find relevant memories and avoid false positives
- ✓ Case-insensitive keyword matching
- ✓ Multiple keywords use OR logic
- ✓ Search results are complete (Recall) and accurate (Precision)
- ✓ Results include full memory content
- ✓ Performs at scale (100+ memories, <1s)

**Success Criteria**: Precision >90%, Recall >95%. Searches return within 1 second.

### 3. **Graph Integrity** (`test_correctness_graph.py`)
- ✓ Relationships between memories are created correctly
- ✓ Bidirectional linking works
- ✓ No orphaned nodes or cycles
- ✓ Graph is valid even with 100+ relationships
- ✓ Deletion removes relationships cleanly
- ✓ Traversal finds connected memories

**Success Criteria**: 100% pass rate. Graph must be acyclic, connected, and complete.

### 4. **Project Isolation** (`test_correctness_isolation.py`)
- ✓ Memory in Project A is NOT visible in Project B
- ✓ Search results are project-scoped
- ✓ Graphs are project-scoped (no cross-project edges)
- ✓ Metadata (agentId, type) doesn't leak between projects
- ✓ Concurrent access to multiple projects stays isolated
- ✓ Deleting one project doesn't affect others

**Success Criteria**: 100% pass rate. Zero cross-project data leaks.

### 5. **Concurrent Operations** (`test_correctness_concurrency.py`)
- ✓ Multiple threads writing simultaneously don't corrupt data
- ✓ Reads don't block writes
- ✓ Concurrent relationship creation is safe
- ✓ Search results are consistent during writes
- ✓ No race conditions on duplicate stores
- ✓ High concurrency (50+ simultaneous ops) doesn't crash
- ✓ Project isolation holds under concurrent load

**Success Criteria**: 100% pass rate. Zero data corruption, deadlocks, or lost writes.

## Running the Tests

### Prerequisites

```bash
# Install test dependencies
cd /path/to/Cognexia
pip install -r benchmarks/requirements.txt
```

### Start the Cognexia Server

In one terminal:
```bash
cd /path/to/Cognexia
npm start
# Server starts on http://localhost:3000
```

### Run All Correctness Tests

```bash
cd /path/to/Cognexia
pytest benchmarks/test_correctness_*.py -v
```

### Run Specific Test Suite

```bash
# Encryption tests only
pytest benchmarks/test_correctness_encryption.py -v

# Search accuracy tests only
pytest benchmarks/test_correctness_search.py -v

# Graph integrity tests only
pytest benchmarks/test_correctness_graph.py -v

# Project isolation tests only
pytest benchmarks/test_correctness_isolation.py -v

# Concurrent operations tests only
pytest benchmarks/test_correctness_concurrency.py -v
```

### Run with Coverage

```bash
pytest benchmarks/test_correctness_*.py --cov=. --cov-report=html
# Opens htmlcov/index.html for coverage report
```

### Run with Timeout (prevent hanging tests)

```bash
pytest benchmarks/test_correctness_*.py --timeout=60
```

### Run in Parallel (faster execution)

```bash
pytest benchmarks/test_correctness_*.py -n auto
```

## Test Output Format

Each test outputs:
- **PASSED**: Requirement verified
- **FAILED**: Requirement not met (see error message)
- **SKIPPED**: Test skipped (fixture unavailable)

Example:
```
test_correctness_encryption.py::TestEncryptionRoundTrip::test_encrypt_decrypt_simple_text PASSED
test_correctness_search.py::TestSearchAccuracy::test_search_finds_keyword_in_content PASSED
test_correctness_isolation.py::TestProjectIsolation::test_memories_isolated_by_project PASSED
```

## Success Thresholds

| Dimension | Metric | Pass Threshold | Target |
|-----------|--------|---|--|
| Correctness | Encryption round-trip | 100% | 100% |
| Correctness | Search precision | >90% | >95% |
| Correctness | Search recall | >90% | >95% |
| Correctness | Graph validity | 100% | 100% |
| Correctness | Project isolation | 100% (zero leaks) | 100% |
| Reliability | Concurrent writes | 100% success | 100% |
| Performance | Search latency | <2s @ 100 memories | <500ms |
| Performance | Graph render | All nodes included | All nodes |

## Interpreting Results

### All Green ✓

> Cognexia is production-ready. Core promises (encryption, search, isolation, concurrency) verified.

### Some Failures ✗

Investigate failed test. Likely issues:
- **Encryption**: Data corruption risk — **must fix**
- **Search**: Missing results or false positives — **must fix**
- **Isolation**: Cross-project leak — **critical, must fix**
- **Concurrency**: Race condition or deadlock — **must fix**
- **Graph**: Invalid relationships — **must fix**

### Performance Misses

If tests pass but are slow:
- Investigate latency bottlenecks (indexing, search, encryption)
- Profile with `--profile` flag
- Consider optimization sprints, but don't sacrifice correctness

## CI/CD Integration

These benchmarks should be run on every commit:

```yaml
# Example GitHub Actions workflow
name: Correctness Benchmarks
on: [push, pull_request]
jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm start &
      - run: pip install -r benchmarks/requirements.txt
      - run: pytest benchmarks/test_correctness_*.py -v --tb=short
```

## FAQ

**Q: How long do the tests take?**  
A: ~3-5 minutes for full suite. Use `-n auto` to parallelize (reduce to ~1 minute).

**Q: My encryption test failed. What now?**  
A: This is a critical failure. Data integrity is broken. Review crypto.js immediately.

**Q: Search is too slow.**  
A: Normal. Blind indexing adds ~20-30% overhead. Acceptable if <2s @ 100 memories.

**Q: Project isolation test failed.**  
A: Critical security failure. Check that project names are properly scoped in queries.

**Q: Can I run these on Windows/Mac?**  
A: Yes. Tests are platform-independent (node server is required).

## What's NOT Tested Here

- **Performance**: See `benchmarks/performance/` for throughput, latency curves
- **Encryption strength**: See `tests/crypto.test.js` for cryptographic properties
- **UI/UX**: See manual testing or Electron app tests
- **Folder sync**: See `benchmarks/reliability/` 
- **Long-term stability**: Covered by continuous CI runs

## Next Steps

1. ✓ Run correctness benchmarks (you are here)
2. → Run performance benchmarks (`benchmarks/test_performance_*.py`)
3. → Run reliability benchmarks (`benchmarks/test_reliability_*.py`)
4. → Generate final report (`benchmarks/generate_report.py`)

## Contact

Issues with tests? Open an issue on [GitHub](https://github.com/nKOxxx/Cognexia/issues).
