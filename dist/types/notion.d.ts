export interface NotionPage {
    id: string;
    properties: NotionProperties;
}
export interface NotionProperties {
    Name: {
        title: Array<{
            text: {
                content: string;
            };
        }>;
    };
    ID: {
        number: number;
    };
    Number: {
        number: number;
    };
    State: {
        select: {
            name: 'Open' | 'Closed';
        };
    };
    Labels: {
        multi_select: Array<{
            name: string;
        }>;
    };
    URL: {
        url: string;
    };
    Status?: {
        status: {
            name: string;
        };
    };
    Type: {
        select: {
            name: 'Issue' | 'Pull Request';
        };
    };
    Draft?: {
        checkbox: boolean;
    };
    Merged?: {
        checkbox: boolean;
    };
    'Base Branch'?: {
        rich_text: Array<{
            text: {
                content: string;
            };
        }>;
    };
    'Head Branch'?: {
        rich_text: Array<{
            text: {
                content: string;
            };
        }>;
    };
    Additions?: {
        number: number;
    };
    Deletions?: {
        number: number;
    };
    'Changed Files'?: {
        number: number;
    };
    Assignees?: {
        multi_select: Array<{
            name: string;
        }>;
    };
    Milestone?: {
        rich_text: Array<{
            text: {
                content: string;
            };
        }>;
    };
}
export interface NotionPageData {
    parent?: {
        database_id: string;
    };
    icon?: {
        emoji: string;
    };
    properties: NotionProperties;
    children?: any[];
}
