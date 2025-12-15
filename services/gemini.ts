
import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY not found in environment variables.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export type ArtStyle = 'chibi' | 'icon';

export const generateCartoonAvatar = async (base64Image: string, style: ArtStyle = 'chibi', userInstruction: string = ""): Promise<string | null> => {
    const ai = getClient();
    if (!ai) return null;

    try {
        const mimeType = base64Image.match(/data:([^;]+);base64/)?.[1] || 'image/jpeg';
        const imagePart = {
            inlineData: {
                data: base64Image.split(',')[1],
                mimeType: mimeType
            }
        };

        let stylePrompt = "";
        if (style === 'chibi') {
            stylePrompt = `
            - STYLE: CUTE CHIBI / BRICKHEADZ.
            - TRANSFORM the subject into a character with a big square head and small body.
            - If it's a person or animal, maximize cuteness.
            `;
        } else {
            // Updated ICON prompt for extreme flatness
            stylePrompt = `
            - STYLE: EXTREME FLAT VECTOR ICON / CLIP ART / ENAMEL PIN DESIGN.
            - SUBJECT: Keep the original shape of the object (e.g., Bag, Shoe, Car) exactly.
            - CRITICAL: REMOVE ALL LIGHTING, SHADOWS, HIGHLIGHTS, AND GRADIENTS.
            - MATERIAL: Ignore realistic textures (like leather gloss, fabric folds, metal shine). 
            - COLORING: Use ONE solid color for each area. For example, if a bag is brown leather, make it a single solid flat brown block. Do not simulate the 3D curve of the bag with darker browns.
            - PATTERNS: If the object has a print (like a logo pattern or monogram), keep the pattern sharp and high-contrast, but make the background behind it solid.
            - OUTLINE: Use thick, clean lines to define shapes.
            `;
        }

        const prompt = `
        Task: Redraw the main subject of this image as a pixel-perfect reference for a Perler Bead project.

        STYLE MODE: ${style.toUpperCase()}
        ${stylePrompt}

        USER SPECIFIC INSTRUCTIONS:
        "${userInstruction ? userInstruction : "Follow the original image content."}"
        (IMPORTANT: Apply the user's instructions to the content, but strictly adhere to the VISUAL STYLE defined above.)

        STRICT VISUAL RULES:
        1. COLOR PALETTE: 
           - Use a limited palette (max 12-16 distinct colors).
           - COLORS MUST BE SOLID AND FLAT. 
           - NO SHADING. NO "AIRBRUSH" LOOK. NO AMBIENT OCCLUSION.

        2. COMPOSITION: 
           - Image MUST be a PERFECT 1:1 SQUARE.
           - Center the subject with GENEROUS WHITE PADDING (at least 15% margin on all sides).
           - Do not crop the subject.

        3. BACKGROUND: 
           - PURE SOLID WHITE (#FFFFFF) ONLY. 
           - REMOVE all floor shadows, drop shadows, and background scenery.
        
        Output only the resulting image.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, { text: prompt }] }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
        return null;
    } catch (e) {
        console.error("Cartoonize Error:", e);
        return null;
    }
};

export const refinePixelArt = async (base64Image: string, instruction: string): Promise<string | null> => {
    const ai = getClient();
    if (!ai) return null;

    try {
        const mimeType = base64Image.match(/data:([^;]+);base64/)?.[1] || 'image/png';
        const imagePart = {
            inlineData: {
                data: base64Image.split(',')[1],
                mimeType: mimeType
            }
        };

        const prompt = `
        Edit this image based on the user's instruction.
        
        USER INSTRUCTION: "${instruction}"

        STRICT RULES:
        1. MAINTAIN STYLE: Keep it EXTREMELY FLAT and 2D. Solid colors only. No gradients/shadows.
        2. OUTPUT: 1:1 Square, White Background (#FFFFFF).
        3. Only change what is asked.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, { text: prompt }] }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
        return null;
    } catch (e) {
        console.error("Refine Error:", e);
        return null;
    }
};

export const generateStickerSVG = async (prompt: string): Promise<string | null> => {
    const ai = getClient();
    if (!ai) return null;

    try {
        const fullPrompt = `Create a clean, cute, thick-outlined SVG sticker of: ${prompt}. 
        The SVG must be self-contained. 
        Use bold, flat colors. 
        Add a white die-cut border around the shape if possible.
        Return ONLY the raw SVG string. Do not use Markdown code blocks.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: fullPrompt,
        });

        let text = response.text;
        if (!text) return null;

        // Clean up markdown if present
        text = text.trim();
        if (text.startsWith('```xml')) text = text.replace(/^```xml/, '').replace(/```$/, '');
        if (text.startsWith('```svg')) text = text.replace(/^```svg/, '').replace(/```$/, '');
        if (text.startsWith('```')) text = text.replace(/^```/, '').replace(/```$/, '');
        
        return text;
    } catch (e) {
        console.error("SVG Generation Error:", e);
        return null;
    }
};
