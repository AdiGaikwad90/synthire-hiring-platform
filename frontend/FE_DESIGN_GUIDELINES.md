# Synthire Frontend Design Guidelines

Rules to follow every time you add or modify any frontend UI. Never use raw HTML elements when a design-system component exists.

---

## 1. Always use design-system components

All primitives live in `components/ui/` and are exported from `@/components/ui`. **Never use raw HTML equivalents.**

| Need | Use | Never use |
|---|---|---|
| Dropdown / select | `<Select options={[...]} />` | `<select>`, inline `<select style={...}>` |
| Text input | `<Input />` | `<input>` |
| Button | `<Button variant="...">` | `<button style={...}>` (except icon-only toolbar buttons that use `tsIconBtn` class) |
| Icon button | `<IconButton />` | bare `<button>` with icon child |
| Avatar | `<Avatar name="..." size={N} />` | `<div>` initials, `<img>` |
| Score display | `<ScorePill score={N} />` | custom score divs |
| Stage badge | `<StagePill stage="..." />` | colored `<span>` |
| Badge / tag | `<Badge variant="...">` | `<span className="chip">` |
| Search field | `<SearchInput value={...} onChange={...} />` | `<input type="search">` |
| Tab bar | `<Tabs items={[...]} />` | manual tab button arrays |
| Modal / dialog | `<Modal open={...} onClose={...}>` | `<div>` overlays |
| Toast notification | `useToast()` hook | `alert()`, custom overlays |
| Tooltip | `<Tooltip content="...">` | `title` attribute |
| Toggle / switch | `<Toggle checked={...} onChange={...} />` | `<input type="checkbox">` |
| Slider | `<Slider value={...} onChange={...} />` | `<input type="range">` |
| AI label | `<AIPill>` | custom gradient spans |

---

## 2. Select component usage

```tsx
import { Select } from "@/components/ui";

<Select
  label="Job"                          // optional inline label
  value={selectedValue}
  onChange={e => setValue(e.target.value)}
  options={[
    { value: "", label: "All jobs" },
    { value: "id1", label: "Senior Engineer" },
  ]}
/>
```

- Always use `Select` for dropdowns — never `<select>` directly
- Use the `label` prop for inline labels in filter bars (renders visually inline)
- For form fields, pass `error` and `hint` props for validation messages

---

## 3. Button variants

```tsx
<Button variant="primary">Save</Button>        // filled accent — primary action
<Button variant="secondary">Cancel</Button>    // outlined — secondary action
<Button variant="ghost">Clear</Button>         // text-only — tertiary / destructive
<Button variant="danger">Delete</Button>       // red — destructive confirm
<Button icon={<Icon.Plus size={14}/>}>Add</Button>  // with leading icon
```

- Active filter state → `variant="primary"`
- Default / inactive → `variant="secondary"`
- Never use inline `style={{ background, border, color }}` to style buttons

---

## 4. CSS classes — always prefer existing ones

Use the design system class names from `app/globals.css`. Never write inline styles for things already covered.

| Class | Purpose |
|---|---|
| `h1`, `h2`, `h3` | Headings |
| `small` | Muted small text |
| `mono` | Monospace numbers/codes |
| `tsChip` | Skill/tag chip |
| `tsField` | Form field wrapper |
| `tsField-label` | Field label |
| `tsIconBtn` | Icon-only toolbar button |
| `tsViewToggle` | View mode toggle button group |
| `tsPipe-toolbar` | Pipeline page toolbar row |
| `tsKanban` | Kanban board container |
| `tsKanban-col` | Kanban column |
| `tsKanban-card` | Kanban card |
| `tsKanban-head` | Column header |
| `tsKanban-list` | Column card list |
| `tsKanban-add` | Column "add" footer button |
| `tsKanban-empty` | Empty drop zone placeholder |
| `ai-text` | Gradient AI text |
| `ai-border` | Gradient AI border ring |
| `ai-surface` | Glow AI background |

---

## 5. Inline styles — when allowed

Only use `style={{}}` for:
- Dynamic values that come from data (e.g. `style={{ background: col.color }}`)
- One-off layout (`flex: 1`, `gap: N`, `minWidth: N`) when no utility class covers it
- `style={{ width, height }}` on container wrappers

Never use inline styles for: colors, font sizes, font weights, borders, border-radius, padding, cursor — these all have class equivalents.

---

## 6. Spacing and layout

- Use `gap` in flexbox, not `margin` on children
- Filter bars: flex row, `gap: 12`, `padding: "10px 24px"`, `background: var(--surface-2)`, `border-bottom: 1px solid var(--border)`
- Dividers between filter groups: `<div style={{ width: 1, height: 20, background: "var(--border)" }}/>`

---

## 7. Color tokens — never hardcode colors

All colors come from CSS custom properties. Never write hex or rgb values.

| Token | Use |
|---|---|
| `var(--text)` | Primary text |
| `var(--muted)` | Secondary / hint text |
| `var(--accent)` | Brand accent (links, highlights) |
| `var(--surface)` | Card / input background |
| `var(--surface-2)` | Slightly elevated surface |
| `var(--border)` | Borders and dividers |
| `var(--bg)` | Page background |
| `var(--stage-new/shortlisted/...)` | Stage indicator colors |

---

## 8. Icons

Use `Icon.*` from `@/lib/icons`. Always pass `size={N}` explicitly.

```tsx
import { Icon } from "@/lib/icons";
<Icon.Filter size={14} />
<Icon.Plus size={13} />
```

Never use lucide-react directly in components — always go through `@/lib/icons`.

---

## 9. Forms and filter bars

When building a filter row:
1. Use `<Select>` for every dropdown — not `<select>`
2. Use `<SearchInput>` for text search
3. Use `<Button>` for actions
4. Show active filter count on the toggle button: `Filters (2)`
5. Include a "Clear filters" text button (`variant="ghost"`) when any non-default filter is active
6. Filter bar collapses by default — toggled by the Filters button in the toolbar

---

## 10. Feedback to the user

Always provide feedback for user actions:
- Mutations (save, delete, stage change) → `useToast()` with `variant: "success"` or `"error"`
- Loading states → show spinner or skeleton, never blank content
- Empty states → icon + title + description, never blank space
