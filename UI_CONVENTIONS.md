# UI_CONVENTIONS.md — Synthire frontend conventions

The rules for building UI so a screen added in six months looks and behaves like
one added today. `frontend/FE_DESIGN_GUIDELINES.md` covers *visual* direction
(colour, spacing, tone); this file covers **which component to reach for, where
it lives, and what not to hand-roll**.

Read this before adding a screen or a component.

---

## 1. The one rule

> **Look in `@/components/ui` first. If a primitive exists, use it. If it almost
> exists, extend it there — do not fork it into your screen.**

Every primitive is exported from the barrel, so there is exactly one import:

```tsx
import { Button, Select, Modal, useToast } from "@/components/ui"
```

Never deep-import (`@/components/ui/button`). The barrel is the public surface.

---

## 2. The primitive catalogue

Everything in `frontend/components/ui/`. This is the complete list — if you are
about to build something not on it, that is the moment to ask whether it belongs
here rather than in a screen file.

| Import | Use for | Never instead |
|---|---|---|
| `Button` | Any action with a label | a raw `<button>` |
| `IconButton` | Icon-only action (`icon` + required `label`) | `<button className="tsIconBtn">` |
| `Input`, `Textarea` | Text entry | raw `<input>` / `<textarea>` |
| `Select` | **Every dropdown** | a native `<select>` |
| `Checkbox`, `Toggle` | Boolean input | raw `<input type=checkbox">` |
| `Slider` | Numeric range (scoring importance) | raw `<input type="range">` |
| `Card` | Any surface/panel | a bare `<div>` with a border |
| `Modal` | Any overlay | a hand-rolled fixed-position div |
| `Tabs` | In-page section switching | hand-rolled button rows |
| `Badge` | Small status/label chip | a styled `<span>` |
| `StagePill` + `STAGE` | Candidate pipeline stage | your own stage colour map |
| `ScoreRing`, `ScoreBar`, `ScorePill` | Any score display | a hand-rolled percentage bar |
| `AIPill` | Marking AI-generated surfaces | a plain label |
| `Avatar` | Person representation | your own initials logic |
| `SearchInput` | Search fields | `Input` with a magnifier bolted on |
| `Tooltip` | Hover explanation | `title=""` |
| `useToast()` | All user feedback | `alert()`, inline banners |

### `IconButton` is the one people forget

`IconButton` requires a `label` and applies it as `aria-label`. A raw
`<button className="tsIconBtn">` renders identically and is **invisible to
screen readers**. If you are typing `tsIconBtn`, you want `IconButton`.

---

## 3. Where things live

```
frontend/
├── app/                      # routes only — thin. A page renders ONE component.
│   ├── (auth)/ (recruiter)/ (interviewer)/    # route groups = layout boundaries
│   └── globals.css           # ALL styling: 71 tokens, 431 .ts* classes
├── components/
│   ├── ui/                   # ← design system. Reusable, no business logic, no hooks/queries.
│   ├── shared/               # ← cross-role composites: Sidebar, Navigation,
│   │                         #    CommandPalette, TweaksPanel, Logo, NotificationToast
│   ├── (auth)/ (recruiter)/ (interviewer)/    # screens, by role
├── hooks/queries/            # ← ALL data access. One file per domain.
├── context/AuthContext.tsx   # session only
└── lib/
    ├── api.ts                # typed client — components never import this directly
    ├── auth.ts               # token storage
    ├── types.ts              # domain types
    ├── utils.ts              # cn(), initials(), formatDate()
    └── icons.tsx             # the icon set
```

**Which folder?**

- Reusable, no business logic, could ship in any app → `components/ui/`
- Used by more than one role, knows about Synthire → `components/shared/`
- Belongs to one screen → the role folder, in the screen file
- Fetches data → it needs a hook from `hooks/queries/`, not `apiFetch`

---

## 4. Data access — non-negotiable

```tsx
// ✅ the only shape
const { data, isLoading, isError } = useCandidates(filters)
if (isLoading) return <Skeleton />
if (isError)   return <ErrorState />

// ❌ never
const data = await apiFetch("/api/candidates")
```

