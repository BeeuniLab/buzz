import PartialJSON from 'partial-json';

export class StreamingBuffer {
    constructor() {
        this.buffer = '';
    }

    addChunk(chunk) {
        this.buffer += chunk;
    }

    tryParse() {
        if (!this.buffer.trim()) {
            return null;
        }

        try {
            // Try using the partial-json library
            return PartialJSON.parse(this.buffer);
        } catch (error) {
            // If even partial parsing fails, return null
            // This is expected for very early chunks
            return null;
        }
    }

    reset() {
        this.buffer = '';
    }

    getBuffer() {
        return this.buffer;
    }
}
