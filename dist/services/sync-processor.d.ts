import { GitHubItem } from '../types/github';
import { RepositoryInfo, ActionConfig } from '../types/action';
export declare function syncGitHubItemToNotion(item: GitHubItem, repositoryInfo: RepositoryInfo, config: ActionConfig): Promise<void>;
export declare function syncAllItemsToNotion(items: GitHubItem[], repositoryInfo: RepositoryInfo, config: ActionConfig): Promise<void>;
