import { Disposable } from 'vscode-languageclient'
import { workspace } from 'vscode'
import * as path from 'path'

type Workspace = typeof workspace

export class WorkspaceClientService implements Disposable {
  constructor(private workspace: Workspace) {}

  async init() {}

  async getNodeProjectsForGlob(
    glob: string
  ): Promise<{ label: string; origin: string; type: string }[]> {
    await this.init()

    const uris = await workspace.findFiles(glob)

    return uris.map((uri) => ({
      label: path.basename(path.dirname(uri.fsPath)),
      origin: 'root-package-json-workspaces',
      type: 'package-json-workspaces-glob-resolved',
    }))
  }

  async getRootPackageJsonWorkspaces(): Promise<
    { label: string; origin: string; type: string }[]
  > {
    await this.init()

    console.log('find packagejson suggestions')

    const uris = await workspace.findFiles('package.json')

    console.log(`found ${uris.length} packagejson suggestions`)
    if (uris.length !== 1) {
      return []
    }
    const uri = uris[0]
    const contentUint8Array = await workspace.fs.readFile(uri)
    const content = contentUint8Array.toString()
    const packageJson = JSON.parse(content)
    const workspaces = packageJson.workspaces ?? ([] as string[])

    const results: { label: string; origin: string; type: string }[] = []
    for (const workspace of workspaces) {
      console.log(`processing ${workspace} packagejson suggestions`)
      if (workspace.endsWith('/*')) {
        // resolve wildcards - e. g. 'packages/*' to 'package-a', 'package-b'
        const nodeProjects = await this.getNodeProjectsForGlob(
          `${workspace}/package.json`
        )
        results.push(...nodeProjects)
      } else {
        results.push({
          label: workspace,
          origin: 'root-package-json-workspaces',
          type: 'package-json-workspaces-hardcoded',
        })
      }
    }

    return results
  }

  async getRootLernaJsonWorkspaces(): Promise<
    { label: string; origin: string; type: string }[]
  > {
    await this.init()

    const uris = await workspace.findFiles('package.json')

    if (uris.length === 1) {
      const uri = uris[0]
      const contentUint8Array = await workspace.fs.readFile(uri)
      const content = contentUint8Array.toString()
      const packageJson = JSON.parse(content)
      const workspaces = packageJson.workspaces
      return workspaces.flatMap((workspace) => {
        if (workspace.endsWith('/*')) {
          // resolve wildcards - e. g. 'packages/*' to 'package-a', 'package-b'
          return []
        }

        return [
          {
            label: workspace,
            origin: 'Root package.json field "workspaces"',
            type: 'package-json-workspaces',
          },
        ]
      })
    }

    return []
  }

  async getScopeSuggestions(): Promise<
    { label: string; origin: string; type: string }[]
  > {
    await this.init()

    console.log('get scope suggestions')

    const results = await Promise.all([this.getRootPackageJsonWorkspaces()])

    return results.flat()
  }

  dispose(): void {}
}
