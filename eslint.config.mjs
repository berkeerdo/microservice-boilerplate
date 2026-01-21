/**
 * ESLint Configuration - Senior Level
 *
 * Features:
 * - TypeScript strict type checking
 * - Security plugin (OWASP compliance)
 * - SonarJS (code quality & bug detection)
 * - Prettier integration
 *
 * References:
 * - https://typescript-eslint.io/
 * - https://www.npmjs.com/package/eslint-plugin-security
 * - https://www.npmjs.com/package/eslint-plugin-sonarjs
 */
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import securityPlugin from 'eslint-plugin-security';
import sonarjsPlugin from 'eslint-plugin-sonarjs';

export default tseslint.config(
  // ============================================
  // BASE CONFIGURATIONS
  // ============================================
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettierConfig,

  // ============================================
  // GLOBAL IGNORES
  // ============================================
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'tests/**',
      'scripts/**',
      '.claude/**', // Claude Code agent files
      '**/*.test.ts',
      '**/*.spec.ts',
      'vitest.config.ts',
      'eslint.config.mjs',
      'commitlint.config.cjs',
      'knexfile.ts',
      'dbbridge.config.ts',
    ],
  },

  // ============================================
  // TYPESCRIPT FILES
  // ============================================
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      prettier: prettierPlugin,
      security: securityPlugin,
      sonarjs: sonarjsPlugin,
    },
    rules: {
      // ========================================
      // FILE SIZE LIMITS
      // ========================================
      'max-lines': [
        'error',
        {
          max: 400,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      'max-lines-per-function': [
        'warn',
        {
          max: 50,
          skipBlankLines: true,
          skipComments: true,
        },
      ],

      // ========================================
      // TYPESCRIPT STRICT
      // ========================================
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            arguments: false,
            attributes: false,
            properties: false,
          },
        },
      ],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'off', // Conflicts with existing patterns
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/strict-boolean-expressions': 'off', // Too strict for existing codebase
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-deprecated': 'warn', // Allow but warn for deprecated APIs
      '@typescript-eslint/restrict-template-expressions': 'off', // Too strict
      '@typescript-eslint/no-unnecessary-condition': 'off', // Conflicts with defensive coding
      '@typescript-eslint/no-extraneous-class': 'off', // Allow utility classes
      '@typescript-eslint/no-non-null-assertion': 'warn', // Prefer safer alternatives
      '@typescript-eslint/restrict-plus-operands': 'off', // Too strict for string concatenation
      '@typescript-eslint/no-unnecessary-type-parameters': 'off', // Common in generic gRPC/API clients
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      // Naming convention - relaxed for existing codebase
      // Note: Enable I-prefix for interfaces in new projects
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'typeAlias',
          format: ['PascalCase'],
        },
        {
          selector: 'enum',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE', 'PascalCase'],
        },
      ],

      // ========================================
      // SECURITY RULES (eslint-plugin-security)
      // ========================================
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-object-injection': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-bidi-characters': 'error',

      // ========================================
      // CODE QUALITY (eslint-plugin-sonarjs)
      // ========================================
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-duplicate-string': ['warn', { threshold: 3 }],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-collapsible-if': 'warn',
      'sonarjs/prefer-immediate-return': 'warn',
      'sonarjs/no-redundant-jump': 'error',
      'sonarjs/no-nested-switch': 'error',
      'sonarjs/no-small-switch': 'warn',

      // ========================================
      // GENERAL BEST PRACTICES
      // ========================================
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-return-await': 'off', // Use @typescript-eslint/return-await instead
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      'no-throw-literal': 'off', // Use @typescript-eslint/only-throw-error
      '@typescript-eslint/only-throw-error': 'error',
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': [
        'error',
        {
          allowShortCircuit: true,
          allowTernary: true,
        },
      ],

      // ========================================
      // PRETTIER
      // ========================================
      'prettier/prettier': 'error',
    },
  },

  // ============================================
  // OVERRIDES FOR SPECIFIC FILES
  // ============================================
  {
    files: [
      'src/**/migrations/**/*.ts',
      'src/**/seeds/**/*.ts',
      'src/**/types/**/*.ts',
      'src/**/*.types.ts',
      'src/**/domain/models/**/*.ts', // Domain models can be large with many interfaces
      'src/**/routes/**/*.ts', // Route files can be large with many endpoints (Gateway)
    ],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      '@typescript-eslint/naming-convention': 'off',
      'sonarjs/no-duplicate-string': 'off',
    },
  },
  {
    files: ['src/**/repositories/**/*.ts'],
    rules: {
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'security/detect-object-injection': 'off', // Repository layer uses dynamic keys safely
    },
  },
  // i18n files - Object.hasOwn() check makes dynamic access safe
  {
    files: ['src/**/i18n/**/*.ts'],
    rules: {
      'security/detect-object-injection': 'off',
    },
  },
  // Utils files - safe dynamic access patterns
  {
    files: ['src/**/utils/**/*.ts'],
    rules: {
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['src/**/useCases/**/*.ts'],
    rules: {
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/**/handlers/**/*.ts', 'src/**/grpc/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'max-lines': ['warn', { max: 550, skipBlankLines: true, skipComments: true }],
    },
  },
  // Complex business logic services
  {
    files: ['src/**/services/**/*.ts'],
    rules: {
      'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
    },
  },
  // Template engine files (if any)
  {
    files: ['src/**/templates/**/*.ts', 'src/**/TemplateService.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
  // Repository mappers (type conversion from DB rows)
  {
    files: ['src/**/*Mappers.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  // Infra layer - shutdown, cache, connections, queue
  {
    files: ['src/**/infra/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off', // Infrastructure often has runtime checks
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'security/detect-object-injection': 'off', // Dynamic config and cache keys
      '@typescript-eslint/no-deprecated': 'off', // Library API transitions
      'sonarjs/cognitive-complexity': ['warn', 25], // Complex infrastructure logic
      'sonarjs/no-collapsible-if': 'off', // Processing patterns
    },
  },
  // Queue consumers and publishers (complex async logic)
  {
    files: ['src/**/queue/consumers/**/*.ts', 'src/**/queue/publishers/**/*.ts'],
    rules: {
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
    },
  },
  // Application layer - services, providers
  {
    files: ['src/**/application/**/*.ts'],
    rules: {
      'security/detect-object-injection': 'off', // Dynamic key access in business logic
      '@typescript-eslint/no-non-null-assertion': 'off', // Validated data
    },
  },
  // Domain models
  {
    files: ['src/**/domain/**/*.ts'],
    rules: {
      'security/detect-object-injection': 'off', // Model property access
    },
  },
  // App layer - middlewares, routes, plugins
  {
    files: ['src/**/app/**/*.ts'],
    rules: {
      'security/detect-object-injection': 'off', // Request/response handling
      '@typescript-eslint/no-non-null-assertion': 'off', // Request data
    },
  },
  // gRPC handlers
  {
    files: ['src/**/grpc/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off', // gRPC response handling
      'security/detect-object-injection': 'off', // Handler context access
      'sonarjs/no-duplicate-string': 'off', // Handler and status names
    },
  },
  // Index files and bootstrap
  {
    files: ['src/index.ts', 'src/**/server.ts', 'src/app/server.ts'],
    rules: {
      'no-console': 'off', // Startup logging
      '@typescript-eslint/no-deprecated': 'off', // Library transitions
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
  // Container and DI setup
  {
    files: ['src/**/container.ts', 'src/**/container/**/*.ts'],
    rules: {
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
  // Error handling
  {
    files: ['src/**/errors/**/*.ts', 'src/**/shared/errors/**/*.ts'],
    rules: {
      'max-lines-per-function': ['warn', { max: 120, skipBlankLines: true, skipComments: true }],
    },
  }
);
