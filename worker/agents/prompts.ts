import { FileTreeNode, RuntimeError, StaticAnalysisResponse, TemplateDetails } from "worker/types/project-types";
import { TemplateRegistry } from "./inferutils/schemaFormatters";
import z from 'zod';
import { PhasicBlueprint, AgenticBlueprint, BlueprintSchemaLite, AgenticBlueprintSchema, FileOutputType, PhaseConceptLiteSchema, PhaseConceptSchema, PhaseConceptType, TemplateSelection, Blueprint } from "./schemas";
import { IssueReport } from "./domain/values/IssueReport";
import { FileState, MAX_PHASES } from "./core/state";
import { CODE_SERIALIZERS, CodeSerializerType } from "./utils/codeSerializers";
import { getCodebaseContext } from "./utils/codebaseContext";

export const PROMPT_UTILS = {
    /**
     * Replace template variables in a prompt string
     * @param template The template string with {{variable}} placeholders
     * @param variables Object with variable name -> value mappings
     */
    replaceTemplateVariables(template: string, variables: Record<string, string>): string {
        let result = template;
        
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{{${key}}}`;
            result = result.replaceAll(placeholder, value ?? '');
        }
        
        return result;
    },

    serializeTreeNodes(node: FileTreeNode): string {
        // The output starts with the root node's name.
        const outputParts: string[] = [node.path.split('/').pop() || node.path];
    
        function processChildren(children: FileTreeNode[], prefix: string) {
            children.forEach((child, index) => {
                const isLast = index === children.length - 1;
                const connector = isLast ? '└── ' : '├── ';
                const displayName = child.path.split('/').pop() || child.path;
    
                outputParts.push(prefix + connector + displayName);
    
                // If the child is a directory with its own children, recurse deeper.
                if (child.type === 'directory' && child.children && child.children.length > 0) {
                    // The prefix for the next level depends on whether the current node
                    // is the last in its list. This determines if we use a vertical line or a space.
                    const childPrefix = prefix + (isLast ? '    ' : '│   ');
                    processChildren(child.children, childPrefix);
                }
            });
        }
    
        // Start the process if the root node has children.
        if (node.children && node.children.length > 0) {
            processChildren(node.children, '');
        }
    
        return outputParts.join('\n');
    },

    serializeTemplate(template?: TemplateDetails): string {
        if (template) {
            return `
<TEMPLATE DETAILS>
The following are the details (structures and files) of the starting boilerplate template, on which the project is based.

Name: ${template.name}
Frameworks: ${template.frameworks?.join(', ')}

Template Usage Instructions: 
${template.description.usage}

<DO NOT TOUCH FILES>
These files are forbidden to be modified. Do not touch them under any circumstances. Doing so will break the application.
${(template.dontTouchFiles ?? []).join('\n')}
worker/core-utils.ts
</DO NOT TOUCH FILES>

<REDACTED FILES>
These files are redacted. They exist but their contents are hidden for security reasons. Do not touch them under any circumstances.
${(template.redactedFiles ?? []).join('\n')}
</REDACTED FILES>

**Websockets and dynamic imports are not supported, so please avoid using them.**

</TEMPLATE DETAILS>`;
        } else {
            return `
<START_FROM_SCRATCH>
No starter template is available—design the entire structure yourself. You need to write all the configuration files, package.json, and all the source code files from scratch.
You are allowed to install stuff. Be very careful with the versions of libraries and frameworks you choose.
For an example typescript vite project,
The project should support the following commands in package.json to run the application:
"scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "npm run build && vite preview",
    "deploy": "npm run build && wrangler deploy",
    "cf-typegen": "wrangler types"
}
and provide a preview url for the application.

</START_FROM_SCRATCH>`;
        }
    },

    serializeErrors(errors: RuntimeError[]): string {
        if (errors && errors.length > 0) {
            const errorsSerialized = errors.map(e => {
                // Use rawOutput if available, otherwise serialize using schema
                const errorText = e.message;
                // Remove any trace lines with no 'tsx' or 'ts' extension in them
                const cleanedText = errorText.split('\n')
                                    .map(line => line.includes('/deps/') && !(line.includes('.tsx') || line.includes('.ts')) ? '' : line).filter(line => line.trim() !== '')
                                    .join('\n');
                // Truncate to 1000 characters to prevent context overflow
                return `<error>${cleanedText.slice(0, 1000)}</error>`;
            });
            return errorsSerialized.join('\n\n');
        } else {
            return 'N/A';
        }
    },

    serializeStaticAnalysis(staticAnalysis: StaticAnalysisResponse, maxIssues = 20): string {
        const formatIssues = (issues: typeof staticAnalysis.lint.issues): string => {
            if (issues.length === 0) {
                return 'No issues detected';
            }
            const limitedIssues = issues.slice(0, maxIssues);
            const formatted = limitedIssues.map(issue => 
                `- [${issue.severity}] ${issue.filePath}:${issue.line}:${issue.column} - ${issue.message} (${issue.ruleId})`
            ).join('\n');
            if (issues.length > maxIssues) {
                return `${formatted}\n... and ${issues.length - maxIssues} more issues (truncated)`;
            }
            return formatted;
        };

        const lintOutput = staticAnalysis.lint.rawOutput || formatIssues(staticAnalysis.lint.issues);
        const typecheckOutput = staticAnalysis.typecheck.rawOutput || formatIssues(staticAnalysis.typecheck.issues);
        
        return `**LINT ANALYSIS:**
${lintOutput}

**TYPE CHECK ANALYSIS:**
${typecheckOutput}`;
    },

    verifyPrompt(prompt: string): string {
        // If any of the '{{variables}}' are not replaced, throw an error
        // if (prompt.includes('{{')) {
        //     throw new Error(`Prompt contains un-replaced variables: ${prompt}`);
        // }
        return prompt;
    },

    serializeFiles(files: FileOutputType[], serializerType: CodeSerializerType): string {
        // Use scof format
        return CODE_SERIALIZERS[serializerType](files);
    },    
    
    summarizeFiles(files: FileState[], max = 120): string {
        const compact = files
            .slice(0, max)
            .map((file) => {
                const purpose = file.filePurpose ? ` — ${file.filePurpose}` : '';
                return `- ${file.filePath}${purpose}`;
            })
            .join('\n');

        const extra = files.length > max ? `\n...and ${files.length - max} more` : '';
        return compact + extra;
    },


    REACT_RENDER_LOOP_PREVENTION: `
<REACT_RENDER_LOOP_PREVENTION>
"Maximum update depth exceeded" or "Too many re-renders" = your code has an infinite loop. React aborts after ~50 nested updates.

## VALIDATION CHECKLIST (Run Before Submitting)
Search your code for these patterns. If found, rewrite immediately:
- \`useStore()\` without selector → CRASH
- \`useStore(s => s)\` returning entire store → CRASH
- \`useStore(s => ({\` or \`useStore(s => [\` → CRASH (object/array allocation)
- \`useStore(s => s.get\` or \`useStore(s => Object.\` → CRASH (function call in selector)
- \`useEffect(() => {\` without \`}, [\` → CRASH (missing dependency array)
- \`setState\` call outside useEffect/event handler → CRASH

## ZUSTAND STORE SELECTORS

### ONLY ALLOWED PATTERNS (use these exclusively):
\`\`\`tsx
// Direct property access - returns stable ref or primitive
const user = useStore(s => s.user);
const name = useStore(s => s.user.name);
const isOpen = useStore(s => s.isOpen);
const count = useStore(s => s.items.length);
const isValid = useStore(s => !!s.data);

// Multiple values? Call useStore multiple times:
const name = useStore(s => s.name);
const age = useStore(s => s.age);

// Need derived data? Derive OUTSIDE the selector with useMemo:
const items = useStore(s => s.items);
const sortedItems = useMemo(() => [...items].sort(), [items]);
\`\`\`

### BANNED ANTI-PATTERNS (never write these):
\`\`\`tsx
useStore()                              // no selector - returns entire store, new ref every time
useStore(s => s)                        // identity selector - same problem, returns entire store
useStore(s => ({ name: s.name }))       // object literal - allocates new object every render
useStore(s => [s.a, s.b])               // array literal - allocates new array every render
useStore(s => s.getItems())             // method call - may return new ref
useStore(s => Object.keys(s.data))      // Object.keys - allocates new array
useStore(s => s.items.filter(x => x))   // .filter/.map/.reduce - allocates new array
useStore(useShallow(s => ({ a: s.a }))) // useShallow doesn't fix object allocation
const { name, age } = useStore(s => s)  // destructuring entire store - still causes re-render
\`\`\`

## STATE UPDATES

### ALLOWED: Only in event handlers or useEffect
\`\`\`tsx
const handleClick = () => setCount(count + 1);     // event handler - OK
useEffect(() => { setData(result); }, [result]);   // useEffect - OK
\`\`\`

### BANNED: During render phase
\`\`\`tsx
function Component() {
    const [n, setN] = useState(0);
    setN(n + 1);                    // CRASH - setState during render
    if (condition) setX(value);     // CRASH - conditional setState during render
    return <div>{n}</div>;
}
\`\`\`

## useEffect RULES

### ALLOWED:
\`\`\`tsx
useEffect(() => { /* ... */ }, []);           // empty deps - run once
useEffect(() => { /* ... */ }, [userId]);     // specific deps
useEffect(() => {
    if (userId) fetchUser(userId);             // guard before async/setState
}, [userId]);
\`\`\`

### BANNED:
\`\`\`tsx
useEffect(() => { setCount(count + 1); });    // no dependency array - infinite loop
useEffect(() => { setX(y); }, [y, setX]);     // including setter that triggers itself
\`\`\`

## UNSTABLE REFERENCES

### Problem: New object/array created every render triggers useEffect infinitely
\`\`\`tsx
// BANNED:
const config = { theme: 'dark' };              // new object every render
useEffect(() => { init(config); }, [config]); // infinite loop

// ALLOWED:
const config = useMemo(() => ({ theme: 'dark' }), []);
useEffect(() => { init(config); }, [config]); // stable reference
\`\`\`

## QUICK RULES
1. Zustand selectors: return primitive or direct property access ONLY
2. setState: ONLY in useEffect or event handlers, NEVER during render
3. useEffect: ALWAYS include dependency array
4. Objects/arrays in deps: wrap with useMemo
5. Multiple store values: call useStore multiple times, don't destructure
6. Derived data: compute with useMemo OUTSIDE selector

</REACT_RENDER_LOOP_PREVENTION>`,

COMMON_PITFALLS: `<AVOID COMMON PITFALLS>
    **TOP 6 MISSION-CRITICAL RULES (FAILURE WILL CRASH THE APP):**
    1. **DEPENDENCY VALIDATION:** BEFORE writing any import statement, verify it exists in <DEPENDENCIES>. Common failures: @xyflow/react uses { ReactFlow } not default import, @/lib/utils for cn function. If unsure, check the dependency list first.
    2. **IMPORT & EXPORT INTEGRITY:** Ensure every component, function, or variable is correctly defined and imported properly (and exported properly). Mismatched default/named imports will cause crashes. NEVER write \`import React, 'react';\` - always use \`import React from 'react';\`
    3. **NO RUNTIME ERRORS:** Write robust, fault-tolerant code. Handle all edge cases gracefully with fallbacks. Never throw uncaught errors that can crash the application.
    4. **NO UNDEFINED VALUES/PROPERTIES/FUNCTIONS/COMPONENTS etc:** Ensure all variables, functions, and components are defined before use. Never use undefined values. If you use something that isn't already defined, you need to define it.
    5. **STATE UPDATE INTEGRITY:** Never call state setters directly during the render phase; all state updates must originate from event handlers or useEffect hooks to prevent infinite loops.
    6. **🔥 ZUSTAND ZERO-TOLERANCE RULE 🔥:** ABSOLUTE LAW: useStore(s => s.primitive) ONLY. No object selectors. No exceptions. Any useStore(s => ({...})), useStore(), or useStore(s => s.getXxx()) = INSTANT CRASH. Multiple values? Call useStore multiple times - this is the ONLY correct pattern. See REACT INFINITE LOOP PREVENTION section for complete patterns.
    
    **UI/UX EXCELLENCE CRITICAL RULES:**
    7. **VISUAL HIERARCHY CLARITY:** Every interface must have clear visual hierarchy - never create pages with uniform text sizes or equal visual weight for all elements
    8. **INTERACTIVE FEEDBACK MANDATORY:** Every button, link, and interactive element MUST have visible hover, focus, and active states - no exceptions
    9. **RESPONSIVE BREAKPOINT INTEGRITY:** Test layouts mentally at sm, md, lg breakpoints - never create layouts that break or look unintentional at any screen size
    10. **SPACING CONSISTENCY:** Use systematic spacing (space-y-4, space-y-6, space-y-8) - avoid arbitrary margins that create visual chaos
    11. **LOADING STATE EXCELLENCE:** Every async operation must have beautiful loading states - never leave users staring at blank screens
    12. **ERROR HANDLING GRACE:** All error states must be user-friendly with clear next steps - never show raw error messages or technical jargon
    13. Height Chain Breaks
    - h-full requires all parents to have explicit height.
    - Root chains should be: html (100vh) -> body (h-full) -> #root/app (h-full) -> page container (h-screen or h-full).
    - Symptom: content not visible or zero-height scrolling areas.

    14. Flexbox Without Flex Parent
    - flex-1 only works when parent is display:flex. Ensure parent has className="flex".
    - For column layouts use flex-col; for row layouts use flex.

    15. Resizable Sidebars + Text Cutoff
    - Do not rely on %-based minimums for readable sidebar text.
    - Always apply CSS min-w-[180px] (or appropriate) to the sidebar content, and use w-64 for initial width.
    - Keep a ResizableHandle between panels and a parent with explicit height.

    16. Framer Motion Drag Handle (Correct API)
    - There is no dragHandle prop. Use useDragControls + dragListener={false} and trigger controls.start(e) in the header pointer down.
    - Avoid adding non-existent props that cause TS2322.

    17. Type-safe Object Construction (avoid misuse of \`as\`)
    - When creating discriminated unions, include all fields required by that variant
    - ✅ Correct: Fix object shape: const node: Folder = { id, type: 'folder', name, children: [] };
    - ⚠️ Use sparingly: \`as\` for DOM or explicit narrowing: event.target as HTMLInputElement
    - ❌ Wrong: Forcing types: const node = { id, name } as Folder; // Missing required fields!

    18. Missing Try-Catch in Async Operations (causes silent failures)
    - AI often forgets error handling in async functions
    - ALWAYS wrap fetch/API calls in try-catch
    - Set error state, don't silently fail
    - Pattern: try { await api() } catch (e) { setError(e.message) }

    19. Missing Optional Chaining (causes "cannot read property" crashes)
    - Use ?. for all object access: user?.profile?.name
    - Use ?? for defaults: items ?? []
    - Prevents most common runtime crashes from null/undefined

    20. No Debug Logging (makes AI bugs impossible to diagnose)
        - Although you would not have access to browser logs, but console.error and console.warn in templates are wired to send error reports to our backend. 
        - Thus, you consider adding extensive console.error and console.warn in code paths where you expect errors to occur, so its easier to debug.

    **ENHANCED RELIABILITY PATTERNS:**
    •   **State Management:** Handle loading/success/error states for async operations. Initialize state with proper defaults, never undefined. Use functional updates for dependent state.
    •   **Type Safety:** Define interfaces for props/state/API responses. Check null/undefined before property access. Validate array length before element access. Rely on \`?\` operator for properties that might be undefined.
    •   **Component Safety:** Use error boundaries for components that might fail. Provide fallbacks for conditional content. Use stable, unique keys for lists.
    •   **Performance:** Use React.memo, useMemo, useCallback to prevent unnecessary re-renders. Define event handlers outside render or use useCallback.
    •   **Object Literals**: NEVER duplicate property names. \`{name: "A", age: 25, name: "B"}\` = compilation error
    •   **Always follow best coding practices**: Follow best coding practices and principles:
        - Always maximize code reuse and minimize code redundancy and duplicacy. 
        - Strict DRY (Don't Repeat Yourself) principle.
        - Always try to import or extend existing types, components, functions, variables, etc. instead of redefining something similar.

    •   **State Management Best Practices:** Keep actions for side-effects, use selectors for derivation only. Export typed selectors/hooks that derive from primitive IDs.

    **ALGORITHMIC PRECISION & LOGICAL REASONING:**
    •   **Mathematical Accuracy:** For games/calculations, implement precise algorithms step-by-step. ALWAYS validate boundaries: if (x >= 0 && x < width && y >= 0 && y < height). Use === for exact comparisons.
    •   **Game Logic Systems:** Break complex logic into smaller, testable functions. Example: moveLeft(), checkWin(), updateScore(). Each function should handle ONE responsibility.
    •   **Array/Grid Operations:** CRITICAL - Check array bounds before access: if (grid[row] && grid[row][col] !== undefined). Use descriptive names: rowIndex, colIndex, not i, j.
    •   **State Transitions:** For complex state changes, use pure functions that return new state. Example: const newState = {...oldState, score: oldState.score + points}.
    •   **Algorithm Test Cases:** BEFORE coding, write a simple test case. Example: "moveLeft([2,2,4,0]) should return [4,4,0,0]". Verify your logic matches this expected output.

    **FRAMEWORK & SYNTAX SPECIFICS:**
    •   Framework compatibility: Pay attention to version differences (Tailwind v3 vs v4, React Router versions)
    •   No environment variables: App deploys serverless - avoid libraries requiring env vars unless they support defaults
    •   React/Vite best practices: Follow patterns compatible with Vite + React (avoid Next.js-specific APIs)
    •   Tailwind classes: Verify all classes exist in tailwind.config.js (e.g., avoid undefined classes like \`border-border\`)
    •   Component exports: Export all components properly, avoid mixing default/named imports
    •   UI spacing: Ensure proper padding/margins, avoid left-aligned layouts without proper spacing

    **PROPER IMPORTS**:
       - **Importing React and other libraries should be done correctly.**

    **CRITICAL SYNTAX ERRORS - PREVENT AT ALL COSTS:**
    
    **CATASTROPHIC IMPORT SYNTAX ERRORS (Zero Tolerance):**
    ❌ \`import React, 'react';\` → **FATAL**: Comma instead of 'from' keyword = build crash
    ❌ \`import { scaleOrdinal } from 'd3-scale-chromatic';\` → **WRONG PACKAGE**: scaleOrdinal is in 'd3-scale'
    ❌ \`import */styles/globals.css'\` → **INVALID**: Missing 'import' or wrong path syntax
    ✅ \`import React from 'react';\` → **CORRECT**: Default import with 'from' keyword
    ✅ \`import { useState } from 'react';\` → **CORRECT**: Named imports
    ✅ \`import './styles/globals.css';\` → **CORRECT**: CSS import
    
    1. **IMPORT SYNTAX**: Always use \`import [item] from '[package]';\` - never use commas instead of 'from'
    2. **UNDEFINED VARIABLES**: Always import/define variables before use. \`cn is not defined\` = missing \`import { cn } from './lib/utils'\`

    **CRITICAL ERROR RECOVERY PATTERNS:**
    •   **API Call Safety:** Always wrap in try-catch with user-friendly fallbacks:
        \`const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(null);\`
    •   **Component Rendering Safety:** Use conditional rendering to prevent crashes:
        \`{user ? <Profile user={user} /> : <div>Loading user...</div>}\`
    •   **Array Operations Safety:** Always check if array exists:
        \`{items?.length > 0 ? items.map(...) : <div>No items found</div>}\`
    •   **State Update Safety:** Use functional updates when depending on previous state:
        \`setCount(prev => prev + 1)\` instead of \`setCount(count + 1)\`

    **PRE-CODE VALIDATION CHECKLIST:**
    Before writing any code, mentally verify:
    - All imports use correct syntax and paths. Be cautious about named vs default imports wherever needed.
    - All variables are defined before use  
    - **No setState calls during render phase** - only in useEffect/event handlers
    - **Zustand selectors are primitives only:**
        ✅ \`const count = useStore(s => s.count);\` 
        ✅ \`const name = useStore(s => s.name);\`
        ❌ \`const { count, name } = useStore(s => ({ count: s.count, name: s.name }));\` = CRASH
        ❌ \`const data = useStore(s => s.getData());\` = CRASH  
        ❌ \`const state = useStore();\` = CRASH
    - **All useEffect hooks have dependency arrays** - no exceptions
    - All Tailwind classes exist in config
    - External dependencies are available
    - Error boundaries around components that might fail

    **Also dynamic imports may not work, so please avoid using them.**

    ### **IMPORT VALIDATION EXAMPLES**
    **CRITICAL**: Verify ALL imports before using. Wrong imports = runtime crashes.
    **When suggesting to import packages, make sure to check if the package actually exists and is correct. If installing it fails multiple times, it is not a valid package.**

    **BAD IMPORTS** (cause runtime errors):
    \`\`\`tsx
    import ReactFlow from '@xyflow/react';      // WRONG: ReactFlow is named export
    import cn from '@/lib/utils';               // WRONG: cn is named export  
    import { Button } from 'shadcn/ui';         // WRONG: should be @/components/ui
    import { useState } from 'react';           // MISSING: React itself
    import { useRouter } from 'next/navigation'; // WRONG: use 'react-router-dom'
    \`\`\`

    **GOOD IMPORTS** (correct syntax):
    \`\`\`tsx
    import React, { useState, useEffect } from 'react';  // ALWAYS import React
    import { ReactFlow } from '@xyflow/react';           // CORRECT: named export
    import { cn } from '@/lib/utils';                    // CORRECT: named export
    import { Button } from '@/components/ui/button';     // CORRECT: full path
    import { useNavigate } from 'react-router-dom';      // CORRECT for routing
    \`\`\`

    **Import Checklist**:
    - ✅ React imported in every TSX/JSX file
    - ✅ All @xyflow imports use named exports: { ReactFlow, Node, Edge }
    - ✅ All UI components use full @/components/ui/[component] path
    - ✅ cn function from '@/lib/utils' (named export)
    - ✅ Router hooks from 'react-router-dom' (not Next.js)

    **A \`require()\` or \`import()\` style import is forbidden. Always import properly at the top of the file.**
    # Few more heuristics:
        **IF** you receive a TypeScript error "cannot be used as a JSX component" for a component \`<MyComponent />\`, **AND** the error says its type is \`'typeof import(...)'\`, then check if the import is correct (named vs default import).
        Applying this rule to your situation will fix both the type-check errors and the browser's runtime error.

    # Never write image files! Never write jpeg, png, svg, etc files yourself! Always use some image url from the web.
    **Do not recommend installing \`cloudflare:workers\` or \`cloudflare:durable-objects\` as dependencies, these are already installed in the project always.**

</AVOID COMMON PITFALLS>`,
    COMMON_DEP_DOCUMENTATION: `<COMMON DEPENDENCY DOCUMENTATION>
    • **The @xyflow/react package doesn't export a default ReactFlow, it exports named imports.**
        - Don't import like this:
        \`import ReactFlow from '@xyflow/react';\`
        Doing this would cause a runtime error and the only hint you would get is a lint message: 'ReactFlow' cannot be used as a JSX component. Its type 'typeof import(...)' is not a valid JSX element type

        - Import like this:
        \`import { ReactFlow } from '@xyflow/react';\`
    • **@react-three/fiber ^9.0.0 and @react-three/drei ^10.0.0 require react ^19 and will not work with react ^18. And in general avoid using these**
        - Please upgrade react to 19 to use these packages.
        - With react 18, it will throw runtime error: Cannot read properties of undefined (reading 'S')
        react@18.3.1 three@^0.160.0 comlink@^4.4.1 idb-keyval@^6.2.1 simplex-noise@^4.0.1 @msgpack/msgpack@^2.8.0 - These work well together

    • **No support for dynamic imports may not work, so please avoid using them.**
    - **Zustand v5 (Always Installed in Templates):**
      - Selector patterns: See REACT INFINITE LOOP PREVENTION section for complete guidelines
      - v5 syntax for useShallow: \`import { useShallow } from 'zustand/react/shallow';\`
      - Store actions are stable and should NOT be in dependency arrays
</COMMON DEPENDENCY DOCUMENTATION>
`,
    COMMANDS: `<SETUP COMMANDS>
    • **Provide explicit commands to install necessary dependencies ONLY.** DO NOT SUGGEST MANUAL CHANGES. These commands execute directly.
    • **Dependency Versioning:**
        - **Use specific, known-good major versions.** Avoid relying solely on 'latest' (unless you are unsure) which can introduce unexpected breaking changes.
        - Always suggest a known recent compatible stable major version. If unsure which version might be available, don't specify any version.
        - Example: \`npm install react@18 react-dom@18\`
        - List commands to add dependencies separately, one command per dependency for clarity.
        - Make sure the packages actually exist and are correct.
    • **Format:** Provide ONLY the raw command(s) without comments, explanations, or step numbers, in the form of a list
    • **Execution:** These run *before* code generation begins.

Example:
\`\`\`sh
bun add react@18
bun add react-dom@18
bun add zustand@4
bun add immer@9
bun add shadcn@2
bun add @geist-ui/react@1
\`\`\`
</SETUP COMMANDS>
`,
    CODE_CONTENT_FORMAT: `<CODE CONTENT GENERATION RULES> 
    The generated content for any file should be one of the following formats: \`full_content\` or \`unified_diff\`.

    - **When working on an existing (previously generated) file and the scope of changes would be smaller than a unified diff, use \`unified_diff\` format.**
    - **When writing an entirely new file, or the scope of changes would be bigger than a unified diff, use \`full_content\` format.**
    - **Do not use \`unified_diff\` for modifying untouched template files.**
    - **Make sure to choose the format so as to minimize the total length of response.**

    <RULES FOR \`full_content\`>
        • **Content Format:** Provide the complete and raw content of the file. Do not escape or wrap the content in any way.
        • **Example:**
            \`\`\`
                function myFunction() {
                    console.log('Hello, world!');
                }
            \`\`\`
    </RULES FOR \`full_content\`>

    <RULES FOR \`unified_diff\`>
        • **Content Format:** Provide the diff of the file. Do not escape or wrap the content in any way.
        • **Usage:** Use this format when working to modify an existing file and it would be smaller to represent the diff than the full content.
        
        **Diff Format Rules:**
            • Return edits similar to diffs that \`diff -U0\` would produce.
            • Do not include the first 2 lines with the file paths.
            • Start each hunk of changes with a \`@@ ... @@\` line.
            • Do not include line numbers like \`diff -U0\` does. The user's patch tool doesn't need them. The user's patch tool needs CORRECT patches that apply cleanly against the current contents of the file!
            • Think carefully and make sure you include and mark all lines that need to be removed or changed as \`-\` lines.
            • Make sure you mark all new or modified lines with \`+\`.
            • Don't leave out any lines or the diff patch won't apply correctly.
            • Indentation matters in the diffs!
            • Start a new hunk for each section of the file that needs changes.
            • Only output hunks that specify changes with \`+\` or \`-\` lines.
            • Skip any hunks that are entirely unchanging \` \` lines.
            • Output hunks in whatever order makes the most sense. Hunks don't need to be in any particular order.
            • When editing a function, method, loop, etc try to use a hunk to replace the *entire* code block. Delete the entire existing version with \`-\` lines and then add a new, updated version with \`+\` lines.  This will help you generate correct code and correct diffs.
            • To move code within a file, use 2 hunks: 1 to delete it from its current location, 1 to insert it in the new location.
        **Example:**

** Instead of low level diffs like this: **
\`\`\`
@@ ... @@
-def factorial(n):
+def factorial(number):
-    if n == 0:
+    if number == 0:
         return 1
     else:
-        return n * factorial(n-1)
+        return number * factorial(number-1)
\`\`\`

**Write high level diffs like this:**

\`\`\`
@@ ... @@
-def factorial(n):
-    if n == 0:
-        return 1
-    else:
-        return n * factorial(n-1)
+def factorial(number):
+    if number == 0:
+        return 1
+    else:
+        return number * factorial(number-1)
\`\`\`

    </RULES FOR \`unified_diff\`>

    When a changes to a file are big or the file itself is small, it is better to use \`full_content\` format, otherwise use \`unified_diff\` format. In the end, you should choose a format that minimizes the total length of response.
</CODE CONTENT GENERATION RULES>
`,
    UI_GUIDELINES: `## UI MASTERY & INTERACTION QUALITY STANDARDS
    
    ### 🎨 VISUAL HIERARCHY MASTERY
    • **Typography Excellence:** Create clear text hierarchies sized to the surface:
        - Hero-scale headlines only for true hero/landing contexts, not compact playable scenes
        - Playable scenes: use compact, readable titles and status text that never covers controls or action
        - Subheadings: text-xl/2xl with font-semibold for clear structure  
        - Body: text-lg/base with font-medium for perfect readability
        - Captions: text-sm with font-normal for supporting details
        - **Color Psychology:** Use text-gray-900 for primary, text-gray-600 for secondary, text-gray-400 for tertiary
    • **Spacing Rhythm:** Create visual breathing room with harmonious spacing:
        - Content pages: space-y-8 md:space-y-12 for major sections
        - Playable scenes: compact spacing that keeps the stage, controls, and result visible on a phone viewport
        - Content blocks: space-y-6 md:space-y-8 for related content
        - Element spacing: space-y-3 md:space-y-4 for tight groupings
        - **Consistent Rhythm:** Use 8px base unit (space-2) and avoid arbitrary spacing that causes mobile overflow
    
    ### ✨ INTERACTIVE DESIGN EXCELLENCE
    • **Micro-Interactions:** Every interactive element must delight users:
        - **Hover States:** Subtle elevation (hover:shadow-lg), color shifts (hover:bg-blue-600), or scale (hover:scale-105)
        - **Focus States:** Beautiful ring outlines (focus:ring-2 focus:ring-blue-500 focus:ring-offset-2)
        - **Active States:** Pressed effects (active:scale-95) for tactile feedback
        - **Loading States:** Elegant spinners, skeleton screens, or pulse animations
        - **Transitions:** Smooth animations (transition-all duration-200 ease-in-out) for every state change
    • **Button Mastery:** Create buttons that users love to click:
        - **Primary:** Bold, vibrant colors (bg-blue-600 hover:bg-blue-700) with perfect contrast
        - **Secondary:** Subtle elegance (bg-gray-100 hover:bg-gray-200) with clear hierarchy
        - **Outline:** Clean borders (border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white)
        - **Danger:** Warning colors (bg-red-600 hover:bg-red-700) for destructive actions
    
    ### 🏗️ LAYOUT ARCHITECTURE EXCELLENCE
    • **Container Strategies:** Build layouts that feel intentional:
        - **Content Width:** Use max-w-7xl mx-auto for content/application pages
        - **Playable Stage:** Use a full-height responsive stage for games, toys, feed previews, and short interactive posts
        - **Responsive Padding:** px-4 sm:px-6 lg:px-8 for perfect edge spacing
        - **Section Spacing:** Use generous spacing for content pages and tighter stage-safe spacing for playable scenes
    • **Grid Systems:** Create balanced, scannable layouts:
        - **Content Grids:** grid-cols-1 md:grid-cols-2 lg:grid-cols-3 with consistent aspect ratios when browsing items
        - **Playable Layouts:** Stage-first composition with overlays anchored to safe areas
        - **Dashboard Grids:** Use only when the user explicitly asks for analytics/admin/business views
    • **Flexbox Mastery:** Perfect alignment and distribution:
        - **Navigation:** flex items-center justify-between for header layouts
        - **Cards:** flex flex-col justify-between for equal height card layouts
        - **Forms:** flex flex-col space-y-4 for clean form arrangements
    
    ### 🎯 COMPONENT DESIGN EXCELLENCE
    • **Card Components:** Design cards that are clear and purposeful:
        - Use cards for repeated items, result panels, inventory/choice trays, and modals
        - Avoid card-heavy compositions for the main playable surface
        - **Elevation:** Use shadow-sm, shadow-md, shadow-lg strategically for visual depth
        - **Borders:** Subtle border border-gray-200 or borderless with shadow for modern feel
        - **Padding:** p-6 md:p-8 for comfortable content spacing
        - **Hover Effects:** hover:shadow-xl hover:-translate-y-1 for delightful interactions
    • **Form Excellence:** Make forms a joy to use:
        - **Input States:** Beautiful focus rings, clear error states, success indicators
        - **Label Design:** font-medium text-gray-700 with proper spacing (mb-2)
        - **Error Handling:** text-red-600 text-sm with helpful, friendly messages
        - **Success Feedback:** text-green-600 with checkmark icons for validation
    • **Navigation Design:** Create intuitive navigation:
        - **Active States:** Clear indicators with color, background, or underline
        - **Breadcrumbs:** Subtle text-gray-500 with proper separators
        - **Mobile Menu:** Smooth slide-in animations with backdrop blur
    
    ### 📱 RESPONSIVE DESIGN MASTERY
    • **Mobile-First Excellence:** Design for mobile, enhance for desktop:
        - **Touch Targets:** Minimum 44px touch targets for mobile usability
        - **Typography Scaling:** text-2xl md:text-4xl lg:text-5xl for responsive headers
        - **Image Handling:** Prefer Tailwind v3-safe utilities like aspect-video or aspect-[16/9] for consistent image ratios
    • **Breakpoint Strategy:** Use Tailwind breakpoints meaningfully:
        - **sm (640px):** Tablet portrait adjustments
        - **md (768px):** Tablet landscape and small desktop
        - **lg (1024px):** Desktop layouts
        - **xl (1280px):** Large desktop enhancements
        - **2xl (1536px):** Ultra-wide optimizations
    
    ### 🌟 VISUAL POLISH CHECKLIST
    **Before completing any component, ensure:**
    - ✅ **Visual Rhythm:** Consistent spacing that creates natural reading flow
    - ✅ **Color Harmony:** Thoughtful color choices that support the brand and enhance usability
    - ✅ **Interactive Feedback:** Every clickable element responds clearly to user interaction
    - ✅ **Loading Elegance:** Graceful loading states that maintain user engagement
    - ✅ **Error Grace:** Helpful, non-intimidating error messages with clear next steps
    - ✅ **Empty State Beauty:** Inspiring empty states that guide users toward their first success
    - ✅ **Accessibility Excellence:** Proper contrast ratios, keyboard navigation, screen reader support
    - ✅ **Performance Smooth:** 60fps animations and instant perceived load times`,
    UI_NON_NEGOTIABLES_V3: `## UI NON-NEGOTIABLES (Tailwind v3-safe, shadcn/ui first)

1) Root Wrapper & Playable Stage
Default content/application pages should use:
export default function Page() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="py-8 md:py-10 lg:py-12">
        {/* content */}
      </div>
    </div>
  );
}

For playable posts, games, toys, feed previews, canvas/SVG scenes, or touch-first experiences, use a stage-first root instead:
export default function Page() {
  return (
    <main className="min-h-[100dvh] w-full overflow-hidden px-3 py-3 sm:px-4">
      {/* responsive playable stage */}
    </main>
  );
}

2) Prefer shadcn/ui components heavily
- Use shadcn/ui primitives for structure and widgets (e.g., Button, Card, Input, Sheet, Sidebar) when they fit the interaction
- Import from "@/components/ui/..." and compose with Tailwind utilities. Use Radix primitives as needed for composition.
- For custom game controls, canvas/SVG scenes, and animated props, plain React + Tailwind/CSS is acceptable when it is simpler and safer.

3) Tailwind v3-safe Instructions
- Avoid CSS @theme or CSS @plugin directives in component styles
- Prefer built-in utilities only; avoid plugin-only utilities unless template shows they exist
- For media sizing, prefer aspect-video or aspect-[16/9] and object-cover

4) Good vs Bad
- BAD: top-level <div> with no gutters (content flush to the left edge)
- GOOD for content pages: wrap with max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 and section spacing py-8 md:py-10 lg:py-12
- GOOD for playable scenes: min-h-[100dvh] w-full overflow-hidden with safe-area padding and a responsive stage

5) Color & Contrast (light theme defaults)
- Primary labels: text-foreground
- Secondary/meta: text-muted-foreground
- Selected state: bg-accent text-accent-foreground (or bg-primary text-primary-foreground)
- Icons: text-foreground/80 hover:text-foreground
- Inputs: bg-secondary text-secondary-foreground border border-input; placeholder:text-muted-foreground
- Never place muted text over dark backgrounds; if background is dark, use paired *-foreground or text-white
- Aim for >= 4.5:1 contrast for normal text (>= 3:1 for large)
`,
    BUZZPLAY_PLAYABLE_CONTENT_GUIDELINES: `## BUZZPLAY PLAYABLE CONTENT GUIDELINES

These rules take precedence over generic landing-page, dashboard, or long-form app guidance for interactive app/game requests.

### Product Intent
- Build a "playable post": a short, mobile-first interactive content unit that users can play, replay, share, and remix.
- Do not default to a static landing page, feature explainer, or technical demo unless the user explicitly asks for one.
- The experience should be understandable in 1 second, interactive within 5 seconds, and deliver a payoff/result within 15-30 seconds.
- Preserve the user's concrete request first. Add creative interpretation only to clarify, heighten, or complete a simple idea without replacing it.

### Creative Expansion For Simple Ideas
- If the prompt is short or vague, choose one clear playable format:
  - Playable meme: tap, drag, choose, reveal, trigger a surprising outcome.
  - Social challenge: timed action, score, streak, rank, or result card.
  - Character toy: a character reacts to user choices, props, timing, or combinations.
- Always include a clear hook, one primary action, immediate feedback, an ending/payoff state, and a replay/remix-friendly result.
- Prefer small scenes with expressive UI, props, character reactions, sound/visual feedback cues, and surprising micro-interactions over complex game systems.
- 3D is acceptable when it feels like a toy, tabletop scene, paper theater, low-poly prop, or physics-like object interaction. Avoid big worlds, realistic humans, precise action games, or cinematic video-like scenes.

### Mobile-First Interaction
- Design for a vertical phone feed first: 360-430px wide, 100dvh tall, with safe-area padding and no clipped controls.
- For playable scenes, use a stage-first root such as min-h-[100dvh] w-full overflow-hidden with a responsive stage; do not force a generic max-w dashboard wrapper if it hurts gameplay.
- Keep all essential controls reachable by thumb. Touch targets must be at least 44px, with enough spacing to avoid accidental taps.
- Support pointer events so mouse and touch both work. Do not rely on hover-only interactions.
- Handle drag/tap gestures carefully: prevent unwanted page scroll while dragging, clamp positions to the stage, and release pointer capture cleanly.
- Canvas/SVG/absolute-positioned elements must resize with the container. Recompute bounds on resize/orientation changes and account for devicePixelRatio when drawing canvas.
- Preview and live play should match: avoid hard-coded pixel sizes, viewport assumptions, or iframe-dependent offsets.

### Reliability And Finish
- Ship a complete playable first screen in the initial phase. No blank screens, placeholder-only pages, or "coming soon" states.
- Guard every interaction path with safe defaults. Never read from possibly undefined objects without checks.
- Timers, requestAnimationFrame loops, event listeners, and pointer listeners must be cleaned up.
- Keep state transitions simple and testable: start -> playing -> result/replay, or equivalent.
- Use only available dependencies and valid imports. If a dependency is optional or uncertain, implement with React, Tailwind, CSS, SVG, or canvas instead.
- Prefer robust fallback visuals for missing user assets. Uploaded assets should enhance the scene but must not be required for the app to render.
`,
    KAPLAY_PLAYABLE_DEVELOPMENT_GUIDELINES: `## KAPLAY PLAYABLE DEVELOPMENT GUIDELINES

Official KAPLAY guides: https://kaplayjs.com/docs/guides/

Use these rules when the selected template is "buzzplay-kaplay-playable" or the project imports KAPLAY:
- Build the playable inside \`src/game/playable-game.ts\`; keep React responsible for mounting the canvas and light platform UI only.
- Structure the game with KAPLAY scenes such as \`start\`, \`game\`, and \`result\` so state transitions stay simple and replayable.
- Prefer KAPLAY primitives and components: \`pos\`, \`area\`, \`body\`, \`move\`, \`anchor\`, \`sprite\`, \`rect\`, \`circle\`, \`text\`, \`onUpdate\`, \`loop\`, and \`onCollide\`.
- Use KAPLAY collision and scene APIs for outcomes instead of DOM hit-testing or React state-driven animation loops.
- Keep controls mobile-first: tap, hold, drag, swipe, one-thumb lanes, or large choice zones. Keyboard support is optional fallback, not the main path.
- Use the template's \`src/lib/playable-assets.ts\` helpers for uploaded media from \`src/asset_map\`; always include shape/color fallbacks.
- Do not add Phaser, PixiJS, Three.js, Matter.js, or new game engines unless the user explicitly asks and the dependency is available.
- Avoid changing \`package.json\`, \`vite.config.ts\`, or \`wrangler.jsonc\`; KAPLAY is already provided by the template.
`,
PROJECT_CONTEXT: `Here is everything you will need about the project:

<PROJECT_CONTEXT>

{{phasesText}}

<CODEBASE>

Here are all the latest relevant files in the current codebase:

{{files}}

**THESE DO NOT INCLUDE PREINSTALLED SHADCN COMPONENTS, REDACTED FOR SIMPLICITY. BUT THEY DO EXIST AND YOU CAN USE THEM.**

<FILE_TREE>
**Use these files as a reference for the file structure, components and hooks that are present**

{{fileTree}}

</FILE_TREE>

</CODEBASE>

{{commandsHistory}}

</PROJECT_CONTEXT>
`,
}

