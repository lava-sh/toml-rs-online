import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";

const page = (name: string): string => fileURLToPath(new URL(`./${name}`, import.meta.url));

export default defineConfig(({ command }) => ({
  base: "./",
  plugins:
    command === "serve"
      ? [
          vue(),
          checker({
            enableBuild: false,
            oxlint: {
              lintCommand: "oxlint --type-aware",
            },
            typescript: {
              typescriptPath: "@typescript/typescript6",
            },
          }),
        ]
      : [vue()],
  server: {
    allowedHosts: true,
  },
  build: {
    target: "es2022",
    sourcemap: false,
    minify: "oxc",
    rolldownOptions: {
      input: {
        main: page("index.html"),
      },
    },
  },
}));
