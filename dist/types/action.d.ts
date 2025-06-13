export interface ActionConfig {
    repo: string;
    notionToken: string;
    notionDatabaseId: string;
    githubToken?: string;
    includePullRequests: boolean;
    projectName?: string;
}
export interface RepositoryInfo {
    owner: string;
    repoName: string;
}
export declare enum EventType {
    SCHEDULE = "schedule",
    WORKFLOW_DISPATCH = "workflow_dispatch",
    ISSUES = "issues",
    PULL_REQUEST = "pull_request"
}
export interface EventContext {
    eventName: string;
    eventType: EventType | null;
    issueNumber?: number;
    pullRequestNumber?: number;
}
