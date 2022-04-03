# vscode-conventional-commits
*Author your Commit Message like your Code*

## Packages
* `git-commit-parser` - consists of scanner & parser and transforms commit message into AST
* `vscode-extension`
  * Provides VSCode command which opens file in editor
  * Provides better Syntax Highlighting for `git-commit` language type
  * Provides Language Server
  * Adds icon in Source Control panel to invoke command
* `language-server`
  * Shows warnings & errors with suggesions in existing commit messages if not following conventional commits
  * Provides auto completion in multiple places
  * Runs local commitlint config to enhance language server

