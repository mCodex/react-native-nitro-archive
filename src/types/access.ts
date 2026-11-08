/**
 * Access requested by preflight. create-children checks a directory intended to receive new entries.
 */
export type ArchiveAccessMode = "read" | "write" | "create-children";

/**
 * Suggested recovery for your app to present. The library never launches a picker or permission prompt.
 */
export type ArchiveRecoveryAction =
	| "none"
	| "choose-document"
	| "choose-directory"
	| "reselect-document"
	| "grant-read-access"
	| "grant-write-access"
	| "download-from-provider"
	| "move-into-app-storage"
	| "use-content-uri";

/**
 * Advisory access snapshot. Grants, storage and provider state can change before an operation starts.
 */
export interface ArchiveAccessReport {
	/**
	 * Native platform that produced this report.
	 */
	readonly platform: "ios" | "android";
	/**
	 * Access mode being inspected.
	 */
	readonly mode: ArchiveAccessMode;
	/**
	 * Whether the requested mode passed this advisory access check.
	 */
	readonly accessible: boolean;
	/**
	 * Whether read access was observed.
	 */
	readonly readable: boolean;
	/**
	 * Whether write access was observed.
	 */
	readonly writable: boolean;
	/**
	 * Whether access is reported as persistent; external grants can still be revoked.
	 */
	readonly persistent: boolean;
	/**
	 * Whether iOS security-scoped access applies to this target.
	 */
	readonly securityScoped: boolean;
	/**
	 * Whether a document provider owns access to the target.
	 */
	readonly providerBacked: boolean;
	/**
	 * Whether random access is available; omitted if unknown.
	 */
	readonly seekable?: boolean;
	/**
	 * Permissions reported by preflight. The library does not request them automatically.
	 */
	readonly requiredManifestPermissions: readonly string[];
	/**
	 * Suggested recovery for your app to handle explicitly.
	 */
	readonly recoveryAction: ArchiveRecoveryAction;
	/**
	 * Optional diagnostic explanation of the access result.
	 */
	readonly reason?: string;
}
