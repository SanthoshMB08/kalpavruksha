const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly' // built into Node 18+ (this app's minimum, per package.json engines)
      }
    },
    rules: {
      // Catches real bugs, not style nitpicks — an unused variable is
      // usually a leftover from a refactor or a typo, not a style choice.
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-undef': 'error'
    }
  },
  {
    files: ['tests/**/*.test.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly'
      }
    }
  },
  {
    ignores: ['node_modules/**', 'public/**', 'coverage/**']
  }
];
