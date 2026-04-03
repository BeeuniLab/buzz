#!/usr/bin/env bun
/**
 * Test script for cover image generation via gpt-image-1.5
 * Usage: bun scripts/test-cover-gen.ts
 */
import OpenAI from 'openai';
import { writeFileSync } from 'fs';

const API_KEY = 'sk-EtGwrz7C5GF67OlEql5eWBN5ffEjSd26eYrR3dmqNyUQc0dD';
const BASE_URL = 'https://api.phsharp.com/v1';
const MODEL = 'gpt-image-1.5';

const prompt = `Create one high-quality original cover art (key art) for an interactive web experience.
The illustration must be centered on what the DESCRIPTION says: setting, mood, characters, objects, and atmosphere should follow the description first.
The cover may include ONLY the title as readable text. Do not add any other words.

--- Description (primary) ---
A mysterious underwater exploration game where players dive into the deep ocean to discover ancient ruins, bioluminescent creatures, and hidden treasures. The atmosphere is serene yet thrilling, with dark blue depths illuminated by glowing sea life.

--- Context ---
Title (render exactly this as the ONLY readable text): Deep Abyss
Color palette hint: #0a1628, #00d4ff, #ff6b35

Requirements:
- Vertical portrait (~9:16), app-store style key art, one clear focal subject, readable at thumbnail size.
- Text constraint: render ONLY the title; no subtitles, slogans, numbers, or any other words.
- No logos, watermarks, or UI overlays on the image.
- Strong silhouette, depth, and lighting that match the described experience.
- Output a single finished cover image.`;

async function testImagesGenerate() {
    console.log('=== Test: images.generate (url mode) ===');
    const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
    const startTime = Date.now();

    try {
        const response = await client.images.generate({
            model: MODEL,
            prompt,
            n: 1,
            size: '1024x1536',
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`API responded in ${elapsed}s`);
        console.log('Response data:', JSON.stringify(response.data?.map(d => ({
            has_url: !!d.url,
            has_b64: !!d.b64_json,
            url_preview: d.url?.slice(0, 100),
        })), null, 2));

        const imageData = response.data?.[0];

        let bytes: Buffer;
        if (imageData?.b64_json) {
            bytes = Buffer.from(imageData.b64_json, 'base64');
        } else if (imageData?.url) {
            console.log(`Downloading from URL: ${imageData.url.slice(0, 80)}...`);
            const resp = await fetch(imageData.url);
            if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
            bytes = Buffer.from(await resp.arrayBuffer());
        } else {
            console.error('No url or b64_json in response');
            return false;
        }

        console.log(`Image size: ${(bytes.length / 1024).toFixed(1)} KB`);

        const magic = bytes.slice(0, 4).toString('hex');
        let ext = 'bin';
        if (magic.startsWith('52494646')) { console.log('Format: WebP'); ext = 'webp'; }
        else if (magic.startsWith('89504e47')) { console.log('Format: PNG'); ext = 'png'; }
        else if (magic.startsWith('ffd8ff')) { console.log('Format: JPEG'); ext = 'jpg'; }
        else console.log(`Format: unknown (magic: ${magic})`);

        const outPath = `/tmp/test-cover.${ext}`;
        writeFileSync(outPath, bytes);
        console.log(`Saved to: ${outPath}`);
        return true;
    } catch (error: unknown) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Failed after ${elapsed}s: ${msg}`);
        return false;
    }
}

async function main() {
    console.log(`Model: ${MODEL}`);
    console.log(`API: ${BASE_URL}\n`);

    const ok = await testImagesGenerate();
    if (ok) {
        console.log('\nDone!');
    } else {
        process.exit(1);
    }
}

main();
