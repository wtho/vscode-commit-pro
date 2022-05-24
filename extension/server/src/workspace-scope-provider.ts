import { EventEmitter } from 'stream'
import { Disposable } from 'vscode-languageserver'
import { Notifications } from './server'

export interface WorkspaceScope {
  label: string
  origin: string
  type: string
}

export class WorkspaceScopeProvider implements Disposable {
  private readonly workspaceScopeEventTarget = new EventEmitter()

  private readonly disposables: Disposable[] = []

  constructor(private readonly notifications: Notifications) {
    this.disposables.push(
      notifications.onNotification(
        'gitCommit/scopeWorkspaceSuggestions',
        (scopes: WorkspaceScope[]) => {
          this.workspaceScopeEventTarget.emit(
            'gitCommit/scopeWorkspaceSuggestions',
            scopes
          )
        }
      )
    )
  }

  async requestScopes(): Promise<WorkspaceScope[]> {
    return new Promise<WorkspaceScope[]>((resolve, reject) => {
      // TODO: send id to identify request
      this.notifications.sendNotification(
        'gitCommit/requestScopeWorkspaceSuggestions'
      )
      this.workspaceScopeEventTarget.once(
        'gitCommit/scopeWorkspaceSuggestions',
        (scopes: WorkspaceScope[]) => resolve(scopes)
      )
    })
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose())
    this.workspaceScopeEventTarget.removeAllListeners()
  }
}
