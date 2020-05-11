import { Root, isAbapFile, AbapFile, isAbapStat } from "abapfs"
import { cache, log } from "../../lib"
import { getRoot } from "../conections"
import { MainInclude } from "abap-adt-api"
import { PACKAGE, AbapObject } from "abapobject"

export interface IncludeData {
  current: MainInclude | undefined
  includeUri: string
  candidates: MainInclude[]
}

const only = (c: MainInclude[]) => (c.length === 1 && c[0]) || undefined

export class IncludeService {
  public static get(connId: string) {
    return this.services.get(connId)
  }

  private static services = cache(
    (connId: string) => new IncludeService(getRoot(connId))
  )

  private includes = new Map<string, IncludeData | false>()
  private constructor(private root: Root) {}

  current(vsPath: string) {
    const data = this.includes.get(vsPath)
    return (data && data.current) || undefined
  }

  needMain(obj: AbapObject) {
    return obj.type === "PROG/I"
  }

  includeData(vsPath: string) {
    return this.includes.get(vsPath) || undefined
  }

  mainName(main: MainInclude) {
    return decodeURIComponent(main["adtcore:name"].replace(/.*\//, ""))
  }

  setInclude(vsPath: string, main: MainInclude) {
    const data = this.includes.get(vsPath)
    if (data) data.current = main
    else log(`Can't set main program for path ${vsPath}`)
  }

  /** guesses the parent. Assumes the system already saw the include */
  guessParent(vsPath: string): MainInclude | undefined {
    const data = this.includeData(vsPath)
    if (data?.candidates.length === 1) return data.candidates[0]
    const dad = this.root
      .getNodePath(vsPath)
      .slice(1)
      .map(p => p.file)
      .find(isAbapStat)
    if (!dad || dad.object.type === PACKAGE) return
    const main = data?.candidates.find(
      c => c["adtcore:uri"] === dad.object.path
    )
    if (main) return main
    const { name, type, path } = dad.object
    if (dad)
      return { "adtcore:name": name, "adtcore:type": type, "adtcore:uri": path }
  }

  async candidates(vsPath: string, refresh = false) {
    const data = this.includes.get(vsPath)
    if (data === false) return []
    if (data && !refresh) return data.candidates

    const file = await this.root.getNodeAsync(vsPath)
    if (isAbapFile(file))
      if (this.needMain(file.object)) {
        const candidates = await file.object.mainPrograms()
        const current = data?.current || only(candidates)
        const includeUri = file.object.path
        this.includes.set(vsPath, { candidates, current, includeUri })
        return candidates
      } else this.includes.set(vsPath, false)

    return []
  }
}
