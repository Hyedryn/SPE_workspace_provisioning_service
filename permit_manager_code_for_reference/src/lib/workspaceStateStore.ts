type WorkspaceState = {
  status: string
  connection: Record<string, unknown> | null
}

class WorkspaceStateStore {
  private inMemory: Map<string, WorkspaceState>

  constructor() {
    this.inMemory = new Map()
  }

  async set(permitId: string, state: WorkspaceState): Promise<void> {
    this.inMemory.set(permitId, state)
  }

  async get(permitId: string): Promise<WorkspaceState | null> {
    return this.inMemory.get(permitId) ?? null
  }

  // Placeholder for potential future storage engines (e.g. Redis) without
  // leaking the underlying storage implementation to consumers.
}

const store = new WorkspaceStateStore()
export default store
export type { WorkspaceState }
