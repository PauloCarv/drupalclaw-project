---
name: drupal-plan-validate
description: Validates a DrupalClaw plan by running the Verification section checks and updating the plan status.
distribution: public
---

# drupal-plan-validate

Validates a plan stored in `.piclaw/plans/<id>.md` by running the checks defined in its `## Verification` section.

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

2. Extract and run each verification check:

   Read the `## Verification` section of the plan file. For each line matching `- [ ] ...`, interpret and run the described check (e.g. "Module is enabled (drush pm:list)" → run `drush pm:list | grep module_name`). After a successful check, mark the checkbox as done by replacing `- [ ]` with `- [x]` in the file using the Edit tool.

   If a verification check fails:
   - Leave the checkbox as `- [ ]`
   - Note the failure

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

4. Interaction mode — check and show or suppress the didactic block:
   ```bash
   INTERACTION_MODE=$(jq -r '.interaction_mode // "learning"' /workspace/.piclaw/user-prefs.json 2>/dev/null || echo "learning")
   echo "INTERACTION_MODE=$INTERACTION_MODE"
   ```

   If INTERACTION_MODE is `learning`, output the following block verbatim:

   💡 **How to replicate manually:**
   ```bash
   # Check each verification item manually, then mark done:
   sed -i 's/- \[ \] <check>/- [x] <check>/' .piclaw/plans/<plan-id>.md

   # Update status:
   sed -i 's/^status: .*/status: completed/' .piclaw/plans/<plan-id>.md
   ```
   Want a step-by-step explanation of how plan validation works? Just ask.

   If INTERACTION_MODE is `expert`, output nothing — skip this block entirely.
