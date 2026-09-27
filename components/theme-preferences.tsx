"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { normalizePreferences, type AccentTheme, type ColorMode } from "@/lib/user-preferences";

const accentKey = "leadflow-accent-theme";
const modeKey = "leadflow-color-mode";

export function applyPreferences(accentTheme: AccentTheme, colorMode: ColorMode) {
  const root = document.documentElement;
  root.dataset.accentTheme = accentTheme;
  const dark = colorMode === "dark" || (colorMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.colorMode = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  localStorage.setItem(accentKey, accentTheme);
  localStorage.setItem(modeKey, colorMode);
}

export function readLocalPreferences() {
  return normalizePreferences({
    accent_theme: localStorage.getItem(accentKey),
    color_mode: localStorage.getItem(modeKey),
  });
}

export default function ThemePreferences() {
  useEffect(() => {
    let current = readLocalPreferences();
    applyPreferences(current.accentTheme, current.colorMode);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystem = () => {
      current = readLocalPreferences();
      if (current.colorMode === "system") applyPreferences(current.accentTheme, current.colorMode);
    };
    media.addEventListener("change", syncSystem);

    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await supabase.from("user_preferences")
        .select("accent_theme,color_mode").eq("user_id", session.user.id).maybeSingle();
      if (!data) return;
      current = normalizePreferences(data);
      applyPreferences(current.accentTheme, current.colorMode);
    });
    return () => media.removeEventListener("change", syncSystem);
  }, []);
  return null;
}
