[![](https://vsmarketplacebadge.apphb.com/version-short/wtho.commitpro.svg)](https://marketplace.visualstudio.com/items?itemName=wtho.commitpro)
[![](https://vsmarketplacebadge.apphb.com/downloads-short/wtho.commitpro.svg)](https://marketplace.visualstudio.com/items?itemName=wtho.commitpro)
[![](https://vsmarketplacebadge.apphb.com/rating-short/wtho.commitpro.svg)](https://marketplace.visualstudio.com/items?itemName=wtho.commitpro)

<p align="center">
  <br />
  <a title="Learn more about CommitPro" href="https://github.com/wtho/vscode-commit-pro"><img width="476px" src="https://raw.githubusercontent.com/wtho/vscode-commit-pro/main/images/docs/commit-pro-logo.png" alt="CommitPro Logo" /></a>
</p>

> CommitPro lets you **write your Commit Messages** like a pro - like you **write your Code**.

# CommitPro

[CommitPro](https://github.com/wtho/vscode-commit-pro 'Learn more about CommitPro') is an open-source extension for [Visual Studio Code](https://code.visualstudio.com).

CommitPro helps you **writing better git commit messages**. As opposed to existing solutions, it runs and validates *while you write your message* and immediately shows you problems and provides fixes and completions. The extension runs as Language Server in an own process to support you using the full IDE features set like when your write code in a programming language.

Here are the **features** that CommitPro provides:

- [**Syntax Highlighting**](#syntax-highlighting- 'Jump to Syntax Highlighting') for commit messages using semantic tokens (make sure to [**opt-in**](#syntax-highlighting-opt-in- 'Jump to Opt-In Syntax Highlighting') if it does not work out of the box)
- [**Commitlint Support**](#commitlint-support- 'Jump to Commitlint Support') to show errors in real-time based on your workspace configuration or sensible defaults
- [**Autocompletion**](#autocompletion- 'Jump to Autocompletion') for types and scopes according your commitlint config or your previous commits history
- [**Quick Fixes**](#quick-fixes- 'Jump to Quick Fixes') for commitlint rule violations
- [**Git History Introspection**](#git-history-introspection- 'Jump to Git History Introspection') to write new messages consistent with old ones

# Usage
You can start composing your commit message using the extension through the following ways:
* Set the IDE as your default commit editor in git.
  This can be done using the git command `git config --global core.editor "code --wait"`. If you then use `git commit` or `git commit --amend` in your command line, your current vscode editor will open the commit message.
* Use the Magic Wand button in the Source Control View
* Invoke the commands from the Command Palette
  * **Git: Commit Message in Code Editor** for regular commits
  * **Git: Amend Commit Message in Code Editor** for amending commits
* Define a keyboard shortcut for the commands
  * **`commitPro.editor.command.openEditor`** for regular commits
  * **`commitPro.editor.command.openEditorAmend`** for amending commits

# Features

## Syntax Highlighting [#](#syntax-highlighting- 'Syntax Highlighting')
CommitPro uses its own commit message parser, which turns the message into an *Abstract Syntax Tree* (AST). This allows the extension to locate all parts of the message at any time and tell the IDE where to apply highlighting.
It uses the Semantic Highlighting feature, which is slower than conventional highlighting, but allows more complex, context-based highlighting.

### Opt-In [#](#syntax-highlighting-opt-in- 'Syntax Highlighting')
In case your Syntax Highlighting is not working, you might use a theme which does not support semantic highlighting out of the box. In this case you can opt-in in your vscode-configuration.
Use the `Preferences: Open Settings` command to edit your `settings.json` and add the following entry:
```json
"[git-commit]": { "editor.semanticHighlighting.enabled": true }
```

## Commitlint Support [#](#commitlint-support- 'Commitlint Support')
You can configure **CommitPro** using [commitlint](https://commitlint.js.org/#/)  configuration files. While *commitlint* is a JS-based library, CommitPro will pick up your `json` or `yaml` configuration, if you work with a non-JavaScript project.

If you want to tweak the validation to your liking, you can start with this example **`.commitlintrc.json`** file and take a look at the rules supported by commitlint:
```json
{ 
  "extends": ["@commitlint/config-conventional"],
  "rules": {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "ci",
        "chore",
        "docs",
        "perf",
        "refactor",
        "revert",
        "style",
        "test"
      ]
    ]
  }
}
```

[Rule Reference](https://commitlint.js.org/#/reference-rules)

If you want your team to follow common guidelines, make sure you commit the configuration file and add CommitPro to recommended extension for this codebase.

## Autocompletion [#](#autocompletion- 'Autocompletion')
According to your configuration and commits in your git history, **CommitPro** will provide completions for certain parts of your commit message.

## Quick Fixes [#](#quick-fixes- 'Quick Fixes')
If not following your ruleset or the conventional commit format, **CommitPro** will provide quick fix actions to your IDE so you can quickly correct your message before committing.

## History Introspection [#](#git-history-introspection- 'Quick Fixes')
**CommitPro** takes a deep look into your git history to adapt to patterns and keeping your message style consistent with previous commits.

# Planned Features
Take a look at the [GitHub Issues](https://github.com/wtho/vscode-commit-pro/issues) to get an overview of what features will be developed next.

