import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from 'react';
import { Loader, FileText, FileDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeExternalLinks from 'rehype-external-links';
import { DocsSidebar } from './docs-sidebar';
import { ExportButton } from './export-button';
import { exportMarkdownAsFile } from '@/utils/markdown-export';
import type { FileType } from '@/api-types';
import { useIsMobile } from '@/hooks/use-mobile';
import './markdown-docs-preview.css';

interface MarkdownDocsPreviewProps {
	files: FileType[];
	isGenerating: boolean;
}

export function MarkdownDocsPreview({
	files,
	isGenerating: _isGenerating,
}: MarkdownDocsPreviewProps) {
	const isMobile = useIsMobile();

	// Prioritize README as default, otherwise first file
	const defaultFile = useMemo(() => {
		const readmeFile = files.find((f) =>
			f.filePath.toLowerCase().includes('readme')
		);
		return readmeFile || files[0];
	}, [files]);

	const [activeFilePath, setActiveFilePath] = useState<string>(
		defaultFile?.filePath || ''
	);

	// Update active file if default changes
	useEffect(() => {
		if (defaultFile && !activeFilePath) {
			setActiveFilePath(defaultFile.filePath);
		}
	}, [defaultFile, activeFilePath]);

	const activeFile = files.find((f) => f.filePath === activeFilePath);

	// Ref for print export
	const contentRef = useRef<HTMLElement>(null);

	// Export handlers
	const handleExportMarkdown = useCallback(() => {
		if (!activeFile) return;
		const filename = activeFile.filePath.split('/').pop() || 'documentation.md';
		exportMarkdownAsFile(activeFile.fileContents || '', filename);
	}, [activeFile]);

	const handlePrint = useCallback(() => {
		window.print();
	}, []);

	// Extract table of contents from markdown headings
	const tableOfContents = useMemo(() => {
		if (!activeFile?.fileContents) return [];

		const headingRegex = /^(#{1,3})\s+(.+)$/gm;
		const headings: { level: number; text: string; id: string }[] = [];
		let match;

		while ((match = headingRegex.exec(activeFile.fileContents)) !== null) {
			const level = match[1].length;
			const text = match[2];
			const id = text
				.toLowerCase()
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '-');

			headings.push({ level, text, id });
		}

		return headings;
	}, [activeFile?.fileContents]);

	const handleFileSelect = (filePath: string) => {
		setActiveFilePath(filePath);
	};

	const markdownContent = useMemo(() => {
		if (!activeFile) return '';

		let content = activeFile.fileContents || '';

		// Add generating indicator if still streaming
		if (activeFile.isGenerating && content) {
			content += '\n\n_Generating..._';
		}

		return content;
	}, [activeFile]);

	const showMobileFileSelect = isMobile && files.length > 1;

	return (
		<div className="docs-markdown-layout flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
			{/* File tree: desktop only (mobile uses header select) */}
			<div className="docs-file-panel hidden md:flex md:w-52 lg:w-56 shrink-0 min-h-0 flex-col border-r border-border-primary bg-bg-2">
				<DocsSidebar
					files={files}
					activeFile={activeFilePath}
					onFileSelect={handleFileSelect}
				/>
			</div>

			{/* Main column: grows; min-w-0 so flex gives it the remaining width */}
			<div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
				<div className="flex items-center gap-2 md:gap-3 px-4 md:px-6 h-12 shrink-0 bg-bg-2 border-b border-border-primary">
					<div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
						{showMobileFileSelect ? (
							<select
								className="w-full min-w-0 text-xs bg-bg-1 border border-border-primary rounded-md px-2 py-1.5 text-text-primary"
								value={activeFilePath}
								onChange={(e) => handleFileSelect(e.target.value)}
								aria-label="Choose documentation file"
							>
								{files.map((f) => (
									<option key={f.filePath} value={f.filePath}>
										{f.filePath.split('/').pop() ?? f.filePath}
									</option>
								))}
							</select>
						) : (
							<span className="text-sm font-medium text-text-primary truncate">
								{activeFile?.filePath || 'Documentation'}
							</span>
						)}
						{activeFile?.isGenerating && (
							<div className="flex items-center gap-2 text-xs text-accent shrink-0">
								<Loader className="size-3 animate-spin" />
								<span className="hidden sm:inline">Generating...</span>
							</div>
						)}
					</div>

					<div className="flex items-center gap-2 export-button-container shrink-0">
						<ExportButton
							icon={FileText}
							onClick={handleExportMarkdown}
							tooltip="Download Markdown"
							disabled={!activeFile}
						/>
						<ExportButton
							icon={FileDown}
							onClick={handlePrint}
							tooltip="Print to PDF"
							disabled={!activeFile}
						/>
					</div>
				</div>

				<div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
					<div className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8">
						{!activeFile ? (
							<div className="flex flex-col items-center justify-center h-full gap-4 text-text-secondary">
								<p>No documentation file selected</p>
							</div>
						) : !markdownContent ? (
							<div className="flex flex-col items-center justify-center h-full gap-4 text-text-secondary">
								<Loader className="size-8 animate-spin text-accent" />
								<p>Waiting for content...</p>
							</div>
						) : (
							<article
								ref={contentRef}
								className="prose prose-sm prose-invert max-w-none w-full"
							>
								<ReactMarkdown
									remarkPlugins={[remarkGfm]}
									rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
									components={{
										h1: ({ node, ...props }) => (
											<h1 id={createId(props.children)} {...props} />
										),
										h2: ({ node, ...props }) => (
											<h2 id={createId(props.children)} {...props} />
										),
										h3: ({ node, ...props }) => (
											<h3 id={createId(props.children)} {...props} />
										),
									}}
								>
									{markdownContent}
								</ReactMarkdown>
							</article>
						)}
					</div>

					{/* TOC: large screens only — keeps the reading column wide */}
					{tableOfContents.length > 0 && (
						<aside className="docs-toc hidden xl:flex xl:w-48 2xl:w-52 shrink-0 flex-col border-l border-border-primary bg-bg-2 overflow-y-auto py-6 px-3 2xl:px-4">
							<h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 px-1">
								On This Page
							</h4>
							<nav className="px-1">
								<ul className="space-y-2">
									{tableOfContents.map((heading, idx) => (
										<li
											key={idx}
											style={{
												paddingLeft: `${(heading.level - 1) * 10}px`,
											}}
										>
											<a
												href={`#${heading.id}`}
												className="text-xs text-text-tertiary hover:text-text-primary transition-colors block break-words"
											>
												{heading.text}
											</a>
										</li>
									))}
								</ul>
							</nav>
						</aside>
					)}
				</div>
			</div>
		</div>
	);
}

/**
 * Create ID from heading text for anchor links
 */
function createId(children: ReactNode): string {
	const text = extractText(children);
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-');
}

/**
 * Extract text from React children
 */
function extractText(children: ReactNode): string {
	if (typeof children === 'string') return children;
	if (Array.isArray(children)) return children.map(extractText).join('');
	if (children && typeof children === 'object' && 'props' in children) {
		const element = children as { props: { children?: ReactNode } };
		return extractText(element.props.children);
	}
	return '';
}
