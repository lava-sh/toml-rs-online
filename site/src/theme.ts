export type ThemeMode = "auto" | "light" | "dark";
export type ThemeScheme = "light" | "dark";

const THEME_TABLE = [
  ["vscode-light-modern", "light", "VS Code Light Modern"],
  ["vscode-dark-modern", "dark", "VS Code Dark Modern"],
  ["light", "light", "Default Light"],
  ["dark", "dark", "Default Dark"],
  ["light-soft", "light", "Default Light Soft"],
  ["dark-soft", "dark", "Default Dark Soft"],
  ["midnight", "dark", "Midnight Blue"],
  ["solar", "light", "Solarized Light"],
  ["forest", "dark", "Forest Green"],
  ["rose", "light", "Rose Quartz"],
  ["latte", "light", "Catppuccin Latte"],
  ["frappe", "dark", "Catppuccin Frappé"],
  ["macchiato", "dark", "Catppuccin Macchiato"],
  ["mocha", "dark", "Catppuccin Mocha"],
  ["dawn", "light", "Rosé Pine Dawn"],
  ["rose-pine", "dark", "Rosé Pine"],
  ["moon", "dark", "Rosé Pine Moon"],
  ["tokyo-day", "light", "Tokyo Night Day"],
  ["tokyo-night", "dark", "Tokyo Night"],
  ["tokyo-storm", "dark", "Tokyo Night Storm"],
  ["nord", "dark", "Nord"],
  ["dracula", "dark", "Dracula"],
  ["gruvbox-light", "light", "Gruvbox Light"],
  ["gruvbox-dark", "dark", "Gruvbox Dark"],
] as const satisfies readonly (readonly [string, ThemeScheme, string])[];

const THEME_KEY = "toml-rs-theme-bootstrap";

const DEFAULT_THEME_BY_SCHEME: Record<ThemeScheme, ThemeId> = {
  light: "vscode-light-modern",
  dark: "vscode-dark-modern",
};

const SYSTEM_SCHEME_QUERY = window.matchMedia("(prefers-color-scheme: dark)");

export type ThemeId = (typeof THEME_TABLE)[number][0];

export type ThemeDefinition = {
  id: ThemeId;
  scheme: ThemeScheme;
  label: string;
};

export type StoredTheme = {
  mode: ThemeMode;
  theme: ThemeId;
};

export const THEMES: readonly ThemeDefinition[] = THEME_TABLE.map(([id, scheme, label]) => ({
  id,
  scheme,
  label,
}));

const THEME_MAP = new Map(THEMES.map((theme) => [theme.id, theme]));

function resolveSystemScheme(): ThemeScheme {
  return SYSTEM_SCHEME_QUERY.matches ? "dark" : "light";
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "auto" || value === "light" || value === "dark";
}

function parseStoredTheme(candidate: unknown): StoredTheme | null {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("mode" in candidate) ||
    !("theme" in candidate)
  ) {
    return null;
  }
  const { mode, theme } = candidate;
  if (!isThemeMode(mode) || typeof theme !== "string") {
    return null;
  }
  const known = THEMES.find((entry) => entry.id === theme);
  return known === undefined ? null : { mode, theme: known.id };
}

function readStoredTheme(): StoredTheme | null {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === null ? null : parseStoredTheme(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function watchSystemScheme(listener: () => void): () => void {
  SYSTEM_SCHEME_QUERY.addEventListener("change", listener);
  return () => SYSTEM_SCHEME_QUERY.removeEventListener("change", listener);
}

export function resolveTheme(mode: ThemeMode): ThemeScheme {
  return mode === "auto" ? resolveSystemScheme() : mode;
}

export function defaultThemeForMode(mode: ThemeMode): ThemeId {
  return DEFAULT_THEME_BY_SCHEME[resolveTheme(mode)];
}

export function themeById(id: ThemeId): ThemeDefinition {
  return THEME_MAP.get(id) ?? THEMES[0];
}

export function loadStoredTheme(): StoredTheme {
  return readStoredTheme() ?? { mode: "auto", theme: defaultThemeForMode("auto") };
}

export function saveStoredTheme(mode: ThemeMode, theme: ThemeId): void {
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify({ mode, theme }));
  } catch {}
}

export function applyTheme(mode: ThemeMode, id: ThemeId): void {
  const root = document.documentElement;
  const resolved = resolveTheme(mode);
  root.classList.add("theme-switching");
  root.classList.toggle("light", resolved === "light");
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = id;
  root.style.colorScheme = resolved;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove("theme-switching"));
  });
}
