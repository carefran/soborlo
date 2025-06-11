import { GitHubIssue, GitHubPullRequest, GitHubItem } from '../types/github';
export declare function getIssues(repo: string, githubToken?: string): Promise<GitHubIssue[]>;
export declare function getPullRequests(repo: string, githubToken?: string): Promise<GitHubPullRequest[]>;
export declare function getIssuesAndPullRequests(repo: string, includePullRequests: boolean, githubToken?: string): Promise<GitHubItem[]>;
export declare function getProjectStatus(owner: string, repo: string, issueNumber: number, githubToken: string): Promise<string | null>;
export declare function updateProjectStatus(owner: string, repo: string, issueNumber: number, statusName: string, githubToken: string): Promise<boolean>;
