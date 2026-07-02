declare module 'node:child_process' {
  export function execFileSync(
    command: string,
    args?: string[],
    options?: { cwd?: string; encoding?: 'utf8'; env?: Record<string, string | undefined> }
  ): string
}

declare module 'node:fs' {
  export function existsSync(path: string): boolean
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
  export function mkdtempSync(prefix: string): string
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function rmSync(path: string, options?: { force?: boolean; recursive?: boolean }): void
  export function writeFileSync(path: string, data: string): void
}

declare module 'node:os' {
  export function tmpdir(): string
}

declare module 'node:path' {
  export function dirname(path: string): string
  export function join(...paths: string[]): string
  export function resolve(...paths: string[]): string
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string
}

declare const process: {
  cwd(): string
  env: Record<string, string | undefined>
  execPath: string
}
