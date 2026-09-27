export const accentThemes = ["blue", "green", "orange"] as const;
export const colorModes = ["light", "dark", "system"] as const;

export type AccentTheme = typeof accentThemes[number];
export type ColorMode = typeof colorModes[number];

export const defaultPreferences = { accentTheme: "blue" as AccentTheme, colorMode: "system" as ColorMode };

export function validAccentTheme(value: unknown): value is AccentTheme {
  return typeof value === "string" && accentThemes.includes(value as AccentTheme);
}

export function validColorMode(value: unknown): value is ColorMode {
  return typeof value === "string" && colorModes.includes(value as ColorMode);
}

export function normalizePreferences(value: { accent_theme?: unknown; color_mode?: unknown } | null | undefined) {
  return {
    accentTheme: validAccentTheme(value?.accent_theme) ? value.accent_theme : defaultPreferences.accentTheme,
    colorMode: validColorMode(value?.color_mode) ? value.color_mode : defaultPreferences.colorMode,
  };
}

export function roleLabel(role: unknown) {
  if (role === "owner") return "Tulajdonos";
  if (role === "admin") return "Adminisztrátor";
  return "Felhasználó";
}
