
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

        // UPDATED PROMPT: BRICKHEADZ STYLE PIXEL ART
        // The user specifically wants the "Square Head" LEGO look, but as a bead pattern.
        // We force a "Front View" to ensure the pixel grid aligns well.
        const prompt = `
        Redraw this person as a 2D PIXEL ART character in the exact style of a LEGO BRICKHEADZ figure.

        STRICT VISUAL RULES:
        1. CANVAS: Image MUST be a PERFECT 1:1 SQUARE.
        2. COMPOSITION: Full body visible within the square. DO NOT CROP THE FEET or HEAD. Leave white padding around the figure.
        3. HEAD SHAPE: Must be a large, perfect SQUARE/CUBE shape with slightly rounded corners.
        4. EYES: Two distinct black circular dots, widely spaced (classic BrickHeadz eyes).
        5. PROPORTIONS: Chibi style. Head ~50%, Body+Legs ~50%.
        6. VIEW ANGLE: Direct FRONT view (flat 2D). No complex perspective.
        7. STYLE: Pixel art. Clean lines. Flat vibrant colors. No gradients.
        8. BACKGROUND: PURE SOLID WHITE (#FFFFFF) ONLY. Remove all scenery.
        9. ASPECT RATIO: Maintain the natural aspect ratio of the character. DO NOT STRETCH the character wide or tall to fill the square. It is better to have more white space than a distorted character.
        
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
