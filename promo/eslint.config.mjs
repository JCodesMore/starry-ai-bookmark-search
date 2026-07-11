// Same lint stack as the repo root (the root gate's `eslint .` walks in here and
// ESLint 10 resolves each file's nearest config, so the toolchains must match).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["out/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // Two tsconfig roots exist in the repo (repo root and here) — pin the parser to this one.
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
);
