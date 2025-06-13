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
    ID?: {
        rich_text: Array<{
            text: {
                content: string;
            };
        }>;
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
    Product?: {
        select: {
            name: string;
        };
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
