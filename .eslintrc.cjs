module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  ignorePatterns: ["dist", "node_modules", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
    // The gds DTOs and the three.js/urdf-loader typings force a fair amount of `any`.
    "@typescript-eslint/no-explicit-any": "off",
    // Unused locals and imports are dead code; unused ARGUMENTS are not, since a
    // signature may be fixed by an interface or by stored code that calls it.
    "@typescript-eslint/no-unused-vars": ["warn", { args: "none" }],
  },
};
