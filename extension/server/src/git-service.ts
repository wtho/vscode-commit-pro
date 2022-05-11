import { URI } from 'vscode-languageserver/node'
import * as parser from 'git-commit-parser'

type ResolvablePromise<T> = Promise<T> & {
  resolve?: (arg: T) => void
  reject?: (error: Error) => void
}

const createResolvablePromise = <T>() => {
  let resolveFn: ((arg: T) => void) | undefined
  let rejectFn: ((error: Error) => void) | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve
    rejectFn = reject
  }) as ResolvablePromise<T>

  promise.resolve = (arg: T) => {
    resolveFn?.(arg)
    promise.resolve = undefined
    promise.reject = undefined
  }
  promise.reject = (error: Error) => {
    rejectFn?.(error)
    promise.resolve = undefined
    promise.reject = undefined
  }

  return promise
}

export type GitClientEvent =
  | GitClientRepostoryUpdateEvent
  | GitClientRepositoryCloseEvent

export interface GitClientRepostoryUpdateEvent {
  type: 'repository-update'
  uri: string
  branch: string
  headCommit: string | undefined
  commitIds: string[]
}
export interface GitClientRepositoryCloseEvent {
  type: 'repository-close'
  uri: string
}

export interface BaseCommit {
  hash7: string
  message: string
  authorName: string
  commitDate: string
}

type CommitData = EmptyCommitData | ParsedCommitData

interface EmptyCommitData {
  commitId: string
  commitDate: string
  header: string
  parsedRootNode: undefined
}

interface ParsedCommitData {
  commitId: string
  parsedRootNode: parser.Node
  type: string | undefined
  scope: string | undefined
  authorName: string | undefined
  commitDate: string
  header: string
}

interface RepoData {
  branch: string
  commitIds: string[]
  parsedCommits: Map<string, CommitData>
  types: string[]
  headCommit: string | undefined
  typeStats: Map<string, { count: number; lastUsed: string }>
  scopes: string[]
  scopeStats: Map<string, { count: number; lastUsed: string }>
  commitSummaries: CommitSummary[]
  loading: ResolvablePromise<void>
}

interface CommitSummary {
  commitId: string
  commitDate: string
  header: string
  authorName: string | undefined
}

export class GitService {
  private gitForRepoUri: Map<string, RepoData> = new Map()

  // TODO: watch repositories for commit changes
  // (amend, commit, push, pull, branch switch)
  // and reload commit analysis

  updateRepo(
    uri: string,
    event: GitClientRepostoryUpdateEvent
  ): { uri: string; commitIds: string[] } {
    const currentRepo = this.gitForRepoUri.get(uri)
    const isNew = !currentRepo
    const hasSwitchedBranch = currentRepo?.branch !== event.branch
    const isOnDifferentCommit = currentRepo?.headCommit !== event.branch
    const isUpToDate = !hasSwitchedBranch && !isOnDifferentCommit

    let missingCommitIds: string[] = []
    if (isNew) {
      missingCommitIds = event.commitIds
    } else if (hasSwitchedBranch || isOnDifferentCommit) {
      // find commits that are missing
      const currentCommits = currentRepo.parsedCommits
      missingCommitIds = event.commitIds.filter(
        (commitId) => !currentCommits.has(commitId)
      )
      // also delete commits that are not in the new branch!
      if (
        missingCommitIds.length + currentCommits.size !==
        event.commitIds.length
      ) {
        currentCommits.forEach((commitData, commitId) => {
          if (!event.commitIds.includes(commitId)) {
            currentRepo.parsedCommits.delete(commitId)
          }
        })
      }
    }

    const isOutdated = isNew || hasSwitchedBranch || isOnDifferentCommit

    if (!isOutdated) {
      return {
        uri,
        commitIds: [],
      }
    }

    // (partial) reload
    this.gitForRepoUri.set(uri, {
      commitIds: event.commitIds,
      branch: event.branch,
      headCommit: event.headCommit,
      commitSummaries: [],
      loading: createResolvablePromise(),
      parsedCommits: currentRepo?.parsedCommits ?? new Map(),
      scopeStats: new Map(),
      scopes: [],
      typeStats: new Map(),
      types: [],
    })

    return {
      uri,
      commitIds: event.commitIds,
    }
  }

