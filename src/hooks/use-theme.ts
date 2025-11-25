import { useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) || "system"
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    let systemTheme: Theme = "light";
    if (theme === "system") {
      systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }

    const currentTheme = theme === "system" ? systemTheme : theme;
    root.classList.add(currentTheme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return { theme, setTheme };
};