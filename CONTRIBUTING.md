# Contributing to Cognexia

Thank you for your interest in contributing to Cognexia! We welcome contributions of all kinds.

## Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn
- Git

### Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/nKOxxx/Cognexia.git
cd Cognexia

# Install dependencies
npm install

# Start the development server
npm start

# In another terminal, run tests
npm test
```

## Development Workflow

1. **Create a branch** for your feature/fix
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clear, concise code
   - Follow existing code style
   - Add comments for complex logic
   - Update tests as needed

3. **Test your changes**
   ```bash
   npm test              # Run all tests
   npm test:watch       # Watch mode
   npm test:coverage    # With coverage report
   ```

4. **Commit with clear messages**
   ```bash
   git commit -m "feat: Add feature description"
   git commit -m "fix: Fix bug description"
   git commit -m "docs: Update documentation"
   ```

5. **Push and create a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Code Style

### JavaScript
- Use `const`/`let` (no `var`)
- 2-space indentation
- Camelcase for variables/functions
- UPPERCASE for constants
- Meaningful variable names

### Comments
```javascript
// Use for single-line comments
/**
 * Use JSDoc for functions/classes
 * Describe parameters and return types
 */
```

### Testing
- Write tests for new features
- Tests go in `tests/` or `benchmarks/` directories
- Use Jest for unit tests
- Use pytest for integration tests

## Types of Contributions

### Bug Reports
- Use GitHub Issues
- Include reproduction steps
- Attach logs if available
- Specify your environment (OS, Node version, etc.)

### Feature Requests
- Use GitHub Discussions
- Explain the use case
- Discuss implementation approach
- Get feedback before implementing

### Documentation
- Update README.md for user-facing changes
- Add JSDoc comments for functions
- Update CHANGELOG.md for releases
- Create examples for new features

### Code Improvements
- Refactoring for clarity
- Performance optimizations
- Security improvements
- Test coverage increases

## Areas for Contribution

### High Priority
- [ ] Multi-process architecture for better concurrency
- [ ] PostgreSQL support for scaling
- [ ] Key rotation for encryption
- [ ] Web UI improvements
- [ ] CLI tool enhancements

### Medium Priority
- [ ] SDKs (Python, Go, Ruby, etc.)
- [ ] Database migration tools
- [ ] Advanced search features
- [ ] Backup/restore tooling
- [ ] API documentation

### Good First Issues
- [ ] Documentation improvements
- [ ] Bug fixes in UI
- [ ] CLI command additions
- [ ] Test coverage
- [ ] Example applications

## Pull Request Process

1. **Update documentation** if your change affects how users interact with Cognexia
2. **Add tests** for new functionality
3. **Ensure CI passes** (tests, linting, coverage)
4. **Keep PRs focused** - one feature per PR
5. **Write a clear PR description**

### PR Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Performance improvement
- [ ] Security improvement

## Testing
- [ ] Added tests
- [ ] Updated tests
- [ ] All tests pass

## Checklist
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] No breaking changes
- [ ] Ready for review
```

## Code Review Process

All PRs require review before merge. Be receptive to feedback:
- Maintainers may suggest changes
- Respond to comments or make requested changes
- Address concerns thoroughly
- Ask questions if unclear

## Release Process

Releases follow semantic versioning (MAJOR.MINOR.PATCH):
- v1.0.0 → v1.1.0 (minor features)
- v1.0.0 → v1.0.1 (bug fixes)
- v1.0.0 → v2.0.0 (breaking changes)

## Community Guidelines

### Be Respectful
- Treat all members with respect
- Welcome diverse perspectives
- Assume good intent
- Provide constructive feedback

### Be Helpful
- Answer questions in issues
- Help newer contributors
- Share knowledge and experience
- Review PRs from community

### Be Honest
- Report bugs accurately
- Don't spam
- Credit contributors
- Be transparent about limitations

## Questions?

- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - Questions and ideas
- **Pull Requests** - Code contributions
- **Email** - For security issues only

## License

By contributing, you agree your contributions are licensed under the MIT License (same as the project).

---

**Thank you for contributing to Cognexia! 🎉**
