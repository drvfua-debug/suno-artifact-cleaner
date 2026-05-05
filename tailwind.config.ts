import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#111827",
        panel2: "#0f172a",
        ink: "#e5e7eb",
        muted: "#94a3b8",
        line: "#243244"
      }
    }
  },
  plugins: []
};

export default config;
