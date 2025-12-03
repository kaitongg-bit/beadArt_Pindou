import React, { useState } from 'react';
import { generateStickerSVG } from '../services/gemini';

export const StickerMaker: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setSvgContent(null);
    
    try {
        const svg = await generateStickerSVG(prompt);
        if (svg) {
            setSvgContent(svg);
        } else {
            setError("Could not generate sticker. Please try a different prompt or check API Key.");
        }
    } catch (e) {
        setError("Network or API error.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-4">
      <div className="max-w-xl w-full text-center space-y-6">
        
        <div className="space-y-2">
            <h2 className="text-3xl font-black text-slate-800">AI Sticker Lab</h2>
            <p className="text-slate-500">
                Type a name, object, or feeling. Gemini will create a custom sticker for your brick set.
            </p>
        </div>

        <div className="flex gap-2 relative">
            <input 
                type="text" 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., 'A cool pizza', 'Amy in 8-bit'"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            />
            <button 
                onClick={handleGenerate}
                disabled={loading || !prompt}
                className="absolute right-2 top-2 bottom-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold px-6 rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                {loading ? 'Thinking...' : 'Create'}
            </button>
        </div>

        {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium animate-pulse">
                {error}
            </div>
        )}

        <div className="mt-8 relative w-64 h-64 mx-auto bg-white rounded-xl shadow-2xl border-4 border-slate-100 flex items-center justify-center overflow-hidden">
            {loading ? (
                 <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce delay-200"></div>
                 </div>
            ) : svgContent ? (
                <div 
                    className="w-full h-full p-4 transform transition-transform hover:scale-110"
                    dangerouslySetInnerHTML={{ __html: svgContent }}
                />
            ) : (
                <div className="text-slate-300 text-6xl font-black opacity-20 select-none">?</div>
            )}
            
            {/* Sticker Peel Effect */}
            <div className="absolute top-0 right-0 w-8 h-8 bg-slate-100 shadow-md transform rotate-45 translate-x-4 -translate-y-4"></div>
        </div>

        {svgContent && (
            <div className="flex justify-center gap-4">
                <button className="text-sm font-bold text-slate-500 hover:text-blue-600 underline">
                    Download PDF
                </button>
                <button className="text-sm font-bold text-slate-500 hover:text-blue-600 underline">
                    Download SVG
                </button>
            </div>
        )}

      </div>
    </div>
  );
};
