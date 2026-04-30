import { PhaseConceptGenerationSchema, PhaseConceptGenerationSchemaType } from '../schemas';
import { IssueReport } from '../domain/values/IssueReport';
import { createUserMessage, createMultiModalUserMessage } from '../inferutils/common';
import { executeInference } from '../inferutils/infer';
import { issuesPromptFormatter, PROMPT_UTILS, STRATEGIES } from '../prompts';
import { Message } from '../inferutils/common';
import { AgentOperation, getSystemPromptWithProjectContext, OperationOptions } from '../operations/common';
import { AGENT_CONFIG } from '../inferutils/config';
import type { UserContext } from '../core/types';
import { imagesToBase64 } from 'worker/utils/images';
import { PhasicGenerationContext } from '../domain/values/GenerationContext';
import { formatUploadedAssetContext } from '../utils/assetContext';

export interface PhaseGenerationInputs {
    issues: IssueReport;
    userContext?: UserContext;
    isUserSuggestedPhase?: boolean;
    isFinal: boolean;
}

const SYSTEM_PROMPT = `<ROLE>
    You are a meticulous senior software architect and interaction designer at Cloudflare with expertise in touch-friendly, iframe-fit playable web experiences.
    You are responsible for planning development phases that prioritize clear interaction, fast feedback, stable implementation, and shareable creative payoff.
</ROLE>

<TASK>
    You are given the blueprint (PRD) and the client query. You will be provided with all previously implemented project phases, the current latest snapshot of the codebase, and any current runtime issues or static analysis reports.
    
    **Your primary task:** Design the next phase of the project as a deployable milestone leading to project completion or to address any user feedbacks or reported bugs (runtime error fixing is the highest priority). Use the implementation roadmap provided in the blueprint as a reference. Do not overengineer beyond what is either required or explicitly requested.
    
    **Phase Planning Process:**
    1. **ANALYZE** current codebase state and identify what's implemented vs. what remains
    2. **PRIORITIZE** critical runtime errors that block deployment or user reported issues (render loops, undefined errors, import issues)
    3. **DESIGN** next logical development milestone following our phase strategy with emphasis on:
       - **Playable Clarity**: The next screen or feature should be understandable immediately
       - **Touch-Friendly UX**: Pointer/touch controls, edge-aware overlays, responsive stage sizing
       - **Interactive Feedback**: Smooth animations, clear state changes, satisfying micro-interactions
       - **Reliability**: Safe state transitions, cleanup for timers/listeners, no runtime crashes
       - **Accessibility Basics**: Semantic HTML, labels/aria where needed, visible focus for controls
       - **Supreme software development practices**: Follow the best coding principles and practices, and lay out the codebase in a way that is easy to maintain, extend and debug.
    4. **VALIDATE** that the phase will be deployable with all views/pages working across mobile, tablet, desktop, and preview iframe contexts without adding nested device frames

    Plan the phase name and description appropriately. They don't have to strictly adhere to the blueprint's roadmap as unforeseen issues may occur.
    
    Plan the next phase to advance toward completion. Set lastPhase: true when:
    - The blueprint's implementation roadmap is complete
    - All core features are working
    - No critical runtime errors remain

    Do not add phases for polish, optimization, or hypothetical improvements - users can request those via feedback.
    Follow the <PHASES GENERATION STRATEGY> as your reference policy for building and delivering projects.
    
    **Configuration File Guidelines:**
    - Core config files are locked: package.json, tsconfig.json, wrangler.jsonc (already configured)
    - You may modify: tailwind.config.js, vite.config.js (if needed for styling/build)
    
    **Visual Assets - Use These Approaches:**
    ✅ External URLs: Use unsplash.com or placehold.co for images
    ✅ Phaser scenes: use Phaser display objects, tweens, input, timers, and Arcade Physics in \`src/game/scenes/*\` for playable scenes
    ✅ Canvas drawing: \`<canvas>\` element for shapes and patterns only when the selected template is not Phaser
    ✅ Icon libraries: lucide-react, heroicons (from dependencies)
    ❌ Binary files (.png, .jpg, .svg files) cannot be generated in phases

    **Preinstalled UI Components:**
    - Only use src/components/ui/* shadcn primitives when they exist in the selected template.
    - buzzplay-phaser uses Phaser for gameplay and does not use shadcn; plan gameplay in \`src/game/scenes/*\` instead of React UI.
    - If shadcn components exist, do not include them in phase file lists or rewrite them.

    **REMEMBER: This is BuzzPlay playable content. A simple idea should become a working, fun, touch-friendly interactive post that fills the preview iframe, not a static showcase or overbuilt business app.**

    **LATEST USER INTENT WINS:** The blueprint represents the current spec, but explicit later user feedback can supersede older prompt/blueprint details. If user feedback or a recent phase says the core direction changed, preserve that newer direction and do not plan a phase that reverts to an older concept.
</TASK>

${STRATEGIES.FRONTEND_FIRST_PLANNING}

${PROMPT_UTILS.BUZZPLAY_PLAYABLE_CONTENT_GUIDELINES}

${PROMPT_UTILS.PHASER_PLAYABLE_DEVELOPMENT_GUIDELINES}

${PROMPT_UTILS.UI_NON_NEGOTIABLES_V3}

${PROMPT_UTILS.UI_GUIDELINES}

${PROMPT_UTILS.COMMON_DEP_DOCUMENTATION}

<BLUEPRINT>
{{blueprint}}
</BLUEPRINT>

<DEPENDENCIES>
**Available Dependencies:** You can ONLY import and use dependencies from the following==>

template dependencies:
{{dependencies}}

additional dependencies/frameworks provided:
{{blueprintDependencies}}

These are the only dependencies, components and plugins available for the project. No other plugin or component or dependency is available.
</DEPENDENCIES>

<STARTING TEMPLATE>
{{template}}
</STARTING TEMPLATE>`;

