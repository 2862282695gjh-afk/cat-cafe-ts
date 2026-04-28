import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface ThemeAgent {
  name: string;
  avatar: string;      // emoji 或图片 URL
  title: string;       // 职位描述
  color: string;       // Tailwind 文字色
  ring: string;        // 头像 ring 色
  border: string;      // 边框色
}

export interface ThemeColors {
  bg: string;
  sidebar: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryHover: string;
  accent: string;
  userBubble: string;
  userBubbleText: string;
  assistantBubble: string;
  assistantBubbleText: string;
  inputBg: string;
  inputBorder: string;
}

export interface Theme {
  id: string;
  name: string;
  icon: string;
  colors: ThemeColors;
  headerTitle: string;
  headerSubtitle: string;
  newThreadLabel: string;
  agents: Record<string, ThemeAgent>;
}

// ========== Context ==========

const ThemeCtx = createContext<{
  theme: Theme;
  setTheme: (id: string) => void;
  allThemes: Theme[];
} | null>(null);

export function ThemeProvider({ themes, children }: { themes: Theme[]; children: ReactNode }) {
  const [themeId, setThemeId] = useState(() => {
    return localStorage.getItem("catcafe-theme") || themes[0]?.id || "default";
  });

  const theme = themes.find((t) => t.id === themeId) ?? themes[0];

  useEffect(() => {
    localStorage.setItem("catcafe-theme", theme.id);
    document.documentElement.setAttribute("data-theme", theme.id);
  }, [theme.id]);

  return (
    <ThemeCtx.Provider value={{ theme, setTheme: setThemeId, allThemes: themes }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
