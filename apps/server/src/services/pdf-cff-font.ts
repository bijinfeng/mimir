/** Narrow adapter for @pdf-lib/fontkit 1.1.1's CID CFF subset FD selection. */
type FontDict = { FontName?: unknown; Private?: { Subrs?: unknown[] } }
type CffSubset = {
  cff: {
    isCIDFont: boolean
    fdForGlyph(gid: number): number | null
    topDict: { FDArray: FontDict[] }
  }
  glyphs: number[]
  font: { getGlyph(gid: number): { path: unknown; _usedSubrs: Record<string, boolean> } }
  subsetSubrs(subrs: unknown[], used: Record<string, boolean>): unknown[]
  subsetFontdict(top: { FDArray: FontDict[]; FDSelect: { version: number; fds: number[] } }): void
}

export function fixCffSubsetFontDict(value: unknown): void {
  const subset = value as Partial<CffSubset>
  if (!subset.cff?.isCIDFont || typeof subset.subsetFontdict !== 'function') return
  const source = subset as CffSubset
  // Upstream tracks only whether an FD was used, then assigns every subsequent
  // glyph to the last FD. A CID font with interleaved FD runs therefore loses
  // outlines/subroutines. Keep original FD -> subset FD and used subrs per FD.
  source.subsetFontdict = (top) => {
    const mapping = new Map<number, number>(),
      dictionaries: FontDict[] = [],
      used: Record<string, boolean>[] = [],
      fds: number[] = []
    for (const gid of source.glyphs) {
      const original = source.cff.fdForGlyph(gid)
      if (original === null) throw new Error('PDF 字体字形缺少 FD 映射')
      let index = mapping.get(original)
      if (index === undefined) {
        index = dictionaries.length
        const dictionary = source.cff.topDict.FDArray[original]
        if (!dictionary) throw new Error('PDF 字体 FD 数据缺失')
        dictionaries.push({ ...dictionary })
        used.push({})
        mapping.set(original, index)
      }
      fds.push(index)
      const glyph = source.font.getGlyph(gid)
      // Parsing the outline populates its local-subroutine dependencies.
      void glyph.path
      Object.assign(used[index]!, glyph['_usedSubrs'])
    }
    dictionaries.forEach((dictionary, index) => {
      delete dictionary.FontName
      if (dictionary.Private?.Subrs)
        dictionary.Private = {
          ...dictionary.Private,
          Subrs: source.subsetSubrs(dictionary.Private.Subrs, used[index]!),
        }
    })
    top.FDArray = dictionaries
    top.FDSelect = { version: 0, fds }
  }
}