const NEXT_PHASE_USER_PROMPT = `**GENERATE THE PHASE**
{{generateInstructions}}
Adhere to the following guidelines: 

<SUGGESTING NEXT PHASE>
•   Suggest the next phase based on the current progress, the overall application architecture, suggested phases in the blueprint, current runtime errors/bugs and any user suggestions.
•   **Latest user intent wins:** If user suggestions conflict with older blueprint/query details, treat the suggestions as the current product direction. Do not plan rollback work that restores an older concept after the user approved or requested a newer one.
•   Please ignore non functional or non critical issues. Your primary task is to suggest project development phases. Linting and non-critical issues can be fixed later in code review cycles.
•   **CRITICAL RUNTIME ERROR PRIORITY**: If any runtime errors are present, they MUST be the primary focus of this phase. Runtime errors prevent deployment and user testing.
    
    **Priority Order for Critical Errors:**
    1. **React Render Loops** - "Maximum update depth exceeded", "Too many re-renders", useEffect infinite loops
    2. **Undefined Property Access** - "Cannot read properties of undefined", missing null checks
    3. **Import/Export Errors** - Wrong import syntax (@xyflow/react named vs default, @/lib/utils)
    4. **Tailwind Class Errors** - Invalid classes (border-border vs border)
    5. **Component Definition Errors** - Missing exports, undefined components
    
    **Error Handling Protocol:**
    - Name phase to reflect fixes: "Fix Critical Runtime Errors and [Feature]"
    - Cross-reference any code line or file name with current code structure
    - Validate reported issues exist before planning fixes
    - Focus on deployment-blocking issues over linting warnings
    - You would be provided with the diff of the last phase. If the runtime error occured due to the previous phase, you may get some clues from the diff.
•   Thoroughly review all the previous phases and the current implementation snapshot. Verify the frontend elements, UI, and backend components.
    - **Understand what has been implemented and what remains** We want a fully playable experience eventually! No requested interaction, result state, or critical content behavior should be left unimplemented if it is possible in the current project environment with open source tools and free tier services (i.e, without requiring any third party paid/API key service).
    - Each phase should advance toward the final product. **ONLY** mark as last phase if you are sure the project is at least >97% finished already.
    - If a certain feature can't be implemented due to constraints, use mock data or best possible alternative that's still possible.
    - Thoroughly review the current codebase and identify and fix any bugs, incomplete features or unimplemented stuff.
•    **PLAYABLE CONTENT PRIORITY**: Next phase should cover fixes (if any), development, AND significant focus on creating a clear, stable, touch-friendly playable experience with:
    - A visible hook and obvious primary action
    - Smooth animations and micro-interactions  
    - Immediate feedback for tap, drag, choice, or other user input
    - Proper spacing, edge-aware controls, and visual polish
    - Engaging user interface elements
    
    **UI LAYOUT NON-NEGOTIABLES**
    - For content/application templates that include Tailwind/shadcn, wrap visible content in the existing app container patterns.
    - For buzzplay-phaser, do not plan React pages, shadcn components, or Tailwind layouts for gameplay. Plan Phaser scene composition in \`src/game/scenes/*\`.
    - For BuzzPlay playable scenes, prioritize a full-height responsive stage over generic page chrome. It must fill the preview iframe and live play consistently without fake phone/device wrappers.
•   Use the <PHASES GENERATION STRATEGY> section to guide your phase generation.
•   Ensure the next phase logically and iteratively builds on the previous one, maintaining playable clarity, smooth interactions, responsive layout, and reliable runtime behavior.
•   Provide a clear, concise, to the point description of the next phase and the purpose and contents of each file in it.
•   Keep all the description fields very short and concise but unambiguous so the coding agent can implement them effectively and accurately.
•   If there are any files that were supposed to be generated in the previous phase, but were not, please mention them in the phase description and suggest them in the phase.
•   Always suggest phases in sequential ordering - Phase 1 comes after Phase 0, Phase 2 comes after Phase 1 and so on.
•   **Every phase must be deployable with all playable screens/states working properly, fitting the viewport, and responding to user input.**
•   IF you need to get any file to be deleted or cleaned, please set the \`changes\` field to \`delete\` for that file.
•   **\`changes\` field format:** 
    - WHAT (user-visible behavior) + HOW (conceptual approach) + CONSTRAINTS — but NO code/syntax
    
    ❌ "openWindow('finder', file.name, FinderWindow, {dirId: file.id})"
    ✅ "Double-click folder navigates within same window (update dir state, not new window). Breadcrumbs show path, clickable to ancestors."
    
    ❌ "Add useState for loading, show Skeleton, catch error and setError"
    ✅ "Fetch files on mount with loading/error states. Skeleton during load, error with retry on failure, empty state with create prompt."
    
    ❌ "onPointerDown check e.target === e.currentTarget before dragControls.start"
    ✅ "Drag from title bar area only, not from buttons or title text. Use existing drag controls."
•   **Visual assets:** For Phaser playable content, use Phaser display objects plus bundled starter assets or uploaded assets from \`src/asset_map\`; if current uploaded asset requirements explicitly request a specific asset role, preserve that role in the phase. Otherwise use external image URLs, canvas elements, or icon libraries. Reference these in file descriptions as needed.
</SUGGESTING NEXT PHASE>

{{issues}}

{{userSuggestions}}`;

