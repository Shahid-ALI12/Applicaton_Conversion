export type LicenseState = 'trial' | 'active' | 'expiring' | 'expired' | 'tampered';
export interface LicenseStatus {
    state: LicenseState;
    machine_id: string;
    licensed_until: string | null;
    days_left: number;
    trial: boolean;
    message: string;
    customer_name: string | null;
}
export declare const machineId: string;
export declare function licenseStatus(force?: boolean): LicenseStatus;
export declare function activateLicense(code: string): LicenseStatus;
export declare class LicenseError extends Error {
}
