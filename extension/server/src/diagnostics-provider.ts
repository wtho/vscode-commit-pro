import { TextDocument } from 'vscode-languageserver-textdocument'
import { DiagnosticFeatureShape } from 'vscode-languageserver/lib/common/diagnostic'
import {
  CancellationToken,
  Diagnostic,
  DocumentDiagnosticParams,
  DocumentDiagnosticReport,
  DocumentDiagnosticReportPartialResult,
  ResultProgressReporter,
  TextDocuments,
  WorkDoneProgressReporter,
} from 'vscode-languageserver/node'
import {
  CommitMessageProvider,
  PartialTextDocument,
} from './commit-message-provider'
import * as commitlint from './commitlint'
import type { Workspace } from './server'

export class DiagnosticsProvider {
  constructor(
    private readonly commitMessageProvider: CommitMessageProvider,
    private readonly diagnosticFeature: DiagnosticFeatureShape['diagnostics'],
    private readonly documents: TextDocuments<TextDocument>,
    private readonly workspace: Workspace
  ) {
    diagnosticFeature.on(
      (
        documentDiagnosticParams,
        cancellationToken,
        workDoneProgressReporter,
        resultProgressReporter
      ) =>
        this.handleDiagnosticsRequest(
          documentDiagnosticParams,
          cancellationToken,
          workDoneProgressReporter,
          resultProgressReporter
        )
    )
  }

  refreshDiagnostics() {
    this.diagnosticFeature.refresh()
  }

  async handleDiagnosticsRequest(
    documentDiagnosticParams: DocumentDiagnosticParams,
    cancellationToken: CancellationToken,
    workDoneProgressReporter: WorkDoneProgressReporter,
    resultProgressReporter:
      | ResultProgressReporter<DocumentDiagnosticReportPartialResult>
      | undefined
  ): Promise<DocumentDiagnosticReport> {
    const document = this.documents.get(
      documentDiagnosticParams.textDocument.uri
    )

    if (!document) {
      return {
        resultId: '12345', // TODO: use a better resultId
        kind: 'unchanged',
      }
    }

    return {
      items: await this.getDiagnosticsForDocument(document),
      kind: 'full',
    }
  }

  async getDiagnosticsForDocument(
    textDocument: PartialTextDocument
  ): Promise<Diagnostic[]> {
    const getParsedTreeAndConfig = async () => {
      const parsedTree =
        await this.commitMessageProvider.getParsedTreeForDocument(textDocument)

      if (!parsedTree) {
        console.warn(
          `getDiagnosticsForDocument: Could not parse tree from input`
        )
        throw new Error('Could not parse tree from input')
      }

      const config = await this.commitMessageProvider.getConfig(
        parsedTree.config?.configUri,
        textDocument.uri
      )

      return { parsedTree, config }
    }

    const getShouldUseDefaultRules = (): Promise<boolean> =>
      this.workspace.getConfiguration(
        'commitPro.enableDefaultCommitlintRulesDiagnostics'
      )

    const [{ parsedTree, config }, shouldUseDefaultRules] = await Promise.all([
      getParsedTreeAndConfig(),
      getShouldUseDefaultRules(),
    ])

    const { isDefaultConfig } = config

    if (isDefaultConfig && !shouldUseDefaultRules) {
      return []
    }

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
