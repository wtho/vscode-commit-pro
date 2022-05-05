import { URI } from 'vscode-languageserver/node'
import * as url from 'url'
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git'
import * as parser from 'git-commit-parser'
import { performance } from 'perf_hooks'

type CommitData = EmptyCommitData | ParsedCommitData

interface EmptyCommitData {
  commitId: string
  date: string
  header: string
  parsedRootNode: undefined
}

interface ParsedCommitData {
  commitId: string
  parsedRootNode: parser.Node
  type: string | undefined
  scope: string | undefined
  date: string
  header: string
}

interface RepoData {
  git: SimpleGit
  branchName: string
  parsedCommits: Map<string, CommitData>
  types: string[]
  typeCount: Map<string, { count: number; lastUsed: string }>
  scopes: string[]
  scopeCount: Map<string, { count: number; lastUsed: string }>
  commitSummaries: { commitId: string; date: string; header: string }[]
  loading: Promise<void>
}

export function loadRepo(uri: string) {
  const simpleGitOptions: Partial<SimpleGitOptions> = {
    baseDir: url.fileURLToPath(uri),
  }
  const git = simpleGit(simpleGitOptions)

  // data to extract from git:
  // - [ ] git log - parsed from each message
  //   - [x] types from messages
  //   - [x] scopes from messages
  //   - [ ] footer-token from messages
  //   - [ ] (issue refs - for later detail when using the same ref that this ref was used in commit abcdef1)
  // - [ ] git log commit hashes
  // - [x] git branch name (for issue name/nr)

  let loadRepo = new Promise<void>((rs) => setTimeout(() => rs(), 1000)) // Promise.resolve()

  const repoData: RepoData = {
    git,
    branchName: 'main',
    parsedCommits: new Map(),
    types: [],
    typeCount: new Map(),
    scopes: [],
    scopeCount: new Map(),
    commitSummaries: [],
    loading: loadRepo,
  }

  const runGitBranch = loadRepo
    .then(() => git.branch())
    .then((branchResult) => (repoData.branchName = branchResult.current))
  const runGitLog = loadRepo.then(() => git.log({ maxCount: 3000 }))
  const runParseCommits: Promise<CommitData[]> = runGitLog.then((log) =>
    log.all.map((commit) => {
      const fullCommitMessage = `${commit.message}\n\n${commit.body}`
      const parsed = parser.parseTree(fullCommitMessage, { strict: true })

      const parsedRootNode = parsed?.root

      const commitId = commit.hash.slice(0, 7)
      const { date, message: header } = commit

      if (!parsedRootNode) {
        return {
          commitId,
          date,
          header,
          parsedRootNode: undefined,
        }
      }

      const type =
        parser.getStringContentOfNode(
          parser.getFirstNodeOfType(parsedRootNode, 'type')
        ) || undefined // filter out empty string
      const scope =
        parser.getStringContentOfNode(
          parser.getFirstNodeOfType(parsedRootNode, 'scope')
        ) || undefined // filter out empty string

      const commitData: CommitData = {
        parsedRootNode: parsed.root,
        type,
        scope,
        commitId,
        date,
        header,
      }

      return commitData
    })
  )

  const runCommitAnalysis = runParseCommits.then((commitsData) => {
    commitsData.forEach((commitData) => {
      const { commitId, date, header } = commitData
      repoData.parsedCommits.set(commitId, commitData)
      repoData.commitSummaries.push({ commitId, date, header })
      if (commitData.parsedRootNode === undefined) {
        return
      }
      const type = commitData.type
      const scope = commitData.scope
      if (type) {
        if (!repoData.typeCount.has(type)) {
          repoData.types.push(type)
          repoData.typeCount.set(type, { count: 1, lastUsed: commitData.date! })
        } else {
          const typeCount = repoData.typeCount.get(type)!
          typeCount.count += 1
        }
      }
      if (scope) {
        if (!repoData.scopeCount.has(scope)) {
          repoData.scopes.push(scope)
          repoData.scopeCount.set(scope, {
            count: 1,
            lastUsed: commitData.date!,
          })
        } else {
          const scopeCount = repoData.scopeCount.get(scope)!
          scopeCount.count += 1
        }
      }
    })
    // sort types and scopes according to relevance
    // (first count and second recent usage)
    repoData.types.sort((type1, type2) => {
      const count1 = repoData.typeCount.get(type1)?.count ?? 0
      const count2 = repoData.typeCount.get(type2)?.count ?? 0
      return count2 - count1
    })
    repoData.scopes.sort((scope1, scope2) => {
      const count1 = repoData.scopeCount.get(scope1)?.count ?? 0
      const count2 = repoData.scopeCount.get(scope2)?.count ?? 0
      return count2 - count1
    })
  })

  repoData.loading = Promise.all([runCommitAnalysis, runGitBranch]).then(
    () => {}
  )

  return repoData
}

export class GitService {
  private repoUris: URI[] = []

  private gitForRepoUri: Map<URI, RepoData> = new Map()

  // TODO: watch repositories for commit changes
  // (amend, commit, push, pull, branch switch)
  // and reload commit analysis

  setRepoUris(repoUris: URI[]): void {
    // repo uri changes
    const newRepoUris = repoUris.filter((uri) => !this.repoUris.includes(uri))
    const deletedRepoUris = this.repoUris.filter(
      (uri) => !repoUris.includes(uri)
    )
    this.repoUris = repoUris

    deletedRepoUris.forEach((uri) => this.gitForRepoUri.delete(uri))
    newRepoUris.forEach(async (uri) => {
      this.gitForRepoUri.set(uri, loadRepo(uri))

      const start = performance.now()

      const repoData = this.gitForRepoUri.get(uri)!
      await repoData.loading

      const end = performance.now()
      const duration = Math.abs(end - start)
      console.log(
        'done loading repo',
        uri,
        end,
        start,
        duration,
        repoData.branchName,
        repoData.commitSummaries
      )
    })
  }

  async getTypeDataForWorkspace(
    workspaceUri: URI
  ): Promise<{ type: string; count: number; lastUsed: string }[]> {
    const repoData = this.gitForRepoUri.get(workspaceUri)
    if (!repoData) {
      return []
    }
    await repoData.loading
    return repoData.types.map(type => {
      const typeData = repoData.typeCount.get(type)!
      return {
        type,
        count: typeData.count,
        lastUsed: typeData.lastUsed,
      }
    })
  }

  async getScopeDataForWorkspace(
    workspaceUri: URI
  ): Promise<{ scope: string; count: number; lastUsed: string }[]> {
    const repoData = this.gitForRepoUri.get(workspaceUri)
    if (!repoData) {
      return []
    }
    await repoData.loading
    return repoData.scopes.map(scope => {
      const scopeData = repoData.scopeCount.get(scope)!
      return {
        scope: scope,
        count: scopeData.count,
        lastUsed: scopeData.lastUsed,
      }
    })
  }
}
