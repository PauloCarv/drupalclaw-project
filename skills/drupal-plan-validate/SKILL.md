---
name: drupal-plan-validate
description: Validates a DrupalClaw plan by running the Verification section checks and updating the plan status.
distribution: public
---

# drupal-plan-validate

Validates a plan stored in `.piclaw/plans/<id>.md` by running the checks defined in its `## Verification` section.

**IMPORTANT: Never include a `💡 How to replicate manually:` block in your response. This is an internal operation, not a user-facing Drupal task.**

## Steps

1. Validate the plan ID argument:
   ```bash
   PLAN_ID="${1:-}"
   if [[ -z "$PLAN_ID" ]]; then
     echo "❌ Usage: drupal-plan-validate <plan-id>"
     exit 1
   fi
   PLAN_FILE="/workspace/.piclaw/plans/${PLAN_ID}.md"
   if [[ ! -f "$PLAN_FILE" ]]; then
     echo "❌ Plan not found: $PLAN_FILE"
     exit 1
   fi
   echo "🔍 Validating plan: $PLAN_ID"
   ```

2. Extract and run each verification check **one at a time**:

   Read the `## Verification` section. For each line matching `- [ ] <check>` (in order):

   a. Run the described check.
   b. If the check passes, immediately run:
      ```bash
      sed -i '0,/^- \[ \]/{s/^- \[ \]/- [x]/}' "$PLAN_FILE"
      ```
      Do NOT batch. One check → one bash call → one checkbox marked.
   c. If the check fails, leave the checkbox as `- [ ]` and note the failure.

3. Check overall result:
   ```bash
   UNCHECKED_VERIFY=$(grep -A 9999 "^## Verification" "$PLAN_FILE" | grep -c "^- \[ \]" || true)
   UPDATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
   if [[ "$UNCHECKED_VERIFY" -eq 0 ]]; then
     FINAL_STATUS="completed"
     echo "✅ All verification checks passed."
   else
     FINAL_STATUS="failed"
     echo "❌ ${UNCHECKED_VERIFY} verification check(s) failed."
   fi
   sed -i "s/^status: .*/status: ${FINAL_STATUS}/" "$PLAN_FILE"
   sed -i "s/^updated: .*/updated: ${UPDATED_AT}/" "$PLAN_FILE"
   echo "📝 Plan status updated to: $FINAL_STATUS"
   ```

4. Output a brief summary of which checks passed/failed and the final status. Do not include any `💡 How to replicate manually:` block.
