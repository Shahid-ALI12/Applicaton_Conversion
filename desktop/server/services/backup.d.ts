export declare function startBackupScheduler(): void;
export declare function stopBackupScheduler(): void;
export declare function runBackup(): string;
export declare function listBackups(): {
    name: string;
    size: number;
    date: string;
}[];
