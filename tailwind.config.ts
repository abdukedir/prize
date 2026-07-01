import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201B",
        mint: "#19A974",
        amber: "#E8A23A",
        coral: "#E85D5D",
        paper: "#F7F4EE"
      },
      boxShadow: {
        panel: "0 18px 60px rgba(23, 32, 27, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
