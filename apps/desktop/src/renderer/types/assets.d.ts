// Vite ?url import suffix type declarations
declare module '*?url' {
    const url: string
    export default url
}

declare module '*.wasm?url' {
    const url: string
    export default url
}
