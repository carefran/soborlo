import { GitHubIssue, GitHubPullRequest, GitHubItem } from '../types/github';
export declare function getIssues(repo: string, githubToken?: string, since?: string): Promise<GitHubIssue[]>;
export declare function getPullRequests(repo: string, githubToken?: string, since?: string): Promise<GitHubPullRequest[]>;
export declare function getIssuesAndPullRequests(repo: string, includePullRequests: boolean, githubToken?: string, since?: string): Promise<GitHubItem[]>;
export declare function getProjectStatus(owner: string, repo: string, issueNumber: number, githubToken: string): Promise<string | null>;
export declare function getIssueState(owner: string, repo: string, issueNumber: number, githubToken?: string): Promise<string | null>;
export declare function getPullRequestDetails(owner: string, repo: string, prNumber: number, githubToken?: string): Promise<{
    state: string;
    merged: boolean;
    draft: boolean;
} | null>;
export declare function updateProjectStatus(owner: string, repo: string, issueNumber: number, statusName: string, githubToken: string): Promise<boolean>;
