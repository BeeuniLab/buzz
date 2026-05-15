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
import { useAppI18n } from '@/i18n';

interface ChatModalsProps {
	isResetDialogOpen: boolean;
	onResetDialogChange: (open: boolean) => void;
	onResetConversation: () => void;
}

export function ChatModals({
	isResetDialogOpen,
	onResetDialogChange,
	onResetConversation,
}: ChatModalsProps) {
	const { t } = useAppI18n();
	return (
		<>
			<AlertDialog open={isResetDialogOpen} onOpenChange={onResetDialogChange}>
				<AlertDialogContent className="sm:max-w-[425px]">
					<AlertDialogHeader>
						<AlertDialogTitle>{t('Reset conversation?')}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('This will clear the chat history for this app. Generated files and preview are not affected.')}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
						<AlertDialogAction onClick={onResetConversation} className="bg-bg-2 hover:bg-bg-2/80 text-text-primary">
							{t('Reset')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
