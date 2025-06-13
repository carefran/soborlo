export class SyncError extends Error {
  constructor(
    message: string,
    public readonly itemType: string,
    public readonly itemNumber: number,
    public readonly cause?: Error,
  ) {
    super(message)
    this.name = 'SyncError'
  }
}

export class ConfigurationError extends Error {
  constructor(message: string, public readonly field: string) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createSyncError(
  itemType: string,
  itemNumber: number,
  originalError: unknown,
): SyncError {
  const message = `Failed to sync ${itemType} #${itemNumber}`
  const cause = originalError instanceof Error ? originalError : undefined
  return new SyncError(message, itemType, itemNumber, cause)
}