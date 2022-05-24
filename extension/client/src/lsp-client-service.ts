import { EventEmitter } from 'stream'
import { Disposable } from 'vscode-languageclient'
import { ServerNotifications } from './extension'

export interface HistoryScope {
  scope: string
  count: number
  lastUsed: string
}

export class LspClientService implements Disposable {
  private readonly notificationsEventEmitter = new EventEmitter()

  private readonly disposables: Disposable[] = []

  constructor(private readonly notifications: ServerNotifications) {}

  init() {
    this.disposables.push(
      this.notifications.onNotification(
        'gitCommit/scopeHistorySuggestions',
        (event: { scopes: HistoryScope[] }) => {
          this.notificationsEventEmitter.emit(
            'gitCommit/scopeHistorySuggestions',
            event
          )
        }
      )
    )
  }

  async requestHistoryScopes(): Promise<HistoryScope[]> {
    this.notifications.sendNotification(
      'gitCommit/requestScopeHistorySuggestions'
    )

    return new Promise((resolve, reject) => {
      this.notificationsEventEmitter.once(
        'gitCommit/scopeHistorySuggestions',
        (scopes: HistoryScope[]) => resolve(scopes)
      )
    })
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose())
    this.notificationsEventEmitter.removeAllListeners()
  }
}
