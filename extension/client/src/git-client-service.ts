import { Disposable, EventEmitter, extensions, Uri } from 'vscode'
import type {
  GitExtension,
  API as GitApi,
  Repository,
} from '../types/vscode.git'

const createResolvablePromise = <T>() => {
  type ResolvablePromise<T> = Promise<T> & { resolve: (arg: T) => void }
  let resolveFn: (arg: T) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve
  }) as ResolvablePromise<T>

  promise.resolve = resolveFn

  return promise
}

// relevant information for each repository
// * repository.getBranch() -> branch: Branch { name?: string }
// * repository.log({ maxEntries: 32 }) -> Commit[] { hash: string, message: string, commitDate: Date, parents: [] }

// if no node:
//   provide flow for commiting
//   1. create commit template
//     * repository.status() and repository.state -> RepositoryState
//     * repository.branch() -> branch: string
//   2. submit commit
//     * repository.commit()

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

type LoadedRepository = {
  uri: string
  branch: string | undefined
  headCommit: string | undefined
  commitIds: string[]
  commits: { [hash7: string]: BaseCommit }
  disposableChangeListener: Disposable
}
interface BaseCommit {
  hash7: string
  message: string
  authorName: string
  commitDate: string
}

export class GitClientService
  extends EventEmitter<GitClientEvent>
  implements Disposable
{
  private initialization = createResolvablePromise<void>()
  private gitExtension = createResolvablePromise<GitExtension>()
  private gitApi = createResolvablePromise<GitApi | undefined>()

  private repoForUri: Map<string, LoadedRepository> = new Map()

  private disposables: Disposable[] = []

  constructor() {
    super()
    this.init()
  }

  async init() {
    const extension = extensions.getExtension<GitExtension>('vscode.git')
    const gitExtension = extension.isActive
      ? extension.exports
      : await extension.activate()
    this.gitExtension.resolve(gitExtension)
    const gitApi = gitExtension?.getAPI(1)
    this.gitApi.resolve(gitApi)

    let gitApiState = gitApi.state
    while (gitApiState === 'uninitialized') {
      gitApiState = await new Promise((resolve) => {
        const disposable = gitApi.onDidChangeState((apiStateUpdate) => {
          disposable.dispose()
          resolve(apiStateUpdate)
        })
      })
    }

    this.initialization.resolve()

    this.initRepositories()

    this.disposables.push(
      gitApi.onDidOpenRepository((repository) =>
        this.updateRepository(repository)
      ),
      gitApi.onDidCloseRepository((repository) =>
        this.removeRepository(repository)
      )
    )
  }

  async initRepositories(): Promise<void> {
    await this.initialization
    const gitApi = await this.gitApi
    const repositories = gitApi?.repositories ?? []
    await Promise.all(repositories.map((repo) => this.updateRepository(repo)))
    repositories.map((repo) => {
      repo.state.onDidChange(() => this.updateRepository(repo))
    })
  }

  async fireInitialRepoUpdates(): Promise<void> {
    for (const repo of this.repoForUri.values()) {
      const { uri, branch, commitIds, headCommit } = repo
      this.fire({
        uri,
        branch,
        headCommit,
        commitIds,
        type: 'repository-update',
      })
    }
  }

  async updateRepository(repository: Repository): Promise<void> {
    const uri = repository.rootUri.toString()
    if (!this.repoForUri.has(uri)) {
      return this.loadRepository(repository)
    }
    const loadedRepository = this.repoForUri.get(uri)
    if (loadedRepository.branch !== repository.state.HEAD.name) {
      return this.loadRepository(repository)
    }
    const newHash7 = repository.state.HEAD.commit.substring(0, 7)
    if (loadedRepository.headCommit !== newHash7) {
      return this.loadRepository(repository)
    }
  }

  async removeRepository(repository: Repository): Promise<void> {
    const uri = repository.rootUri.toString()
    if (!this.repoForUri.has(uri)) {
      return
    }
    const loadedRepository = this.repoForUri.get(uri)
    loadedRepository.disposableChangeListener.dispose()
    this.repoForUri.delete(uri)

    this.fire({ uri, type: 'repository-close' })
  }

  async loadRepository(repository: Repository): Promise<void> {
    const uri = repository.rootUri.toString()

    await repository.status()
    const commits = await repository.log({ maxEntries: 2000 })

    const branch = repository.state.HEAD.name
    const baseCommitMap: { [hash7: string]: BaseCommit } = {}
    const commitIds: string[] = new Array(commits.length)

    for (const index in commits) {
      const commit = commits[index]
      const hash7 = commit.hash.substring(0, 7)
      commitIds[index] = hash7
      baseCommitMap[hash7] = {
        hash7,
        authorName: commit.authorName,
        message: commit.message,
        commitDate: commit.commitDate.toISOString(),
      }
    }

    const alreadyLoadedRepository = this.repoForUri.get(uri)
    const disposableChangeListener =
      alreadyLoadedRepository?.disposableChangeListener ??
      repository.state.onDidChange(() => this.updateRepository(repository))

    const headCommit = commitIds[0]

    const loadedRepository: LoadedRepository = {
      uri,
      branch,
      commits: baseCommitMap,
      commitIds,
      headCommit,
      disposableChangeListener,
    }
    this.repoForUri.set(uri, loadedRepository)

    this.fire({ uri, branch, headCommit, commitIds, type: 'repository-update' })
  }

  async getRepoUris(): Promise<string[]> {
    await this.initialization
    return [...this.repoForUri.values()].map((repo) => repo.uri)
  }

  getCommitData(
    uri: string,
    commitIds: string[]
  ): { uri: string; commits: BaseCommit[] } {
    const commitsForRepo = this.repoForUri.get(uri)?.commits ?? {}

    const commits: BaseCommit[] = new Array(commitIds.length)

    for (const index in commitIds) {
      const commitId = commitIds[index]
      const commit = commitsForRepo[commitId]

      if (!commit) {
        this.gitApi
          .then((gitApi) => gitApi.getRepository(Uri.parse(uri)))
          .then((repository) => this.loadRepository(repository))
        throw new Error(`Requested commit id ${commitId} not found`)
      }

      commits[index] = commit
    }

    return {
      uri,
      commits,
    }
  }

  async isClean(): Promise<boolean> {
    await this.initialization

    const gitApi = await this.gitApi
    return gitApi.repositories.some(
      (repo) =>
        repo.state.indexChanges.length === 0 &&
        repo.state.mergeChanges.length === 0
    )
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose())
    this.repoForUri.forEach((repository) =>
      repository.disposableChangeListener.dispose()
    )
  }
}
