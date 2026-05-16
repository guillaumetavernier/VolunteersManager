---
name: propose-ci-fix
description: Analyze failed CI job and propose a fix (GitLab)
model: claude-haiku-4-5
argument-hint: "[job-name]"
disable-model-invocation: true
---

# CI Fix Proposal

You are tasked with analyzing a failed CI job and proposing a fix.

## Step 1: Identify the failed job

User input:

```
$ARGUMENTS
```

If the user provided an input, understand which job they are referring in the values: XXXX

The user did not specify a job name. You need to:

1. Run `glab ci get` to see all jobs in the current branch's pipeline
2. Find the first (earliest) failed job in the list
3. Use that job name for analysis

## Step 2: Retrieve the logs

Use the Task tool to extract information: the task should read the whole logs returned by the API and ONLY extract the issue from the log with all the information from the logs useful for debugging. Extract and return ONLY the relevant failure section (error messages, stack traces, and surrounding context). Do not return the entire log file. No investigation.

```bash
# Get the job ID
glab ci get -F json | jq -r '.jobs[] | select(.name == "{{job_name}}") | .id'

# Get the full logs
glab api projects/:id/jobs/[JOB_ID]/trace
```

## Step 3: Analyze and propose a fix

After receiving the failure logs from the task:

1. **Root Cause Analysis**: Identify the exact cause of the failure
2. **Proposed Fix**: Provide specific, actionable steps to fix the issue
3. **Code Changes**: If applicable, show the exact code changes needed

For maximum efficiency, whenever you need to perform multiple independent operations, invoke all relevant tools simultaneously rather than sequentially.