/*

<LAST_DIFFS>
These are the changes that have been made to the codebase since the last phase:

{{lastDiffs}}

</LAST_DIFFS>
*/

export const STRATEGIES_UTILS = {
    INITIAL_PHASE_GUIDELINES: `**First Phase: Complete Playable First Screen & Stable Interaction**
        * **PLAYABLE CONTENT FOUNDATION:** Build the core playable post immediately:
            - One clear hook visible on the first screen
            - One primary tap, drag, choice, timing, or manipulation interaction
            - Immediate visual feedback on the first user action
            - A simple state flow such as start -> playing -> result -> replay/remix
            - A payoff/result that can be replayed, screenshotted, shared, or remixed
        * **MOBILE-FIRST STAGE:** Design the first screen around a phone feed viewport:
            - Responsive full-height stage for playable scenes
            - Safe-area-aware controls with 44px minimum touch targets
            - No clipped buttons, hidden instructions, or iframe-specific offsets
            - Pointer events that work for both touch and mouse
        * **LEAN VISUAL POLISH:** Make the experience stop-scrolling without overbuilding:
            - Strong visual identity, readable typography, and clear hierarchy
            - Small expressive props, reactions, effects, or character moments
            - Smooth transitions that support feedback and do not block play
            - Fallback visuals when uploaded assets are missing or still loading
        * **RELIABLE CORE FUNCTIONALITY:** Implement the smallest complete loop safely:
            - No blank screen, placeholder-only page, or "coming soon" state
            - Safe defaults for all data and assets
            - Timers, RAF loops, and event listeners cleaned up
            - Type-safe imports and simple state transitions
        * **Phase Granularity:** For simple playable posts, deliver a complete working experience in one phase. For larger apps, still make the initial phase immediately playable and demoable.
        * **Deployable Milestone:** First phase should be something a user can play right away on mobile preview.
        * **Override template home page**: Be sure to rewrite the home page of the app. Do not remove the existing homepage, rewrite on top of it.`,
    SUBSEQUENT_PHASE_GUIDELINES: `**Subsequent Phases: Requested Changes, Reliability, and Playable Polish**
        * **USER FEEDBACK FIRST:** Address explicit user requests, reported issues, and asset-specific changes before speculative enhancements.
        * **INTERACTION REFINEMENT:** Improve what makes the content playable:
            - Tighter touch/drag behavior
            - More satisfying feedback and result states
            - Better replay, retry, and remix affordances
            - Clearer scoring, timing, choices, or character reactions
        * **MOBILE AND PREVIEW CONSISTENCY:** Keep the preview iframe and live play aligned:
            - Responsive stage sizing across mobile, tablet, and desktop
            - Bounds recalculated on resize/orientation changes
            - Controls anchored to safe areas
            - No hard-coded viewport assumptions that shift clickable targets
        * **RELIABILITY OVER SCOPE:** Fix runtime errors, broken imports, undefined access, render loops, and unusable interactions before adding more features.
        * **VISUAL POLISH WITH PURPOSE:** Refine spacing, colors, animations, and copy when they improve playability, clarity, or shareability.
        * **FINAL PHASE:** Deliver a stable playable experience with complete requested behavior, clean runtime, clear result/replay state, and no critical layout issues.`,
    CODING_GUIDELINES: `**Make sure the product is FUNCTIONAL and POLISHED**
    **MAKE SURE TO NOT BREAK THE APPLICATION in SUBSEQUENT PHASES. Always keep fallbacks and failsafes in place for any backend interactions. Look out for simple syntax errors and dependencies you use!**
    **The user needs a good playable preview after each phase. The initial first phase is the most important because it proves the idea can be played, not just viewed. Make sure it deploys and renders well.**
    **Make sure the primary (home) page is rendered correctly and as expected after each phase**
    **Make sure to overwrite the home page file**`,
    CONSTRAINTS: `<PHASE GENERATION CONSTRAINTS>
        **For BuzzPlay interactive content, focus on building a complete playable first screen in the initial phase, then refine interactions, visuals, and requested features.**    
        **Before writing any components of your own, make sure to check the existing components and files in the template, try to use them if possible (for example preinstalled shadcn components)**
        **If auth functionality is required, provide mock auth functionality primarily. Provide real auth functionality ONLY IF template has persistence layer. Remember to seed the persistence layer with mock data AND Always PREFILL the UI with mock credentials. No oauth needed**

        **Single-screen playable posts, memeplays, character toys, short challenges, and small canvas/SVG games are considered **Simple Projects** unless the user explicitly asks for a platform or multiple views.**
        **Applications with multiple views/pages, persistence, accounts, dashboards, or complex workflows are considered **Complex Projects** and should be designed accordingly.**
        * **Phase Count:** Aim for a maximum of 1 phase for simple applications and 3-7 phases for complex applications. Each phase should be self-contained. Do not exceed more than ${Math.floor(MAX_PHASES * 0.8)} phases unless addressing complex client requirements or feedbacks.
        * **File Count:** Aim for a maximum of 1-3 files per phase when each file is big and self-container, or 8-12 files per phase when most files are small (< 100 lines).
        * The number of files in the project should be proportional to the number of views/pages that the project has.
        * Keep the size of codebase as small as possible, write encapsulated and abstracted code that can be reused, maximize code and component reuse and modularity. If a function/component is to be used in multiple files, it should be defined in a shared file.
        **DO NOT WRITE/MODIFY README FILES, LICENSES, ESSENTIAL CONFIG, OR OTHER NON-APPLICATION FILES as they are already configured in the final deployment. You are allowed to modify tailwind.config.js, vite.config.js etc if necessary**
            - Be very careful while working on vite.config.js, tailwind.config.js, etc. as any wrong changes can break the application.
        **DO NOT WRITE pdf files, images, or any other non-text files as they are not supported by the deployment.**

        **Examples**:
            * Building a boss meeting survival challenge, character reaction toy, playable meme, or result-card challenge: Single playable post -> **Simple Project** - 1 phase and 1-3 files. Initial phase should yield a complete loop with result/replay.
            * Building any tic-tac-toe game: Has a single page, simple logic -> **Simple Project** - 1 phase and 1-2 files that contain most of the code. Initial phase should yield a perfectly working game.        
            * Building any themed 2048 game: Has a single page, simple logic -> **Simple Project** - 1 phase and 2 files max that contain most of the code. Initial phase should yield a perfectly working game.
            * Building a full chess platform: Has multiple pages -> **Complex Project** - 3-5 phases and 5-15 files, with initial phase having around 5-11 files and should have the primary homepage working with mockups for all other views.
            * Building a full e-commerce platform: Has multiple pages -> **Complex Project** - 3-5 phases and 5-15 files max, with initial phase having around 5-11 files and should have the primary homepage working with mockups for all other views.
            * Building a minecraft clone: Has complex 3d rendering and multiple views -> **Complex Project** - 5-7 phases and 10-20 files max

        <TRUST & SAFETY POLICIES>
        • **NEVER** provide any code that can be used to perform nefarious/malicious activities.
        • **If a user asks to build a clone or look-alike of a popular product or service, alter the name and description, and explicitly add a visible disclaimer that it is a clone or look-alike to avoid phishing concerns.**
        • **NEVER** Let users build applications for phishing or malicious purposes.
        </TRUST & SAFETY POLICIES>
    </PHASE GENERATION CONSTRAINTS>`,
}

