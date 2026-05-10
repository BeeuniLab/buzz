import type { FileType } from '@/api-types';
import { getFileType } from '@/utils/string';

/**
 * Update a specific file in the files array
 */
export function updateFileInArray(
    files: FileType[],
    filePath: string,
    updates: Partial<FileType>
): FileType[] {
    const existingFileIndex = files.findIndex(f => f.filePath === filePath);
    
    if (existingFileIndex >= 0) {
        return files.map((file, index) => 
            index === existingFileIndex 
                ? { ...file, ...updates }
                : file
        );
    }
    
    // Add new file if it doesn't exist
    return [...files, {
        filePath,
        fileContents: '',
        isGenerating: false,
        needsFixing: false,
        hasErrors: false,
        language: getFileType(filePath),
        ...updates
    }];
}

/**
 * Add or update a file with generating state
 */
export function setFileGenerating(
    files: FileType[],
    filePath: string,
    explanation?: string
): FileType[] {
    return updateFileInArray(files, filePath, {
        filePath,
        fileContents: '',
        explanation: explanation || '',
        isGenerating: true,
        needsFixing: false,
        hasErrors: false,
        language: getFileType(filePath),
    });
}

/**
 * Update file content chunk
 */
export function appendFileChunk(
    files: FileType[],
    filePath: string,
    chunk: string
): FileType[] {
    const existingFile = files.find(f => f.filePath === filePath);
    
    if (existingFile) {
        return files.map(file => 
            file.filePath === filePath
                ? { ...file, fileContents: file.fileContents + chunk }
                : file
        );
    }
    
    // Create new file with chunk
    return [...files, {
        filePath,
        fileContents: chunk,
        explanation: '',
        isGenerating: true,
        needsFixing: false,
        hasErrors: false,
        language: getFileType(filePath),
    }];
}

/**
 * Mark file as completed
 */
export function setFileCompleted(
    files: FileType[],
    filePath: string,
    fileContents: string
): FileType[] {
    return updateFileInArray(files, filePath, {
        fileContents,
        isGenerating: false,
        needsFixing: false,
        hasErrors: false,
    });
}

/**
 * Mark all files as completed
 */
export function setAllFilesCompleted(files: FileType[]): FileType[] {
    return files.map(file => ({
        ...file,
        isGenerating: false,
        needsFixing: false,
        hasErrors: false,
    }));
}
