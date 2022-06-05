declare module 'similarity' {
  function similarity(
    string1: string,
    string2: string,
    options?: { sensitive?: boolean }
  ): number

  export = similarity
}
