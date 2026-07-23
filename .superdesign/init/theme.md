# Tema e design tokens

## Resumo compacto

- Framework visual: Tailwind CSS 4 por CSS, shadcn e Base UI.
- Fonte principal e títulos: Inter via `--font-sans`.
- Modo padrão: escuro; modo claro disponível.
- Acento padrão: violeta. Acentos alternativos existentes: esmeralda, cobalto, âmbar e rosa.
- Fundo escuro: `oklch(0.13 0.01 260)`.
- Superfície principal escura: `oklch(0.18 0.01 260)`.
- Superfície secundária escura: `oklch(0.205 0.01 260)`.
- Borda escura: `oklch(0.28 0.01 260)`.
- Texto principal escuro: `oklch(0.985 0 0)`.
- Texto secundário escuro: `oklch(0.65 0.01 260)`.
- Acento violeta: `oklch(0.526 0.247 293)`.
- Raio base: `0.625rem`; variantes derivadas de 0.6x a 2.6x.
- Espaçamento: escala utilitária padrão do Tailwind, com ritmo predominante de 4, 8, 12, 16 e 24px.
- Sombras: discretas; bordas e contraste de superfície têm prioridade.
- Breakpoints: padrões do Tailwind; shell troca navegação em `lg`.
- Densidade: compacta, orientada a aplicação operacional.
- Não existe `tailwind.config.*`; o tema é definido em CSS por `@theme inline`.

## Fontes reais

### `src/app/globals.css`

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-sans);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  /* Secondary card surface (tile / hover backgrounds) and the accent
   * extras the Settings redesign leans on. The raw --primary-* vars
   * already exist per-accent below; these mappings expose them (and
   * --card-2) as Tailwind utilities: bg-card-2, bg-primary-soft,
   * bg-primary-soft-2, hover:bg-primary-hover. */
  --color-card-2: var(--card-2);
  --color-primary-hover: var(--primary-hover);
  --color-primary-soft: var(--primary-soft);
  --color-primary-soft-2: var(--primary-soft-2);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

/* ============================================================
 * THEMING — two orthogonal dimensions
 *
 *   1. MODE   (light / dark)  → neutral surfaces. Selected with
 *      `document.documentElement.dataset.mode`. Defaults to dark.
 *   2. ACCENT (violet / …)    → the primary color only. Selected
 *      with `document.documentElement.dataset.theme`.
 *
 * The two compose: any accent works in either mode. Neutral
 * tokens (background / card / border / muted / sidebar surfaces /
 * neutral charts / radius) live in the MODE blocks below; accent
 * tokens (--primary*, --ring, --chart-1, --sidebar-primary*,
 * --sidebar-ring) live in the ACCENT blocks. They set disjoint
 * variables, so cascade order between them doesn't matter.
 *
 * `:root` carries the dark-mode + violet defaults so a visitor
 * renders correctly before JS runs; the boot script in
 * layout.tsx replays the saved mode + accent before first paint.
 *
 * The three `--primary-*` extras (hover / soft / soft-2) feed
 * hovered primary buttons and tinted-primary surfaces (sidebar
 * active pill, validation badges).
 *
 * Token shapes come straight from the design handoff at
 * project/Color Themes.html — change one, change the other.
 * ============================================================ */

/* ---- MODE: neutral surfaces ---- */

:root,
html[data-mode="dark"] {
  --background: oklch(0.13 0.01 260);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.18 0.01 260);
  --card-2: oklch(0.205 0.01 260);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.18 0.01 260);
  --popover-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.22 0.01 260);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.22 0.01 260);
  --muted-foreground: oklch(0.65 0.01 260);
  --accent: oklch(0.22 0.01 260);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.28 0.01 260);
  --input: oklch(0.28 0.01 260);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.625rem;
  --sidebar: oklch(0.16 0.01 260);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.22 0.01 260);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(0.28 0.01 260);
}

html[data-mode="light"] {
  --background: oklch(0.99 0.002 260);
  --foreground: oklch(0.21 0.01 260);
  --card: oklch(1 0 0);
  --card-2: oklch(0.985 0.002 260);
  --card-foreground: oklch(0.21 0.01 260);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.21 0.01 260);
  --secondary: oklch(0.967 0.003 260);
  --secondary-foreground: oklch(0.25 0.01 260);
  --muted: oklch(0.967 0.003 260);
  --muted-foreground: oklch(0.52 0.015 260);
  --accent: oklch(0.96 0.004 260);
  --accent-foreground: oklch(0.25 0.01 260);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0.004 260);
  --input: oklch(0.922 0.004 260);
  --chart-2: oklch(0.6 0.1 260);
  --chart-3: oklch(0.7 0.06 260);
  --chart-4: oklch(0.8 0.04 260);
  --chart-5: oklch(0.87 0.03 260);
  --radius: 0.625rem;
  --sidebar: oklch(0.985 0.002 260);
  --sidebar-foreground: oklch(0.21 0.01 260);
  --sidebar-accent: oklch(0.96 0.004 260);
  --sidebar-accent-foreground: oklch(0.25 0.01 260);
  --sidebar-border: oklch(0.922 0.004 260);
}

