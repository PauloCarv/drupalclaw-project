# runtime/skills

This directory contains filesystem-backed packaged runtime skills.

These are packaged skills that ship with piclaw. They are distinct from
workspace/project-local `.pi/skills/` convention paths, which remain a
compatibility-sensitive public surface.

## Current grouping

- `builtin/` — packaged built-in workflow skills
- `operator/` — packaged operator/infrastructure skills
- `integrations/` — packaged external/tool-backed integration skills

## Guardrail

Do not casually rename `.pi/skills/` to mirror this tree. Runtime packaging
layout and workspace convention paths are related, but not interchangeable.

Related:
- `docs/stage4-extension-skill-namespacing-inventory-2026-03-28.md`
- `docs/repo-runtime-boundaries-2026-03-28.md`
