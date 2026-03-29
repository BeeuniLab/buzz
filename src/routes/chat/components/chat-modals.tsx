import { DebugPanel, type DebugMessage } from './debug-panel';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GitHubExportModal } from '@/components/github-export-modal';
import type { AppDetailsData } from '@/api-types';
import type { GitHubExportHook } from '@/hooks/use-github-export';

interface ChatModalsProps {
	// Debug panel
	debugMessages: DebugMessage[];
	chatId?: string;
	onClearDebugMessages: () => void;

	// Reset dialog
	isResetDialogOpen: boolean;
	onResetDialogChange: (open: boolean) => void;
	onResetConversation: () => void;

	// GitHub export modal
	githubExport: GitHubExportHook;
	app?: AppDetailsData | null;
	urlChatId?: string;
}

export function ChatModals({
	debugMessages,
	chatId,
	onClearDebugMessages,
	isResetDialogOpen,
	onResetDialogChange,
	onResetConversation,
	githubExport,
	app,
	urlChatId,
}: ChatModalsProps) {
	return (
		<>
			{/* Debug Panel */}
			<DebugPanel
				messages={debugMessages}
				onClear={onClearDebugMessages}
				chatSessionId={chatId}
			/>

			<AlertDialog open={isResetDialogOpen} onOpenChange={onResetDialogChange}>
				<AlertDialogContent className="sm:max-w-[425px]">
					<AlertDialogHeader>
						<AlertDialogTitle>Reset conversation?</AlertDialogTitle>
						<AlertDialogDescription>
							This will clear the chat history for this app. Generated files and preview are not affected.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={onResetConversation} className="bg-bg-2 hover:bg-bg-2/80 text-text-primary">
							Reset
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* GitHub Export Modal */}
			<GitHubExportModal
				isOpen={githubExport.isModalOpen}
				onClose={githubExport.closeModal}
				onExport={githubExport.startExport}
				isExporting={githubExport.isExporting}
				exportProgress={githubExport.progress}
				exportResult={githubExport.result}
				onRetry={githubExport.retry}
				existingGithubUrl={app?.githubRepositoryUrl || null}
				agentId={urlChatId || undefined}
				appTitle={app?.title}
			/>
		</>
	);
}