/* ---- ACCENT: primary color ---- */

:root,
html[data-theme="violet"] {
  --primary: oklch(0.526 0.247 293);
  --primary-foreground: oklch(0.985 0 0);
  --primary-hover: oklch(0.6 0.22 293);
  --primary-soft: oklch(0.526 0.247 293 / 0.12);
  --primary-soft-2: oklch(0.526 0.247 293 / 0.2);
  --ring: oklch(0.526 0.247 293);
  --chart-1: oklch(0.526 0.247 293);
  --sidebar-primary: oklch(0.526 0.247 293);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-ring: oklch(0.526 0.247 293);
}

html[data-theme="emerald"] {
  --primary: oklch(0.62 0.16 162);
  --primary-foreground: oklch(0.16 0.02 162);
  --primary-hover: oklch(0.68 0.15 162);
  --primary-soft: oklch(0.62 0.16 162 / 0.12);
  --primary-soft-2: oklch(0.62 0.16 162 / 0.22);
  --ring: oklch(0.62 0.16 162);
  --chart-1: oklch(0.62 0.16 162);
  --chart-2: oklch(0.7 0.14 195);
  --sidebar-primary: oklch(0.62 0.16 162);
  --sidebar-primary-foreground: oklch(0.16 0.02 162);
  --sidebar-ring: oklch(0.62 0.16 162);
}

html[data-theme="cobalt"] {
  --primary: oklch(0.585 0.2 254);
  --primary-foreground: oklch(0.985 0 0);
  --primary-hover: oklch(0.66 0.18 254);
  --primary-soft: oklch(0.585 0.2 254 / 0.12);
  --primary-soft-2: oklch(0.585 0.2 254 / 0.22);
  --ring: oklch(0.585 0.2 254);
  --chart-1: oklch(0.585 0.2 254);
  --chart-2: oklch(0.7 0.15 220);
  --sidebar-primary: oklch(0.585 0.2 254);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-ring: oklch(0.585 0.2 254);
}

html[data-theme="amber"] {
  --primary: oklch(0.745 0.16 65);
  --primary-foreground: oklch(0.18 0.03 65);
  --primary-hover: oklch(0.8 0.15 65);
  --primary-soft: oklch(0.745 0.16 65 / 0.12);
  --primary-soft-2: oklch(0.745 0.16 65 / 0.22);
  --ring: oklch(0.745 0.16 65);
  --chart-1: oklch(0.745 0.16 65);
  --chart-2: oklch(0.7 0.15 35);
  --sidebar-primary: oklch(0.745 0.16 65);
  --sidebar-primary-foreground: oklch(0.18 0.03 65);
  --sidebar-ring: oklch(0.745 0.16 65);
}

