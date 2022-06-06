module.exports = {
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm', // root package.json
    ['@semantic-release/npm', { pkgRoot: 'extension' }],
    ['@semantic-release/npm', { pkgRoot: 'git-commit-parser' }],
    './semantic-release-rebuild-extension-plugin',
    [
      '@semantic-release/github',
      {
        assets: [
          {
            path: 'extension/vscode-commit-pro-extension-*.vsix',
            label: 'VSCode Extension',
          },
        ],
      },
    ],
    [
      '@semantic-release/git',
      {
        message:
          'build(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
        assets: [
          'CHANGELOG.md',
          'package.json',
          'package-lock.json',
          'extension/package.json',
          'extension/package-lock.json',
          'git-commit-parser/package.json',
          'git-commit-parser/package-lock.json',
        ],
      },
    ],
  ],
  branches: [{ name: 'main' }],
}
