import {
	createSystemMessage,
	createUserMessage,
	createMultiModalUserMessage,
	type Message,
} from '../inferutils/common';
import { TemplateInfo } from 'worker/types/project-types';
import { createLogger } from '../../logger';
import { executeInference } from '../inferutils/infer';
import { InferenceContext } from '../inferutils/config.types';
import { RateLimitExceededError, SecurityError } from 'shared/types/errors';
import { TemplateSelection, TemplateSelectionSchema, ProjectTypePredictionSchema } from '../../agents/schemas';
import { generateSecureToken } from 'worker/utils/cryptoUtils';
import type { ImageAttachment } from '../../types/image-attachment';
import { ProjectType } from '../core/types';

const logger = createLogger('TemplateSelector');

/** Vision only for image/*; audio/video as filename hints (same pattern as chat). */
function buildTemplateSelectionUserMessage(
	userPrompt: string,
	images: ImageAttachment[] | undefined,
): Message {
	if (!images?.length) {
		return createUserMessage(userPrompt);
	}
	const imageAttachments = images.filter((a) => a.mimeType.startsWith('image/'));
	const nonImage = images.filter((a) => !a.mimeType.startsWith('image/'));
	let text = userPrompt;
	if (nonImage.length > 0) {
		const lines = nonImage.map((f) => `${f.filename} (${f.mimeType})`).join('; ');
		text += `\n\n**Note:** User also attached non-image file(s) (not sent as vision): ${lines}. Infer intent from names, types, and the text request.`;
	}
	if (imageAttachments.length === 0) {
		return createUserMessage(text);
	}
	return createMultiModalUserMessage(
		text,
		imageAttachments.map((img) => `data:${img.mimeType};base64,${img.base64Data}`),
		'high',
	);
}

interface SelectTemplateArgs {
    env: Env;
    query: string;
    projectType?: ProjectType | 'auto';
    availableTemplates: TemplateInfo[];
    inferenceContext: InferenceContext;
    images?: ImageAttachment[];
}

/**
 * Predicts the project type from the user query
 */
async function predictProjectType(
    env: Env,
    query: string,
    inferenceContext: InferenceContext,
    images?: ImageAttachment[]
): Promise<ProjectType> {
    try {
        logger.info('Predicting project type from query', { queryLength: query.length });

        const systemPrompt = `You are the BuzzPlay project type classifier. Your task is to analyze creator requests and determine what kind of project they want to build.

## PROJECT TYPES:

**app** - Interactive playable content or web applications
- BuzzPlay playable posts, mini-games, reaction toys, meme interactions, quizzes, visual stories, creative tools, and touch-first experiences
- Conventional web apps only when explicitly requested
- Examples: "做一个躲老板小游戏", "Make a funny personality tap game", "Use this image as a collectible challenge", "Build a recipe sharing app"

**workflow** - Backend workflows and APIs
- Server-side logic without UI
- API endpoints, cron jobs, webhooks
- Data processing, automation tasks
- Examples: "Create an API to process payments", "Build a webhook handler", "Automate data sync"

**presentation** - Slides and presentation decks
- Slide-based content for presentations
- Marketing decks, pitch decks, educational slides
- Visual storytelling with slides
- Examples: "Create slides about AI", "Make a product pitch deck", "Build a presentation on climate change"

**general** - From-scratch content or mixed artifacts
- Docs/notes/specs in Markdown/MDX, or a slide deck initialized later
- Start with docs when users ask for write-ups; initialize slides if explicitly requested or clearly appropriate
- No runtime unless slides/app are initialized by the builder
- Examples: "Write a spec", "Draft product strategy", "Create teaching notes"

## RULES:
- Default to 'app' when uncertain because BuzzPlay creators usually expect an interactive playable output
- Choose 'workflow' only when explicitly about APIs, automation, or backend-only tasks
- Choose 'presentation' only when explicitly about slides, decks, or presentations
- Choose 'general' for docs/notes/specs or when the user asks to start from scratch without a specific runtime template
- Treat short creative ideas, games, toys, memes, quizzes, visual references, or mobile/feed interaction prompts as 'app'
- High confidence when keywords are explicit, medium/low when inferring`;

        const userPrompt = `**User Request:** "${query}"

**Task:** Determine the project type and provide:
1. Project type (app, workflow, presentation, or general)
2. Reasoning for your classification
3. Confidence level (high, medium, low)

Analyze the request carefully and classify accordingly.`;

        const userMessage = buildTemplateSelectionUserMessage(userPrompt, images);

        const messages = [
            createSystemMessage(systemPrompt),
            userMessage
        ];

        const { object: prediction } = await executeInference({
            env,
            messages,
            agentActionName: "templateSelection", // Reuse existing agent action
            schema: ProjectTypePredictionSchema,
            context: inferenceContext,
            maxTokens: 500,
        });

        logger.info(`Predicted project type: ${prediction.projectType} (${prediction.confidence} confidence)`, {
            reasoning: prediction.reasoning
        });

        return prediction.projectType;

    } catch (error) {
        logger.error("Error predicting project type, defaulting to 'app':", error);
        return 'app';
    }
}

