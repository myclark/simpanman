import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          0: "#0f1117",
          1: "#161b22",
          2: "#1c2333",
          3: "#21262d",
          4: "#30363d",
        },
        accent: {
          DEFAULT: "#58a6ff",
          dim: "#388bfd",
        },
        success: "#3fb950",
        warning: "#d29922",
        danger: "#f85149",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Cascadia Code", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