export const STRATEGIES = {
    FRONTEND_FIRST_PLANNING: `<PHASES GENERATION STRATEGY>
    **STRATEGY: Playable Content First / Stable Interaction First**
    The project is developed live: the user receives a preview after each phase.
    The core principle is to establish a complete, mobile-first playable surface early, before layering in more advanced functionality.
    The goal is to build and demo something users can actually play, understand, and replay as fast as possible.
    **Each phase should be self-contained, deployable and demoable.**
    The number of phases and files per phase should scale based on the number of views/pages and complexity of the application, layed out as follows:

    ${STRATEGIES_UTILS.INITIAL_PHASE_GUIDELINES}

    ${STRATEGIES_UTILS.SUBSEQUENT_PHASE_GUIDELINES}

    ${STRATEGIES_UTILS.CONSTRAINTS}

    **Keep accessibility basics that support interaction (labels, focus, semantic controls), but do not overcomplicate the playable loop. Focus on delivering an actually working, polished and complete experience in as few phases as possible.**
    **Always stick to existing project/template patterns. Respect and work with existing worker bindings rather than making custom ones**
    **Rely on open source tools and free tier services only apart from whats configured in the environment. Refer to template usage instructions to know if specific cloudflare services are also available for use.**
    **Make sure to implement all the features and functionality requested by the user. Stick to the blueprint's implementation roadmap and end at the conclusion of the final phase. There should be no compromises**
    **This is a Cloudflare Workers & Durable Objects project. The environment is preconfigured. Absolutely DO NOT Propose changes to wrangler.toml or any other config files. These config files are hidden from you but they do exist.**
    **The Homepage of the frontend is a dummy page. It should be rewritten as the primary page of the application in the initial phase.**
    **Refrain from editing any of the 'dont touch' files in the project, e.g - package.json, vite.config.ts, wrangler.jsonc, etc.**
</PHASES GENERATION STRATEGY>`, 
FRONTEND_FIRST_CODING: `<PHASES GENERATION STRATEGY>
    **STRATEGY: Playable Content First / Stable Interaction First**
    The project is developed live: the user receives a preview after each phase.
    The core principle is to establish a complete, mobile-first playable surface early, before layering in more advanced functionality.
    The goal is to build and demo something users can actually play, understand, and replay as fast as possible.
    **Each phase should be self-contained, deployable and demoable**

    ${STRATEGIES_UTILS.INITIAL_PHASE_GUIDELINES}

    ${STRATEGIES_UTILS.SUBSEQUENT_PHASE_GUIDELINES}

    ${STRATEGIES_UTILS.CODING_GUIDELINES}

    **Make sure to implement all the features and functionality requested by the user. Add creative touches only when they support the user's idea and keep the experience stable.**
</PHASES GENERATION STRATEGY>`, 
}

