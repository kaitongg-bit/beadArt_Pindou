
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

export const generateCartoonAvatar = async (base64Image: string, style: ArtStyle = 'chibi'): Promise<string | null> => {
    const ai = getClient();
    if (!ai) return null;

    try {
        const imagePart = {
            inlineData: {
                data: base64Image.split(',')[1],
                mimeType: 'image/jpeg'
            }
        };

        let stylePrompt = "";
        if (style === 'chibi') {
            stylePrompt = `
            - TRANSFORM the subject into a CUTE CHIBI / BRICKHEADZ character.
            - Big square head, cute small body.
            - If it's a person, make them cute. If it's an animal, make it cute.
            `;
        } else {
            stylePrompt = `
            - PRESERVE THE ORIGINAL SHAPE strictly. DO NOT turn it into a person/face.
            - If it is a Bag, Shoe, Car, or Object: Draw it exactly as is, but in a flat 2D vector icon style.
            - High fidelity to the original outline.
            `;
        }

        const prompt = `
        Analyze the image. Identify the MAIN SUBJECT.
        Redraw this subject as a 2D PIXEL ART illustration suitable for a Perler Bead pattern.

        STYLE MODE: ${style.toUpperCase()}
        ${stylePrompt}

        STRICT VISUAL RULES:
        1. COLORING: 
           - FLAT COLORS ONLY. 
           - ABSOLUTELY NO SHADING. NO SHADOWS. NO GRADIENTS. 
           - Use a limited palette of vibrant, solid colors.
           - Different parts must be separated by color contrast or black outlines.

        2. CANVAS: 
           - Image MUST be a PERFECT 1:1 SQUARE.
           - The subject must be CENTERED with GENEROUS WHITE PADDING (at least 20% margin).
           - DO NOT CROP parts of the subject.

        3. BACKGROUND: 
           - PURE SOLID WHITE (#FFFFFF) ONLY. No scenery, no floor shadows.
        
        Output only the image.
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
        const imagePart = {
            inlineData: {
                data: base64Image.split(',')[1],
                mimeType: 'image/png'
            }
        };

        const prompt = `
        Edit this pixel art image based on the user's instruction.
        
        USER INSTRUCTION: "${instruction}"

        STRICT RULES:
        1. OUTPUT MUST BE A 1:1 SQUARE. Maintain the white padding.
        2. STYLE: Flat 2D Pixel Art.
        3. COLORING: FLAT COLORS ONLY. NO SHADOWS. NO GRADIENTS.
        4. BACKGROUND: MUST BE PURE SOLID WHITE (#FFFFFF). Do not add any gray or off-white background.
        5. ONLY change the specific details mentioned in the instruction. Keep the rest identical.
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
