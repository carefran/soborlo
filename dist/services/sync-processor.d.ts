import { GitHubItem } from '../types/github';
import { RepositoryInfo, ActionConfig } from '../types/action';
export declare function processSingleItem(item: GitHubItem, repositoryInfo: RepositoryInfo, config: ActionConfig): Promise<void>;
export declare function processAllItems(items: GitHubItem[], repositoryInfo: RepositoryInfo, config: ActionConfig): Promise<void>;
