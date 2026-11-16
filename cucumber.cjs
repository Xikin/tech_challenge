module.exports = {
  default: {
    paths: ['tests/bdd/features/**/*.feature'],
    requireModule: ['tsx/cjs'],
    require: ['tests/bdd/support/**/*.ts', 'tests/bdd/steps/**/*.ts'],
    format: ['progress-bar', 'html:reports/bdd/relatorio.html', 'json:reports/bdd/relatorio.json'],
    strict: true,
  },
};
