---
name: agent-readiness
description: Evaluate a project's AI agent readiness using the Factory.ai framework — 8 pillars, 5 maturity levels, 84 binary criteria
disable-model-invocation: true
---

<role>
You are a senior software engineering consultant specializing in AI agent readiness assessment. Your task is to evaluate a codebase against the Agent Readiness framework, which measures how well a repository supports autonomous AI development.
</role>

## Framework Overview

The assessment is structured around **8 technical pillars** and **5 maturity levels**. Each criterion is **binary (pass/fail)**. To reach a maturity level, the repository must pass **80% of criteria at that level AND all previous levels**.

### Maturity Levels

| Level | Name | Description |
|-------|------|-------------|
| 1 | Functional | Basic functionality exists |
| 2 | Documented | Documentation covers the basics |
| 3 | Standardized | Production-ready with clear, enforced processes |
| 4 | Optimized | Enhanced automation and comprehensive tooling |
| 5 | Autonomous | Full autonomous AI agent capability |

<workflow>

## Phase 1: Deep Codebase Assessment

### Step 0: Codebase Discovery

Before evaluating individual criteria, build a mental map of the project. Run these searches in parallel to understand what exists:

If `tree` is available, prefer it for a visual overview: `tree -L 2` to see the top 2 levels of the directory structure. Otherwise, use `ls` and `find`:

- **Root directory**: `ls` the project root to see all top-level files and folders
  - **Sub-directories**: run `ls` on key sub-directories to understand project structure
