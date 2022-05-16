import type { ChildProcess, ExecException, ExecOptions } from 'child_process'
import * as url from 'url'
import { Disposable } from 'vscode-languageclient'
import { GitClientService } from './git-client-service'

async function runWithShell(
  command: string,
  args: ReadonlyArray<string>,
  options: ExecOptions,
  callback?: (
    error: ExecException | null,
    stdout: string,
    stderr: string
  ) => void
): Promise<ChildProcess> {
  const childProcess = await import('child_process')

  const fullCommand = [command, ...args].join(' ')

  return childProcess.exec(fullCommand, options, callback)
}

async function runWithoutShell(
  command: string,
  args: ReadonlyArray<string>,
  callback?: (
    error: ExecException | null,
    stdout: string,
    stderr: string
  ) => void
): Promise<ChildProcess> {
  const childProcess = await import('child_process')

  return childProcess.execFile(command, args, callback)
}

async function getCodeExecutive(): Promise<{
  inPath: boolean
  version: string | undefined
}> {
  return new Promise((resolve, reject) =>
    runWithoutShell('code', ['-v'], (error, stdout, stderr) => {
      if (error) {
        resolve({ inPath: false, version: undefined })
        return
      }
      resolve({
        inPath: true,
        // example output: "1.42.1\ndfd34e8260c270da74b5c2d86d61aee4b6d56977\nx64"
        version: stdout.split('\n')[0].trim(),
      })
    })
  )
}

async function getGitExecutive(): Promise<{
  inPath: boolean
  version: string | undefined
}> {
  return new Promise((resolve, reject) =>
    runWithoutShell('git', ['--version'], (error, stdout, stderr) => {
      if (error) {
        resolve({ inPath: false, version: undefined })
        return
      }
      resolve({
        inPath: true,
        // example output: "git version 1.42.1"
        version: stdout.slice('git version '.length).trim(),
      })
    })
  )
}

async function startGitCodeWait(folder: string, amend: boolean): Promise<string> {
  const args = ['-c', 'core.editor="code --wait"', 'commit']
  if (amend) {
    args.push('--amend')
  }
  return new Promise((resolve, reject) =>
    runWithShell(
      'git',
      args,
      { cwd: folder },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr))
          return
        }
        resolve(stdout)
      }
    )
  )
}

export class OpenEditorCommand {
  public readonly command = 'commitPro.editor.command.openEditor'

  constructor(private readonly gitClientService: GitClientService) {}

  public async run(gitUris: string[]): Promise<void> {
    const [gitExecutive, codeExecutive] = await Promise.all([
      getGitExecutive(),
      getCodeExecutive(),
    ])

    if (!gitExecutive.inPath) {
      // TODO notification
    }
    if (!codeExecutive.inPath) {
      // TODO notification
    }

    if (!gitExecutive.inPath || !codeExecutive.inPath) {
      return
    }

    const folder = url.fileURLToPath(gitUris[0])

    const gitIsClean = await this.gitClientService.isClean()
    const amend = gitIsClean

    try {
      const resultMessage = await startGitCodeWait(folder, amend)
      console.log({ resultMessage })
    } catch (err) {
      console.error({ err })
      // TODO: notification
    }
  }
}
