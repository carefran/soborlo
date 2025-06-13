import * as core from '@actions/core'
import { getActionConfig, parseRepositoryInfo, logConfig } from './services/action-config'
import { getEventContext, fetchItemsBasedOnEvent, getItemsSyncMessage } from './services/event-handler'
import { syncAllItemsToNotion } from './services/sync-processor'
import { getErrorMessage } from './utils/error-handler'
import { logger } from './utils/logger'

async function main(): Promise<void> {
  try {
    // 設定を取得・検証
    const config = getActionConfig()
    const repositoryInfo = parseRepositoryInfo(config.repo)
    const eventContext = getEventContext()

    // 設定をログ出力
    logConfig(config)

    // イベントタイプに基づいてアイテムを取得
    const items = await fetchItemsBasedOnEvent(eventContext, repositoryInfo, config)
    
    // 取得結果をログ出力
    logger.info(getItemsSyncMessage(items, eventContext))

    // 全アイテムを処理
    await syncAllItemsToNotion(items, repositoryInfo, config)

    logger.info('Sync completed successfully')
  } catch (error) {
    const errorMessage = getErrorMessage(error)
    logger.error('Error in main:', errorMessage)
    core.setFailed(errorMessage)
    process.exit(1)
  }
}

main().catch(error => {
  logger.error('Unhandled error:', getErrorMessage(error))
  process.exit(1)
}) 