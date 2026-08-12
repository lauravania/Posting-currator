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
        ivory: "#faf7f2",
        paper: "#f3efe7",
        ink: "#1c1a17",
        "ink-soft": "#4a463f",
        hairline: "#e2dbcd",
        gold: "#a8894f",
        "gold-soft": "#d8c39f",
        keep: "#4b6350",
        maybe: "#a8894f",
        reject: "#9c4f43",
      },
      fontFamily: {
        serif: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      maxWidth: {
        editorial: "1400px",
      },
    },
  },
  plugins: [],
};
export default config;