- **Never call `apiFetch` from a component.** Add a hook to `hooks/queries/`.
- **Never call `lib/api.ts` auth functions.** `useAuth()` is the only entry
  point for `login` / `logout` / `signup`.
- Every data-dependent component handles **loading, error, and empty** states.
  An empty state is an icon plus a message — never a crash, never a blank panel.
- Mutations that need instant feedback follow `useUpdateCandidateStage()`:
  optimistic update with rollback on error.

---

## 5. Styling

- **All CSS lives in `app/globals.css`.** No CSS modules, no styled-components.
- Use existing `ts*` classes. Search `globals.css` before inventing one.
- Inline `style={{}}` is acceptable for genuine one-offs (a single margin), not
  for anything reusable.
- Colours come from tokens (`var(--muted)`, `var(--primary-3)`,
  `var(--stage-hired)`). **Never hardcode a hex value** — it breaks theming.
- Theme and density switch via `data-theme` / `data-density` on `<html>`,
  persisted by `TweaksPanel`. Anything hardcoded ignores both.
- AI surfaces use `.ai-text`, `.ai-border`, `.ai-surface` so AI output is
  visually distinguishable from user data.

---

## 6. Formatting rules

**Use `formatDate()` from `@/lib/utils`.** Do not call `toLocaleDateString()`
in a component.

Bare `toLocaleDateString()` renders differently depending on the viewer's
browser locale, so the same screen shows `9/6/2026` for one user and `06/09/2026`
for another. Any new format goes into `lib/utils.ts` as a named export
(`formatDateTime`, `formatRelative`), not inline.

Same rule for initials: `initials()` from `@/lib/utils`, or just use `Avatar`.

---

## 7. Component file conventions

- Every file in `components/` starts with `"use client"`.
- Pages under `app/` are server components and export `runtime = "edge"`
  (required by `next-on-pages`).
- **No thin re-export stubs.** A file whose entire body is
  `export { X } from "./Y"` adds an import hop and buys nothing. Import from
  where the component actually lives.
- `strict: false` in this project — do not fight existing `any` props, but type
  new code properly.
- Props interfaces are named `<Component>Props` and exported when a caller may
  need them.

---

## 8. Adding a new screen — checklist

1. Route file in the right `app/(role)/` group; export `runtime = "edge"`; render one component.
2. Component in the matching `components/(role)/` folder; `"use client"`.
3. Data via a hook in `hooks/queries/` — add one if it does not exist.
4. Loading, error and empty states all handled.
5. Every control from `@/components/ui`. Zero raw `<button>`, `<select>`, `<input>`.
6. Colours from tokens; check it in both themes and both densities.
7. Dates via `formatDate()`.
8. Add the route to the table in `frontend/CLAUDE.md`.
9. `npm run lint` and `npm run typecheck` clean.
10. Walk it in the browser per `TESTING_RULES.md` before calling it done.

---

## 9. Known drift — fix when you touch these files

Recorded so it is a decision rather than an accident:

| Drift | Where | Fix |
|---|---|---|
| 23 raw `<button className="tsIconBtn">` | across screens | swap to `IconButton` (gains `aria-label`) |
| 21 inline `toLocaleDateString()`, 4 different formats | 7 screen files | swap to `formatDate()` |
| `formatDate()` / `initials()` exported but never imported | `lib/utils.ts` | they are the fix for the two rows above |
| `Avatar` hand-rolls initials | `components/ui/avatar.tsx` | call `initials()` |
| Re-export stubs: `CandidateCard`, `JobCard`, `FilterPanel`, `FeedbackForm` | `components/(role)/` | delete; import from the real file |
| `ScoreDisplay.tsx` | `components/(recruiter)/` | dead — zero importers |
| `InterviewsList.tsx` | `components/(recruiter)/` | dead — `/interviews` renders `InterviewerHome` |
| `lib/data.ts` | 194 lines of mock data | dead — nothing imports it |

None of these break anything today. They are the cheapest possible cleanups and
each removes a way for the next screen to drift further.
