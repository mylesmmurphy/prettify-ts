// eslint.config.js
const eslint = require("@eslint/js");
const prettierConfig = require("eslint-config-prettier");
const tseslint = require("typescript-eslint");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = tseslint.config(
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
);
