module.exports = {
    env: {
        browser: true,
        node: true,
        es2021: true,
    },
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
    ],
    overrides: [],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: './tsconfig.app.json',
        ecmaVersion: 'latest',
        extraFileExtensions: [".vue"]
    },
    rules: {
        "indent": ["error", 2], // 2 个空格缩进
        'quotes': ['error', 'single', { avoidEscape: true }],
        'semi': ['error', 'never'],
        'space-before-function-paren': ['error', 'never'],
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-this-alias': 'off'
    }
}