html[data-theme="rose"] {
  --primary: oklch(0.645 0.22 16);
  --primary-foreground: oklch(0.985 0 0);
  --primary-hover: oklch(0.71 0.2 16);
  --primary-soft: oklch(0.645 0.22 16 / 0.12);
  --primary-soft-2: oklch(0.645 0.22 16 / 0.22);
  --ring: oklch(0.645 0.22 16);
  --chart-1: oklch(0.645 0.22 16);
  --chart-2: oklch(0.7 0.18 340);
  --sidebar-primary: oklch(0.645 0.22 16);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-ring: oklch(0.645 0.22 16);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

### `src/lib/themes.ts`

```ts
/**
 * Single source of truth for the color-theme catalog.
 *
 * The CSS variables themselves live in `src/app/globals.css` under
 * `html[data-theme="..."]` blocks — that file is the one we paste
 * theme tokens into. This module only carries the metadata the UI
 * (settings picker, no-flash boot script) needs.
 *
 * Adding a new theme is a two-step change:
 *   1. Append the new `html[data-theme="<id>"]` block in globals.css
 *      with every token from an existing theme (use violet as the
 *      shape reference).
 *   2. Add an entry below. The order here drives the picker grid.
 */

export const THEME_IDS = [
  'violet',
  'emerald',
  'cobalt',
  'amber',
  'rose',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = 'violet';

export const STORAGE_KEY = 'studiosp.theme';

/**
 * MODE — the light/dark dimension, orthogonal to the accent theme.
 *
 * The CSS variables live in `src/app/globals.css` under
 * `html[data-mode="..."]` blocks (neutral surfaces only). Applied
 * at runtime via `document.documentElement.dataset.mode`. Dark is
 * the historical default and stays the app's identity; light is the
 * opt-in eye-strain-friendly alternative.
 *
 * Persisted under its own localStorage key so it composes freely
 * with the accent choice (you can run Violet-light or Violet-dark).
 */
export const MODES = ['light', 'dark'] as const;

export type Mode = (typeof MODES)[number];

export const DEFAULT_MODE: Mode = 'dark';

export const MODE_STORAGE_KEY = 'studiosp.mode';

export function isMode(value: unknown): value is Mode {
  return (
    typeof value === 'string' &&
    (MODES as ReadonlyArray<string>).includes(value)
  );
}

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  tagline: string;
  /**
   * Static swatch color for the picker chip. Hard-coded so the boot
   * script / picker cards don't need a getComputedStyle round trip
   * before the page settles. Must mirror `--primary` of the same
   * theme in globals.css.
   */
  swatch: string;
}

export const THEMES: ReadonlyArray<ThemeMeta> = [
  {
    id: 'violet',
    name: 'Violeta',
    tagline: 'O padrão: confiante e levemente descontraído.',
    swatch: 'oklch(0.526 0.247 293)',
  },
  {
    id: 'emerald',
    name: 'Esmeralda',
    tagline: 'Remete a crescimento e mensagens sem copiar o verde do WhatsApp.',
    swatch: 'oklch(0.62 0.16 162)',
  },
  {
    id: 'cobalt',
    name: 'Cobalto',
    tagline: 'Um azul B2B limpo, sereno e profissional.',
    swatch: 'oklch(0.585 0.2 254)',
  },
  {
    id: 'amber',
    name: 'Âmbar',
    tagline: 'Acolhedor e amigável para equipes de pequenas empresas.',
    swatch: 'oklch(0.745 0.16 65)',
  },
  {
    id: 'rose',
    name: 'Rosa',
    tagline: 'Marcante e moderno para marcas, criadores e estilo de vida.',
    swatch: 'oklch(0.645 0.22 16)',
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === 'string' &&
    (THEME_IDS as ReadonlyArray<string>).includes(value)
  );
}
```

### `src/hooks/use-theme.tsx`

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  MODE_STORAGE_KEY,
  STORAGE_KEY,
  isMode,
  isThemeId,
  type Mode,
  type ThemeId,
} from "@/lib/themes";

/**
 * ThemeProvider — wraps the whole app, owns the two theming axes:
 *   • `theme` — the accent color (`data-theme` on <html>)
 *   • `mode`  — light / dark (`data-mode` on <html>)
 * The two are independent, so any accent renders in either mode.
 *
 * The boot script in `src/app/layout.tsx` has already applied both
 * `data-theme` and `data-mode` before React hydrates, so by the time
 * this Provider mounts the page is already painted correctly. We just
 * read what's there and keep it in sync going forward.
 *
 * Persistence is localStorage only (device-scoped). A future
 * follow-up could mirror to `profiles.preferences` for cross-device
 * sync, but a per-device choice is also defensible — your phone may
 * deserve a different theme than your laptop.
 */

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (next: ThemeId) => void;
  mode: Mode;
  setMode: (next: Mode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  // Whatever the boot script applied is the truth. Fall back to
  // localStorage / default if for some reason the attribute is missing
  // (e.g. someone bypassed the boot script in a custom layout).
  const fromAttr = document.documentElement.dataset.theme;
  if (isThemeId(fromAttr)) return fromAttr;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isThemeId(stored)) return stored;
  } catch {
    // localStorage can throw in private-browsing / sandboxed contexts.
  }
  return DEFAULT_THEME;
}

function readInitialMode(): Mode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const fromAttr = document.documentElement.dataset.mode;
  if (isMode(fromAttr)) return fromAttr;
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    if (isMode(stored)) return stored;
  } catch {
    // localStorage can throw in private-browsing / sandboxed contexts.
  }
  return DEFAULT_MODE;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readInitialTheme);
  const [mode, setModeState] = useState<Mode>(readInitialMode);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = next;
    }
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Same private-browsing edge case as above; the in-memory state
      // still updates so the current tab works for the session.
    }
  }, []);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.mode = next;
    }
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // Same private-browsing edge case as above.
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  // Sync from other tabs — change theme or mode in tab A, tab B
  // catches up without a refresh.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        if (isThemeId(e.newValue) && e.newValue !== theme) {
          setThemeState(e.newValue);
          document.documentElement.dataset.theme = e.newValue;
        }
        return;
      }
      if (e.key === MODE_STORAGE_KEY) {
        if (isMode(e.newValue) && e.newValue !== mode) {
          setModeState(e.newValue);
          document.documentElement.dataset.mode = e.newValue;
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [theme, mode]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, mode, setMode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider — return
    // no-op setters so callers don't crash. The boot script still
    // applied the right CSS attributes, so visually the page is fine.
    return {
      theme: DEFAULT_THEME,
      setTheme: () => {},
      mode: DEFAULT_MODE,
      setMode: () => {},
      toggleMode: () => {},
    };
  }
  return ctx;
}
```
