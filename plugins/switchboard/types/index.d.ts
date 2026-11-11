declare module 'claude-code' {
  interface PluginState {
    switchboard: {
      /** Bumped after each change so the panel redraws with fresh values. */
      rev: number
      /** The last change's outcome, shown at the panel's foot. */
      note: string
      /** Plugins whose settings are expanded. */
      expanded: readonly string[]
    }
  }
}
export type SwitchboardNote = string