export interface GeneralSystemPromptBuilderParams {
    query: string,
    templateDetails?: TemplateDetails,
    dependencies?: Record<string, string>,
    blueprint?: Blueprint,
    language?: string,
    frameworks?: string[],
    templateMetaInfo?: TemplateSelection,
}

export function generalSystemPromptBuilder(
    prompt: string,
    params: GeneralSystemPromptBuilderParams
): string {
    // Base variables always present
    const variables: Record<string, string> = {
        query: params.query,
    };
    
    // Template context (optional)
    if (params.templateDetails) {
        variables.template = PROMPT_UTILS.serializeTemplate(params.templateDetails);
        variables.dependencies = JSON.stringify(params.dependencies ?? {});
    }

    // Blueprint variables - discriminate by type
    if (params.blueprint) {
        if ('implementationRoadmap' in params.blueprint) {
            // Phasic blueprint
            const phasicBlueprint = params.blueprint as PhasicBlueprint;
            const blueprintForPrompt = { ...phasicBlueprint, initialPhase: undefined };
            variables.blueprint = TemplateRegistry.markdown.serialize(blueprintForPrompt, BlueprintSchemaLite);
            variables.blueprintDependencies = phasicBlueprint.frameworks?.join(', ') ?? '';
        } else {
            // Agentic blueprint
            const agenticBlueprint = params.blueprint as AgenticBlueprint;
            variables.blueprint = TemplateRegistry.markdown.serialize(agenticBlueprint, AgenticBlueprintSchema);
            variables.blueprintDependencies = agenticBlueprint.frameworks?.join(', ') ?? '';
            variables.agenticPlan = agenticBlueprint.plan.map((step, i) => `${i + 1}. ${step}`).join('\n');
        }
    }

    // Optional language and frameworks
    if (params.language) {
        variables.language = params.language;
    }
    if (params.frameworks) {
        variables.frameworks = params.frameworks.join(', ');
    }
    if (params.templateMetaInfo) {
        variables.usecaseSpecificInstructions = getUsecaseSpecificInstructions(params.templateMetaInfo);
    }

    const formattedPrompt = PROMPT_UTILS.replaceTemplateVariables(prompt, variables);
    return PROMPT_UTILS.verifyPrompt(formattedPrompt);
}

