import type { ChildProcess, ExecException, ExecOptions } from 'child_process'
import * as url from 'url'
import { GitClientService } from './git-client-service'

async function runShell(
  command: string,
  options: ExecOptions,
  callback?: (
    error: ExecException | null,
    stdout: string,
    stderr: string
  ) => void
): Promise<ChildProcess> {
  const childProcess = await import('child_process')

  return childProcess.exec(command, options, callback)
}

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
  callback: (
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
  path: string
  version: string | undefined
}> {
  return new Promise((resolve, reject) =>
    runShell('set -e; f=`command -v code || command -v codium`; echo $f; $f -v',
      (error, stdout, stderr) => {
        if (error) {
          resolve({ inPath: false, path: "", version: undefined })
          return
        }
        resolve({
          inPath: true,
          path: stdout.split('\n')[0].trim(),
          version: stdout.split('\n')[1].trim(),
        })
      }
    )
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

async function startGitCodeWait(folder: string, amend: boolean, codeExePath: string): Promise<string> {
  const args = ['-c', `core.editor="${codeExePath} --wait"`, 'commit']
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
  public readonly commandAlternate = 'commitPro.editor.command.openEditorAmend'

  constructor(private readonly gitClientService: GitClientService) { }

  public async run(gitUris: string[], options?: { amend?: boolean }): Promise<void> {
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

    const amend = options?.amend ?? await this.gitClientService.isClean()

    try {
      const resultMessage = await startGitCodeWait(folder, amend, codeExecutive.path)
      console.log({ resultMessage })
    } catch (err) {
      console.error({ err })
      // TODO: notification
    }
  }
}
