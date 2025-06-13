import { EventType, EventContext } from '../types/action';
import { GitHubItem } from '../types/github';
import { RepositoryInfo, ActionConfig } from '../types/action';
export declare function getEventContext(): EventContext;
export declare function isScheduledOrManualEvent(eventType: EventType | null): boolean;
export declare function fetchItemsBasedOnEvent(eventContext: EventContext, repositoryInfo: RepositoryInfo, config: ActionConfig): Promise<GitHubItem[]>;
export declare function getItemsSyncMessage(items: GitHubItem[], eventContext: EventContext): string;
