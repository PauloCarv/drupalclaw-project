---
name: drupal-plan-run
description: Executes a DrupalClaw plan step by step, updating checkboxes in the plan file as each step completes.
distribution: public
---

# drupal-plan-run

Executes a plan stored in `.piclaw/plans/<id>.md`.

**IMPORTANT: Never include a `💡 How to replicate manually:` block in your response. This is an internal operation, not a user-facing Drupal task.**

## Steps

1. Validate the plan ID argument:
   ```bash
   PLAN_ID="${1:-}"
   if [[ -z "$PLAN_ID" ]]; then
     echo "❌ Usage: drupal-plan-run <plan-id>"
     exit 1
   fi
   PLAN_FILE="/workspace/.piclaw/plans/${PLAN_ID}.md"
   if [[ ! -f "$PLAN_FILE" ]]; then
     echo "❌ Plan not found: $PLAN_FILE"
     exit 1
   fi
   echo "📋 Executing plan: $PLAN_ID"
   cat "$PLAN_FILE"
   ```

2. Update plan status to `running` and record start time:
   ```bash
   STARTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
   # Update status: draft|ready|completed|failed → running
   sed -i "s/^status: .*/status: running/" "$PLAN_FILE"
   echo "🔄 Status set to running"
   ```

3. Parse and execute each step in the `## Steps` section:

   Read the Steps section. For each line matching `- [ ] <step text>` (in order), do the following **one step at a time**:

   a. Execute the action described in that step.
   b. Immediately after — whether success or failure — run this exact bash command to mark **only the first remaining unchecked checkbox**:
      ```bash
      sed -i '0,/^- \[ \]/{s/^- \[ \]/- [x]/}' "$PLAN_FILE"
      ```
      Do NOT skip this bash call. Do NOT batch multiple checkboxes in one call. One step → one bash call → one checkbox marked.

   c. Append the step result to the log:
      ```bash
      TIMESTAMP=$(date -u +%s)
      LOG_FILE="/workspace/.piclaw/plans/runs/${PLAN_ID}-${TIMESTAMP}.log"
      mkdir -p /workspace/.piclaw/plans/runs
      echo "=== Plan run: $PLAN_ID ===" > "$LOG_FILE"
      echo "Started: $STARTED_AT" >> "$LOG_FILE"
      echo "Step: <step text> → success/failure" >> "$LOG_FILE"
      ```

   If a step fails, still run the sed command to mark it `[x]` (so the next step becomes active), note the failure in your response, and continue unless subsequent steps depend on it.

4. After all steps, check if any remain unchecked (`- [ ]`):
   ```bash
   UNCHECKED=$(grep -c "^- \[ \]" "$PLAN_FILE" || true)
   COMPLETED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
   if [[ "$UNCHECKED" -eq 0 ]]; then
     FINAL_STATUS="completed"
     echo "✅ All steps completed successfully."
   else
     FINAL_STATUS="failed"
     echo "❌ ${UNCHECKED} step(s) did not complete."
   fi
   echo "Completed: $COMPLETED_AT (status: $FINAL_STATUS)" >> "$LOG_FILE"
   ```

5. Update frontmatter: set `status` and append a run entry:
   ```bash
   sed -i "s/^status: .*/status: ${FINAL_STATUS}/" "$PLAN_FILE"
   sed -i "s/^updated: .*/updated: ${COMPLETED_AT}/" "$PLAN_FILE"

   # Append run entry to runs: list
   # Replace 'runs: []' if present, or append after existing runs
   if grep -q "^runs: \[\]" "$PLAN_FILE"; then
     sed -i "s/^runs: \[\]/runs:\n  - startedAt: ${STARTED_AT}\n    completedAt: ${COMPLETED_AT}\n    status: ${FINAL_STATUS}\n    logPath: .piclaw\/plans\/runs\/${PLAN_ID}-${TIMESTAMP}.log/" "$PLAN_FILE"
   else
     sed -i "/^runs:/a\\  - startedAt: ${STARTED_AT}\n    completedAt: ${COMPLETED_AT}\n    status: ${FINAL_STATUS}\n    logPath: .piclaw\/plans\/runs\/${PLAN_ID}-${TIMESTAMP}.log" "$PLAN_FILE"
   fi

   echo "📝 Plan file updated."
   ```

6. Output a brief summary of what was executed and the final status. Do not include any `💡 How to replicate manually:` block.
