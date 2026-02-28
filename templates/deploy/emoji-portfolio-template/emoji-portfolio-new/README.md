# Web App Template (Static Frontend)

Pure React + Tailwind template with shadcn/ui baked in. **Use this README as the checklist for shipping static experiences.**

> **Note:** This template includes a minimal `shared/` and `server/` directory with placeholder types to support imported templates. These are just compatibility placeholders - web-static remains a true static-only template without API functionality.

---

## 🤖 AI Development Guide

### Stack Overview
- Client-only routing powered by React + Wouter.
- Design tokens are provided through `client/src/index.css` and `tailwind.config.ts`—keep them intact.

### Component Patterns

```tsx
// Compose pages from shadcn/ui primitives
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="rounded-3xl bg-white p-10 shadow-xl">
      <h1 className="text-4xl font-bold text-slate-900">Launch Quickly</h1>
      <Button size="lg" className="mt-6">Get Started</Button>
    </section>
  );
}
```

### File Structure

```
client/
  public/         ← Static assets copied verbatim to '/'
  src/
    pages/        ← Page-level components
    components/   ← Reusable UI & shadcn/ui
    contexts/     ← React contexts
    hooks/        ← Custom React hooks
    lib/          ← Utility helpers
    App.tsx       ← Routes & top-level layout
    main.tsx      ← React entry point
    index.css     ← global style
server/         ← Placeholder for imported template compatibility
shared/         ← Placeholder for imported template compatibility
  const.ts      ← Shared constants
```

Assets placed under `client/public` are served with aggressive caching, so add a content hash to filenames (for example, `logo.3fa9b2e4.svg`) whenever you replace a file and update its references to avoid stale assets.

Files in `client/public` are available at the root of your site—reference them with absolute paths (`/logo.3fa9b2e4.svg`, `/robots.txt`, etc.) from HTML templates, JSX, or meta tags.

---

## 🎯 Development Workflow

1. **Compose pages** in `client/src/pages/`. Keep sections modular so they can be reused across routes.
2. **Share primitives** via `client/src/components/`—extend shadcn/ui when needed instead of duplicating markup.
3. **Keep styling consistent** by relying on existing Tailwind tokens (spacing, colors, typography).
4. **Fetch external data** with `useEffect` if the site needs dynamic content from public APIs.

---

## 🧱 Tailwind Safeguards

- Preserve the `@layer base` block in `client/src/index.css`; removing it breaks utilities like `border-border`.
- Do not strip values from `theme.extend` in `tailwind.config.ts`—they power the design tokens used in the UI kit.
- Stick to utility classes for responsiveness (mobile-first by default).
## ✅ Launch Checklist
- [ ] UI layout and navigation structure correct, all image src valid.
- [ ] Success + error paths verified in the browser

---

## 🎨 Frontend Best Practices (shadcn-first)

- Prefer shadcn/ui components for interactions to keep a modern, consistent look; import from `@/components/ui/*` (e.g., `button`, `card`, `dialog`).
- Compose Tailwind utilities with component variants for layout and states; avoid excessive custom CSS. Use built-in `variant`, `size`, etc. where available.
- Preserve design tokens: keep the `@layer base` rules in `client/src/index.css`. Utilities like `border-border` and `font-sans` depend on them.
- Consistent design language: use spacing, radius, shadows, and typography via tokens. Extract shared UI into `components/` for reuse instead of copy‑paste.
- Accessibility and responsiveness: keep visible focus rings and ensure keyboard reachability; design mobile‑first with thoughtful breakpoints.
- Theming: Choose dark/light theme to start with for ThemeProvider according to your design style (dark or light bg), then manage colors pallette with CSS variables in `client/src/index.css` instead of hard‑coding to keep global consistency;
- Micro‑interactions and empty states: add motion, empty states, and icons tastefully to improve quality without distracting from content.
- Navigation: Design clear and intuitive navigation structure appropriate for the app type (e.g., top/side nav for multi-page apps, breadcrumbs or contextual navigation for SPAs)'. When building dashboard-like experience, use sidebar-nav to keep all page entry easy to access.

**React component rules:**
- Never call setState/navigation in render phase → wrap in `useEffect`

---

## Common Pitfalls

### Infinite loading loops from unstable references
**Anti-pattern:** Creating new objects/arrays in render that are used as query inputs
```tsx
// ❌ Bad: New Date() creates new reference every render → infinite queries
const { data } = trpc.items.getByDate.useQuery({
  date: new Date(), // ← New object every render!
});

// ❌ Bad: Array/object literals in query input
const { data } = trpc.items.getByIds.useQuery({
  ids: [1, 2, 3], // ← New array reference every render!
});
```

**Correct approach:** Stabilize references with useState/useMemo
```tsx
// ✅ Good: Initialize once with useState
const [date] = useState(() => new Date());
const { data } = trpc.items.getByDate.useQuery({ date });

// ✅ Good: Memoize complex inputs
const ids = useMemo(() => [1, 2, 3], []);
const { data } = trpc.items.getByIds.useQuery({ ids });
```

**Why this happens:** TRPC queries trigger when input references change. Objects/arrays created in render have new references each time, causing infinite re-fetches.

### Navigation dead-ends in subpages
**Problem:** Creating nested routes without escape routes—no header nav, no sidebar, no back button.

**Solution:** Choose navigation based on app structure:
```tsx
// For dashboard/multi-section apps: Use persistent sidebar (from shadcn/ui)
import { SidebarProvider, Sidebar, SidebarContent, SidebarInset } from "@/components/ui/sidebar";

<SidebarProvider>
  <Sidebar>
    <SidebarContent>
      {/* Navigation menu items - always visible */}
    </SidebarContent>
  </Sidebar>
  <SidebarInset>
    {children}  {/* Page content */}
  </SidebarInset>
</SidebarProvider>

// For linear flows (detail pages, wizards): Use back button
import { useRouter } from "wouter";

const router = useRouter();
<div>
  <Button variant="ghost" onClick={() => router.back()}>
    ← Back
  </Button>
  <ItemDetailPage />
</div>
```

### Dark mode styling without theme configuration
**Problem:** Using dark foreground colors without setting the theme, making text invisible on default light backgrounds.

**Solution:** Set `defaultTheme="dark"` in App.tsx, then update CSS variables in `index.css`:
```tsx
// App.tsx: Set the default theme first
<ThemeProvider defaultTheme="dark">  {/* Applies .dark class to root */}
  <div className="text-foreground bg-background">
    Content  {/* Now uses dark theme CSS variables */}
  </div>
</ThemeProvider>
```

```css
/* index.css: Adjust color palette for dark theme */
.dark {
  --background: oklch(0.145 0 0);  /* Dark background */
  --foreground: oklch(0.985 0 0);  /* Light text */
  /* ... other variables ... */
}
```
