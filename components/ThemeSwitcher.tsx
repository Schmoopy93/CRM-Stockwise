"use client";

import { useTheme } from "@/lib/theme-context";
import { Sun, Moon } from "lucide-react";

export function ThemeSwitcher({
  className,
  lightLabel = "Switch to light mode",
  darkLabel = "Switch to dark mode",
}: {
  className?: string;
  lightLabel?: string;
  darkLabel?: string;
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === "dark" ? lightLabel : darkLabel}
      className={className}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 34, height: 34,
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        borderRadius: 9,
        color: theme === "dark" ? "var(--amber)" : "var(--accent-2)",
        cursor: "pointer",
        transition: "all 0.2s",
        flexShrink: 0,
      }}
      onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-hover)"; }}
      onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
