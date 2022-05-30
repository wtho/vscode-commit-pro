import { describe, test, expect, beforeEach } from 'vitest'
import { OpenEditorCommand } from './command-open-editor'
import { GitClientService } from './git-client-service'

describe('command-open-editor', () => {
  let gitClientService: GitClientService
  beforeEach(() => {
    const gitClientServiceMock = {}
    gitClientService = gitClientServiceMock as unknown as GitClientService
  })
  test('should instantiate command', () => {
    const command = new OpenEditorCommand(gitClientService)
    expect(command).toBeTruthy()
  })
})
