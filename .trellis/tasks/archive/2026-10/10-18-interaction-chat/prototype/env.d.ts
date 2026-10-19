declare module '*.css'
declare module '*.svg' {
  const url: string
  export default url
}
declare module '*.svg?raw' {
  const svg: string
  export default svg
}
declare module '*.txt?raw' {
  const text: string
  export default text
}
