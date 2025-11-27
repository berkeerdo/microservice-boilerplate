/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // ============================================
    // TYPE RULES
    // ============================================
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature for the user
        'fix',      // Bug fix for the user
        'docs',     // Documentation only changes
        'style',    // Formatting, missing semicolons, etc (no code change)
        'refactor', // Code refactoring (no feature change, no bug fix)
        'perf',     // Performance improvements
        'test',     // Adding or updating tests
        'build',    // Build system or external dependencies
        'ci',       // CI/CD configuration changes
        'chore',    // Maintenance tasks, tooling, etc
        'revert',   // Revert a previous commit
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    // ============================================
    // SCOPE RULES
    // Suggested scopes: api, auth, db, cache, queue, config, middleware, grpc, docs
    // ============================================
    'scope-case': [2, 'always', 'lower-case'],
    'scope-empty': [1, 'never'], // Warning if no scope (recommended but not required)

    // ============================================
    // SUBJECT (DESCRIPTION) RULES
    // - Lowercase, imperative mood, no period, max 50 chars
    // ============================================
    'subject-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'subject-max-length': [2, 'always', 50],
    'subject-full-stop': [2, 'never', '.'],

    // ============================================
    // HEADER RULES (type + scope + subject combined)
    // ============================================
    'header-max-length': [2, 'always', 72],

    // ============================================
    // BODY RULES
    // - Must have blank line before body
    // - Each line max 100 chars (wrap long lines!)
    // ============================================
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 100],

    // ============================================
    // FOOTER RULES
    // - For BREAKING CHANGE, issue references, etc
    // ============================================
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [2, 'always', 100],
  },
};