export function issuesPromptFormatter(issues: IssueReport): string {
    const runtimeErrorsText = PROMPT_UTILS.serializeErrors(issues.runtimeErrors);
    const staticAnalysisText = PROMPT_UTILS.serializeStaticAnalysis(issues.staticAnalysis);
    
    return `## ERROR ANALYSIS PRIORITY MATRIX

### 1. CRITICAL RUNTIME ERRORS (Fix First - Deployment Blockers)
**Error Count:** ${issues.runtimeErrors?.length || 0} runtime errors detected
**Contains Render Loops:** ${runtimeErrorsText.includes('Maximum update depth') || runtimeErrorsText.includes('Too many re-renders') || runtimeErrorsText.includes('infinite loop') ? 'YES - HIGHEST PRIORITY' : 'No'}

${runtimeErrorsText || 'No runtime errors detected'}

### 2. STATIC ANALYSIS ISSUES (Fix After Runtime Issues)
**Lint Issues:** ${issues.staticAnalysis?.lint?.issues?.length || 0}
**Type Issues:** ${issues.staticAnalysis?.typecheck?.issues?.length || 0}

${staticAnalysisText}

## ANALYSIS INSTRUCTIONS
- **PRIORITIZE** "Maximum update depth exceeded" and useEffect-related errors. If 'Warning: The result of getSnapshot should be cached to avoid an infinite loop' is present, it is a high priority issue to be resolved ASAP. 
- **CROSS-REFERENCE** error messages with current code structure (line numbers may be outdated)
- **VALIDATE** reported issues against actual code patterns before fixing
- **FOCUS** on deployment-blocking runtime errors over linting issues`
}

