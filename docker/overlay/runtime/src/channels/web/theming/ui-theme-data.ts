/**
 * Shared theme metadata and markdown rendering helpers for /theme command output.
 *
 * Extended with the "drupal" theme (Drupal official colour palette).
 */

export type UiThemeMode = "light" | "dark" | "auto";

export interface UiThemePreset {
  name: string;
  label: string;
  mode: UiThemeMode;
  light?: Record<string, string>;
  dark?: Record<string, string>;
}

export const THEME_PRESETS: UiThemePreset[] = [
  {
    name: "default",
    label: "Default",
    mode: "auto",
    light: {
      bgPrimary: "#ffffff",
      bgSecondary: "#f7f9fa",
      textPrimary: "#0f1419",
      textSecondary: "#536471",
      borderColor: "#eff3f4",
      accent: "#1d9bf0",
      accentHover: "#1a8cd8",
      danger: "#f4212e",
      success: "#00ba7c",
    },
    dark: {
      bgPrimary: "#000000",
      bgSecondary: "#16181c",
      textPrimary: "#e7e9ea",
      textSecondary: "#71767b",
      borderColor: "#2f3336",
      accent: "#1d9bf0",
      accentHover: "#1a8cd8",
      danger: "#f4212e",
      success: "#00ba7c",
    },
  },
  {
    name: "drupal",
    label: "Drupal",
    mode: "auto",
    light: {
      bgPrimary: "#ffffff",
      bgSecondary: "#f0f5fb",
      textPrimary: "#1b2332",
      textSecondary: "#4a6080",
      borderColor: "#c8d8e8",
      accent: "#0678be",
      accentHover: "#055a9e",
      danger: "#c62828",
      success: "#2e7d32",
    },
    dark: {
      bgPrimary: "#0a1628",
      bgSecondary: "#0f2140",
      textPrimary: "#e8edf5",
      textSecondary: "#8fa4c4",
      borderColor: "#1c3a5e",
      accent: "#29abe2",
      accentHover: "#1d98cc",
      danger: "#f44336",
      success: "#4caf50",
    },
  },
  {
    name: "tango",
    label: "Tango",
    mode: "light",
    light: {
      bgPrimary: "#f6f5f4",
      bgSecondary: "#efedeb",
      textPrimary: "#2e3436",
      textSecondary: "#5c6466",
      borderColor: "#d3d7cf",
      accent: "#3465a4",
      accentHover: "#2c5890",
      danger: "#cc0000",
      success: "#4e9a06",
    },
    dark: {
      bgPrimary: "#f6f5f4",
      bgSecondary: "#efedeb",
      textPrimary: "#2e3436",
      textSecondary: "#5c6466",
      borderColor: "#d3d7cf",
      accent: "#3465a4",
      accentHover: "#2c5890",
      danger: "#cc0000",
      success: "#4e9a06",
    },
  },
  {
    name: "xterm",
    label: "XTerm",
    mode: "dark",
    dark: {
      bgPrimary: "#000000",
      bgSecondary: "#0a0a0a",
      textPrimary: "#d0d0d0",
      textSecondary: "#8a8a8a",
      borderColor: "#1f1f1f",
      accent: "#00a2ff",
      accentHover: "#0086d1",
      danger: "#ff5f5f",
      success: "#5fff87",
    },
  },
  {
    name: "monokai",
    label: "Monokai",
    mode: "dark",
    dark: {
      bgPrimary: "#272822",
      bgSecondary: "#2f2f2f",
      textPrimary: "#f8f8f2",
      textSecondary: "#cfcfc2",
      borderColor: "#3e3d32",
      accent: "#f92672",
      accentHover: "#e81560",
      danger: "#f92672",
      success: "#a6e22e",
    },
  },
  {
    name: "monokai-pro",
    label: "Monokai Pro",
    mode: "dark",
    dark: {
      bgPrimary: "#2d2a2e",
      bgSecondary: "#363237",
      textPrimary: "#fcfcfa",
      textSecondary: "#c1c0c0",
      borderColor: "#444046",
      accent: "#ff6188",
      accentHover: "#f74f7e",
      danger: "#ff4f5e",
      success: "#a9dc76",
    },
  },
  {
    name: "ristretto",
    label: "Ristretto",
    mode: "dark",
    dark: {
      bgPrimary: "#2c2525",
      bgSecondary: "#362d2d",
      textPrimary: "#f4f1ef",
      textSecondary: "#cbbdb8",
      borderColor: "#4a3c3c",
      accent: "#ff9f43",
      accentHover: "#f28a2e",
      danger: "#ff5f56",
      success: "#a9dc76",
    },
  },
  {
    name: "dracula",
    label: "Dracula",
    mode: "dark",
    dark: {
      bgPrimary: "#282a36",
      bgSecondary: "#303445",
      textPrimary: "#f8f8f2",
      textSecondary: "#c5c8d6",
      borderColor: "#44475a",
      accent: "#bd93f9",
      accentHover: "#a87ded",
      danger: "#ff5555",
      success: "#50fa7b",
    },
  },
  {
    name: "catppuccin",
    label: "Catppuccin",
    mode: "dark",
    dark: {
      bgPrimary: "#1e1e2e",
      bgSecondary: "#24273a",
      textPrimary: "#cdd6f4",
      textSecondary: "#a6adc8",
      borderColor: "#313244",
      accent: "#89b4fa",
      accentHover: "#74a0f5",
      danger: "#f38ba8",
      success: "#a6e3a1",
    },
  },
  {
    name: "nord",
    label: "Nord",
    mode: "dark",
    dark: {
      bgPrimary: "#2e3440",
      bgSecondary: "#3b4252",
      textPrimary: "#eceff4",
      textSecondary: "#d8dee9",
      borderColor: "#4c566a",
      accent: "#88c0d0",
      accentHover: "#78a9c0",
      danger: "#bf616a",
      success: "#a3be8c",
    },
  },
  {
    name: "gruvbox",
    label: "Gruvbox",
    mode: "dark",
    dark: {
      bgPrimary: "#282828",
      bgSecondary: "#32302f",
      textPrimary: "#ebdbb2",
      textSecondary: "#bdae93",
      borderColor: "#3c3836",
      accent: "#d79921",
      accentHover: "#c28515",
      danger: "#fb4934",
      success: "#b8bb26",
    },
  },
  {
    name: "solarized",
    label: "Solarized",
    mode: "auto",
    light: {
      bgPrimary: "#fdf6e3",
      bgSecondary: "#f5efdc",
      textPrimary: "#586e75",
      textSecondary: "#657b83",
      borderColor: "#e0d8c6",
      accent: "#268bd2",
      accentHover: "#1f78b3",
      danger: "#dc322f",
      success: "#859900",
    },
    dark: {
      bgPrimary: "#002b36",
      bgSecondary: "#073642",
      textPrimary: "#eee8d5",
      textSecondary: "#93a1a1",
      borderColor: "#18424a",
      accent: "#268bd2",
      accentHover: "#1f78b3",
      danger: "#dc322f",
      success: "#859900",
    },
  },
  {
    name: "tokyo",
    label: "Tokyo",
    mode: "dark",
    dark: {
      bgPrimary: "#1a1b26",
      bgSecondary: "#24283b",
      textPrimary: "#c0caf5",
      textSecondary: "#9aa5ce",
      borderColor: "#414868",
      accent: "#7aa2f7",
      accentHover: "#6b92e6",
      danger: "#f7768e",
      success: "#9ece6a",
    },
  },
  {
    name: "miasma",
    label: "Miasma",
    mode: "dark",
    dark: {
      bgPrimary: "#1f1f23",
      bgSecondary: "#29292f",
      textPrimary: "#e5e5e5",
      textSecondary: "#b4b4b4",
      borderColor: "#3d3d45",
      accent: "#c9739c",
      accentHover: "#b8618c",
      danger: "#e06c75",
      success: "#98c379",
    },
  },
  {
    name: "github",
    label: "GitHub",
    mode: "auto",
    light: {
      bgPrimary: "#ffffff",
      bgSecondary: "#f6f8fa",
      textPrimary: "#24292f",
      textSecondary: "#57606a",
      borderColor: "#d0d7de",
      accent: "#0969da",
      accentHover: "#0550ae",
      danger: "#cf222e",
      success: "#1a7f37",
    },
    dark: {
      bgPrimary: "#0d1117",
      bgSecondary: "#161b22",
      textPrimary: "#c9d1d9",
      textSecondary: "#8b949e",
      borderColor: "#30363d",
      accent: "#2f81f7",
      accentHover: "#1f6feb",
      danger: "#f85149",
      success: "#3fb950",
    },
  },
  {
    name: "gotham",
    label: "Gotham",
    mode: "dark",
    dark: {
      bgPrimary: "#0b0f14",
      bgSecondary: "#111720",
      textPrimary: "#cbd6e2",
      textSecondary: "#9bb0c3",
      borderColor: "#1f2a37",
      accent: "#5ccfe6",
      accentHover: "#48b8ce",
      danger: "#d26937",
      success: "#2aa889",
    },
  },
];

