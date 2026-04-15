import type { Config } from "tailwindcss";

/**
 * Tailwind config.
 *
 * Colors are bound to CSS custom properties (see globals.css) so the app
 * can switch between dark and light by toggling a class on <html>.
 *
 * Token architecture — a four-layer depth hierarchy:
 *   background → card → muted → secondary
 * Plus a single brand accent (primary / forest green).
 *
 * Legacy tokens (`surface`, `accent-strong`) are kept as aliases so
 * existing `bg-surface`, `border-surface-border`, `bg-accent-strong`
 * utilities continue to work across the existing codebase.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // --- Semantic surfaces (new tokens) ---
        background: "rgb(var(--color-background) / <alpha-value>)",
        foreground: "rgb(var(--color-foreground) / <alpha-value>)",
        card: {
          DEFAULT: "rgb(var(--color-card) / <alpha-value>)",
          foreground: "rgb(var(--color-card-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--color-muted) / <alpha-value>)",
          foreground: "rgb(var(--color-muted-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--color-secondary) / <alpha-value>)",
          foreground: "rgb(var(--color-secondary-foreground) / <alpha-value>)",
        },
        border: "rgb(var(--color-border) / <alpha-value>)",
        input: "rgb(var(--color-input) / <alpha-value>)",

        // --- Brand ---
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          foreground: "rgb(var(--color-primary-foreground) / <alpha-value>)",
        },

        // --- Status ---
        destructive: {
          DEFAULT: "rgb(var(--color-destructive) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--color-success) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--color-warning) / <alpha-value>)",
        },

        // --- Legacy aliases (kept for backward compatibility) ---
        // `bg-surface` = `bg-background`
        // `bg-surface-muted` = `bg-card`
        // `border-surface-border` = `border-border`
        // `bg-accent` = `bg-primary`, `bg-accent-strong` = hover-darker primary
        surface: {
          DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
          muted: "rgb(var(--color-surface-muted) / <alpha-value>)",
          border: "rgb(var(--color-surface-border) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          strong: "rgb(var(--color-accent-strong) / <alpha-value>)",
        },
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
