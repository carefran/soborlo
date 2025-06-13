/**
 * Retry utility with exponential backoff for handling transient errors
 * Optimized for GitHub Actions to minimize execution time usage
 */

import { logger } from './logger'

interface RetryOptions {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  retryableStatuses?: number[]
}

// Optimized for GitHub Actions execution time limits
// Total worst-case delay: 500ms + 1000ms = 1.5s per operation
const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 2,        // Maximum 2 retries (3 total attempts)
  baseDelay: 500,       // Start with 500ms delay
  maxDelay: 2000,       // Cap at 2 seconds
  retryableStatuses: [409, 429, 500, 502, 503, 504],
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: unknown

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        logger.debug(`🔄 Retry attempt ${attempt}/${opts.maxRetries}`)
      }
      
      const result = await operation()
      
      if (attempt > 0) {
        logger.info(`✅ Operation succeeded on retry attempt ${attempt}`)
      }
      
      return result
    } catch (error: unknown) {
      lastError = error

      if (attempt === opts.maxRetries) {
        logger.error(`❌ Operation failed after ${opts.maxRetries + 1} attempts`)
        break
      }

      const errorWithResponse = error as { response?: { status?: number } }
      const status = errorWithResponse.response?.status
      const isRetryableError = status && opts.retryableStatuses?.includes(status)
      
      if (!isRetryableError) {
        logger.debug(`❌ Non-retryable error (status: ${status}), aborting`)
        throw error
      }

      const delay = Math.min(opts.baseDelay * Math.pow(2, attempt), opts.maxDelay)
      logger.warn(`⚠️ Attempt ${attempt + 1} failed with status ${status}, retrying in ${delay}ms...`)
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}