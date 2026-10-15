export const PERSONAL_MEMORY_COMMAND = "personal-memory";
export function habitCountLabel(habits: number): string {
  return `${habits} ${habits === 1 ? "habit" : "habits"} loaded`;
}
export function memoryStatusLabel(
  enabled: boolean,
  total: number,
  habits: number,
  running = 0,
): string {
  return `Personal Memory ${enabled ? "On" : "Off"} · ${total} total · ${habitCountLabel(habits)}${running ? ` · ${running} extracting` : ""}`;
}
