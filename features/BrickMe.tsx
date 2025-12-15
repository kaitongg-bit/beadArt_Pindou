
import React, { useState, useRef, useEffect } from 'react';
import { generateCartoonAvatar, refinePixelArt, ArtStyle } from '../services/gemini';
import { BEAD_COLORS, BOARD_SIZES } from '../constants';
import { BeadPattern, BeadPixel, BeadColor } from '../types';
import { jsPDF } from "jspdf";

// --- UTILS ---
const getNearestBeadColor = (r: number, g: number, b: number) => {
    // 1. Dark Threshold (Black Crush) - prevent dark hair turning green
    if (r < 40 && g < 40 && b < 40) {
        return BEAD_COLORS.find(c => c.id === 'P14') || BEAD_COLORS[0];
    }

    let minDiff = Infinity;
    let nearest = BEAD_COLORS[0];

    BEAD_COLORS.forEach(color => {
        const cr = parseInt(color.hex.substring(1, 3), 16);
        const cg = parseInt(color.hex.substring(3, 5), 16);
        const cb = parseInt(color.hex.substring(5, 7), 16);
        
        // 2. Weighted Distance (Redmean Approximation)
        const rmean = (r + cr) / 2;
        const dr = r - cr;
        const dg = g - cg;
        const db = b - cb;
        
        const diff = Math.sqrt(
            (((512 + rmean) * dr * dr) >> 8) + 
            4 * dg * dg + 
            (((767 - rmean) * db * db) >> 8)
        );

        if (diff < minDiff) {
            minDiff = diff;
            nearest = color;
        }
    });
    return nearest;
};

