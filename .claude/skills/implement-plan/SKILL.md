---
name: implement-plan
description: Implement migration plan following component table (Database → Backend → Frontend → Tests)
argument-hint: "[migration-plan.md]"
disable-model-invocation: true
---

## Role

You are a senior engineer implementing a migration plan. The plan is concise — it captures key decisions and gotchas, not every detail. You are expected to read reference implementations and follow established patterns yourself.

## Task

Here is the migration plan given by the user:
<userinput>
$ARGUMENTS
</userinput>

Implement all components listed in the plan. The same folder contains the legacy analysis files (`analysis-*.md`) and the spec (`spec.md`) — all are source of truth for existing behavior.

---

## Steps

1. Check that the user has loaded the project's coding standards and architecture context into the current conversation (e.g., via `/prime-context` or equivalent). If not, say it and stop.

2. Read all docs in the same folder: the migration plan (see `<userinput>` above), all `analysis-*.md` files, and `spec.md`.

3. Read all referenced implementations listed in the plan's References section. These are your primary guide for structure and conventions.

4. Read ALL legacy source code referenced in the legacy analysis. The analysis contains a call graph with every function and its file path. For **every** function in the tree, read the full source using the appropriate extractor script:

    ```bash
    php bin/extract-php-function.php path/to/file methodName  # PHP
    bun bin/extract-cs-function.ts path/to/file MethodName      # C#
    ruby bin/extract-ruby-function.rb path/to/file method_name  # Ruby
    ```

    - Read **every** function in the tree — do not skip any
    - Also read ALL view/template files referenced by the controller using the Read tool

5. **Ask questions BEFORE and while implementing.** After reading all source material (steps 1-4), identify any ambiguities, unclear requirements, or decisions not covered by the plan. Do NOT guess or make assumptions on non-trivial choices.

    Ask questions **one at a time** directly in the conversation (do NOT use `AskUserQuestion`). For each question:
    - State the question clearly
    - Present options in a **table** with concise pros/cons
    - Use visual indicators: ✅❌ for support, 🔴🟠🟢 for risk/effort, ⭐️/⭐️⭐️/⭐️⭐️⭐️ for recommendation strength
    - Wait for the user's answer before asking the next question

6. For each decision made by answering a question, create an ADR file in `docs/adr` following the ADR template in skill `create-migration-plan`.

7. Create a todo list from the Components table (Database → Backend → Frontend → Tests).

8. Implement each component (see below).

9. Launch the `implement-plan-verifier` agent on the feature folder. Read its report and fix all issues yourself.

---

## Implementation

For each component:
- Open the reference implementation mentioned in the plan
- Implement following that pattern, applying the plan's decisions and gotchas
- **Check config registration**: after implementing each component, check whether it needs config registration (services, routes, etc.). Compare with the reference implementation's config files — if the reference has explicit wiring, replicate it for the new component.
- **Keep asking questions during implementation.** When you encounter unexpected complexity, ambiguous legacy behavior, or a choice not covered by the plan, stop and ask the user directly in the conversation (same format: table + visual indicators, one question at a time). Create an ADR for each non-trivial decision made this way.

---

## Rules

- Read the plan's "Decisions & Gotchas" section carefully before starting — it flags traps and non-obvious choices.
- All code must follow documented standards in `docs/standards/`.
- Ask the user directly for ambiguities (don't use `AskUserQuestion`). Don't deviate from the plan without asking.
- Do NOT run automated quality checks (phpstan, eslint, etc.) — they will be handled by a dedicated agent later.
- For maximum efficiency, invoke multiple independent tools simultaneously rather than sequentially.
