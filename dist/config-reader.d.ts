export interface ConfigCounts {
    claudeMdCount: number;
    rulesCount: number;
    mcpCount: number;
    hooksCount: number;
}
export declare function countConfigs(cwd?: string): Promise<ConfigCounts>;
export declare function readThinkingEnabled(): boolean;
//# sourceMappingURL=config-reader.d.ts.map