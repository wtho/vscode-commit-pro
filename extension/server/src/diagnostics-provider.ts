import { Diagnostic } from 'vscode-languageserver/node'
import { CommitMessageProvider, PartialTextDocument } from './commit-message-provider'
import * as commitlint from './commitlint'

export class DiagnosticsProvider {
  constructor(private readonly commitMessageProvider: CommitMessageProvider) {}

  async getDiagnostics(textDocument: PartialTextDocument): Promise<Diagnostic[]> {
    const parsedTree = await this.commitMessageProvider.getParsedTreeForDocument(
      textDocument
    )

    if (!parsedTree) {
      console.warn(`OnValidate: Could not parse tree from input`)
      return []
    }

    const config = await this.commitMessageProvider.getConfig(
      parsedTree.config?.configUri,
      textDocument.uri
    )

    const { rules, ...options } = config?.config ?? {}

    const { diagnostics, configErrors, semVerUpdate } =
      await commitlint.validate({
        parsedRootNode: parsedTree.parseOutcome?.root,
        commitMessage: parsedTree.text,
        options,
        rules,
      })

    const enrichedDiagnostics = diagnostics.map((diagnostic) => {
      const source = ['commitlint', config?.configPath]
        .filter(Boolean)
        .join(':')
      diagnostic.source = source
      return diagnostic
    })

    // const diagnostic: Diagnostic = {
    //   severity: DiagnosticSeverity.Warning,
    //   range: {
    //     start: textDocument.positionAt(m.index),
    //     end: textDocument.positionAt(m.index + m[0].length),
    //   },
    //   message: `${m[0]} is all uppercase.`,
    //   source: 'ex',
    // }
    // if (hasDiagnosticRelatedInformationCapability) {
    //   diagnostic.relatedInformation = [
    //     {
    //       location: {
    //         uri: textDocument.uri,
    //         range: Object.assign({}, diagnostic.range),
    //       },
    //       message: 'Spelling matters',
    //     },
    //     {
    //       location: {
    //         uri: textDocument.uri,
    //         range: Object.assign({}, diagnostic.range),
    //       },
    //       message: 'Particularly for names',
    //     },
    //   ]
    // }

    return enrichedDiagnostics
  }
}
