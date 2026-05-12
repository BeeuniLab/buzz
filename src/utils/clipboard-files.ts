export function getClipboardFiles(
	clipboardData: DataTransfer | null,
	acceptedMimeTypes?: readonly string[],
): File[] {
	if (!clipboardData) return [];

	const accepted = acceptedMimeTypes && acceptedMimeTypes.length > 0
		? new Set(acceptedMimeTypes)
		: null;
	const files: File[] = [];
	const seen = new Set<string>();

	const addFile = (file: File | null) => {
		if (!file) return;
		if (accepted && !accepted.has(file.type)) return;

		const key = `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
		if (seen.has(key)) return;

		seen.add(key);
		files.push(file);
	};

	for (const item of Array.from(clipboardData.items || [])) {
		if (item.kind === 'file') {
			addFile(item.getAsFile());
		}
	}

	for (const file of Array.from(clipboardData.files || [])) {
		addFile(file);
	}

	return files;
}
