import * as z from 'zod'

// --- Core File/Template Types ---

export interface FileTreeNode {
    path: string;
    type: 'file' | 'directory';
    children?: FileTreeNode[];
}

export const FileTreeNodeSchema: z.ZodType<FileTreeNode> = z.lazy(() => z.object({
    path: z.string(),
    type: z.enum(['file', 'directory']),
    children: z.array(FileTreeNodeSchema).optional(),
}));

export const TemplateFileSchema = z.object({
    filePath: z.string(),
    fileContents: z.string(),
})
export type TemplateFile = z.infer<typeof TemplateFileSchema>

// ==========================================
// RUNTIME ERROR SCHEMAS
// ==========================================

export const SimpleErrorSchema = z.object({
  timestamp: z.string(),
  level: z.number(),
  message: z.string(),
  rawOutput: z.string()
});
export type SimpleError = z.infer<typeof SimpleErrorSchema>;

export const StoredErrorSchema = SimpleErrorSchema.extend({
  id: z.number(),
  instanceId: z.string(),
  processId: z.string(),
  errorHash: z.string(),
  occurrenceCount: z.number(),
  createdAt: z.string()
});
export type StoredError = z.infer<typeof StoredErrorSchema>;

export const RuntimeErrorSchema = SimpleErrorSchema
export type RuntimeError = z.infer<typeof RuntimeErrorSchema>

// --- Template Info & Details ---

export const TemplateInfoSchema = z.object({
    name: z.string(),
    language: z.string().optional(),
    frameworks: z.array(z.string()).optional(),
    projectType: z.enum(['app', 'workflow', 'presentation', 'general']).default('app'),
    description: z.object({
        selection: z.string(),
        usage: z.string(),
    }),
    renderMode: z.enum(['sandbox', 'browser']).optional(),
    slideDirectory: z.string().optional(),
    disabled: z.boolean(),
})
export type TemplateInfo = z.infer<typeof TemplateInfoSchema>

export const TemplateDetailsSchema = TemplateInfoSchema.extend({
    fileTree: FileTreeNodeSchema,
    allFiles: z.record(z.string(), z.string()),
    deps: z.record(z.string(), z.string()),
    importantFiles: z.array(z.string()),
    dontTouchFiles: z.array(z.string()),
    redactedFiles: z.array(z.string()),
})
export type TemplateDetails = z.infer<typeof TemplateDetailsSchema>

export const TemplateListResponseSchema = z.object({
    success: z.boolean(),
    templates: z.array(TemplateInfoSchema),
    count: z.number(),
    error: z.string().optional(),
})
export type TemplateListResponse = z.infer<typeof TemplateListResponseSchema>

export const TemplateDetailsResponseSchema = z.object({
    success: z.boolean(),
    templateDetails: TemplateDetailsSchema.optional(),
    error: z.string().optional(),
})
export type TemplateDetailsResponse = z.infer<typeof TemplateDetailsResponseSchema>

export const GetTemplateFilesRequestSchema = z.object({
    filePaths: z.array(z.string()),
})
export type GetTemplateFilesRequest = z.infer<typeof GetTemplateFilesRequestSchema>

export const GetTemplateFilesResponseSchema = z.object({
    success: z.boolean(),
    files: z.array(TemplateFileSchema),
    errors: z.array(z.object({ file: z.string(), error: z.string() })).optional(),
    error: z.string().optional(),
})
export type GetTemplateFilesResponse = z.infer<typeof GetTemplateFilesResponseSchema>

// --- Preview ---

export const PreviewSchema = z.object({
    runId: z.string().optional(),
    previewURL: z.string().optional(),
    tunnelURL: z.string().optional(),
})
export type PreviewType = z.infer<typeof PreviewSchema>

// --- Lint & Static Analysis ---

export const LintSeveritySchema = z.enum(['error', 'warning', 'info'])
export type LintSeverity = z.infer<typeof LintSeveritySchema>

export const CodeIssueSchema = z.object({
    message: z.string(),
    filePath: z.string(),
    line: z.number(),
    column: z.number().optional(),
    severity: LintSeveritySchema,
    ruleId: z.string().optional(),
    source: z.string().optional()
})
export type CodeIssue = z.infer<typeof CodeIssueSchema>

export const CodeIssueResponseSchema = z.object({
    issues: z.array(CodeIssueSchema),
    summary: z.object({
        errorCount: z.number(),
        warningCount: z.number(),
        infoCount: z.number()
    }).optional(),
    rawOutput: z.string().optional(),
})
export type CodeIssueResponse = z.infer<typeof CodeIssueResponseSchema>

export const StaticAnalysisResponseSchema = z.object({
    success: z.boolean(),
    lint: CodeIssueResponseSchema,
    typecheck: CodeIssueResponseSchema,
    error: z.string().optional()
})
export type StaticAnalysisResponse = z.infer<typeof StaticAnalysisResponseSchema>

// --- Cloudflare Deployment ---

export const DeploymentCredentialsSchema = z.object({
    apiToken: z.string().optional(),
    accountId: z.string().optional(),
})
export type DeploymentCredentials = z.infer<typeof DeploymentCredentialsSchema>

export const DeploymentResultSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    deployedUrl: z.string().optional(),
    deploymentId: z.string().optional(),
    output: z.string().optional(),
    error: z.string().optional(),
})
export type DeploymentResult = z.infer<typeof DeploymentResultSchema>
