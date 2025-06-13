import { ActionConfig, RepositoryInfo } from '../types/action';
export declare function getActionConfig(): ActionConfig;
export declare function parseRepositoryInfo(repo: string): RepositoryInfo;
export declare function logConfig(config: ActionConfig): void;
