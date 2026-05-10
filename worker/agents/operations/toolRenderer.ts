export interface ToolCallStatusArgs {
    name: string;
    status: 'start' | 'success' | 'error';
    args?: Record<string, unknown>;
    result?: string;
}

export type RenderToolCall = (args: ToolCallStatusArgs) => void;