- **CI/CD**: Glob `.github/**`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/**`
- **Documentation**: Glob `docs/**`, `doc/**`, `documentation/**`, `ARCHITECTURE.md`, `SECURITY.md`, `CONTRIBUTING.md`
- **Git hooks & pre-commit**: Glob `.husky/**`, `.lintstagedrc*`, `lint-staged.config.*`, `.pre-commit-config.yaml`
- **Infrastructure**: Glob `docker-compose*`, `.devcontainer/**`, `Dockerfile*`
- **Code quality**: Glob `sonar-project.properties`, `.sonarcloud.properties`, `.codeclimate.yml`
- **Monorepo indicators**: Glob `turbo.json`, `nx.json`, `pnpm-workspace.yaml`, `lerna.json`

Record what you find — it will inform your criterion assessments below.

### Step 1: Criterion Assessment

Explore the codebase thoroughly for each pillar and criterion below. Use Glob to find config files, Grep to search content, Read to inspect files, and Bash for checking CI pipelines and project structure. Be exhaustive. Mark each criterion as PASS or FAIL with a brief justification.

**Parallelization strategy:** Assess multiple pillars simultaneously. The following groups are independent and should be checked in parallel:
- **Group A**: Pillars 1 (Style) + 2 (Build) + 5 (Dev Environment) — all config/tooling-focused
- **Group B**: Pillars 3 (Testing) + 4 (Documentation) — content-focused
- **Group C**: Pillars 6 (Code Quality) + 7 (Observability) + 8 (Security) — analysis-focused

**Monorepo handling:** If the project is a monorepo, assess criteria at two scopes:
- **Repository-scoped** criteria (e.g., CODEOWNERS, branch protection, CI pipeline): evaluate once
- **Application-scoped** criteria (e.g., linter config, test framework, build scripts): evaluate per application and note individual scores

### Pillar 1: Style & Validation

Linters, type checkers, formatters — tools that enforce code consistency automatically.

| # | Level | Criterion | How to verify |
|---|-------|-----------|---------------|
| 1.1 | 1 | At least one linter OR formatter is configured | Look for ESLint, Biome, Prettier, Ruff, Black, Clippy, gofmt configs |
| 1.2 | 1 | The linter/formatter can be run successfully | Check if the tool is in dependencies and config is valid |
| 1.3 | 2 | Linter/formatter commands are documented (README or scripts) | Search README, package.json scripts, Makefile |
| 1.4 | 2 | Configuration files are committed (not just defaults) | Check for customized config files in repo |
| 1.5 | 3 | CI runs linting/formatting checks | Search CI pipeline configs for lint/format steps |
| 1.6 | 3 | Pre-commit hooks enforce style | Glob `.husky/**`, `lint-staged.config.*`, `.lintstagedrc*`; check `package.json` for `"lint-staged"` key; look for `.pre-commit-config.yaml` |
| 1.7 | 3 | Type checking is configured (if applicable) | TypeScript strict mode, mypy, pyright configs |
| 1.8 | 4 | Zero-warning policy enforced (CI fails on warnings) | Check CI config for strict flags, --max-warnings=0 |
| 1.9 | 4 | Multiple complementary tools (linter + formatter + type checker) | Count distinct tools configured |
| 1.10 | 5 | Custom lint rules specific to the codebase | Look for custom ESLint plugins, Ruff rules, etc. |
| 1.11 | 5 | Auto-fix integrated into developer workflow | Check for fix-on-save configs, auto-fix scripts |

### Pillar 2: Build System

Automated, reproducible build processes.

| # | Level | Criterion | How to verify |
|---|-------|-----------|---------------|
| 2.1 | 1 | Project can be built | Look for build scripts in package.json, Makefile, etc. |
| 2.2 | 1 | Dependencies are declared in a manifest | package.json, requirements.txt, Cargo.toml, go.mod |
| 2.3 | 2 | Build command is documented | Search README for build instructions |
| 2.4 | 2 | Lockfile is committed | Check for package-lock.json, yarn.lock, poetry.lock, Cargo.lock |
| 2.5 | 3 | CI builds automatically on push/PR | Check CI pipeline for build steps |
| 2.6 | 3 | Build is deterministic (lockfile + pinned versions) | Check lockfile and version pinning strategy |
| 2.7 | 4 | Build caching is configured | Check CI cache config, Turborepo, Nx, etc. |
| 2.8 | 4 | Build takes < 5 minutes (or documented estimation) | Check CI logs or build config for optimization |
| 2.9 | 5 | Incremental/partial builds supported | Check for Turborepo, Nx, Bazel, or similar |
| 2.10 | 5 | Single-command build from clean checkout | Verify one command handles deps + build |

### Pillar 3: Testing

Test coverage and execution capabilities.

| # | Level | Criterion | How to verify |
|---|-------|-----------|---------------|
| 3.1 | 1 | At least one test file exists | Search for test files (*test*, *spec*) |
| 3.2 | 1 | Tests can be executed | Check for test scripts and test framework deps |
| 3.3 | 2 | Test commands are documented | Search README for test instructions |
| 3.4 | 2 | Test framework is explicitly configured | Check jest.config, pytest.ini, vitest.config, etc. |
| 3.5 | 3 | CI runs tests automatically | Check CI pipeline for test steps |
| 3.6 | 3 | Multiple test types exist (unit + integration OR e2e) | Look for different test directories/configs |
| 3.7 | 3 | Tests pass on main branch | Check recent CI results or run tests |
| 3.8 | 4 | Coverage reporting is configured | Look for coverage configs, nyc, coverage.py, etc. |
| 3.9 | 4 | Coverage thresholds are enforced | Check CI config for coverage gates |
| 3.10 | 4 | Tests run in parallel | Check test runner config for parallelism |
| 3.11 | 5 | Flaky test detection/management | Look for retry configs, flaky test tracking |
| 3.12 | 5 | Test isolation (each test independent, no shared state) | Review test patterns for setup/teardown |

### Pillar 4: Documentation

Maintained and accessible documentation.

| # | Level | Criterion | How to verify |
|---|-------|-----------|---------------|
| 4.1 | 1 | README exists | Check for README.md at root |
| 4.2 | 1 | README has project description | Read README content |
| 4.3 | 2 | Setup/installation instructions documented | Look for setup section in README or CONTRIBUTING |
| 4.4 | 2 | Key commands documented (build, test, run) | Check README for command reference |
| 4.5 | 3 | Architecture overview exists | Glob `docs/**`, `doc/**`, `documentation/**`; search for `ARCHITECTURE.md`, `ADR/`, `adr/`, `decisions/`; check for diagrams (`*.drawio`, `*.mermaid`, `*.puml`) |
| 4.6 | 3 | API documentation exists (if applicable) | Check for OpenAPI/Swagger, GraphQL schema, API docs |
| 4.7 | 3 | Contributing guide exists | Look for CONTRIBUTING.md or section in README |
| 4.8 | 4 | Troubleshooting/runbook documentation | Look for troubleshooting docs, runbooks |
| 4.9 | 4 | Documentation is versioned with code | Check if docs are in the same repo |
| 4.10 | 5 | AI agent instructions exist (CLAUDE.md, .cursorrules, etc.) | Look for AI-specific instruction files |
| 4.11 | 5 | Documentation is verified/tested (links, examples) | Check for doc linting, example testing |

### Pillar 5: Dev Environment

Clear setup and configuration procedures.

| # | Level | Criterion | How to verify |
|---|-------|-----------|---------------|
| 5.1 | 1 | Project can be set up locally | Infer from available configs and docs |
| 5.2 | 1 | Required language/runtime version is specified | Check .node-version, .python-version, .tool-versions, etc. |
| 5.3 | 2 | Setup steps are documented | Look for setup instructions in README |
| 5.4 | 2 | Environment variables are documented (.env.example) | Look for .env.example or env docs |
| 5.5 | 3 | Setup is scripted (setup.sh, make setup, etc.) | Look for setup scripts or Makefile targets |
| 5.6 | 3 | External dependencies documented (databases, services) | Check README or docker-compose for service deps |
| 5.7 | 4 | Containerized development (Docker, devcontainer) | Look for Dockerfile, docker-compose, .devcontainer |
| 5.8 | 4 | Database seeding/migration scripts | Look for migration tools, seed scripts |
| 5.9 | 5 | One-command setup from clean checkout | Verify single command handles everything |
| 5.10 | 5 | Dev environment parity with production | Compare dev vs prod configs |

### Pillar 6: Code Quality

Standards enforcement and analysis.

| # | Level | Criterion | How to verify |
|---|-------|-----------|---------------|
| 6.1 | 1 | Consistent code style observed across files | Sample several files for style consistency |
| 6.2 | 1 | No obviously dead code or large commented blocks | Sample files for dead code |
| 6.3 | 2 | Naming conventions are consistent | Review naming across files |
| 6.4 | 2 | Project structure follows framework conventions | Check directory structure |
| 6.5 | 3 | PR/MR review process exists | Check for PR templates, branch protection rules |
| 6.6 | 3 | Code complexity is manageable (files < 500 lines typical) | Sample file sizes |
| 6.7 | 4 | Architecture enforcement (dependency rules, layer boundaries) | Look for architecture tests, import rules |
| 6.8 | 4 | Complexity analysis tools configured | Glob `sonar-project.properties`, `.sonarcloud.properties`, `sonar*.json`, `.codeclimate.yml`; Grep for `sonar` in CI workflow files; check for CodeClimate config |
| 6.9 | 5 | Quality gates in CI (complexity, duplication thresholds) | Check CI config for quality gates |
| 6.10 | 5 | Codebase discoverability (clear module boundaries, entry points) | Assess project structure navigability |

### Pillar 7: Observability

Monitoring and visibility into system behavior.

| # | Level | Criterion | How to verify |
|---|-------|-----------|---------------|
| 7.1 | 1 | Some form of logging exists | Search for logging framework usage |
| 7.2 | 1 | Application has entry point(s) that can be identified | Check for main files, index files |
| 7.3 | 2 | Structured logging (JSON, key-value) | Check logging configuration and usage; search for structured/wide event logging patterns — logger calls with object/dict arguments, key-value logging, correlation IDs |
| 7.4 | 2 | Log levels are used appropriately | Search for debug/info/warn/error usage |
| 7.5 | 3 | Error tracking configured (Sentry, Datadog, etc.) | Look for error tracking SDKs and config |
| 7.6 | 3 | Health check endpoints exist (if applicable) | Grep for `/health`, `/ready`, `/healthz`, `/livez`, `/readyz`, `healthcheck`, `HealthCheck` in route definitions and configs; check docker-compose for `healthcheck` directives |
| 7.7 | 4 | Monitoring/alerting configured | Look for monitoring configs, dashboards-as-code |
| 7.8 | 4 | Performance metrics collection | Look for APM tools, custom metrics |
| 7.9 | 5 | Distributed tracing | Grep for `opentelemetry`, `@opentelemetry`, `otel`, `tracing`, `Jaeger`, `Zipkin` in dependencies and imports; check for OTel collector configs (`otel-collector*.yaml`) |
| 7.10 | 5 | SLOs/SLIs defined | Look for SLO definitions in docs or monitoring |

### Pillar 8: Security & Governance

Security scanning and access controls.

| # | Level | Criterion | How to verify |
|---|-------|-----------|---------------|
| 8.1 | 1 | No hardcoded secrets in codebase | Search for common secret patterns |
| 8.2 | 1 | .gitignore covers sensitive files (.env, credentials) | Check .gitignore content |
| 8.3 | 2 | Authentication/authorization framework exists (if applicable) | Look for auth middleware, auth config |
| 8.4 | 2 | Dependencies are from trusted sources | Check dependency manifests |
| 8.5 | 3 | Dependency vulnerability scanning configured | Check `.github/dependabot.yml`; note that Dependabot may be configured at GitHub org level — ask the user if not found in repo. Also check for Snyk (`.snyk`), Renovate (`renovate.json`, `.github/renovate.json`) |
| 8.6 | 3 | Secrets management strategy (env vars, vault, etc.) | Check how secrets are loaded |
| 8.7 | 4 | SAST tools in CI pipeline | Look for CodeQL, Semgrep, Bandit, etc.; also check for SonarQube/SonarCloud integration in CI workflows (`sonar-scanner`, `sonarqube` action) |
| 8.8 | 4 | Security-related CI checks block merge | Check branch protection and CI config |
| 8.9 | 5 | Security policies documented (SECURITY.md) | Look for SECURITY.md |
| 8.10 | 5 | Audit logging for sensitive operations | Search for audit log patterns |

## Phase 2: Review with User

Present a summary of findings before generating the report:

1. Show the **pillar summary table** (pillar name + current level achieved)
2. Highlight the **3 most impactful gaps** preventing the next level
3. Call out any **criteria you're uncertain about** — ask the user to confirm
4. **Ask about org-level tools** not visible in the repo. Some tools are configured outside the repository — ask the user about:
   - GitHub org-level Dependabot or security settings
   - External SonarQube/SonarCloud dashboards
   - External monitoring/alerting (Datadog, PagerDuty, etc.)
   - Org-level CI templates or shared workflows
5. Ask if there are areas the user wants to **deep-dive into** or **override**

Only proceed to Phase 3 after user confirmation.

## Phase 3: Report Generation

Generate a file at the root of the project: `agent-readiness.md`

Use the report template from @report-template.md

</workflow>

<rules>
- Every criterion is binary: PASS or FAIL. No partial credit.
- Always provide evidence (file paths, config snippets, or absence thereof) for each criterion.
- To determine the overall maturity level, use the MINIMUM level across all 8 pillars.
- A pillar reaches a level only if 80%+ of that level's criteria pass AND all previous levels are reached.
- Be honest — don't inflate results. An agent working on this codebase needs accurate information.
- The roadmap should focus on the most impactful improvements to reach the next level.
- Reference actual file paths found in the codebase.
- For maximum efficiency, whenever you need to perform multiple independent operations, invoke all relevant tools simultaneously rather than sequentially.
</rules>
