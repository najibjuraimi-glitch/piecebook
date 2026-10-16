/** Node builtins used only in Vitest fixture loaders. App tsconfig does not include @types/node. */
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array
}

declare module 'node:path' {
  export function dirname(p: string): string
  export function join(...parts: string[]): string
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string
}
