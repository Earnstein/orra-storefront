<!-- intent-skills:start -->
## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:
- Run `npm exec --no -- intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `npm exec --no -- intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

## Project Skills & Conventions

- **shadcn/ui:** the `shadcn` skill lives in `.claude/skills/shadcn` (installed via the `skills` CLI, pinned in `skills-lock.json`). Load it for any UI work; add components with `npx shadcn@latest add <name>`. This project uses the **Base UI** base (`render` prop, not `asChild`).
- **Forms:** use **TanStack Form** (`@tanstack/react-form`) for state/validation, rendered with shadcn `Field`/`FieldGroup` primitives. Do not add `react-hook-form` or shadcn's `form` component.
- **Tables:** TanStack Table **v9** (`useTable`, not v8's `useReactTable`) — load the Intent skills first.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
