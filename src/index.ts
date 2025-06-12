import * as core from '@actions/core'
import { getActionConfig, parseRepositoryInfo, logConfig } from './services/action-config'
import { getEventContext, fetchItemsBasedOnEvent, getItemsSyncMessage } from './services/event-handler'
import { processAllItems } from './services/sync-processor'
import { getErrorMessage } from './utils/error-handler'

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
    console.log(getItemsSyncMessage(items, eventContext, config))

    // 全アイテムを処理
    await processAllItems(items, repositoryInfo, config)

    console.log('Sync completed successfully')
  } catch (error) {
    const errorMessage = getErrorMessage(error)
    console.error('Error in main:', errorMessage)
    core.setFailed(errorMessage)
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Unhandled error:', getErrorMessage(error))
  process.exit(1)
}) 