const LAST_PHASE_PROMPT = `Finalization and Review phase. 
Goal: Thoroughly review the entire codebase generated in previous phases. Identify and fix any remaining critical issues (runtime errors, logic flaws, rendering bugs) before deployment.
** YOU MUST HALT AFTER THIS PHASE **

**LATEST INTENT PRESERVATION:** This final phase is for critical fixes only. Do not reshape the product, change the core gameplay, or revert to an older blueprint/query concept unless a critical runtime or logic bug makes a small targeted fix necessary. If the latest implemented/user-requested direction conflicts with older blueprint text, preserve the latest direction.

<REVIEW FOCUS & METHODOLOGY>
    **Your primary goal is to find showstopper bugs and UI/UX problems. Prioritize:**
    1.  **Runtime Errors & Crashes:** Any code that will obviously throw errors (Syntax errors, TDZ/Initialization errors, TypeErrors like reading property of undefined, incorrect API calls). **Analyze the provided \`errors\` carefully for root causes.**
    2.  **Critical Logic Flaws:** Does the application logic *actually* implement the behavior described in the blueprint? (e.g., Simulate game moves mentally: Does moving left work? Does scoring update correctly? Are win/loss conditions accurate?).
    3.  **UI Rendering Failures:** Will the UI render as expected? Check for:
        * **Layout Issues:** Misalignment, Incorrect borders/padding/margins etc, overlapping elements, incorrect spacing/padding, broken responsiveness (test mentally against mobile/tablet/desktop descriptions in blueprint).
        * **Styling Errors:** Missing or incorrect CSS classes, incorrect framework usage (e.g., wrong Tailwind class).
        * **Missing Elements:** Are all UI elements described in the blueprint present?
    4.  **State Management Bugs:** Does state update correctly? Do UI updates reliably reflect state changes? Are there potential race conditions or infinite update loops?
    5.  **Data Flow & Integration Errors:** Is data passed correctly between components? Do component interactions work as expected? Are imports valid and do the imported files/functions exist?
    6.  **Event Handling:** Do buttons, forms, and other interactions trigger the correct logic specified in the blueprint?
    7. **Import/Dependency Issues:** Are all imports valid? Are there any missing or incorrectly referenced dependencies? Are they correct for the specific version installed?
    8. **Library version issues:** Are you sure the code written is compatible with the installed version of the library? (e.g., Tailwind v3 vs. v4)
    9. **Especially lookout for setState inside render or without dependencies**
        - Mentally simulate the linting rule \`react-hooks/exhaustive-deps\`.

    **Method:**
    •   Review file-by-file, considering its dependencies and dependents.
    •   Mentally simulate user flows described in the blueprint.
    •   Cross-reference implementation against the \`description\`, \`userFlow\`, \`components\`, \`dataFlow\`, and \`implementationDetails\` sections *constantly*.
    •   Pay *extreme* attention to declaration order within scopes.
    •   Check for any imports that are not defined, installed or are not in the template.
    •   Come up with a the most important and urgent issues to fix first. We will run code reviews in multiple iterations, so focus on the most important issues first.

    IF there are any runtime errors or linting errors provided, focus on fixing them first and foremost. No need to provide any minor fixes or improvements to the code. Just focus on fixing the errors.

</REVIEW FOCUS & METHODOLOGY>

<ISSUES TO REPORT (Answer these based on your review):>
    1.  **Functionality Mismatch:** Does the codebase *fail* to deliver any core functionality described in the blueprint? (Yes/No + Specific examples)
    2.  **Logic Errors:** Are there flaws in the application logic (state transitions, calculations, game rules, etc.) compared to the blueprint? (Yes/No + Specific examples)
    3.  **Interaction Failures:** Do user interactions (clicks, inputs) behave incorrectly based on blueprint requirements? (Yes/No + Specific examples)
    4.  **Data Flow Problems:** Is data not flowing correctly between components or managed incorrectly? (Yes/No + Specific examples)
    5.  **State Management Issues:** Does state management lead to incorrect application behavior or UI? (Yes/No + Specific examples)
    6.  **UI Rendering Bugs:** Are there specific rendering issues (layout, alignment, spacing, overlap, responsiveness)? (Yes/No + Specific examples of files/components and issues)
    7.  **Performance Bottlenecks:** Are there obvious performance issues (e.g., inefficient loops, excessive re-renders)? (Yes/No + Specific examples)
    8.  **UI/UX Quality:** Is the UI significantly different from the blueprint's description or generally poor/unusable (ignoring minor aesthetics)? (Yes/No + Specific examples)
    9.  **Runtime Error Potential:** Identify specific code sections highly likely to cause runtime errors (TDZ, undefined properties, bad imports, syntax errors etc.). (Yes/No + Specific examples)
    10. **Dependency/Import Issues:** Are there any invalid imports or usage of non-existent/uninstalled dependencies? (Yes/No + Specific examples)

    If issues pertain to just dependencies not being installed, please only suggest the necessary \`bun add\` commands to install them. Do not suggest file level fixes.
</ISSUES TO REPORT (Answer these based on your review):>

**Regeneration Rules:**
    - Only regenerate files with **critical issues** causing runtime errors, significant logic flaws, or major rendering failures.
    - **Exception:** Small UI/CSS files *can* be regenerated for styling/alignment fixes if needed.
    - Do **not** regenerate for minor formatting or non-critical stylistic preferences.
    - Do **not** make major refactors or architectural changes.

<INSTRUCTIONS>
    Do not make major changes to the code. Just focus on fixing the critical runtime errors, issues and bugs in isolated and contained ways.
</INSTRUCTIONS>

{{issues}}

{{userSuggestions}}

This phase prepares the code for final deployment.`;