  addRepoCommits(uri: string, commits: BaseCommit[]) {
    const currentRepo = this.gitForRepoUri.get(uri)
    if (!currentRepo) {
      throw new Error(`repo for uri ${uri} not found at language server`)
    }

    for (const commit of commits) {
      const { message, authorName, commitDate, hash7 } = commit
      const parseOutcome = parser.parseCommit(message, { strict: true })

      const newlineIndex = message.indexOf('\n')
      const header =
        newlineIndex === -1 ? message : message.slice(0, newlineIndex)
      const parsedRootNode = parseOutcome?.root

      let commitData: CommitData = {
        commitId: hash7,
        commitDate,
        header,
        parsedRootNode: undefined,
      }

      if (parsedRootNode) {
        const type = parseOutcome.header?.type
        const scope = parseOutcome.header?.scope

        commitData = {
          parsedRootNode,
          type,
          scope,
          commitId: hash7,
          commitDate,
          header,
          authorName,
        }
      }

      currentRepo.parsedCommits.set(hash7, commitData)
    }

    for (const commitId of currentRepo.commitIds) {
      const commit = currentRepo.parsedCommits.get(commitId)
      if (!commit) {
        throw new Error('commit not found')
      }
      if (!commit.parsedRootNode) {
        return
      }
      const { header, authorName, commitDate, type, scope } = commit
      currentRepo.commitSummaries.push({ commitId, commitDate, header, authorName })

      if (type) {
        if (!currentRepo.typeStats.has(type)) {
          currentRepo.types.push(type)
          currentRepo.typeStats.set(type, {
            count: 1,
            lastUsed: commitDate,
          })
        } else {
          const typeCount = currentRepo.typeStats.get(type)!
          typeCount.count += 1
        }
      }
      if (scope) {
        if (!currentRepo.scopeStats.has(scope)) {
          currentRepo.scopes.push(scope)
          currentRepo.scopeStats.set(scope, {
            count: 1,
            lastUsed: commitDate,
          })
        } else {
          const scopeCount = currentRepo.scopeStats.get(scope)!
          scopeCount.count += 1
        }
      }
    }

    // sort types and scopes according to relevance
    // (first count and second recent usage)
    currentRepo.types.sort((type1, type2) => {
      const count1 = currentRepo.typeStats.get(type1)?.count ?? 0
      const count2 = currentRepo.typeStats.get(type2)?.count ?? 0
      return count2 - count1
    })
    currentRepo.scopes.sort((scope1, scope2) => {
      const count1 = currentRepo.scopeStats.get(scope1)?.count ?? 0
      const count2 = currentRepo.scopeStats.get(scope2)?.count ?? 0
      return count2 - count1
    })

    currentRepo.loading.resolve?.()
  }

  closeRepo(uri: string) {
    const repo = this.gitForRepoUri.get(uri)
    if (!repo) {
      return
    }
    repo.loading.resolve?.()
    this.gitForRepoUri.delete(uri)
  }

  async getTypeDataForWorkspace(
    workspaceUri: URI
  ): Promise<{ type: string; count: number; lastUsed: string }[]> {
    const repoData = this.gitForRepoUri.get(workspaceUri)
    if (!repoData) {
      return []
    }
    await repoData.loading
    return repoData.types.map((type) => {
      const typeData = repoData.typeStats.get(type)!
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
    return repoData.scopes.map((scope) => {
      const scopeData = repoData.scopeStats.get(scope)!
      return {
        scope: scope,
        count: scopeData.count,
        lastUsed: scopeData.lastUsed,
      }
    })
  }
}