// Forces any image into a square canvas with GENEROUS white padding
const padImageToSquare = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const maxDim = Math.max(img.width, img.height);
            // ADD 30% PADDING total (15% per side) to the source canvas
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
    const [processedImage, setProcessedImage] = useState<string | null>(null); // The image used for pixelation (Original or AI)
    const [pattern, setPattern] = useState<BeadPattern | null>(null);
    
    // --- NEW STATES FOR WORKFLOW ---
    const [styleMode, setStyleMode] = useState<'chibi' | 'icon' | 'original'>('chibi');
    const [boardSize, setBoardSize] = useState<number>(58); // Default to roughly 2 boards
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [isPixelating, setIsPixelating] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    // View & Zoom
    const [zoomLevel, setZoomLevel] = useState<number>(1.0);
    const [viewMode, setViewMode] = useState<'visual' | 'chart'>('visual');
    const [isExporting, setIsExporting] = useState(false);

    // Refine Modal State
    const [showRefineModal, setShowRefineModal] = useState(false);
    const [refinePrompt, setRefinePrompt] = useState('');
    const [isRefining, setIsRefining] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);

    const BASE_CELL_SIZE = 20;

    // Reset flow when new image uploaded
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setStatusMsg('Loading...');
        setPattern(null);
        setProcessedImage(null);
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const rawBase64 = event.target?.result as string;
            // Pad original image immediately so previews are consistent
            const squareBase64 = await padImageToSquare(rawBase64);
            setOriginalImage(squareBase64);
            setStatusMsg('');
        };
        reader.readAsDataURL(file);
    };

    // Step 1: Generate AI Image (Optional, if not Original mode)
    const handleGenerateAI = async () => {
        if (!originalImage) return;
        if (styleMode === 'original') {
            setProcessedImage(originalImage);
            return;
        }

        setIsGeneratingAI(true);
        setStatusMsg('Generating AI artwork...');
        try {
            const aiStyle = styleMode === 'chibi' ? 'chibi' : 'icon';
            const result = await generateCartoonAvatar(originalImage, aiStyle);
            if (result) {
                setProcessedImage(result);
            } else {
                alert("AI Generation failed. Falling back to original.");
                setProcessedImage(originalImage);
            }
        } catch (error) {
            console.error(error);
            setProcessedImage(originalImage);
        } finally {
            setIsGeneratingAI(false);
            setStatusMsg('');
        }
    };

    // Step 2: Pixelate (The main action)
    const handleGeneratePattern = () => {
        const source = processedImage || originalImage;
        if (!source) return;

        setIsPixelating(true);
        setStatusMsg('Quantizing colors...');
        
        // Short timeout to allow UI to show loading state
        setTimeout(() => {
            processBeadPattern(source, boardSize);
        }, 100);
    };

    const handleRefine = async () => {
        if (!processedImage || !refinePrompt.trim()) return;
        setIsRefining(true);
        try {
            const newImage = await refinePixelArt(processedImage, refinePrompt);
            if (newImage) {
                setProcessedImage(newImage);
                setShowRefineModal(false);
                setRefinePrompt('');
                // Note: User needs to click "Generate Pattern" again to update the grid
            }
        } catch (e) {
            console.error(e);
            alert("Failed to refine image.");
        } finally {
            setIsRefining(false);
        }
    };

    // --- PIXELATION ALGORITHM ---
    const processBeadPattern = (imgSrc: string, size: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;

        const img = new Image();
        img.src = imgSrc;
        img.onload = () => {
            canvas.width = size;
            canvas.height = size;
            
            // Draw Magenta base for transparency detection
            ctx.fillStyle = '#FF00FF'; 
            ctx.fillRect(0, 0, size, size);

            // Scale logic
            const PADDING_FACTOR = 0.90; // slightly tighter for user control
            const scale = (size * PADDING_FACTOR) / Math.max(img.width, img.height);
            const drawWidth = Math.floor(img.width * scale);
            const drawHeight = Math.floor(img.height * scale);
            
            const dx = Math.floor((size - drawWidth) / 2);
            const dy = Math.floor((size - drawHeight) / 2);

            // Draw white background behind image area
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(dx, dy, drawWidth, drawHeight);
            
            ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, drawWidth, drawHeight);

            const imageData = ctx.getImageData(0, 0, size, size);
            const data = imageData.data;
            
            // Dynamic Background Color (Top-Left pixel)
            const bgR = data[0];
            const bgG = data[1];
            const bgB = data[2];

            let rawPixels: {x: number, y: number, color: BeadColor}[] = [];

            // 1. First Pass: Map to Palette
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const i = (y * size + x) * 4;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];

                    // Skip Transparent
                    if (a < 50) continue;
                    // Skip Magenta Key
                    if (r > 250 && g < 10 && b > 250) continue;
                    // Skip Background (similarity check)
                    const distToBg = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
                    if (distToBg < 30 || (r > 240 && g > 240 && b > 240)) continue;

                    const matchedColor = getNearestBeadColor(r, g, b);
                    rawPixels.push({ x, y, color: matchedColor });
                }
            }

            // 2. Second Pass: Color Consolidation (Reduce "Noise")
            // If colors are very close or used very rarely, merge them.
            if (rawPixels.length > 0) {
                // Count usage
                const tempCounts: Record<string, number> = {};
                rawPixels.forEach(p => {
                    tempCounts[p.color.id] = (tempCounts[p.color.id] || 0) + 1;
                });

                // Find "Major" colors (colors that make up at least 1% of the image)
                const totalDots = rawPixels.length;
                const threshold = totalDots * 0.01; 
                const majorColors = Object.keys(tempCounts).filter(id => tempCounts[id] > threshold);

                // If we have enough major colors, try to snap minor colors to them
                if (majorColors.length >= 2) {
                    rawPixels = rawPixels.map(p => {
                        // If this pixel's color is "Minor" (rare)
                        if (tempCounts[p.color.id] <= threshold) {
                            // Find nearest MAJOR color
                            let bestMajor = p.color;
                            let minMajorDiff = Infinity;
                            
                            // Get RGB of current pixel's bead color
                            const cr = parseInt(p.color.hex.substring(1, 3), 16);
                            const cg = parseInt(p.color.hex.substring(3, 5), 16);
                            const cb = parseInt(p.color.hex.substring(5, 7), 16);

                            majorColors.forEach(majorId => {
                                const majorC = BEAD_COLORS.find(c => c.id === majorId);
                                if (!majorC) return;
                                
                                const mr = parseInt(majorC.hex.substring(1, 3), 16);
                                const mg = parseInt(majorC.hex.substring(3, 5), 16);
                                const mb = parseInt(majorC.hex.substring(5, 7), 16);

                                // Simple dist
                                const d = Math.sqrt(Math.pow(cr - mr, 2) + Math.pow(cg - mg, 2) + Math.pow(cb - mb, 2));
                                if (d < minMajorDiff) {
                                    minMajorDiff = d;
                                    bestMajor = majorC;
                                }
                            });

                            // Only swap if it's reasonably close (don't turn a lone red pixel into blue)
                            if (minMajorDiff < 60) {
                                return { ...p, color: bestMajor };
                            }
                        }
                        return p;
                    });
                }
            }

            // 3. Final Counts
            const finalCounts: Record<string, number> = {};
            rawPixels.forEach(p => {
                finalCounts[p.color.id] = (finalCounts[p.color.id] || 0) + 1;
            });

            setPattern({ width: size, height: size, pixels: rawPixels, counts: finalCounts });
            setIsPixelating(false);
            setStatusMsg('');
            setTimeout(handleAutoFit, 100);
        };
    };

    // Auto Fit Logic
    const handleAutoFit = () => {
        if (!pattern || !viewportRef.current) return;
        const { clientWidth, clientHeight } = viewportRef.current;
        const padding = 40;
        const availableW = clientWidth - padding;
        const availableH = clientHeight - padding;
        
        const contentW = pattern.width * BASE_CELL_SIZE;
        const contentH = pattern.height * BASE_CELL_SIZE;

        const scaleW = availableW / contentW;
        const scaleH = availableH / contentH;
        
        const newZoom = Math.min(scaleW, scaleH, 1.5);
        setZoomLevel(Math.max(0.1, newZoom));
    };

    // Export PDF
    const handleExportPDF = () => {
        if (!pattern) return;
        setIsExporting(true);

        try {
            const pdfCanvas = document.createElement('canvas');
            const CELL_PX = 30; // High resolution pixels per bead
            const HEADER_HEIGHT = 100;
            const LEGEND_ITEM_HEIGHT = 30;
            const LEGEND_HEADER_HEIGHT = 60;
            const LEGEND_COL_WIDTH = 250;
            const ITEMS_PER_COL = 15;
            
            const distinctColors = Object.entries(pattern.counts);
            const numCols = Math.ceil(distinctColors.length / ITEMS_PER_COL);
            const legendHeight = LEGEND_HEADER_HEIGHT + (Math.min(distinctColors.length, ITEMS_PER_COL) * LEGEND_ITEM_HEIGHT) + 50;

            const WIDTH = pattern.width * CELL_PX;
            const HEIGHT = (pattern.height * CELL_PX) + HEADER_HEIGHT + legendHeight;
            
            const MIN_WIDTH = numCols * LEGEND_COL_WIDTH + 40;
            pdfCanvas.width = Math.max(WIDTH, MIN_WIDTH);
            pdfCanvas.height = HEIGHT;
            
            const ctx = pdfCanvas.getContext('2d');
            if (!ctx) return;

            // Background
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, pdfCanvas.width, pdfCanvas.height);

            // Header
            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 60px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("BeadGift Pattern", pdfCanvas.width / 2, 60);

            // Draw Grid
            const gridXOffset = (pdfCanvas.width - (pattern.width * CELL_PX)) / 2;
            const gridYOffset = HEADER_HEIGHT;
            
            ctx.translate(gridXOffset, gridYOffset);
            
            // Draw beads
            pattern.pixels.forEach(p => {
                const x = p.x * CELL_PX;
                const y = p.y * CELL_PX;
                const cx = x + CELL_PX / 2;
                const cy = y + CELL_PX / 2;
                const radius = (CELL_PX / 2) - 1;

                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
                ctx.fillStyle = p.color.hex;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(cx, cy, radius * 0.25, 0, 2 * Math.PI);
                ctx.fillStyle = '#FFFFFF';
                ctx.fill();
                
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
                ctx.strokeStyle = '#e2e8f0'; 
                ctx.lineWidth = 1;
                ctx.stroke();

                const r = parseInt(p.color.hex.slice(1,3), 16);
                const g = parseInt(p.color.hex.slice(3,5), 16);
                const b = parseInt(p.color.hex.slice(5,7), 16);
                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                
                ctx.fillStyle = brightness > 125 ? '#000000' : '#FFFFFF';
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(p.color.symbol, cx, cy);
            });

            ctx.setTransform(1, 0, 0, 1, 0, 0); 
            const legendYStart = gridYOffset + (pattern.height * CELL_PX) + 40;
            ctx.translate(20, legendYStart);
            
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 40px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText("Materials List", 0, 0);

            const counts = Object.entries(pattern.counts).sort(([, a], [, b]) => b - a);
            
            counts.forEach((entry, idx) => {
                const [colorId, count] = entry;
                const color = BEAD_COLORS.find(c => c.id === colorId);
                if (!color) return;

                const col = Math.floor(idx / ITEMS_PER_COL);
                const row = idx % ITEMS_PER_COL;
                
                const xPos = col * LEGEND_COL_WIDTH;
                const yPos = 40 + (row * LEGEND_ITEM_HEIGHT);

                ctx.fillStyle = color.hex;
                ctx.beginPath();
                ctx.arc(xPos + 10, yPos - 10, 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#94a3b8';
                ctx.stroke();

                ctx.fillStyle = '#000';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(color.symbol, xPos + 10, yPos - 10 + 4);

                ctx.textAlign = 'left';
                ctx.font = '20px sans-serif';
                ctx.fillText(`${color.name} (x${count})`, xPos + 30, yPos - 2);
            });

            const imgData = pdfCanvas.toDataURL('image/jpeg', 0.85);
            const pdf = new jsPDF({
                orientation: pdfCanvas.width > pdfCanvas.height ? 'l' : 'p',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            const ratio = Math.min(pdfWidth / pdfCanvas.width, pdfHeight / pdfCanvas.height);
            const printW = pdfCanvas.width * ratio;
            const printH = pdfCanvas.height * ratio;
            
            const marginX = (pdfWidth - printW) / 2;
            const marginY = (pdfHeight - printH) / 2;
            
            pdf.addImage(imgData, 'JPEG', marginX, marginY, printW, printH);
            pdf.save('bead-pattern.pdf');

        } catch (e) {
            console.error(e);
            alert("Failed to export PDF.");
        } finally {
            setIsExporting(false);
        }
    };

    const cellSize = BASE_CELL_SIZE * zoomLevel;
    const currentPreview = processedImage || originalImage;

    return (
        <div className="flex flex-col lg:flex-row gap-6 relative h-auto lg:h-full print:h-auto print:block">
            <canvas ref={canvasRef} className="hidden" />

            {/* --- LEFT PANEL: CONTROLS --- */}
            <div className="w-full lg:w-1/4 flex flex-col gap-6 no-print lg:h-full lg:overflow-y-auto shrink-0 pb-10">
                
                {/* 1. UPLOAD */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-xl font-black text-slate-800 mb-4">1. Photo</h2>
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="cursor-pointer border-4 border-dashed border-indigo-100 rounded-xl aspect-square flex flex-col items-center justify-center hover:bg-indigo-50 transition-colors relative overflow-hidden group"
                    >
                         {originalImage ? (
                             <img src={originalImage} className="w-full h-full object-contain bg-slate-50 p-2" alt="Original" />
                         ) : (
                             <div className="text-center p-4">
                                 <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">📸</div>
                                 <span className="font-bold text-slate-400">Select Photo</span>
                             </div>
                         )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>

                {/* 2. STYLE & PROCESS */}
                {originalImage && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-fade-in">
                        <h2 className="text-xl font-black text-slate-800 mb-4">2. Style</h2>
                        
                        {/* Style Selector */}
                        <div className="space-y-3 mb-6">
                            <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${styleMode === 'chibi' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-indigo-200'}`}>
                                <input type="radio" name="style" checked={styleMode === 'chibi'} onChange={() => { setStyleMode('chibi'); setProcessedImage(null); }} className="w-5 h-5 accent-indigo-600" />
                                <div>
                                    <div className="font-bold text-slate-800">Cute Avatar</div>
                                    <div className="text-xs text-slate-500">AI Chibi style for people/pets</div>
                                </div>
                            </label>

                            <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${styleMode === 'icon' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-indigo-200'}`}>
                                <input type="radio" name="style" checked={styleMode === 'icon'} onChange={() => { setStyleMode('icon'); setProcessedImage(null); }} className="w-5 h-5 accent-indigo-600" />
                                <div>
                                    <div className="font-bold text-slate-800">HD Icon</div>
                                    <div className="text-xs text-slate-500">Realistic flat objects (No shadow)</div>
                                </div>
                            </label>

                            <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${styleMode === 'original' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-indigo-200'}`}>
                                <input type="radio" name="style" checked={styleMode === 'original'} onChange={() => { setStyleMode('original'); setProcessedImage(originalImage); }} className="w-5 h-5 accent-indigo-600" />
                                <div>
                                    <div className="font-bold text-slate-800">Original</div>
                                    <div className="text-xs text-slate-500">Use photo as-is (Landscapes)</div>
                                </div>
                            </label>
                        </div>

                        {/* AI Generate Button (Only for AI modes) */}
                        {styleMode !== 'original' && (
                            <div className="mb-6">
                                {!processedImage ? (
                                    <button 
                                        onClick={handleGenerateAI}
                                        disabled={isGeneratingAI}
                                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isGeneratingAI ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                <span>Generating Art...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>🎨</span> Create AI Art
                                            </>
                                        )}
                                    </button>
                                ) : (
                                    <div className="relative rounded-xl overflow-hidden border-2 border-indigo-100 group">
                                        <img src={processedImage} alt="AI Result" className="w-full h-auto" />
                                        <div className="absolute bottom-2 right-2 flex gap-2">
                                             <button onClick={() => setShowRefineModal(true)} className="bg-white/90 text-slate-700 px-3 py-1 rounded-lg text-xs font-bold shadow-sm hover:bg-white">Refine</button>
                                             <button onClick={() => setProcessedImage(null)} className="bg-white/90 text-red-600 px-3 py-1 rounded-lg text-xs font-bold shadow-sm hover:bg-white">Retry</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Size Slider & Generate Pattern */}
                        {currentPreview && (
                            <div className="animate-fade-in space-y-4 pt-4 border-t border-slate-100">
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase">Grid Size</label>
                                        <span className="text-indigo-600 font-mono font-bold text-sm">{boardSize}px ({Math.ceil(boardSize/29)}x{Math.ceil(boardSize/29)} boards)</span>
                                    </div>
                                    <input 
                                        type="range"
                                        min="20" 
                                        max="400"
                                        step="1"
                                        value={boardSize}
                                        onChange={(e) => setBoardSize(parseInt(e.target.value))}
                                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                    {boardSize > 150 && (
                                        <p className="text-[10px] text-amber-600 font-bold mt-1">
                                            ⚠️ Large size! Processing will take longer and require many beads.
                                        </p>
                                    )}
                                </div>

                                <button 
                                    onClick={handleGeneratePattern}
                                    disabled={isPixelating}
                                    className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-lg disabled:opacity-50"
                                >
                                    {isPixelating ? 'Calculating...' : 'Generate Pattern 🧩'}
                                </button>
                            </div>
                        )}
                        
                        {statusMsg && <div className="text-center text-xs font-bold text-indigo-500 mt-2">{statusMsg}</div>}
                    </div>
                )}
            </div>

            {/* --- RIGHT PANEL: PREVIEW & RESULTS --- */}
            <div className="flex-1 flex flex-col min-w-0 gap-4 min-h-[600px] lg:h-full print:h-auto print:block">
                
                {/* --- VIEWPORT --- */}
                <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative print:shadow-none print:border-none print:overflow-visible print:h-auto">
                    
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
                             
                             <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-400">🔍</span>
                                <button onClick={handleAutoFit} className="px-2 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded text-slate-600">FIT</button>
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
                         <button 
                            onClick={handleExportPDF} 
                            disabled={!pattern || isExporting}
                            className="flex items-center gap-2 text-slate-600 font-bold text-sm hover:text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                         >
                             <span>{isExporting ? '⏳' : '📥'}</span> 
                             {isExporting ? 'Generating...' : 'Export PDF'}
                         </button>
                    </div>

                    <div ref={viewportRef} className="flex-1 relative overflow-auto bg-slate-50/50 print:overflow-visible print:bg-white print:h-auto">
                        <div className="min-w-full min-h-full flex items-center justify-center p-8 print:p-0 print:block">
                            {pattern ? (
                                <div 
                                    className="bg-white shadow-xl rounded-xl p-1 border border-slate-200 print:shadow-none print:border-none origin-center transition-transform duration-100 ease-out print:w-full print:h-auto"
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: `repeat(${pattern.width}, ${cellSize}px)`,
                                        gridTemplateRows: `repeat(${pattern.height}, ${cellSize}px)`,
                                        width: `${pattern.width * cellSize}px`,
                                        height: `${pattern.height * cellSize}px`
                                    }}
                                >
                                    {pattern.pixels.map((p, i) => (
                                        <div 
                                            key={i}
                                            style={{ 
                                                aspectRatio: '1/1',
                                                backgroundColor: viewMode === 'visual' ? p.color.hex : `${p.color.hex}33`, 
                                                gridColumn: p.x + 1,
                                                gridRow: p.y + 1
                                            }}
                                            className="w-full h-full rounded-full border-[0.5px] border-black/10 flex items-center justify-center text-[10px] text-slate-500 font-bold print:border-slate-300 relative shadow-inner"
                                        >
                                            {/* Bead Hole */}
                                            {viewMode === 'visual' && (
                                                <div className="w-[25%] h-[25%] bg-white/40 rounded-full"></div>
                                            )}

                                            {viewMode === 'chart' && (
                                                <span style={{ fontSize: Math.max(8, cellSize * 0.6) }} className="text-slate-800 z-10">
                                                    {p.color.symbol}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-slate-400">
                                    <div className="text-6xl mb-4 opacity-20">🎨</div>
                                    <p>Select settings and click "Generate Pattern"</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* --- BOTTOM: MATERIALS --- */}
                {pattern && (
                    <div className="h-48 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col shrink-0 no-print">
                        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 rounded-t-2xl flex justify-between items-center">
                             <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">Material List</h3>
                             <span className="text-xs font-bold text-slate-400">{pattern.pixels.length} Beads • {Object.keys(pattern.counts).length} Colors</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
                             <div className="flex flex-wrap gap-3">
                                {Object.entries(pattern.counts)
                                    .sort(([,a], [,b]) => b - a)
                                    .map(([colorId, count]) => {
                                        const color = BEAD_COLORS.find(c => c.id === colorId);
                                        if (!color) return null;
                                        return (
                                            <div key={colorId} className="flex items-center gap-3 bg-slate-50 pr-4 rounded-full border border-slate-100 hover:border-slate-300 transition-colors">
                                                <div 
                                                    className="w-8 h-8 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                                    style={{ backgroundColor: color.hex, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                                                >
                                                    {color.symbol}
                                                </div>
                                                <div className="flex flex-col py-1">
                                                    <span className="text-xs font-bold text-slate-700">{color.name}</span>
                                                    <span className="text-[10px] text-slate-400 font-bold">x{count}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                }
                             </div>
                        </div>
                    </div>
                )}
            </div>

            {/* --- REFINE MODAL --- */}
            {showRefineModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-float">
                        <h3 className="text-xl font-black text-slate-800 mb-2">Refine Result</h3>
                        <p className="text-slate-500 text-sm mb-4">
                            Describe what you want to change (e.g., "Make the hair lighter", "Fix the left eye").
                        </p>
                        <textarea 
                            value={refinePrompt}
                            onChange={(e) => setRefinePrompt(e.target.value)}
                            className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm focus:border-indigo-500 outline-none min-h-[100px]"
                            placeholder="Type your instruction..."
                        />
                        <div className="flex gap-3 mt-6">
                            <button 
                                onClick={() => setShowRefineModal(false)}
                                className="flex-1 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleRefine}
                                disabled={!refinePrompt.trim() || isRefining}
                                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                            >
                                {isRefining ? 'Refining...' : 'Apply Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
