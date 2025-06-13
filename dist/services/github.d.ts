import { GitHubIssue, GitHubPullRequest, GitHubItem } from '../types/github';
export declare function getIssuesAndPullRequests(repo: string, includePullRequests: boolean, githubToken?: string): Promise<GitHubItem[]>;
export declare function getProjectStatus(owner: string, repo: string, issueNumber: number, githubToken: string, projectName?: string): Promise<string | null>;
export declare function getProjectItems(owner: string, projectName?: string, githubToken?: string): Promise<GitHubItem[]>;
export declare function getSingleIssue(owner: string, repo: string, issueNumber: number, githubToken?: string): Promise<GitHubIssue | null>;
export declare function getSinglePullRequest(owner: string, repo: string, prNumber: number, githubToken?: string): Promise<GitHubPullRequest | null>;
