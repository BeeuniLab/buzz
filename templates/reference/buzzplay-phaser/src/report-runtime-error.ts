type ErrorPayload = {
	message: string;
	stack?: string;
	url: string;
	timestamp: string;
	source?: string;
	line?: number;
	column?: number;
	reason?: unknown;
};

function postClientError(payload: ErrorPayload): void {
	fetch("/api/client-errors", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	}).catch(() => {
		// Avoid recursive reporting if the error endpoint is unavailable.
	});
}

window.addEventListener("error", (event) => {
	postClientError({
		message: event.message || "Unknown client error",
		stack: event.error instanceof Error ? event.error.stack : undefined,
		url: window.location.href,
		timestamp: new Date().toISOString(),
		source: event.filename,
		line: event.lineno,
		column: event.colno,
	});
});

window.addEventListener("unhandledrejection", (event) => {
	const reason = event.reason;
	postClientError({
		message: reason instanceof Error ? reason.message : "Unhandled promise rejection",
		stack: reason instanceof Error ? reason.stack : undefined,
		url: window.location.href,
		timestamp: new Date().toISOString(),
		reason,
	});
});