/**
 * Generates appropriate system prompt based on project type
 */
function getSystemPromptForProjectType(projectType: ProjectType): string {
    if (projectType === 'app') {
        return `You are the BuzzPlay template selector for mobile-first playable content. Your task is to select the most suitable starting template from the provided list.

## SELECTION EXAMPLES:

**Example 1 - Arcade Loop:**
User: "做一个办公室摸鱼躲老板小游戏"
Templates: ["buzzplay-kaplay-playable"]
Selection: "buzzplay-kaplay-playable"
complexity: "simple"
useCase: "Other"
Reasoning: "A short BuzzPlay idea should become a mobile playable post with movement, hazards, score feedback, and replay"

**Example 2 - Soft Interaction / Quiz:**
User: "做一个测我是哪种 MBTI 小猫的互动内容"
Templates: ["buzzplay-kaplay-playable"]
Selection: "buzzplay-kaplay-playable"
complexity: "simple"
useCase: "Other"
Reasoning: "Translate the quiz into a tap/choose/timing playable with expressive feedback and a result scene instead of a static card"

**Example 3 - Uploaded Reference Asset:**
User: "用这张图做一个收集金币的小游戏"
Templates: ["buzzplay-kaplay-playable"]
Selection: "buzzplay-kaplay-playable"
complexity: "simple"
useCase: "Other"
Reasoning: "The KAPLAY template can turn uploaded media into sprites/backgrounds with touch controls, collisions, scoring, and fallbacks"

**Example 4 - Meme / Reaction Toy:**
User: "做一个发疯工位能量充电器"
Templates: ["buzzplay-kaplay-playable"]
Selection: "buzzplay-kaplay-playable"
complexity: "simple"
useCase: "Other"
Reasoning: "A vague creative idea should be expanded into a quick tactile toy with one clear action, punchy feedback, and a replayable payoff"

## SELECTION CRITERIA:
1. **BuzzPlay Product Fit** - Short, playable, mobile-first content beats generic web-app structure.
2. **Interaction Fit** - Prefer templates with game loops, canvas rendering, touch input, collision, state, scoring, and replay.
3. **Asset Fit** - Prefer templates that can use uploaded images/audio/video as creative material with safe fallbacks.
4. **Minimal Modification** - Choose the template that can ship a complete playable first screen fastest.

## BUZZPLAY SELECTION PRIORITY:
- If "buzzplay-kaplay-playable" is available, choose it for arcade loops, dodge/collect/runner, snake/flappy/breakout-style games, physics toys, tap timing, rhythm taps, survival challenges, collisions, movement, hazards, score chasing, result scenes, and replayable mobile content.
- For softer ideas such as quizzes, meme reveals, interactive stories, reaction toys, personality tests, and social challenges, still prefer "buzzplay-kaplay-playable" and translate the idea into a tap/choose/drag/timing playable with a result scene.
- Uploaded image/audio/video references strengthen the case for "buzzplay-kaplay-playable" because the template has asset_map awareness and KAPLAY sprite/audio primitives.
- Avoid dashboard, blog, marketing, presentation, long-form app, or technical demo templates for short playable content unless the user explicitly asks for those categories.
- Treat short/vague creative ideas as simple playable posts, not full game platforms. Pick the template that can deliver a complete mobile-first first screen fastest.

## KAPLAY CONTEXT:
- KAPLAY guidance for later implementation: https://kaplayjs.com/docs/guides/
- This selector does not write code, but it should favor templates whose implementation instructions can guide agents toward KAPLAY scenes, components, collisions, and mobile touch controls.

## USE CASE AND STYLE:
- For BuzzPlay playable posts, use useCase "Other" unless the user explicitly asks for a conventional SaaS, dashboard, blog, portfolio, or e-commerce app.
- Select a style that supports the user's creative mood. "Retro", "Illustrative", "Kid_Playful", or "Custom" usually fit playable content better than generic SaaS styles.
- Do not classify BuzzPlay playable content as "SaaS Product Website" or "Dashboard" just because the generated experience has UI labels, scores, or result panels.

## RULES:
- ALWAYS select a template (never return null)
- **ONLY** Choose from the list of available templates
- Return JSON using the exact field names: selectedTemplateName, reasoning, useCase, complexity, styleSelection, projectType
- Never use alias fields such as template, templateName, selection, style, or styleName
- Ignore templates that are disabled, hidden, or absent from the provided available list
- Do not mention or select example template names that are not in the available list
- Focus on playable content fit over generic framework preference
- Provide clear, specific reasoning for selection`;
    }

    // Simpler, more general prompts for workflow and presentation
    return `You are an Expert Template Selector at Cloudflare. Your task is to select the most suitable ${projectType} template based on user requirements.

## PROJECT TYPE: ${projectType.toUpperCase()}

## SELECTION CRITERIA:
1. **Best Match** - Template that best fits the user's requirements
2. **Feature Alignment** - Templates with relevant functionality
3. **Minimal Modification** - Template requiring least customization

## RULES:
- ALWAYS select a template from the available list
- Analyze template descriptions carefully
- **ONLY** Choose from the provided templates
- Provide clear reasoning for your selection`;
}

