module.exports = {
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm', // root package.json
    ['@semantic-release/npm', { pkgRoot: 'extension' }],
    ['@semantic-release/npm', { pkgRoot: 'git-commit-parser' }],
    [
      '@semantic-release/github',
      {
        assets: [
          {
            path: 'extension/vscode-commit-pro-extension.*.vsix',
            label: 'VSCode Extension (.vsix)',
          },
        ],
      },
    ],
    [
      '@semantic-release/git',
      {
        message:
          'build(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
  branches: [{ name: 'main' }],
}
