
import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY not found in environment variables.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateCartoonAvatar = async (base64Image: string): Promise<string | null> => {
    const ai = getClient();
    if (!ai) return null;

    try {
        const imagePart = {
            inlineData: {
                data: base64Image.split(',')[1],
                mimeType: 'image/jpeg'
            }
        };

        // UPDATED PROMPT: STRICT SQUARE ASPECT RATIO
        const prompt = `
        Redraw this person as a 2D PIXEL ART character in the exact style of a LEGO BRICKHEADZ figure.

        STRICT VISUAL RULES:
        1. CANVAS SHAPE: Image MUST be a PERFECT 1:1 SQUARE (e.g. 1024x1024).
        2. ASPECT RATIO HANDLING: If the character is tall (like a standing person), ADD WHITE PADDING on the left and right. DO NOT STRETCH the character to make them wide. DO NOT CROP the head or feet.
        3. COMPOSITION: The character must be fully visible from head to toe within the square.
        4. HEAD SHAPE: Large, perfect SQUARE/CUBE shape with slightly rounded corners (BrickHeadz style).
        5. EYES: Two distinct black circular dots, widely spaced.
        6. VIEW ANGLE: Direct FRONT view (flat 2D).
        7. STYLE: Pixel art. Clean lines. Flat vibrant colors. No gradients.
        8. BACKGROUND: PURE SOLID WHITE (#FFFFFF) ONLY. No scenery.
        
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
                mimeType: 'image/png' // Assuming previous output is PNG
            }
        };

        const prompt = `
        Edit this pixel art character based on the user's instruction.
        
        USER INSTRUCTION: "${instruction}"

        STRICT RULES:
        1. OUTPUT MUST BE A 1:1 SQUARE. Maintain the padding if necessary.
        2. MAINTAIN the current Lego BrickHeadz pixel art style exactly.
        3. ONLY change the specific details mentioned in the instruction.
        4. Output the result on a PURE WHITE background.
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
