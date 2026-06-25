import { useSyncExternalStore } from "react";
import type { ArchiveTask, ArchiveTaskState } from "../types/task";

export function useArchiveTaskState(
	task: ArchiveTask<unknown> | undefined,
): ArchiveTaskState | undefined {
	const subscribe = (onStoreChange: () => void) => {
		if (!task) return () => {};
		const unsubscribe = task.onProgress(onStoreChange);
		return unsubscribe;
	};
	const getSnapshot = () => task?.state;
	const getServerSnapshot = () => undefined;
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
