module.exports = {
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
      },
    ],
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
