import type { Config } from "tailwindcss";

// Retro (Tecmo Super Bowl / 8-bit NES) design tokens.
// Later feature agents should build UI out of these tokens rather than
// introducing ad-hoc colors — keep the palette limited and saturated.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Scoreboard background tones
        field: {
          DEFAULT: "#0a0e27", // deep navy/black background
          dark: "#05070f",
          light: "#141a3d",
        },
        // NES-style saturated accents
        retro: {
          red: "#e63946",
          blue: "#1d4ed8",
          yellow: "#ffd60a",
          green: "#2ec4b6",
          offwhite: "#f4f1de",
        },
      },
      fontFamily: {
        // Set from next/font/google in src/app/layout.tsx via CSS variables.
        pixel: ["var(--font-press-start)", "monospace"],
        mono: ["var(--font-vt323)", "monospace"],
      },
      borderRadius: {
        none: "0px",
        DEFAULT: "0px",
      },
      borderWidth: {
        DEFAULT: "4px",
        thick: "4px",
        thin: "2px",
      },
      boxShadow: {
        pixel: "4px 4px 0 0 #000",
        "pixel-sm": "2px 2px 0 0 #000",
      },
    },
  },
  plugins: [],
};

export default config;
