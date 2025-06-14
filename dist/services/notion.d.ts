import { GitHubItem } from '../types/github';
import { NotionPage, NotionPageData } from '../types/notion';
export declare function findExistingNotionPage(item: GitHubItem, notionToken: string, notionDatabaseId: string): Promise<NotionPage | null>;
export declare function createNotionPageData(item: GitHubItem, notionDatabaseId: string, isUpdate?: boolean, productName?: string): NotionPageData;
export declare function setNotionPageId(pageId: string, githubId: string, notionToken: string): Promise<void>;
export declare function createNotionPage(pageData: NotionPageData, notionToken: string): Promise<NotionPage>;
export declare function updateNotionPage(pageId: string, pageData: NotionPageData, notionToken: string): Promise<NotionPage>;
export declare function updateNotionPageStatus(pageId: string, statusName: string, notionToken: string): Promise<void>;
export declare function mapGitHubStatusToNotion(githubStatus: string): string;