const COMPLETED_PHASES_CONTEXT = `
<COMPLETED_PHASES>

The following phases have been completed and implemented:

{{redactionNotice}}

{{phases}}

</COMPLETED_PHASES>`

export const USER_PROMPT_FORMATTER = {
    PROJECT_CONTEXT: (phases: PhaseConceptType[], files: FileState[], fileTree: FileTreeNode, commandsHistory: string[], serializerType: CodeSerializerType = CodeSerializerType.SIMPLE) => {
        let lastPhaseFilesDiff = '';
        let phasesText = '';
        try {
            if (phases.length > 1) {
                const lastPhase = phases[phases.length - 1];
                if (lastPhase && lastPhase.files) {
                    // Get last phase files diff only
                    const fileMap = new Map<string, FileState>();
                    files.forEach((file) => fileMap.set(file.filePath, file));
                    const lastPhaseFiles = lastPhase.files.map((file) => fileMap.get(file.path)).filter((file) => file !== undefined);
                    lastPhaseFilesDiff = lastPhaseFiles.map((file) => file.lastDiff).join('\n');
        
                    // Set lastPhase = false for all phases but the last
                    phases.forEach((phase) => {
                        if (phase !== lastPhase) {
                            phase.lastPhase = false;
                        }
                    });
                }

                // Split phases into older (redacted) and last
                const olderPhases = phases.slice(0, -1);
                
                // Serialize older phases without files, recent phases with files
                if (olderPhases.length > 0) {
                    const olderPhasesLite = olderPhases.map(({ name, description }) => ({ name, description }));
                    phasesText += TemplateRegistry.markdown.serialize({ phases: olderPhasesLite }, z.object({ phases: z.array(PhaseConceptLiteSchema) }));
                }
                phasesText += '\n\nLast Phase Implemented:\n' + TemplateRegistry.markdown.serialize(lastPhase, PhaseConceptSchema);
                
                const redactionNotice = olderPhases.length > 0 
                    ? `**Note:** File details for the first ${olderPhases.length} phase(s) have been redacted to optimize context. Only the last phase includes complete file information.\n` 
                    : '';

                phasesText = COMPLETED_PHASES_CONTEXT.replaceAll('{{phases}}', phasesText).replaceAll('{{redactionNotice}}', redactionNotice);
            }
        } catch (error) {
            console.error('Error processing project context:', error);
        }

        const relevantFiles = getCodebaseContext(files);

        const variables: Record<string, string> = {
            phasesText: phasesText,
            files: PROMPT_UTILS.serializeFiles(relevantFiles, serializerType),
            fileTree: PROMPT_UTILS.serializeTreeNodes(fileTree),
            lastDiffs: lastPhaseFilesDiff,
            commandsHistory: commandsHistory.length > 0 ? `<COMMANDS HISTORY>\n\nThe following commands have been executed successfully in the project environment so far (These may not include the ones that are currently pending):\n\n${commandsHistory.join('\n')}\n\n</COMMANDS HISTORY>` : ''
        };

        const prompt = PROMPT_UTILS.replaceTemplateVariables(PROMPT_UTILS.PROJECT_CONTEXT, variables);
        
        return PROMPT_UTILS.verifyPrompt(prompt);
    },
};

