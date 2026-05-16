---
name: validate
description: Run format, lint, and tests in parallel, then fix issues until all green
---

Run first 2 subagents to run in parallel these preparation tasks:

1. `{{FORMAT_CMD:}}`: this does nothing else than executing the command, it doesn't do any other tool calls to investigate more.
2. Ensure server is running and ready with `{{BACKEND_CHECK_CMD:}}`. If not, start it.

Wait to have confirmation that the backend is running.

Then run 3 QA subagents to run in parallel these quality tasks and compile a concise list of issues to adress. These subagents do nothing else than executing the command, they don't perform any other tool call to investigate more.

1. `{{LINT_CMD:}}`
2. `{{UNIT_TEST_CMD:}}`
3. `{{E2E_TEST_CMD:}}`

Then fix all issues.

When all is fixed, re-run all the above. Repeat until all is green.

For maximum efficiency, whenever you need to perform multiple independent operations, invoke all relevant tools simultaneously rather than sequentially.
