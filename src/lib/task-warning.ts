const TASK_BUSY_PATTERNS = [
	'already have 2 tasks running',
	'another task is still running',
	'a task is still running',
	'current task to finish',
];

export function isTaskBusyWarning(message: string | undefined | null): boolean {
	if (!message) return false;
	const normalized = message.toLowerCase();
	return TASK_BUSY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function getTaskBusyWarningTitle(message: string | undefined | null): string {
	return isTaskBusyWarning(message) && message?.includes('2 tasks')
		? 'Task limit reached'
		: 'Task already running';
}