const getStyleInstructions = (style: TemplateSelection['styleSelection']): string => {
    switch (style) {
        case `Brutalism`:
            return `
**Style Name: Brutalism**
- Characteristics: Raw aesthetics, often with bold vibrant colors on light background, large typography, large elements.
- Philosophy: Emphasizes honesty and simplicity, Non-grid, asymmetrical layouts that ignore traditional design hierarchy.
- Example Elements: Large, blocky layouts, heavy use of whitespace, unconventional navigation patterns.
`;
        case 'Retro':
            return `
**Style Name: Retro**
- Characteristics: Early-Internet graphics, pixel art, 3D objects, or glitch effects.
- Philosophy: Nostalgia-driven, aiming to evoke the look and feel of 90s or early 2000s web culture.
- Example Elements: Neon palettes, grainy textures, gradient meshes, and quirky fonts.`;
        case 'Illustrative':
            return `
**Style Name: Illustrative**
- Characteristics: Custom illustrations, sketchy graphics, and playful elements
- Philosophy: Human-centered, whimsical, and expressive.
- Example Elements: Cartoon-style characters, brushstroke fonts, animated SVGs.
- Heading Font options: Playfair Display, Fredericka the Great, Great Vibes
            `
//         case 'Neumorphism':
//             return `
// **Style Name: Neumorphism (Soft UI)**
// - Use a soft pastel background, high-contrast accent colors for functional elements e.g. navy, coral, or bright blue. Avoid monochrome UIs
// - Light shadow (top-left) and dark shadow (bottom-right) to simulate extrusion or embedding, Keep shadows subtle but visible to prevent a washed-out look.
// - Avoid excessive transparency in text — keep readability high.
// - Integrate glassmorphism subtly`;
        case `Kid_Playful`:
            return `
**Style Name: Kid Playful**
- Bright, contrasting colors
- Stylized illustrations resembling 2D animation or children's book art
- Smooth, rounded shapes and clean borders—no gradients or realism
- Similar to Pablo Stanley, Burnt Toast Creative, or Outline-style art.
- Children's book meets modern web`
        case 'Minimalist Design':
            return `
**Style Name: Minimalist Design**
Characteristics: Clean layouts, lots of white space, limited color palettes, and simple typography.
Philosophy: "Less is more." Focuses on clarity and usability.
Example Elements: Monochrome schemes, subtle animations, grid-based layouts.
** Apply a gradient background or subtle textures to the hero section for depth and warmth.
`
    }
    return `
** Apply a gradient background or subtle textures to the hero section for depth and warmth.
** Choose a modern sans-serif font like Inter, Sora, or DM Sans
** Use visual contrast: white or light background, or very soft gradient + clean black text.
    `
};

