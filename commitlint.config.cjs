module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['fix', 'feat', 'chore', 'docs', 'ci']],
    'scope-empty': [2, 'never'],
    'subject-case': [2, 'never', ['upper-case', 'start-case', 'pascal-case']]
  }
}
