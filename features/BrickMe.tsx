
import React, { useState, useRef, useEffect } from 'react';
import { generateCartoonAvatar } from '../services/gemini';
import { BEAD_COLORS, BOARD_SIZES } from '../constants';
import { BeadPattern, BeadPixel } from '../types';

// --- UTILS ---
const getNearestBeadColor = (r: number, g: number, b: number) => {
    let minDiff = Infinity;
    let nearest = BEAD_COLORS[0];

    BEAD_COLORS.forEach(color => {
        const cr = parseInt(color.hex.substring(1, 3), 16);
        const cg = parseInt(color.hex.substring(3, 5), 16);
        const cb = parseInt(color.hex.substring(5, 7), 16);
        
        // Euclidean distance sufficient for this use case
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

// --- COMPONENT ---

export const BrickMe: React.FC = () => {
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [cartoonImage, setCartoonImage] = useState<string | null>(null);
    const [pattern, setPattern] = useState<BeadPattern | null>(null);
    
    // Default to MIDI (29)
    const [boardSize, setBoardSize] = useState<number>(BOARD_SIZES.MIDI);
    
    // Zoom Level (Visual scaling)
    const [zoomLevel, setZoomLevel] = useState<number>(1.0);
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [stepStatus, setStepStatus] = useState('');
    const [viewMode, setViewMode] = useState<'visual' | 'chart'>('visual');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // 1. Handle Upload & AI Stylization
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        setCartoonImage(null);
        setPattern(null);
        setStepStatus('Generating BrickHeadz style pixel art...');

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target?.result as string;
            setOriginalImage(base64);

            try {
                // Call Gemini to "clean up" the image for pixelation
                const aiResult = await generateCartoonAvatar(base64);
                if (aiResult) {
                    setCartoonImage(aiResult);
                    setStepStatus('Quantizing colors to bead palette...');
                    // Automatically trigger pixelation after AI result
                    setTimeout(() => processBeadPattern(aiResult, boardSize), 100);
                } else {
                    setStepStatus('AI failed, using original image...');
                    setTimeout(() => processBeadPattern(base64, boardSize), 100);
                }
            } catch (error) {
                console.error(error);
                setStepStatus('Error. Using original image.');
                processBeadPattern(base64, boardSize);
            } finally {
                setIsProcessing(false);
            }
        };
        reader.readAsDataURL(file);
    };

    // 2. Client-side Pixelation Logic
    const processBeadPattern = (imgSrc: string, size: number) => {
        if (!size || size < 5) return; // Safety check

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // DISABLE SMOOTHING for pixel art crispness
        ctx.imageSmoothingEnabled = false;

        // Extra Contrast Boost Filter
        ctx.filter = 'contrast(1.2) saturate(1.2)';

        const img = new Image();
        img.src = imgSrc;
        img.onload = () => {
            canvas.width = size;
            canvas.height = size;
            
            // Draw White Background first
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, size, size);

            // LOGIC CHANGE: "CONTAIN" instead of "COVER"
            // This ensures the entire figure (feet/head) fits in the square
            const scale = size / Math.max(img.width, img.height);
            const drawWidth = img.width * scale;
            const drawHeight = img.height * scale;
            
            // Center the image
            const dx = (size - drawWidth) / 2;
            const dy = (size - drawHeight) / 2;

            ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, drawWidth, drawHeight);
            
            // Reset filter
            ctx.filter = 'none';

            const imageData = ctx.getImageData(0, 0, size, size);
            const data = imageData.data;
            
            const newPixels: BeadPixel[] = [];
            const counts: Record<string, number> = {};

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const i = (y * size + x) * 4;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];

                    // 1. Ignore transparent pixels
                    if (a < 50) continue;

                    // 2. Ignore WHITE Background pixels
                    // Strict threshold to catch the white background requested
                    // Lowered slightly to 240 to catch compression artifacts
                    if (r > 240 && g > 240 && b > 240) continue;

                    const matchedColor = getNearestBeadColor(r, g, b);
                    
                    newPixels.push({ x, y, color: matchedColor });
                    
                    // Count stats
                    counts[matchedColor.id] = (counts[matchedColor.id] || 0) + 1;
                }
            }

            setPattern({ width: size, height: size, pixels: newPixels, counts });
            setIsProcessing(false);
            setStepStatus('');
        };
    };

    // Re-run pixelation if board size changes
    useEffect(() => {
        // Debounce slightly to allow typing numbers
        const timer = setTimeout(() => {
            if (cartoonImage) processBeadPattern(cartoonImage, boardSize);
            else if (originalImage) processBeadPattern(originalImage, boardSize);
        }, 300);
        return () => clearTimeout(timer);
    }, [boardSize]);


    // Calculate cell size based on zoom
    const BASE_CELL_SIZE = 20; // 20px base size
    const cellSize = BASE_CELL_SIZE * zoomLevel;

    return (
        <div className="h-full flex flex-col lg:flex-row gap-6">
            <canvas ref={canvasRef} className="hidden" />

            {/* --- LEFT PANEL: INPUT --- */}
            <div className="w-full lg:w-1/4 flex flex-col gap-6 no-print">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-xl font-black text-slate-800 mb-4">1. Upload Photo</h2>
                    <div 
                        onClick={() => !isProcessing && fileInputRef.current?.click()}
                        className="cursor-pointer border-4 border-dashed border-indigo-100 rounded-xl aspect-square flex flex-col items-center justify-center hover:bg-indigo-50 transition-colors relative overflow-hidden group"
                    >
                         {cartoonImage ? (
                             <img src={cartoonImage} className="w-full h-full object-contain bg-slate-50 p-2" alt="AI Optimized" />
                         ) : originalImage ? (
                             <img src={originalImage} className="w-full h-full object-cover opacity-50 grayscale" alt="Original" />
                         ) : (
                             <div className="text-center p-4">
                                 <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">📸</div>
                                 <span className="font-bold text-slate-400">Select Photo</span>
                             </div>
                         )}
                         
                         {isProcessing && (
                             <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center text-slate-800 backdrop-blur-sm z-10">
                                 <div className="animate-spin text-3xl mb-4">🟧</div>
                                 <div className="text-sm font-bold text-center px-6 leading-tight">{stepStatus}</div>
                             </div>
                         )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    
                    {cartoonImage && !isProcessing && (
                        <p className="text-xs text-center text-slate-400 mt-2 font-medium">
                            Converted to BrickHeadz Pixel Style
                        </p>
                    )}
                </div>

                {pattern && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h2 className="text-xl font-black text-slate-800 mb-4">2. Settings</h2>
                        <div className="space-y-6">
                            
                            {/* PRESETS */}
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Board Presets</label>
                                <div className="flex gap-2 mt-2">
                                    <button 
                                        onClick={() => setBoardSize(29)}
                                        className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all ${boardSize === 29 ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-slate-100 text-slate-400 hover:border-slate-300'}`}
                                    >
                                        Midi
                                        <span className="block text-[10px] font-normal opacity-70">29x29</span>
                                    </button>
                                    <button 
                                        onClick={() => setBoardSize(58)}
                                        className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all ${boardSize === 58 ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-slate-100 text-slate-400 hover:border-slate-300'}`}
                                    >
                                        Maxi
                                        <span className="block text-[10px] font-normal opacity-70">58x58</span>
                                    </button>
                                </div>
                            </div>

                            {/* CUSTOM SIZE */}
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase flex justify-between items-center">
                                    Custom Grid Size
                                    <span className="text-indigo-600 font-mono">{boardSize}px</span>
                                </label>
                                <div className="flex items-center gap-3 mt-2">
                                    <div className="relative w-full">
                                        <input
                                            type="number"
                                            min="10"
                                            max="116"
                                            value={boardSize}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (!isNaN(val)) setBoardSize(val);
                                            }}
                                            className="w-full border-2 border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-700 focus:border-indigo-500 outline-none transition-colors"
                                        />
                                        <div className="absolute right-3 top-2.5 text-xs font-bold text-slate-300 pointer-events-none">PX</div>
                                    </div>
                                </div>
                                <input 
                                    type="range"
                                    min="10" 
                                    max="116"
                                    value={boardSize}
                                    onChange={(e) => setBoardSize(parseInt(e.target.value))}
                                    className="w-full mt-3 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                                <p className="text-[10px] text-slate-400 mt-2 leading-tight">
                                    Drag slider or type a number (10-116). Standard Perler boards are 29x29.
                                </p>
                            </div>
                            
                            {/* VIEW ZOOM */}
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase flex justify-between items-center">
                                    Zoom Level
                                    <span className="text-indigo-600 font-mono">{Math.round(zoomLevel * 100)}%</span>
                                </label>
                                <input 
                                    type="range"
                                    min="0.5" 
                                    max="3.0"
                                    step="0.1"
                                    value={zoomLevel}
                                    onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                                    className="w-full mt-3 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                            </div>

                        </div>
                    </div>
                )}
            </div>

            {/* --- RIGHT PANEL: PATTERN --- */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden min-h-[600px]">
                
                {/* TOOLBAR */}
                <div className="border-b border-slate-100 p-4 flex justify-between items-center bg-slate-50 no-print">
                     <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                         <button 
                            onClick={() => setViewMode('visual')}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${viewMode === 'visual' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                         >
                            Visual
                         </button>
                         <button 
                            onClick={() => setViewMode('chart')}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${viewMode === 'chart' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                         >
                            Chart
                         </button>
                     </div>
                     <button onClick={() => window.print()} className="flex items-center gap-2 text-slate-600 font-bold text-sm hover:text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors">
                         <span>🖨️</span> Print PDF
                     </button>
                </div>

                {/* CANVAS AREA - SCROLLABLE */}
                <div className="flex-1 overflow-auto p-4 md:p-8 bg-slate-50/50 print:bg-white print:p-0">
                    {pattern ? (
                        <div className="flex flex-col items-center gap-8 w-full print:max-w-none min-w-min">
                            
                            {/* THE GRID */}
                            <div 
                                className="bg-white shadow-xl rounded-xl p-1 relative border border-slate-200 print:shadow-none print:border-none"
                                style={{
                                    display: 'grid',
                                    // FORCE FIXED PIXEL SIZE PER CELL
                                    gridTemplateColumns: `repeat(${pattern.width}, ${cellSize}px)`,
                                    // FORCE TOTAL WIDTH TO TRIGGER SCROLL IF NEEDED
                                    width: `${pattern.width * cellSize}px`,
                                    height: `${pattern.height * cellSize}px`
                                }}
                            >
                                {pattern.pixels.map((p, i) => (
                                    <div 
                                        key={i}
                                        style={{ 
                                            // FORCE FIXED PIXEL SIZE PER CELL
                                            width: `${cellSize}px`,
                                            height: `${cellSize}px`,
                                            // IN CHART MODE: Use faint color background (opacity 0.2) + Symbol
                                            backgroundColor: viewMode === 'visual' ? p.color.hex : `${p.color.hex}33`, 
                                            gridColumn: p.x + 1,
                                            gridRow: p.y + 1,
                                        }}
                                        className={`relative border-[0.5px] border-slate-100 flex items-center justify-center ${viewMode === 'visual' ? 'rounded-full scale-90 shadow-sm' : ''}`}
                                    >
                                        {/* HOLE in bead mode */}
                                        {viewMode === 'visual' && (
                                            <div className="w-[30%] h-[30%] bg-slate-900/10 rounded-full shadow-inner pointer-events-none" />
                                        )}

                                        {/* SYMBOL in chart mode */}
                                        {viewMode === 'chart' && (
                                            <span 
                                                className="font-bold text-slate-700 leading-none select-none"
                                                style={{ fontSize: `${cellSize * 0.6}px` }}
                                            >
                                                {p.color.symbol}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>

                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300">
                             <div className="text-6xl mb-4">🧱</div>
                             <p className="font-bold text-lg">Your pattern will appear here</p>
                        </div>
                    )}
                </div>
            </div>

            {/* --- RIGHTMOST: MATERIAL LIST --- */}
             {pattern && (
                 <div className="w-full lg:w-64 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 overflow-y-auto max-h-[800px] no-print">
                    <h3 className="text-lg font-black text-slate-800 mb-4 flex justify-between items-center">
                        Materials
                        <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">
                            {pattern.pixels.length} beads
                        </span>
                    </h3>
                    <div className="space-y-3">
                        {Object.entries(pattern.counts)
                            .sort(([, a], [, b]) => b - a)
                            .map(([colorId, count]) => {
                                const color = BEAD_COLORS.find(c => c.id === colorId);
                                if (!color) return null;
                                return (
                                    <div key={colorId} className="flex items-center gap-3 text-sm">
                                        <div 
                                            className="w-8 h-8 rounded-full shadow-sm border border-slate-100 flex items-center justify-center font-bold text-sm text-slate-700"
                                            style={{ backgroundColor: color.hex }}
                                        >
                                            {viewMode === 'chart' ? color.symbol : ''}
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-bold text-slate-700">{color.name}</div>
                                            <div className="text-xs text-slate-400">
                                                {color.id} <span className="font-mono bg-slate-100 px-1 rounded ml-1 text-slate-500">{color.symbol}</span>
                                            </div>
                                        </div>
                                        <div className="font-mono font-bold text-slate-600">
                                            x{count}
                                        </div>
                                    </div>
                                )
                            })
                        }
                    </div>
                 </div>
             )}

        </div>
    );
};
