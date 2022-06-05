import { Position, Range, TextEdit, Uri, WorkspaceEdit } from 'vscode'
import * as path from 'path'

export interface CommitlintConfigFileNamesContext {
  workspaceUri: Uri
  scopes: string[]
  getFileContent: (fileUri: Uri) => Promise<string>
}

const createSingleFile = (
  fileName: string,
  fileContent: string,
  context: CommitlintConfigFileNamesContext
): WorkspaceEdit => {
  const fileUri = Uri.file(path.join(context.workspaceUri.path, fileName))

  const workspaceEdit = new WorkspaceEdit()

  workspaceEdit.createFile(fileUri)
  workspaceEdit.set(fileUri, [
    new TextEdit(
      new Range(new Position(0, 0), new Position(0, 0)),
      fileContent
    ),
  ])

  return workspaceEdit
}

const editPackageJsonFile = async (
  fileContent: string,
  context: CommitlintConfigFileNamesContext
): Promise<WorkspaceEdit> => {
  const fileUri = Uri.file(path.join(context.workspaceUri.path, 'package.json'))

  const packageJsonContent = await context.getFileContent(fileUri)
  const jsonEndIndex = packageJsonContent.lastIndexOf('}')
  const contentUntilJsonEndIndex = packageJsonContent.substring(0, jsonEndIndex)

  // get the index of the last non-whitespace character
  const regex = /[^\s\n]/g
  let lastNonWhitespaceIndex = 0
  while (regex.test(contentUntilJsonEndIndex)) {
    lastNonWhitespaceIndex = regex.lastIndex
  }
  const insertIndex = lastNonWhitespaceIndex
  const contentUntilInsertIndexLines = packageJsonContent.substring(0, insertIndex).split('\n')

  const insertLine = contentUntilInsertIndexLines.length - 1
  const lastLine = contentUntilInsertIndexLines.at(-1)
  const insertChar = lastLine?.length ?? Number.MAX_SAFE_INTEGER

  const workspaceEdit = new WorkspaceEdit()

  workspaceEdit.set(fileUri, [
    new TextEdit(
      new Range(new Position(insertLine, insertChar), new Position(insertLine, insertChar)),
      fileContent
    ),
  ])

  return workspaceEdit
}

export const commitlintrcJsonTemplate = (
  context: CommitlintConfigFileNamesContext
): string => {
  if (context.scopes.length === 0) {
    return `{
  "extends": ["@commitlint/config-conventional"],
  "parserPreset": "conventional-changelog-conventionalcommits"
}
`
  }
  return `{
  "extends": ["@commitlint/config-conventional"],
  "parserPreset": "conventional-changelog-conventionalcommits",
  "rules": {
    "scope-enum": [
      1,
      "always",
      [
        ${context.scopes.map((scope) => `"${scope}"`).join(',\n        ')} 
      ]
    ]
  }
}`
}

export const commitlintrcYamlTemplate = (
  context: CommitlintConfigFileNamesContext
): string => {
  if (context.scopes.length === 0) {
    return `extends:
  - "@commitlint/config-conventional"
parserPreset: "conventional-changelog-conventionalcommits"
`
  }
  return `extends:
  - "@commitlint/config-conventional"
parserPreset: "conventional-changelog-conventionalcommits"
rules:
  scope-enum:
    - 1,
    - always,
    - ${context.scopes.map((scope) => `- "${scope}"`).join('\n      ')} 
`
}

export const commitlintrcJsTemplate = (
  context: CommitlintConfigFileNamesContext
): string => {
  if (context.scopes.length === 0) {
    return `export default {
  extends: ['@commitlint/config-conventional'],
  parserPreset: 'conventional-changelog-conventionalcommits'
}
`
  }
  return `export default {
  extends: ['@commitlint/config-conventional'],
  parserPreset: 'conventional-changelog-conventionalcommits',
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        ${context.scopes.map((scope) => `'${scope}'`).join(',\n        ')}
      ]
    ]
  }
}
`
}

export const commitlintrcCjsTemplate = (
  context: CommitlintConfigFileNamesContext
): string => {
  if (context.scopes.length === 0) {
    return `module.exports = {
  extends: ['@commitlint/config-conventional'],
  parserPreset: 'conventional-changelog-conventionalcommits'
}
`
  }
  return `module.exports = {
  extends: ['@commitlint/config-conventional'],
  parserPreset: 'conventional-changelog-conventionalcommits',
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        ${context.scopes.map((scope) => `'${scope}'`).join(',\n        ')}
      ]
    ]
  }
}
`
}

