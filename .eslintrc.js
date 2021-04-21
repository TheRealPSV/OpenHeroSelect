module.exports = {
  env: {
    browser: false,
    commonjs: true,
    es2021: true
  },
  extends: "standard",
  parserOptions: {
    ecmaVersion: 12
  },
  rules: {
    indent: ["error", 2],
    "linebreak-style": ["error", "unix"],
    "max-len": "off",
    "operator-linebreak": ["error", "before", { overrides: { "=": "after" } }],
    quotes: "off",
    semi: ["error", "always"],
    "space-before-function-paren": ["error", {
      anonymous: "always",
      named: "never",
      asyncArrow: "always"
    }],
    "spaced-comment": "off"
  }
};
