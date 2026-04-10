import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0b1020",
          muted: "#111936",
          border: "#1f2a44",
        },
        accent: {
          DEFAULT: "#4f8cff",
          strong: "#2563eb",
        },
      },
    },
  },
  plugins: [],
};

export default config;
