import { useEffect, useState } from "react";

const KEY = "signbridge-theme";
export type Theme = "light" | "dark";

function apply(t: Theme) {
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Theme | null) ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(stored);
    apply(stored);
  }, []);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(KEY, next);
    apply(next);
  };
  return { theme, toggle };
}
