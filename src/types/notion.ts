export interface NotionPage {
  id: string
  properties: NotionProperties
}

export interface NotionProperties {
  Name: {
    title: Array<{
      text: {
        content: string
      }
    }>
  }
  ID: {
    number: number
  }
  Number: {
    number: number
  }
  State: {
    select: {
      name: 'Open' | 'Closed'
    }
  }
  Labels: {
    multi_select: Array<{
      name: string
    }>
  }
  URL: {
    url: string
  }
  Status?: {
    status: {
      name: string
    }
  }
  Type: {
    select: {
      name: 'Issue' | 'Pull Request'
    }
  }
}

export interface NotionPageData {
  parent?: {
    database_id: string
  }
  icon?: {
    emoji: string
  }
  properties: NotionProperties
  children?: any[] // markdownToBlocksの戻り値の型
} 