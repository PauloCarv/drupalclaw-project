---
name: script-discovery-annotation
description: Add or validate SCRIPT_JDOC metadata on skill-shipped and workspace scripts so list_scripts and future script discovery can find them reliably.
distribution: public
---

# Script Discovery Annotation

Use this skill when adding or updating TypeScript scripts that should be discoverable by `list_scripts` or future script-catalog tooling.

## What to annotate

Apply `SCRIPT_JDOC` blocks to script files under surfaces such as:

- packaged skill scripts: `runtime/skills/**/*.ts`
- packaged extension skill scripts: `runtime/extensions/**/skills/**/*.ts`
- workspace skill scripts: `.pi/skills/**/*.ts`
- workspace note scripts: `notes/**/*.ts`

## Workflow

1. Preview scaffold metadata for a file or directory:

   ```bash
   bun ./annotate-script-jdoc.ts --path <file-or-dir>
   ```

2. Write scaffold metadata in place:

   ```bash
   bun ./annotate-script-jdoc.ts --path <file-or-dir> --write
   ```

3. For helper/support modules that should not be treated as standalone entrypoints:

   ```bash
   bun ./annotate-script-jdoc.ts --path <file-or-dir> --write --role module
   ```

4. Validate that every target script has a parseable `SCRIPT_JDOC` block:

   ```bash
   bun ./annotate-script-jdoc.ts --path <file-or-dir> --check
   ```

## Review checklist

After scaffolding, hand-tune the JSON block so it reflects the real user-facing purpose:

- `summary` should be a short, literal description
- `aliases` should match phrases a human would actually type
- `domains`, `verbs`, and `nouns` should help intent matching
- `keywords` should be supplemental, not a junk drawer
- `examples` should be short task-shaped phrases
- `role` should be `entrypoint` for runnable scripts and `module` for helper files
- `kind` / `weight` should reflect real behavior and cost

Primary script purpose matters more than path scaffolding. Keep the metadata compact and human-facing.

## Canonical fields

```ts
{
  summary?: string,
  aliases?: string[],
  domains?: string[],
  verbs?: string[],
  nouns?: string[],
  keywords?: string[],
  guidance?: string[],
  examples?: string[],
  kind?: "read-only" | "mutating" | "mixed",
  weight?: "lightweight" | "standard" | "heavy",
  role?: "entrypoint" | "module"
}
```

## Notes

- The helper script creates or updates only the `SCRIPT_JDOC` comment block.
- Preview mode prints the generated block without modifying files.
- `--force` replaces an existing block; without it, existing metadata is left alone.
- Prefer manual review after scaffolding, especially for high-value scripts.
- If `list_scripts` is available, use it after annotation to confirm the script is discoverable.
