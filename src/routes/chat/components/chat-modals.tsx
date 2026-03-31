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

interface ChatModalsProps {
	debugMessages: DebugMessage[];
	chatId?: string;
	onClearDebugMessages: () => void;

	isResetDialogOpen: boolean;
	onResetDialogChange: (open: boolean) => void;
	onResetConversation: () => void;
}

export function ChatModals({
	debugMessages,
	chatId,
	onClearDebugMessages,
	isResetDialogOpen,
	onResetDialogChange,
	onResetConversation,
}: ChatModalsProps) {
	return (
		<>
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
		</>
	);
}
