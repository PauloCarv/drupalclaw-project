---
name: drupal-plan-run
description: Executes a DrupalClaw plan step by step, updating checkboxes in the plan file as each step completes.
distribution: public
---

# drupal-plan-run

Executes a plan stored in `.piclaw/plans/<id>.md`.

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

   Read the Steps section of the plan file. For each line matching `- [ ] ...` (unchecked checkbox), execute the command or instruction described. After successful execution, mark the checkbox as done by replacing `- [ ]` with `- [x]` in the file using the Edit tool.

   Execute steps in order. If a step fails:
   - Note the failure in your response
   - DO NOT mark it with `[x]`
   - Continue to remaining steps if they are independent, or stop if they depend on the failed step
   - Record the failure at the end

   Capture all output to a log file:
   ```bash
   TIMESTAMP=$(date -u +%s)
   LOG_FILE="/workspace/.piclaw/plans/runs/${PLAN_ID}-${TIMESTAMP}.log"
   mkdir -p /workspace/.piclaw/plans/runs
   echo "=== Plan run: $PLAN_ID ===" > "$LOG_FILE"
   echo "Started: $STARTED_AT" >> "$LOG_FILE"
   ```

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

6. Interaction mode — check and show or suppress the didactic block:
   ```bash
   INTERACTION_MODE=$(jq -r '.interaction_mode // "learning"' /workspace/.piclaw/user-prefs.json 2>/dev/null || echo "learning")
   echo "INTERACTION_MODE=$INTERACTION_MODE"
   ```

   If INTERACTION_MODE is `learning`, output the following block verbatim (fill in the actual plan ID):

   💡 **How to replicate manually:**
   ```bash
   # Read the plan
   cat .piclaw/plans/<plan-id>.md

   # Execute each step manually, then mark as done:
   sed -i 's/- \[ \] <step>/- [x] <step>/' .piclaw/plans/<plan-id>.md

   # Update status when complete:
   sed -i 's/^status: .*/status: completed/' .piclaw/plans/<plan-id>.md
   ```
   Want a step-by-step explanation of how plan execution works? Just ask.

   If INTERACTION_MODE is `expert`, output nothing — skip this block entirely.