export const THEME_ALIASES = new Map<string, string>([
  ["default", "default"],
  ["auto", "default"],
  ["drupal", "drupal"],
  ["tango", "tango"],
  ["xterm", "xterm"],
  ["monokai", "monokai"],
  ["monokai-pro", "monokai-pro"],
  ["ristretto", "ristretto"],
  ["drac", "dracula"],
  ["dracula", "dracula"],
  ["catpp", "catppuccin"],
  ["catppuccin", "catppuccin"],
  ["nord", "nord"],
  ["gruv", "gruvbox"],
  ["gruvbox", "gruvbox"],
  ["solarized", "solarized"],
  ["solarized-dark", "solarized"],
  ["solarized-light", "solarized"],
  ["tokyo", "tokyo"],
  ["tokyo-night", "tokyo"],
  ["miasma", "miasma"],
  ["github", "github"],
  ["github-dark", "github"],
  ["github-light", "github"],
  ["gotham", "gotham"],
]);

export const THEME_LIST_COLOR_KEYS = [
  "bgPrimary",
  "bgSecondary",
  "textPrimary",
  "textSecondary",
  "borderColor",
  "accent",
  "danger",
  "success",
] as const;

const FALLBACK_PALETTE: Record<(typeof THEME_LIST_COLOR_KEYS)[number], string> = {
  bgPrimary: "#ffffff",
  bgSecondary: "#f7f9fa",
  textPrimary: "#0f1419",
  textSecondary: "#536471",
  borderColor: "#eff3f4",
  accent: "#1d9bf0",
  danger: "#f4212e",
  success: "#00ba7c",
};

