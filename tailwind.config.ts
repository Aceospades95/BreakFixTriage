import type { Config } from "tailwindcss";

/**
 * Tailwind config.
 *
 * Colors are bound to CSS custom properties (see globals.css) so
 * the app can switch between dark and light by toggling a class on
 * <html>. The `rgb(var(...) / <alpha-value>)` syntax is Tailwind's
 * way of letting utility classes like `bg-surface/40` still apply
 * opacity against a variable-sourced color.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
          muted: "rgb(var(--color-surface-muted) / <alpha-value>)",
          border: "rgb(var(--color-surface-border) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          strong: "rgb(var(--color-accent-strong) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
