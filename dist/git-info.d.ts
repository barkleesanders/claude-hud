export interface GitInfo {
    branch: string;
    dirty: boolean;
}
export declare function getGitInfo(cwd?: string): GitInfo | null;
//# sourceMappingURL=git-info.d.ts.map