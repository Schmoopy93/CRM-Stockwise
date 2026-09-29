"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const STORAGE_KEY = "inventory-theme";
const CHANGE_EVENT = "inventory-theme-change";

const themeStore = {
  subscribe(onChange: () => void) {
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  },
  get(): Theme {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  },
  toggle() {
    window.localStorage.setItem(STORAGE_KEY, themeStore.get() === "dark" ? "light" : "dark");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  },
};

const ThemeContext = createContext<ThemeContextType>({ theme: "dark", toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get, () => "dark" as Theme);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, toggleTheme: themeStore.toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
