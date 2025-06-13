export declare class SyncError extends Error {
    readonly itemType: string;
    readonly itemNumber: number;
    readonly cause?: Error | undefined;
    constructor(message: string, itemType: string, itemNumber: number, cause?: Error | undefined);
}
export declare class ConfigurationError extends Error {
    readonly field: string;
    constructor(message: string, field: string);
}
export declare function getErrorMessage(error: unknown): string;
export declare function createSyncError(itemType: string, itemNumber: number, originalError: unknown): SyncError;
