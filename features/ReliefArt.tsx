
import React, { useState, useRef, useEffect } from 'react';
import { LEGO_COLORS } from '../constants';
import { BrickPixel } from '../types';

// Helper to find nearest LEGO color
const getNearestColor = (r: number, g: number, b: number) => {
  let minDiff = Infinity;
  let nearest = LEGO_COLORS[0];

  LEGO_COLORS.filter(c => c.type === 'solid').forEach(color => {
    const cr = parseInt(color.hex.substring(1, 3), 16);
    const cg = parseInt(color.hex.substring(3, 5), 16);
    const cb = parseInt(color.hex.substring(5, 7), 16);
    
    // Simple Euclidean distance
    const diff = Math.sqrt(
      Math.pow(r - cr, 2) + Math.pow(g - cg, 2) + Math.pow(b - cb, 2)
    );

    if (diff < minDiff) {
      minDiff = diff;
      nearest = color;
    }
  });

  return nearest;
};

export const ReliefArt: React.FC = () => {
  const [image, setImage] = useState<string | null>(null);
  const [pixels, setPixels] = useState<BrickPixel[]>([]);
  const [resolution, setResolution] = useState(32); // 32x32 or 48x48
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (image && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.src = image;
      img.onload = () => {
        // Resize logic
        canvas.width = resolution;
        canvas.height = resolution;
        
        // Draw image to small canvas to pixelate
        ctx.drawImage(img, 0, 0, resolution, resolution);
        
        const imageData = ctx.getImageData(0, 0, resolution, resolution);
        const data = imageData.data;
        const newPixels: BrickPixel[] = [];

        for (let y = 0; y < resolution; y++) {
          for (let x = 0; x < resolution; x++) {
            const i = (y * resolution + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Calculate luminance for height (0-255)
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            
            // Map luminance to height: Darker = Lower (1 plate), Lighter = Higher (3 plates)
            // Lighter = 3 plates (highlight), Darker = 1 plate (shadow)
            let height = 1;
            if (luminance > 180) height = 3;
            else if (luminance > 100) height = 2;

            const matchedColor = getNearestColor(r, g, b);

            newPixels.push({
              x,
              y,
              color: matchedColor.hex,
              height
            });
          }
        }
        setPixels(newPixels);
      };
    }
  }, [image, resolution]);

  return (
    <div className="flex flex-col h-full gap-6">
      
      {/* Controls */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-md transition-colors"
            >
                Upload Photo
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleImageUpload}
            />
            {image && (
                <div className="flex items-center gap-3 ml-4 border-l pl-4 border-slate-200">
                    <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Size:</span>
                    <button 
                        onClick={() => setResolution(32)}
                        className={`px-3 py-1 rounded text-sm font-bold transition-all ${resolution === 32 ? 'bg-slate-800 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        32x32
                    </button>
                    <button 
                        onClick={() => setResolution(48)}
                        className={`px-3 py-1 rounded text-sm font-bold transition-all ${resolution === 48 ? 'bg-slate-800 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        48x48
                    </button>
                </div>
            )}
        </div>
        {pixels.length > 0 && (
             <div className="text-right">
                <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Part Count</div>
                <div className="text-xl font-black text-slate-800">{pixels.length}</div>
             </div>
        )}
      </div>

      {/* Workspace */}
      <div className="flex-1 flex gap-6 min-h-0">
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Left: Original Preview (Small) */}
        {image && (
             <div className="w-64 hidden lg:flex flex-col gap-3">
                 <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Original Image</h3>
                 <img src={image} alt="Original" className="w-full rounded-xl shadow-lg border-2 border-slate-200" />
                 
                 <div className="bg-blue-50 p-4 rounded-xl text-xs text-blue-800 font-medium">
                    Tip: High contrast photos with simple backgrounds work best for brick art.
                 </div>
             </div>
        )}

        {/* Right: Brick Matrix */}
        <div className="flex-1 bg-slate-900 rounded-2xl p-8 flex items-center justify-center overflow-auto shadow-inner relative">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
                 backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', 
                 backgroundSize: '20px 20px' 
            }}></div>

            {!image && (
                <div className="text-center text-slate-500">
                    <div className="w-20 h-20 mx-auto mb-6 bg-slate-800 rounded-full flex items-center justify-center shadow-inner">
                        <svg className="w-10 h-10 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <p className="text-2xl font-black text-slate-700">Pixelate Your Memories</p>
                    <p className="text-slate-600 mt-2">Upload a photo to generate a LEGO relief map</p>
                </div>
            )}
            
            {pixels.length > 0 && (
                <div 
                    className="grid gap-[1px] bg-black/50 p-3 rounded-lg shadow-2xl backdrop-blur-sm border-4 border-slate-800"
                    style={{ 
                        gridTemplateColumns: `repeat(${resolution}, minmax(0, 1fr))`,
                        width: 'min(100%, 650px)',
                        aspectRatio: '1/1'
                    }}
                >
                    {pixels.map((p, i) => (
                        <div 
                            key={i}
                            className="w-full h-full relative"
                            style={{ 
                                backgroundColor: p.color,
                                boxShadow: p.height > 1 
                                    ? `inset 1px 1px 0 rgba(255,255,255,0.3), 1px 1px 2px rgba(0,0,0,0.5)` // Higher = more shadow
                                    : 'inset 0 0 2px rgba(0,0,0,0.2)', // Low
                                zIndex: p.height,
                                borderRadius: '1px'
                            }}
                        >
                            {/* Stud Effect */}
                            <div 
                                className="absolute inset-[15%] rounded-full"
                                style={{
                                    background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), rgba(0,0,0,0) 60%)',
                                    boxShadow: 'inset 0 -1px 1px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.2)'
                                }}
                            >
                                {/* LEGO Logo hint (very subtle) */}
                                <div className="w-full h-full flex items-center justify-center opacity-20">
                                   <div className="w-[40%] h-[10%] bg-black rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
