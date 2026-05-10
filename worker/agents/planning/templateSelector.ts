import { createLogger } from '../../logger';
import type { TemplateSelection } from '../../agents/schemas';
import type { ImageAttachment, ProcessedImageAttachment } from '../../types/image-attachment';
import type { InferenceContext } from '../inferutils/config.types';
import type { ProjectType } from '../core/types';
import type { TemplateInfo } from 'worker/types/project-types';

const logger = createLogger('TemplateSelector');
export const DEFAULT_BUZZPLAY_TEMPLATE = 'buzzplay-phaser';

type TemplateSelectionAttachment = ImageAttachment | ProcessedImageAttachment;

interface SelectTemplateArgs {
	env: Env;
	query: string;
	projectType?: ProjectType | 'auto';
	availableTemplates: TemplateInfo[];
	inferenceContext: InferenceContext;
	images?: TemplateSelectionAttachment[];
}

function isSelectableTemplate(template: TemplateInfo): boolean {
	return !template.disabled && !template.hiddenFromSelection && !template.name.includes('minimal');
}

function buildSelection(
	template: TemplateInfo,
	projectType: ProjectType,
	reasoning: string,
): TemplateSelection {
	return {
		selectedTemplateName: template.name,
		reasoning,
		useCase: projectType === 'app' ? 'Other' : 'General',
		complexity: 'simple',
		styleSelection: projectType === 'app' ? 'Custom' : null,
		projectType: (template.projectType || projectType) as ProjectType,
	} as TemplateSelection;
}

function buildEmptySelection(projectType: ProjectType, reasoning: string): TemplateSelection {
	return {
		selectedTemplateName: null,
		reasoning,
		useCase: null,
		complexity: null,
		styleSelection: null,
		projectType,
	} as TemplateSelection;
}

/**
 * Deterministic template selection.
 *
 * BuzzPlay currently ships one app runtime template, and the product direction is to let
 * users choose explicitly when more templates appear. Keep this function as the shared
 * selection interface, but do not call an LLM or pass uploaded media into model context.
 */
export async function selectTemplate({
	query,
	availableTemplates,
	images,
}: SelectTemplateArgs): Promise<TemplateSelection> {
	const selectableTemplates = availableTemplates.filter(isSelectableTemplate);

	logger.info('Using deterministic template selection', {
		queryLength: query.length,
		attachmentCount: images?.length || 0,
		availableTemplates: selectableTemplates.map((template) => template.name),
	});

	const selectedTemplate = selectableTemplates.find((template) => template.name === DEFAULT_BUZZPLAY_TEMPLATE);
	if (!selectedTemplate) {
		logger.warn(`Default template ${DEFAULT_BUZZPLAY_TEMPLATE} is not available`);
		return buildEmptySelection(
			'app',
			`Default template ${DEFAULT_BUZZPLAY_TEMPLATE} was not available`,
		);
	}

	return buildSelection(
		selectedTemplate,
		'app',
		`Defaulted to ${DEFAULT_BUZZPLAY_TEMPLATE}`,
	);
}
