import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0B0E13",
        panel: "#12161D",
        panel2: "#1C222C",
        border: "#232A35",
        text: "#E6E9EF",
        textMuted: "#97A1B0",
        danger: "#FF6B6B",
        dangerText: "#FF8A8A",
        dangerBg: "#1E1215",
        dangerBorder: "#5A2328",
        safe: "#3DD68C",
        safeBg: "#0F1B16",
        safeBorder: "#1F4A36",
        warn: "#F5B942",
        warnBg: "#2A2210",
        info: "#8FB0FF",
        infoBg: "#16264A",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        card: "14px",
        control: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
