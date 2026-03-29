import { tool, type } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { selectTemplate } from '../../planning/templateSelector';
import { TemplateSelection } from '../../schemas';
import { TemplateFile } from 'worker/types/project-types';
import { listTemplates } from 'worker/services/templates/templateCatalog';
import { z } from 'zod';

export type InitSuitableTemplateResult =
	| {
		selection: TemplateSelection;
		importedFiles: TemplateFile[];
		reasoning: string;
		message: string;
	  }
	| { error: string };

export function createInitSuitableTemplateTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'init_suitable_template',
		description: 'Analyze user requirements and automatically select + import the most suitable template from library. Uses AI to match requirements against available templates. Returns selection with reasoning and imported files. For interactive projects (app/presentation/workflow) only. Call this BEFORE generate_blueprint.',
		args: {
			query: type(z.string(), () => ({
				files: { mode: 'write', paths: [] },
			})).describe('User requirements and project description. Provide clear description of what needs to be built.'),
		},
		run: async ({ query }) => {
			try {
				const projectType = agent.getProjectType();
				const operationOptions = agent.getOperationOptions();

				logger.info('Analyzing template suitability and importing', {
					projectType,
					queryLength: query.length
				});

				const catalogResponse = await listTemplates(operationOptions.env.TEMPLATES_BUCKET);
				if (!catalogResponse.success || catalogResponse.templates.length === 0) {
					return { error: `No templates available: ${catalogResponse.error || 'empty catalog'}` };
				}

				const selection = await selectTemplate({
					env: operationOptions.env,
					query,
					projectType,
					availableTemplates: catalogResponse.templates,
					inferenceContext: operationOptions.inferenceContext,
				});

				if (!selection.selectedTemplateName) {
					return { error: 'No suitable template found for the given requirements' };
				}

				const importResult = await agent.importTemplate(selection.selectedTemplateName);

				return {
					selection,
					importedFiles: importResult.files,
					reasoning: selection.reasoning || 'Template selected based on requirements',
					message: `Imported template "${selection.selectedTemplateName}" with ${importResult.filesImported} files`,
				};
			} catch (error) {
				logger.error('Error in init_suitable_template', error);
				return {
					error: `Error selecting/importing template: ${error instanceof Error ? error.message : 'Unknown error'}`
				};
			}
		},
	});
}
