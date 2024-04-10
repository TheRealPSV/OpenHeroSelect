const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      indent: ["error", 2, { SwitchCase: 1 }],
      "linebreak-style": "off",
      "max-len": "off",
      "no-unused-vars": ["error", { caughtErrors: "none" }],
      "operator-linebreak": ["error", "before", { overrides: { "=": "after" } }],
      "prefer-const": "error",
      quotes: "off",
      semi: ["error", "always"],
      "space-before-function-paren": ["error", {
        anonymous: "always",
        named: "never",
        asyncArrow: "always"
      }],
      "spaced-comment": "off"
    }
  }
];