const SAAS_LANDING_INSTRUCTIONS = (style: TemplateSelection['styleSelection']): string => `
** If there is no brand/product name specified, come up with a suitable name
** Include a prominent hero section with a headline, subheadline, and a clear call-to-action (CTA) button above the fold.
** Insert a pricing table with tiered plans if applicable
** Design a footer with key navigation links, company info, social icons, and a newsletter sign-up.
** Add a product feature section using icon-text pairs or cards to showcase 3-6 key benefits.
** Use a clean, modern layout with generous white space and a clear visual hierarchy
** Show the magic live i.e if possible show a small demo of the product. Only if simple and feasible.
** Generate SVG illustrations where absolutely relevant.

Use the following artistic style:
${getStyleInstructions(style)}
`;

const ECOMM_INSTRUCTIONS = (): string => `
** If there is no brand/product name specified, come up with a suitable name
** Include a prominent hero section with a headline, subheadline, and a clear call-to-action (CTA) button above the fold.
** Insert a product showcase section with high-quality images, descriptions, and prices.
** Provide a collapsible sidebar (desktop) or an expandable top bar (tablet/mobile) containing filters (category, price range slider, brand, color swatches), so users can refine results without leaving the page.
** Use a clean, modern layout with generous white space and a clear visual hierarchy
`;

const DASHBOARD_INSTRUCTIONS = (): string => `
** If applicable to user query group Related Controls and Forms into Well-Labeled Cards / Panels
** If applicable to user query offer Quick Actions / Shortcuts for Common Tasks
** If user asked for analytics/visualizations/statistics - Show sparklines, mini line/bar charts, or simple pie indicators for trends 
** If user asked for analytics/visualizations/statistics - Maybe show key metrics in modular cards
** If applicable to user query make It Interactive and Contextual (Filters, Search, Pagination)
** If applicable to user query add a sidebar and or tabs
** Dashboard should be information dense.
`;

const BUZZPLAY_KAPLAY_INSTRUCTIONS = (): string => `
Use this project as a BuzzPlay playable post, not a conventional website.
- Lead with the playable scene, not a marketing hero, feature explainer, dashboard, or card-only UI.
- Expand simple creator prompts into one clear mobile interaction, immediate feedback, a result/payoff scene, and replay.
- Use KAPLAY for the core loop, scene transitions, collisions, spawning, scoring, and touch controls.
- Keep React outside the game loop except for mounting the canvas and optional lightweight overlays.
- Use uploaded assets through \`src/asset_map\` helpers when relevant, with visual fallbacks.
- Treat the selected style as the playable's visual mood: palette, props, typography, particles, result copy, and feedback effects.

${PROMPT_UTILS.KAPLAY_PLAYABLE_DEVELOPMENT_GUIDELINES}`;

export const getUsecaseSpecificInstructions = (selectedTemplate: TemplateSelection): string => {
    if (selectedTemplate.selectedTemplateName === 'buzzplay-kaplay-playable') {
        return BUZZPLAY_KAPLAY_INSTRUCTIONS();
    }

    switch (selectedTemplate.useCase) {
        case 'SaaS Product Website':
            return SAAS_LANDING_INSTRUCTIONS(selectedTemplate.styleSelection);
        case 'E-Commerce':
            return ECOMM_INSTRUCTIONS();
        case 'Dashboard':
            return DASHBOARD_INSTRUCTIONS();
        default:
            return `Use the following artistic style:
            ${getStyleInstructions(selectedTemplate.styleSelection)}`;
    }
}
