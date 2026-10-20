import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*", "esbuild.config.mjs", "scripts/*", "tests/*"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          brands: ["StudyFlow"],
          acronyms: ["YYYY-MM-DD"],
        },
      ],
    },
  },
  {
    ignores: [
      "main.js",
      "node_modules/**",
      "odd/**",
      "dist/**",
      "tests/**",
      "scripts/**",
      "*.config.mjs",
    ],
  },
];