function normalizeHex(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^#[0-9a-fA-F]{3}$/.test(raw) || /^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  return null;
}

function normalizeThemeColor(input: string): string {
  return normalizeHex(input) || input;
}

function base64(value: string): string {
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    return Buffer.from(value).toString("base64");
  }
  if (typeof btoa === "function") {
    return btoa(encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
  }
  return "";
}

function makeSwatch(color: string): string {
  const safe = normalizeThemeColor(color) || "#000000";
  const size = 20;
  const radius = 3;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-hidden="true">
      <rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="${radius}" ry="${radius}" fill="${safe}" />
    </svg>
  `.trim();
  return `data:image/svg+xml;base64,${base64(svg)}`;
}

function colorCell(_label: string, color: string): string {
  return `![](${makeSwatch(color)})`;
}

function resolvePalette(preset: UiThemePreset): Record<string, string> {
  const chosen = preset.mode === "dark"
    ? preset.dark
    : preset.mode === "light"
      ? preset.light
      : (preset.light || preset.dark);
  const merged = { ...FALLBACK_PALETTE } as Record<string, string>;
  if (!chosen) return merged;
  for (const key of THEME_LIST_COLOR_KEYS) {
    const value = chosen[key];
    if (typeof value === "string" && value.trim()) {
      merged[key] = value.trim();
    }
  }
  return merged;
}

export function normalizeTheme(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  return THEME_ALIASES.get(raw) ?? null;
}

export function labelForTheme(theme: string): string {
  return THEME_PRESETS.find((item) => item.name === theme)?.label || theme;
}

export function formatThemeList(): string {
  const header = [
    "| Theme | Mode | Swatches |",
    "| --- | --- | --- |",
  ];

  const rows = THEME_PRESETS.map((preset) => {
    const palette = resolvePalette(preset);
    const modeLabel = preset.mode === "auto" ? "auto (light)" : preset.mode;
    const swatches = THEME_LIST_COLOR_KEYS
      .map((key) => colorCell(key, palette[key]))
      .join(" ");

    return [
      `| ${preset.label} (${preset.name}) `,
      `| ${modeLabel} `,
      `| ${swatches} |`,
    ].join("");
  });

  return [
    "Available themes:",
    ...header,
    ...rows,
    "",
    "Usage: /theme <name>",
    "(omit name to show this list)",
  ].join("\n");
}