export const commitlintrcTsTemplate = (
  context: CommitlintConfigFileNamesContext
): string => {
  if (context.scopes.length === 0) {
    return `export default {
  extends: ['@commitlint/config-conventional'],
  parserPreset: 'conventional-changelog-conventionalcommits'
}
`
  }
  return `export default {
  extends: ['@commitlint/config-conventional'],
  parserPreset: 'conventional-changelog-conventionalcommits',
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        ${context.scopes.map((scope) => `'${scope}'`).join(',\n        ')}
      ]
    ]
  }
}
`
}

export const packageJsonTemplate = (
  context: CommitlintConfigFileNamesContext
): string => {
  if (context.scopes.length === 0) {
    return `,
  "commitlint":{
    "extends": ["@commitlint/config-conventional"],
    "parserPreset": "conventional-changelog-conventionalcommits"
  }`
  }
  return `,
  "commitlint":{
    "extends": ["@commitlint/config-conventional"],
    "parserPreset": "conventional-changelog-conventionalcommits",
    "rules": {
      "scope-enum": [
        1,
        "always",
        [
          ${context.scopes.map((scope) => `"${scope}"`).join(',\n        ')} 
        ]
      ]
    }
  }`
}

// taken from
// https://github.com/conventional-changelog/commitlint/blob/4683b059bb8c78c45f10960435c0bd01194421fa/%40commitlint/load/src/utils/load-config.ts#L17-L33
export const commitlintConfigFileData: {
  [file: string]: {
    detail?: string
    description?: string
    getEdit: (context: CommitlintConfigFileNamesContext) => WorkspaceEdit | Promise<WorkspaceEdit>
  }
} = {
  '.commitlintrc.json': {
    detail: 'Recommended for most projects',
    description: 'JSON',
    getEdit: (context) =>
      createSingleFile(
        '.commitlintrc.json',
        commitlintrcJsonTemplate(context),
        context
      ),
  },
  '.commitlintrc.yaml': {
    detail: 'Recommended for most projects',
    description: 'YAML',
    getEdit: (context) =>
      createSingleFile(
        '.commitlintrc.yaml',
        commitlintrcYamlTemplate(context),
        context
      ),
  },
  '.commitlintrc.js': {
    // detail: 'Recommended for JavaScript codebases',
    description: 'JS',
    getEdit: (context) =>
      createSingleFile(
        '.commitlintrc.js',
        commitlintrcJsTemplate(context),
        context
      ),
  },
  '.commitlintrc.cjs': {
    // detail: 'Recommended for JavaScript codebases',
    description: 'CommonJS Modules',
    getEdit: (context) =>
      createSingleFile(
        '.commitlintrc.cjs',
        commitlintrcCjsTemplate(context),
        context
      ),
  },
  'commitlint.config.js': {
    detail: 'Recommended for JavaScript codebases',
    description: 'JS',
    getEdit: (context) =>
      createSingleFile(
        'commitlint.config.js',
        commitlintrcJsTemplate(context),
        context
      ),
  },
  'commitlint.config.cjs': {
    detail: 'Recommended for CJS JavaScript codebases',
    description: 'CommonJS Modules',
    getEdit: (context) =>
      createSingleFile(
        'commitlint.config.cjs',
        commitlintrcCjsTemplate(context),
        context
      ),
  },
  // files supported by TypescriptLoader
  '.commitlintrc.ts': {
    description: 'TS',
    // detail: 'Recommended for TypeScript codebases',
    getEdit: (context) =>
      createSingleFile(
        '.commitlintrc.ts',
        commitlintrcTsTemplate(context),
        context
      ),
  },
  'commitlint.config.ts': {
    detail: 'Recommended for TypeScript codebases',
    description: 'TS',
    getEdit: (context) =>
      createSingleFile(
        'commitlint.config.ts',
        commitlintrcTsTemplate(context),
        context
      ),
  },
  '.commitlintrc': {
    detail: 'Not recommended',
    getEdit: (context) =>
      createSingleFile('.commitlintrc', commitlintrcJsTemplate(context), context),
  },
  'package.json': {
    detail: 'Not recommended, adds field to your package.json',
    description: 'NodeJS project, JSON',
    getEdit: (context) => editPackageJsonFile(packageJsonTemplate(context), context),
  },
}

const commitlintConfigFileNames = Object.keys(commitlintConfigFileData)

export const commitlintConfigFileGlobPattern = `**/{${commitlintConfigFileNames.join(
  ','
)}}`
