import React, { useState, useRef, useEffect } from 'react';
import { generateCartoonAvatar, refinePixelArt } from '../services/gemini';
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

// Forces any image into a square canvas with GENEROUS white padding
// This prevents the AI from generating "full bleed" images that get cut off
const padImageToSquare = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const maxDim = Math.max(img.width, img.height);
            // ADD 30% PADDING total (15% per side) to the source canvas
            // This is the "Nuclear Option" to ensure heads/feet are NEVER cut off
            const padding = maxDim * 0.30; 
            const canvasSize = maxDim + (padding * 2);
            
            const canvas = document.createElement('canvas');
            canvas.width = canvasSize;
            canvas.height = canvasSize;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(base64Str);
                return;
            }

            // Fill white background
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvasSize, canvasSize);

            // Draw centered
            const x = (canvasSize - img.width) / 2;
            const y = (canvasSize - img.height) / 2;
            ctx.drawImage(img, x, y);

            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = () => resolve(base64Str);
    });
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

    // Refine Modal State
    const [showRefineModal, setShowRefineModal] = useState(false);
    const [refinePrompt, setRefinePrompt] = useState('');
    const [isRefining, setIsRefining] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);

    const BASE_CELL_SIZE = 20;

    // Auto Fit Logic
    const handleAutoFit = () => {
        if (!pattern || !viewportRef.current) return;
        const { clientWidth, clientHeight } = viewportRef.current;
        const padding = 40; // px buffer
        const availableW = clientWidth - padding;
        const availableH = clientHeight - padding;
        
        const contentW = pattern.width * BASE_CELL_SIZE;
        const contentH = pattern.height * BASE_CELL_SIZE;

        const scaleW = availableW / contentW;
        const scaleH = availableH / contentH;
        
        // Fit to smallest dimension, capped at 1.0 (don't zoom in too much automatically)
        // But allow zooming OUT as much as needed (e.g. 0.2)
        const newZoom = Math.min(scaleW, scaleH, 1.0);
        setZoomLevel(Math.max(0.1, newZoom));
    };

    // 1. Handle Upload & AI Stylization
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        setCartoonImage(null);
        setPattern(null);
        setStepStatus('Preparing image...');

        const reader = new FileReader();
        reader.onload = async (event) => {
            const rawBase64 = event.target?.result as string;
            
            // STEP 1: FORCE SQUARE ASPECT RATIO WITH PADDING
            // This ensures the AI gets a square canvas with whitespace
            const squareBase64 = await padImageToSquare(rawBase64);
            
            setOriginalImage(squareBase64);
            setStepStatus('Generating BrickHeadz style pixel art...');

            try {
                // Call Gemini to "clean up" the image for pixelation
                const aiResult = await generateCartoonAvatar(squareBase64);
                if (aiResult) {
                    setCartoonImage(aiResult);
                    setStepStatus('Quantizing colors to bead palette...');
                    // Automatically trigger pixelation after AI result
                    setTimeout(() => processBeadPattern(aiResult, boardSize), 100);
                } else {
                    setStepStatus('AI failed, using original image...');
                    setTimeout(() => processBeadPattern(squareBase64, boardSize), 100);
                }
            } catch (error) {
                console.error(error);
                setStepStatus('Error. Using original image.');
                processBeadPattern(squareBase64, boardSize);
            } finally {
                setIsProcessing(false);
            }
        };
        reader.readAsDataURL(file);
    };

    // Handle Refine Request
    const handleRefine = async () => {
        if (!cartoonImage || !refinePrompt.trim()) return;
        
        setIsRefining(true);
        
        try {
            const newImage = await refinePixelArt(cartoonImage, refinePrompt);
            if (newImage) {
                setCartoonImage(newImage);
                setShowRefineModal(false);
                setRefinePrompt('');
                // Automatically re-process pattern
                processBeadPattern(newImage, boardSize);
            }
        } catch (e) {
            console.error(e);
            alert("Failed to refine image. Please try again.");
        } finally {
            setIsRefining(false);
        }
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

            // LOGIC CHANGE: AGGRESSIVE SAFETY MARGIN PADDING
            // Scale to 85% (was 90%) of the grid to ensure edge beads are empty
            const PADDING_FACTOR = 0.85; 
            
            // "CONTAIN" logic with Padding
            // Use Math.floor to ensure integer coordinates
            const scale = (size * PADDING_FACTOR) / Math.max(img.width, img.height);
            const drawWidth = Math.floor(img.width * scale);
            const drawHeight = Math.floor(img.height * scale);
            
            // Center the image strictly
            const dx = Math.floor((size - drawWidth) / 2);
            const dy = Math.floor((size - drawHeight) / 2);

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
                    // Using 250 to avoid cutting off light hair
                    if (r > 250 && g > 250 && b > 250) continue;

                    const matchedColor = getNearestBeadColor(r, g, b);
                    
                    newPixels.push({ x, y, color: matchedColor });
                    
                    // Count stats
                    counts[matchedColor.id] = (counts[matchedColor.id] || 0) + 1;
                }
            }

            setPattern({ width: size, height: size, pixels: newPixels, counts });
            setIsProcessing(false);
            setStepStatus('');
            
            // Auto fit after processing
            setTimeout(handleAutoFit, 100);
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
    const cellSize = BASE_CELL_SIZE * zoomLevel;

    return (
        // CRITICAL FIX: height is auto on mobile (scrollable), full on desktop (fixed app)
        <div className="flex flex-col lg:flex-row gap-6 relative h-auto lg:h-full print:h-auto print:block">
            <canvas ref={canvasRef} className="hidden" />

            {/* --- LEFT PANEL: INPUT --- */}
            {/* Scrollable on desktop, stacked on mobile */}
            <div className="w-full lg:w-1/4 flex flex-col gap-6 no-print lg:h-full lg:overflow-y-auto shrink-0">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-xl font-black text-slate-800 mb-4">1. Upload Photo</h2>
                    <div 
                        onClick={() => !isProcessing && fileInputRef.current?.click()}
                        className="cursor-pointer border-4 border-dashed border-indigo-100 rounded-xl aspect-square flex flex-col items-center justify-center hover:bg-indigo-50 transition-colors relative overflow-hidden group"
                    >
                         {cartoonImage ? (
                             <img src={cartoonImage} className="w-full h-full object-contain bg-slate-50 p-2" alt="AI Optimized" />
                         ) : originalImage ? (
                             <img src={originalImage} className="w-full h-full object-contain bg-slate-50 p-2" alt="Original" />
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
                        <div className="flex flex-col gap-2 mt-4">
                            <p className="text-xs text-center text-slate-400 font-medium">
                                Converted to BrickHeadz Pixel Style
                            </p>
                            <button 
                                onClick={() => setShowRefineModal(true)}
                                className="w-full bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 font-bold py-2 rounded-lg text-sm border border-slate-200 transition-colors flex items-center justify-center gap-2"
                            >
                                <span>✨</span> Refine Image
                            </button>
                        </div>
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
                        </div>
                    </div>
                )}
            </div>

            {/* --- RIGHT PANEL: PATTERN + MATERIALS (Vertical Flex) --- */}
            {/* Height fix: min-h defined so it doesn't collapse on mobile. full height on desktop */}
            <div className="flex-1 flex flex-col min-w-0 gap-4 min-h-[600px] lg:h-full print:h-auto print:block">
                
                {/* --- TOP: VIEWPORT (FIXED FRAME) --- */}
                <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative print:shadow-none print:border-none print:overflow-visible print:h-auto">
                    
                    {/* TOOLBAR */}
                    <div className="border-b border-slate-100 p-4 flex justify-between items-center bg-slate-50 no-print z-10 relative shrink-0">
                         <div className="flex items-center gap-4">
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
                             
                             {/* ZOOM SLIDER IN TOOLBAR */}
                             <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-400">🔍</span>
                                <button 
                                    onClick={handleAutoFit}
                                    className="px-2 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded text-slate-600"
                                    title="Auto Fit to Screen"
                                >
                                    FIT
                                </button>
                                <input 
                                    type="range"
                                    min="0.1" 
                                    max="3.0"
                                    step="0.1"
                                    value={zoomLevel}
                                    onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                                    className="w-24 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                             </div>
                         </div>
                         <button onClick={() => window.print()} className="flex items-center gap-2 text-slate-600 font-bold text-sm hover:text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors">
                             <span>🖨️</span> Print PDF
                         </button>
                    </div>

                    {/* SCROLLABLE CONTENT AREA - CRITICAL FIX */}
                    <div ref={viewportRef} className="flex-1 relative overflow-auto bg-slate-50/50 print:overflow-visible print:bg-white print:h-auto">
                        {/* THE WRAPPER: Ensures content expands down/right correctly so scrolling works */}
                        <div className="min-w-full min-h-full flex items-center justify-center p-8 print:p-0 print:block">
                            {pattern ? (
                                <div 
                                    className="bg-white shadow-xl rounded-xl p-1 border border-slate-200 print:shadow-none print:border-none origin-center transition-transform duration-100 ease-out print:w-full print:h-auto"
                                    style={{
                                        display: 'grid',
                                        // FORCE FIXED PIXEL SIZE PER CELL AND ROW
                                        gridTemplateColumns: `repeat(${pattern.width}, ${cellSize}px)`,
                                        gridTemplateRows: `repeat(${pattern.height}, ${cellSize}px)`, // ADDED THIS to fix uneven spacing
                                        // FORCE TOTAL SIZE to be SQUARE based on pattern size
                                        width: `${pattern.width * cellSize}px`,
                                        height: `${pattern.height * cellSize}px`
                                    }}
                                >
                                    {pattern.pixels.map((p, i) => (
                                        <div 
                                            key={i}
                                            style={{ 
                                                width: `${cellSize}px`,
                                                height: `${cellSize}px`,
                                                backgroundColor: viewMode === 'visual' ? p.color.hex : `${p.color.hex}33`, 
                                                gridColumn: p.x + 1,
                                                gridRow: p.y + 1,
                                            }}
                                            className={`relative border-[0.5px] border-slate-100 flex items-center justify-center ${viewMode === 'visual' ? 'rounded-full scale-90 shadow-sm' : ''}`}
                                        >
                                            {viewMode === 'visual' && (
                                                <div className="w-[30%] h-[30%] bg-slate-900/10 rounded-full shadow-inner pointer-events-none" />
                                            )}
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
                            ) : (
                                <div className="text-center text-slate-300">
                                     <div className="text-6xl mb-4">🧱</div>
                                     <p className="font-bold text-lg">Pattern View</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* --- BOTTOM: MATERIALS (HORIZONTAL) --- */}
                 {pattern && (
                     <div className="h-48 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 overflow-hidden flex flex-col no-print shrink-0 print:h-auto print:overflow-visible">
                        <div className="flex justify-between items-center mb-2 shrink-0">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Materials</h3>
                            <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500 font-bold">
                                {pattern.pixels.length} beads
                            </span>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto pr-2 print:overflow-visible print:h-auto">
                             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                                {Object.entries(pattern.counts)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([colorId, count]) => {
                                        const color = BEAD_COLORS.find(c => c.id === colorId);
                                        if (!color) return null;
                                        return (
                                            <div key={colorId} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 print:border-slate-300">
                                                <div 
                                                    className="w-6 h-6 rounded-full shadow-sm border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700 shrink-0 print:border-slate-900"
                                                    style={{ backgroundColor: color.hex }}
                                                >
                                                    {viewMode === 'chart' ? color.symbol : ''}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-slate-700 text-xs truncate">{color.name}</div>
                                                    <div className="text-[10px] text-slate-400 font-mono">x{count}</div>
                                                </div>
                                            </div>
                                        )
                                    })
                                }
                            </div>
                        </div>
                     </div>
                 )}
            </div>

            {/* --- EDIT MODAL --- */}
            {showRefineModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
                        <h3 className="text-xl font-black text-slate-800 mb-2">Refine with AI</h3>
                        <p className="text-slate-500 text-sm mb-4">
                            Describe what needs to be fixed. <br/>
                            <span className="text-xs italic opacity-70">"Make the guitar border white", "Make hair brighter"</span>
                        </p>
                        
                        <textarea 
                            value={refinePrompt}
                            onChange={(e) => setRefinePrompt(e.target.value)}
                            placeholder="What should we change?"
                            className="w-full border-2 border-slate-200 rounded-xl p-3 text-slate-700 focus:border-indigo-500 outline-none h-24 mb-4 resize-none"
                            autoFocus
                        />
                        
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setShowRefineModal(false)}
                                disabled={isRefining}
                                className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleRefine}
                                disabled={isRefining || !refinePrompt.trim()}
                                className="flex-1 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                            >
                                {isRefining ? (
                                    <>
                                        <span className="animate-spin">🔄</span> Refining...
                                    </>
                                ) : (
                                    <>✨ Generate</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};