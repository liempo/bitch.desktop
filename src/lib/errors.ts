export function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
