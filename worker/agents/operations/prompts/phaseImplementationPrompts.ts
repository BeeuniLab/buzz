import { TemplateRegistry } from '../../inferutils/schemaFormatters';
import { PhaseConceptSchema, type PhaseConceptType } from '../../schemas';
import type { IssueReport } from '../../domain/values/IssueReport';
import type { UserContext } from '../../core/types';
import { issuesPromptFormatter, PROMPT_UTILS } from '../../prompts';

export const PHASE_IMPLEMENTATION_SYSTEM_PROMPT = `You are implementing a phase in the project's selected template and existing language/framework stack.

<UX_RUBRIC>
- Layout: responsive, consistent spacing, clear hierarchy.
- Interaction: hover/focus states, sensible transitions.
- States: loading/empty/error handled.
- Accessibility: labels/aria where needed, keyboard focus visible.
</UX_RUBRIC>

${PROMPT_UTILS.BUZZPLAY_PLAYABLE_CONTENT_GUIDELINES}

<LATEST_USER_INTENT>
If this phase or client feedback says the product direction changed, that latest direction supersedes older prompt or blueprint details. Implement the requested current direction and do not restore older gameplay, UI, or concept details that conflict with it.
</LATEST_USER_INTENT>

<RELIABILITY>
- No JavaScript/TypeScript syntax, import, or build errors.
- No hooks violations when the project uses React.
- No render loops or runaway animation/update loops.
- No whole-store selectors.
</RELIABILITY>

${PROMPT_UTILS.UI_NON_NEGOTIABLES_V3}

${PROMPT_UTILS.COMMON_PITFALLS}

${PROMPT_UTILS.COMMON_DEP_DOCUMENTATION}

<DEPENDENCIES>
{{dependencies}}

{{blueprintDependencies}}
</DEPENDENCIES>

{{template}}

<BLUEPRINT>
{{blueprint}}
</BLUEPRINT>`;

const PHASE_IMPLEMENTATION_USER_PROMPT_TEMPLATE = `Phase Implementation

<OUTPUT_REQUIREMENTS>
- Output exactly {{fileCount}} files.
- One cat block per file.
- Output only file contents (no commentary).
</OUTPUT_REQUIREMENTS>

<ZUSTAND_STORE_LAW>
Apply only if this project uses Zustand.
- One field per store call: useStore(s => s.field)
- NEVER: useStore(s => s) / useStore((state)=>state)
- NEVER destructure store results
- NEVER return object/array from selector
If you need multiple values/actions, write multiple store calls.
Example:
BAD: const { openWindow, setActiveWindow } = useOSStore(s => s)
GOOD: const openWindow = useOSStore(s => s.openWindow); const setActiveWindow = useOSStore(s => s.setActiveWindow)
</ZUSTAND_STORE_LAW>

<CURRENT_PHASE>
{{phaseText}}

{{issues}}

{{userSuggestions}}
</CURRENT_PHASE>`;

const formatUserSuggestions = (suggestions?: string[] | null): string => {
	if (!suggestions || suggestions.length === 0) return '';

	return `Client feedback to address in this phase. Treat explicit newer direction as authoritative over conflicting older blueprint/query details:\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
};

export function formatPhaseImplementationUserPrompt(args: {
	phaseText: string;
	issuesText?: string;
	userSuggestionsText?: string;
	fileCount?: number;
}): string {
	const prompt = PROMPT_UTILS.replaceTemplateVariables(PHASE_IMPLEMENTATION_USER_PROMPT_TEMPLATE, {
		phaseText: args.phaseText,
		issues: args.issuesText ?? '',
		userSuggestions: args.userSuggestionsText ?? '',
		fileCount: String(args.fileCount ?? 0),
	});

	return PROMPT_UTILS.verifyPrompt(prompt);
}

export function buildPhaseImplementationUserPrompt(args: {
	phase: PhaseConceptType;
	issues: IssueReport;
	userContext?: UserContext;
}): string {
	const phaseText = TemplateRegistry.markdown.serialize(args.phase, PhaseConceptSchema);
	const fileCount = args.phase.files?.length ?? 0;

	return formatPhaseImplementationUserPrompt({
		phaseText,
		issuesText: issuesPromptFormatter(args.issues),
		userSuggestionsText: formatUserSuggestions(args.userContext?.suggestions),
		fileCount,
	});
}
