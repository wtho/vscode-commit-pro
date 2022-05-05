import { EventEmitter, extensions } from 'vscode'
import type { Uri } from 'vscode'
import type { GitExtension, API as GitApi, Repository } from '../types/vscode.git'
import { URI } from 'vscode-languageclient/node';

const createResolvablePromise = <T>() => {
  type ResolvablePromise<T> = Promise<T> & { resolve: (arg: T) => void };
  let resolveFn: (arg: T) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
  }) as ResolvablePromise<T>

  promise.resolve = resolveFn

  return promise
}

export class GitClientService {

  private initialization = createResolvablePromise<void>()
  private gitExtension = createResolvablePromise<GitExtension>()
  private gitApi = createResolvablePromise<GitApi | undefined>()
  private repoUris = new EventEmitter<URI[]>()

  constructor() {
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

    gitApi?.onDidCloseRepository(repo => this.getRepoUris().then(uris => this.repoUris.fire(uris)))
    gitApi?.onDidOpenRepository(repo => this.getRepoUris().then(uris => this.repoUris.fire(uris)))

    this.initialization.resolve()
  }

  onDidChangeRepositories(listener: (uris: URI[]) => void) {
    return this.repoUris.event(listener)
  }

  async findLocalRepos(): Promise<Repository[]> {
    await this.initialization
    const gitApi = await this.gitApi
    if (!gitApi) {
      return[]
    }
    return gitApi.repositories
  }

  async getRepoUris(): Promise<URI[]> {
    await this.initialization

    const localRepos = await this.findLocalRepos()
    return localRepos.map(repo => repo.rootUri.toString())
  }

}
