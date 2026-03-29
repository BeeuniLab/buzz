import type { CodeIssue, StaticAnalysisResponse, LintSeverity } from '../../types/project-types';

export interface FileInput {
	path: string;
	content: string;
}

export interface IStaticAnalyzer {
	analyze(files: FileInput[]): Promise<StaticAnalysisResponse>;
}

export interface LanguageAnalyzer {
	readonly supportedExtensions: string[];
	analyze(file: FileInput): CodeIssue[];
}

export interface CrossFileValidator {
	validate(files: FileInput[]): CodeIssue[];
}

export type { CodeIssue, StaticAnalysisResponse, LintSeverity };
