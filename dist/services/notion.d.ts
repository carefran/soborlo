import { GitHubItem } from '../types/github';
import { NotionPage, NotionPageData } from '../types/notion';
export declare function findExistingNotionPage(itemId: number, notionToken: string, notionDatabaseId: string): Promise<NotionPage | null>;
export declare function createNotionPageData(item: GitHubItem, notionDatabaseId: string, isUpdate?: boolean): NotionPageData;
export declare function createNotionPage(pageData: NotionPageData, notionToken: string): Promise<NotionPage>;
export declare function updateNotionPage(pageId: string, pageData: NotionPageData, notionToken: string): Promise<NotionPage>;
export declare function updateNotionPageStatus(pageId: string, statusName: string, notionToken: string): Promise<void>;
export declare function mapGitHubStatusToNotion(githubStatus: string): string;