const formatUserSuggestions = (suggestions?: string[] | null): string => {
    if (!suggestions || suggestions.length === 0) {
        return '';
    }
    
    return `
<USER SUGGESTIONS>
The following client suggestions and feedback have been provided, relayed by our client conversation agent.
Explicitly state user's needs and suggestions in relevant files and components. For example, if user provides an image url, explicitly state it as-in in changes required for that file.
Please attend to these **on priority**:

**Client Feedback & Suggestions**:
\`\`\`
${suggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`).join('\n')}
\`\`\`

**IMPORTANT**: Make sure the above feedbacks are resolved and executed properly, elegantly and in a non-hacky way. Only work towards resolving the above feedbacks.
If the feedback says it supersedes older requirements or changes the current product direction, treat it as authoritative. Do not restore older gameplay, UI, or concept details that conflict with it.
And add this information detailedly in the phase description as well as in the relevant files. You may implement these suggestions across multiple phases as needed.
</USER SUGGESTIONS>`;
};

const issuesPromptFormatterWithGuidelines = (issues: IssueReport): string => {
    let serialized = issuesPromptFormatter(issues);
    if (issues.hasRuntimeErrors()) {
        serialized = `
${PROMPT_UTILS.COMMON_PITFALLS}

${issues.runtimeErrors.some((error) => error.message.includes('infinite loop') || error.message.includes('re-renders')) ? PROMPT_UTILS.REACT_RENDER_LOOP_PREVENTION: ''}

${serialized}`;
    }
    return serialized;
};

