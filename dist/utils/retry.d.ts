/**
 * Retry utility with exponential backoff for handling transient errors
 * Optimized for GitHub Actions to minimize execution time usage
 */
interface RetryOptions {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    retryableStatuses?: number[];
}
export declare function retryWithBackoff<T>(operation: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>;
export {};
