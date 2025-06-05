import eslint from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default [
  {
    ignores: [
      "**/out/**", // Ignore all out directories
      "scripts/**", // Ignore scripts directory
      "eslint.config.mjs", // Ignore this config file
      "test/.vscode-test.js", // Ignore VSCode test file,
      ".vscode-test/**", // Ignore all VSCode test files
    ],
  },
  ...tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          project: true,
        },
      },
    },
    prettierConfig,
    eslintPluginPrettierRecommended,
    {
      rules: {
        "@typescript-eslint/no-explicit-any": "off", // Allow 'any' type
        "@typescript-eslint/no-unsafe-assignment": "off", // Allow unsafe assignments
        "@typescript-eslint/no-unsafe-member-access": "off", // Allow unsafe member access
      }
    }
  ),
];