const userPromptFormatter = (isFinal: boolean, issues: IssueReport, userSuggestions?: string[], isUserSuggestedPhase?: boolean) => {
    let prompt = isFinal ? LAST_PHASE_PROMPT : NEXT_PHASE_USER_PROMPT;
    prompt = prompt
        .replaceAll('{{issues}}', issuesPromptFormatterWithGuidelines(issues))
        .replaceAll('{{userSuggestions}}', formatUserSuggestions(userSuggestions));
    
    if (isUserSuggestedPhase) {
        prompt = prompt.replaceAll('{{generateInstructions}}', 'User submitted feedback. Please thoroughly review the user needs and generate the next phase of the application accordingly, completely addressing their pain points in the right and proper way. And name the phase accordingly.');
    } else {
        prompt = prompt.replaceAll('{{generateInstructions}}', 'Generate the next phase of the application.');
    }
    
    return PROMPT_UTILS.verifyPrompt(prompt);
}
export class PhaseGenerationOperation extends AgentOperation<PhasicGenerationContext, PhaseGenerationInputs, PhaseConceptGenerationSchemaType> {
    async execute(
        inputs: PhaseGenerationInputs,
        options: OperationOptions<PhasicGenerationContext>
    ): Promise<PhaseConceptGenerationSchemaType> {
        const { issues, userContext, isUserSuggestedPhase, isFinal } = inputs;
        const { env, logger, context } = options;
        try {
            const suggestionsInfo = userContext?.suggestions && userContext.suggestions.length > 0
                ? `with ${userContext.suggestions.length} user suggestions`
                : "without user suggestions";
            const imagesInfo = userContext?.images && userContext.images.length > 0
                ? ` and ${userContext.images.length} image(s)`
                : "";
            
            logger.info(`Generating next phase ${suggestionsInfo}${imagesInfo} (isFinal: ${isFinal})`);
    
            // Create user message with optional images
            const assetContext = formatUploadedAssetContext(userContext?.images, {
                title: 'CURRENT_UPLOADED_ASSET_REQUIREMENTS',
            });
            const userPrompt = userPromptFormatter(isFinal, issues, userContext?.suggestions, isUserSuggestedPhase)
                + (assetContext ? `\n\n${assetContext}` : '');
            const userMessage = userContext?.images && userContext.images.length > 0
                ? createMultiModalUserMessage(
                    userPrompt,
                    await imagesToBase64(env, userContext?.images),
                    'high'
                )
                : createUserMessage(userPrompt);
            
            const messages: Message[] = [
                ...getSystemPromptWithProjectContext(SYSTEM_PROMPT, context),
                userMessage
            ];
    
            const results = await executeInference({
                env: env,
                messages,
                agentActionName: "phaseGeneration",
                schema: PhaseConceptGenerationSchema,
                context: options.inferenceContext,
                reasoning_effort: (userContext?.suggestions || issues.runtimeErrors.length > 0) ? AGENT_CONFIG.phaseGeneration.reasoning_effort == 'low' ? 'medium' : 'high' : undefined,
                format: 'markdown',
            });
    
            if (!results || !results.object) {
                logger.error('Phase generation returned no result after all retries');
                return {
                    name: '',
                    description: '',
                    files: [],
                    lastPhase: true,
                    installCommands: [],
                };
            }

            const concept = results.object;
    
            logger.info(`Generated next phase: ${concept.name}, ${concept.description}`);
    
            return concept;
        } catch (error) {
            logger.error("Error generating next phase:", error);
            throw error;
        }
    }
}
