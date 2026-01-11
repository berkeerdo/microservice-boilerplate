# Commit Convention Guide

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification. All commits are validated automatically using **commitlint** and **Husky** git hooks.

## Commit Message Format

```
<type>(<scope>): <description>

<body>

<footer>
```

### Structure

| Part | Required | Rules |
|------|----------|-------|
| type | ✅ Yes | Must be one of the allowed types |
| scope | ⚠️ Recommended | Lowercase, describes the affected area |
| description | ✅ Yes | Lowercase, imperative mood, no period, max 50 chars |
| body | ❌ Optional | Blank line before, max 100 chars per line |
| footer | ❌ Optional | For BREAKING CHANGE or issue references |

## Commit Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature for the user | `feat(auth): add jwt refresh token support` |
| `fix` | Bug fix for the user | `fix(api): resolve null pointer in user handler` |
| `docs` | Documentation only changes | `docs(readme): update installation instructions` |
| `style` | Formatting, no code change | `style(lint): fix eslint warnings` |
| `refactor` | Code refactoring | `refactor(db): simplify query builder logic` |
| `perf` | Performance improvements | `perf(cache): optimize redis key generation` |
| `test` | Adding or updating tests | `test(auth): add unit tests for jwt service` |
| `build` | Build system or dependencies | `build(deps): upgrade fastify to v5` |
| `ci` | CI/CD configuration | `ci(github): add node 22 to test matrix` |
| `chore` | Maintenance tasks | `chore(deps): update dev dependencies` |
| `revert` | Revert a previous commit | `revert: revert "feat(auth): add oauth"` |

## Suggested Scopes

| Scope | Description |
|-------|-------------|
| `api` | HTTP API routes and handlers |
| `auth` | Authentication and authorization |
| `db` | Database related changes |
| `cache` | Redis cache operations |
| `queue` | RabbitMQ message queue |
| `config` | Configuration and environment |
| `middleware` | Fastify middlewares |
| `grpc` | gRPC service definitions |
| `docs` | Documentation |
| `deps` | Dependencies |

## Rules Summary

### Header (First Line)
- **Max 72 characters** total
- **Description max 50 characters**
- **Lowercase** everything
- **Imperative mood** ("add" not "added" or "adds")
- **No period** at the end

### Body
- **Blank line** before body (required)
- **Max 100 characters** per line
- Use **bullet points** starting with `-`
- Explain **what** and **why**, not how
- **Wrap long lines** properly

### Footer
- **Blank line** before footer
- Use for `BREAKING CHANGE:` notes
- Reference issues: `Closes #123`

## Examples

### Simple Commit (No Body)

```
feat(auth): add password reset endpoint
```

### Commit with Body

```
fix(db): resolve connection pool exhaustion

- increase max connections from 10 to 100
- add connection timeout handling
- implement retry logic for transient failures
```

### Commit with Breaking Change

```
feat(api): change response format to json:api spec

- update all endpoint responses to follow json:api format
- add meta information to paginated responses

BREAKING CHANGE: all API responses now follow json:api specification.
Clients need to update their response parsing logic.
```

### Multi-line Body (Line Wrapping)

❌ **Wrong** - Line too long:
```
- delete outdated standalone service modules including content creation, image generation, and orchestration
```

✅ **Correct** - Properly wrapped:
```
- delete outdated standalone service modules including content creation,
  image generation, and orchestration
```

## Git Hooks

### Pre-commit Hook
Runs **lint-staged** which:
- Runs ESLint with `--fix` on staged `.ts` files
- Runs Prettier with `--write` on staged `.ts` files

### Commit-msg Hook
Validates commit message against commitlint rules.

## Testing Your Commit Message

```bash
# Test a commit message
echo "feat(api): add new endpoint" | npx commitlint

# See all rules
npx commitlint --print-config
```

## IDE Integration

### VS Code
Install the [Conventional Commits](https://marketplace.visualstudio.com/items?itemName=vivaxy.vscode-conventional-commits) extension for commit message templates.

### JetBrains IDEs
Install the [Conventional Commit](https://plugins.jetbrains.com/plugin/13389-conventional-commit) plugin.

## Quick Reference

```
feat(scope): add something new          # New feature
fix(scope): resolve the bug             # Bug fix
docs(scope): update the readme          # Documentation
style(scope): format the code           # Formatting
refactor(scope): simplify the logic     # Refactoring
perf(scope): optimize the query         # Performance
test(scope): add unit tests             # Tests
build(scope): upgrade dependencies      # Build/deps
ci(scope): update github actions        # CI/CD
chore(scope): clean up old files        # Maintenance
revert: revert "previous commit"        # Revert
```