/**
 * Uses AI to select the most suitable template for a given query.
 */
export async function selectTemplate({ env, query, projectType, availableTemplates, inferenceContext, images }: SelectTemplateArgs, retryCount: number = 3): Promise<TemplateSelection> {
    // Step 1: Predict project type if 'auto'
    const actualProjectType: ProjectType = projectType === 'auto'
        ? await predictProjectType(env, query, inferenceContext, images)
        : (projectType || 'app') as ProjectType;
    
    availableTemplates = availableTemplates.filter(
        t => !t.disabled && !t.hiddenFromSelection && !t.name.includes('minimal')
    );
    logger.info(`Using project type: ${actualProjectType}${projectType === 'auto' ? ' (auto-detected)' : ''}`);

    // Step 2: Filter templates by project type
    const filteredTemplates = projectType === 'general' ? availableTemplates : availableTemplates.filter(t => t.projectType === actualProjectType);
    
    if (filteredTemplates.length === 0) {
        logger.warn(`No templates available for project type: ${actualProjectType}`);
        return { 
            selectedTemplateName: null, 
            reasoning: `No templates were available for project type: ${actualProjectType}`, 
            useCase: null, 
            complexity: null, 
            styleSelection: null, 
            projectType: actualProjectType
        };
    }

    // Step 3: Skip template selection if only 1 template for workflow/presentation
    if ((actualProjectType === 'workflow' || actualProjectType === 'presentation') && filteredTemplates.length === 1) {
        logger.info(`Only one ${actualProjectType} template available, auto-selecting: ${filteredTemplates[0].name}`);
        return {
            selectedTemplateName: filteredTemplates[0].name,
            reasoning: `Auto-selected the only available ${actualProjectType} template`,
            useCase: 'General',
            complexity: 'simple',
            styleSelection: null,
            projectType: actualProjectType
        };
    }

    try {
        logger.info(`Asking AI to select a template for the ${retryCount} time`, { 
            query, 
            projectType: actualProjectType,
            queryLength: query.length,
            imagesCount: images?.length || 0,
            availableTemplates: filteredTemplates.map(t => t.name),
            templateCount: filteredTemplates.length 
        });

        const validTemplateNames = filteredTemplates.map(t => t.name);

        const templateDescriptions = filteredTemplates.map((t, index) =>
            `### Template #${index + 1} \n Name - ${t.name} \n Language: ${t.language}, Frameworks: ${t.frameworks?.join(', ') || 'None'}\n Description: \`\`\`${t.description.selection}\`\`\``
        ).join('\n\n');

        // Step 4: Perform AI-based template selection
        const systemPrompt = getSystemPromptForProjectType(actualProjectType as ProjectType)

        const userPrompt = `**User Request:** "${query}"

## **Available Templates:**
**ONLY** These template names are available for selection: ${validTemplateNames.join(', ')}

Template detail: ${templateDescriptions}

**Task:** Select the most suitable template and provide:
1. selectedTemplateName (exact match from list)
2. Clear reasoning for why it fits the user's needs
${actualProjectType === 'app' ? '3. For BuzzPlay playable content, use useCase "Other" or "General" unless the user explicitly asks for SaaS, dashboard, blog, portfolio, or e-commerce. Pick a style that fits the creative mood and mobile playable format.' : ''}

Return only a JSON object with exactly these keys:
{
  "selectedTemplateName": "one of the available template names",
  "reasoning": "brief explanation",
  "useCase": "SaaS Product Website | Dashboard | Blog | Portfolio | E-Commerce | General | Other",
  "complexity": "simple | moderate | complex",
  "styleSelection": "Minimalist Design | Brutalism | Retro | Illustrative | Kid_Playful | Custom",
  "projectType": "${actualProjectType}"
}

Analyze each template's features, frameworks, and architecture to make the best match.
${images && images.length > 0 ? `\n**Note:** User provided reference attachment(s); use vision for images where included; for other file types rely on filenames and the request text.` : ''}

ENTROPY SEED: ${generateSecureToken(64)} - for unique results`;

        const userMessage = buildTemplateSelectionUserMessage(userPrompt, images);

        const messages = [
            createSystemMessage(systemPrompt),
            userMessage
        ];

        const { object: selection } = await executeInference({
            env,
            messages,
            agentActionName: "templateSelection",
            schema: TemplateSelectionSchema,
            context: inferenceContext,
            maxTokens: 2000,
        });

        if (!selection) {
            logger.error('Template selection returned no result after all retries');
            throw new Error('Failed to select template: inference returned null');
        }

        logger.info(`AI template selection result: ${selection.selectedTemplateName || 'None'}, Reasoning: ${selection.reasoning}`);
        
        // Ensure projectType is set correctly
        return {
            ...selection,
            projectType: actualProjectType
        };

    } catch (error) {
        logger.error("Error during AI template selection:", error);
        if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
            throw error;
        }

        if (retryCount > 0) {
            return selectTemplate({ env, query, projectType, availableTemplates, inferenceContext, images }, retryCount - 1);
        }
        // Fallback to no template selection in case of error
        return { selectedTemplateName: null, reasoning: "An error occurred during the template selection process.", useCase: null, complexity: null, styleSelection: null, projectType: actualProjectType };
    }
}
