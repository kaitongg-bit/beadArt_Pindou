import React, { useState, useRef, useEffect } from 'react';
import { generateCartoonAvatar, refinePixelArt, ArtStyle } from '../services/gemini';
import { BEAD_COLORS, BOARD_SIZES } from '../constants';
import { BeadPattern, BeadPixel, BeadColor } from '../types';
import { jsPDF } from "jspdf";

// --- COLOR MATH UTILS (CIELAB) ---

interface LabColor {
    l: number;
    a: number;
    b: number;
}

const rgbToLab = (r: number, g: number, b: number): LabColor => {
    let R = r / 255;
    let G = g / 255;
    let B = b / 255;

    // Convert to linear RGB
    R = (R > 0.04045) ? Math.pow((R + 0.055) / 1.055, 2.4) : R / 12.92;
    G = (G > 0.04045) ? Math.pow((G + 0.055) / 1.055, 2.4) : G / 12.92;
    B = (B > 0.04045) ? Math.pow((B + 0.055) / 1.055, 2.4) : B / 12.92;

    // Convert to XYZ
    let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    let Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.00000;
    let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;

    // Convert to Lab
    X = (X > 0.008856) ? Math.pow(X, 1/3) : (7.787 * X) + 16/116;
    Y = (Y > 0.008856) ? Math.pow(Y, 1/3) : (7.787 * Y) + 16/116;
    Z = (Z > 0.008856) ? Math.pow(Z, 1/3) : (7.787 * Z) + 16/116;

    return {
        l: (116 * Y) - 16,
        a: 500 * (X - Y),
        b: 200 * (Y - Z)
    };
};

// Pre-calculate Lab values for the entire palette to optimize performance
const BEAD_LABS = BEAD_COLORS.map(color => {
    const r = parseInt(color.hex.substring(1, 3), 16);
    const g = parseInt(color.hex.substring(3, 5), 16);
    const b = parseInt(color.hex.substring(5, 7), 16);
    return {
        ...color,
        lab: rgbToLab(r, g, b)
    };
});

const getNearestBeadColor = (r: number, g: number, b: number) => {
    // 1. Dark Threshold - Keep absolute blacks strictly black
    if (r < 30 && g < 30 && b < 30) {
        return BEAD_COLORS.find(c => c.id === 'H7') || BEAD_COLORS.find(c => c.id === 'H6') || BEAD_COLORS[0];
    }

    const targetLab = rgbToLab(r, g, b);
    let minDeltaE = Infinity;
    let nearest = BEAD_COLORS[0];

    for (const bead of BEAD_LABS) {
        const dL = targetLab.l - bead.lab.l;
        const da = targetLab.a - bead.lab.a;
        const db = targetLab.b - bead.lab.b;
        
        const deltaE = (dL * dL) + (da * da) + (db * db);

        if (deltaE < minDeltaE) {
            minDeltaE = deltaE;
            nearest = bead;
        }
    }
    return nearest;
};

// Forces any image into a square canvas with GENEROUS white padding
const padImageToSquare = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const originalMax = Math.max(img.width, img.height);
            const TARGET_MAX = 1024;
            
            // Calculate raw padded size (30% padding)
            let finalSize = originalMax * 1.3;
            
            // Calculate scale to fit in target
            let scale = 1;
            if (finalSize > TARGET_MAX) {
                scale = TARGET_MAX / finalSize;
                finalSize = TARGET_MAX;
            }

            const canvas = document.createElement('canvas');
            canvas.width = finalSize;
            canvas.height = finalSize;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(base64Str);
                return;
            }

            // Fill white background
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, finalSize, finalSize);

            // Draw centered
            const drawW = img.width * scale;
            const drawH = img.height * scale;
            const x = (finalSize - drawW) / 2;
            const y = (finalSize - drawH) / 2;
            
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            ctx.drawImage(img, x, y, drawW, drawH);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => resolve(base64Str);
    });
};

// --- COMPONENT ---

export const BrickMe: React.FC = () => {
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [processedImage, setProcessedImage] = useState<string | null>(null);
    const [pattern, setPattern] = useState<BeadPattern | null>(null);
    
    // --- NEW STATES FOR WORKFLOW ---
    const [styleMode, setStyleMode] = useState<'chibi' | 'icon' | 'original'>('chibi');
    const [customPrompt, setCustomPrompt] = useState('');
    const [projectName, setProjectName] = useState('MyPattern');
    
    // Default to STANDARD board size (52)
    const [boardSize, setBoardSize] = useState<number>(32); 
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [isPixelating, setIsPixelating] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    // View & Zoom
    const [zoomLevel, setZoomLevel] = useState<number>(1.0);
    const [isExporting, setIsExporting] = useState(false);
    const [showSymbols, setShowSymbols] = useState(true);

    // Refine Modal State
    const [showRefineModal, setShowRefineModal] = useState(false);
    const [refinePrompt, setRefinePrompt] = useState('');
    const [isRefining, setIsRefining] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);

    const BASE_CELL_SIZE = 25;

    // Reset flow when new image uploaded
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setStatusMsg('正在读取...');
        setPattern(null);
        setProcessedImage(null);
        setCustomPrompt(''); 
        setStyleMode('chibi'); 
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const rawBase64 = event.target?.result as string;
            const squareBase64 = await padImageToSquare(rawBase64);
            setOriginalImage(squareBase64);
            setStatusMsg('');
        };
        reader.readAsDataURL(file);
    };

    const handleGenerateAI = async () => {
        if (!originalImage) return;
        
        if (styleMode === 'original') {
            setProcessedImage(originalImage);
            return;
        }

        setIsGeneratingAI(true);
        setStatusMsg('AI 正在绘制草图...');
        try {
            const aiStyle = styleMode === 'chibi' ? 'chibi' : 'icon';
            const result = await generateCartoonAvatar(originalImage, aiStyle, customPrompt);
            if (result) {
                setProcessedImage(result);
            } else {
                alert("AI 生成失败，使用原图。");
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

    const handleGeneratePattern = () => {
        const source = processedImage || originalImage;
        if (!source) return;

        setIsPixelating(true);
        setStatusMsg('正在量化色彩...');
        
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
            }
        } catch (e) {
            console.error(e);
            alert("修改失败");
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
            
            ctx.fillStyle = '#FF00FF'; 
            ctx.fillRect(0, 0, size, size);

            const PADDING_FACTOR = 0.90; 
            const scale = (size * PADDING_FACTOR) / Math.max(img.width, img.height);
            const drawWidth = Math.floor(img.width * scale);
            const drawHeight = Math.floor(img.height * scale);
            
            const dx = Math.floor((size - drawWidth) / 2);
            const dy = Math.floor((size - drawHeight) / 2);

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(dx, dy, drawWidth, drawHeight);
            
            ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, drawWidth, drawHeight);

            const imageData = ctx.getImageData(0, 0, size, size);
            const data = imageData.data;
            
            const bgR = data[0];
            const bgG = data[1];
            const bgB = data[2];

            let rawPixels: {x: number, y: number, color: BeadColor}[] = [];

            // 1. Map to Palette
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const i = (y * size + x) * 4;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];

                    if (a < 50) continue;
                    if (r > 250 && g < 10 && b > 250) continue;
                    const distToBg = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
                    if (distToBg < 30 || (r > 240 && g > 240 && b > 240)) continue;

                    const matchedColor = getNearestBeadColor(r, g, b);
                    rawPixels.push({ x, y, color: matchedColor });
                }
            }

            // 2. Consolidate Colors (Simple pass)
            if (rawPixels.length > 0) {
                const tempCounts: Record<string, number> = {};
                rawPixels.forEach(p => {
                    tempCounts[p.color.id] = (tempCounts[p.color.id] || 0) + 1;
                });

                const totalDots = rawPixels.length;
                const threshold = totalDots * 0.01; 
                const majorColors = Object.keys(tempCounts).filter(id => tempCounts[id] > threshold);

                if (majorColors.length >= 2) {
                    rawPixels = rawPixels.map(p => {
                        if (tempCounts[p.color.id] <= threshold) {
                            let bestMajor = p.color;
                            let minMajorDiff = Infinity;
                            
                            const cr = parseInt(p.color.hex.substring(1, 3), 16);
                            const cg = parseInt(p.color.hex.substring(3, 5), 16);
                            const cb = parseInt(p.color.hex.substring(5, 7), 16);
                            const cLab = rgbToLab(cr, cg, cb);

                            majorColors.forEach(majorId => {
                                const majorBead = BEAD_LABS.find(b => b.id === majorId);
                                if (!majorBead) return;
                                
                                const dL = cLab.l - majorBead.lab.l;
                                const da = cLab.a - majorBead.lab.a;
                                const db = cLab.b - majorBead.lab.b;
                                const dist = (dL*dL) + (da*da) + (db*db);

                                if (dist < minMajorDiff) {
                                    minMajorDiff = dist;
                                    bestMajor = majorBead;
                                }
                            });

                            if (minMajorDiff < 200) {
                                return { ...p, color: bestMajor };
                            }
                        }
                        return p;
                    });
                }
            }

            // 3. Final Counts & Sort Pixels (Row by Row for Chart)
            const finalCounts: Record<string, number> = {};
            // Fill a complete grid
            const fullGrid: (BeadColor | null)[] = new Array(size * size).fill(null);
            
            rawPixels.forEach(p => {
                finalCounts[p.color.id] = (finalCounts[p.color.id] || 0) + 1;
                fullGrid[p.y * size + p.x] = p.color;
            });

            // Rebuild pixels list to include nulls (transparent) for the chart grid
            const gridPixels: BeadPixel[] = fullGrid.map((color, idx) => ({
                x: idx % size,
                y: Math.floor(idx / size),
                color: color || { id: '', name: '', hex: 'transparent', symbol: '' }
            }));

            setPattern({ width: size, height: size, pixels: gridPixels, counts: finalCounts });
            setIsPixelating(false);
            setStatusMsg('');
            // Defer auto-fit slightly to let React render
            setTimeout(handleAutoFit, 100);
        };
    };

    const handleAutoFit = () => {
        if (!pattern || !viewportRef.current) return;
        const { clientWidth, clientHeight } = viewportRef.current;
        const padding = 60; // More padding for rulers
        const availableW = clientWidth - padding;
        const availableH = clientHeight - padding;
        
        const contentW = (pattern.width + 1) * BASE_CELL_SIZE; // +1 for ruler
        const contentH = (pattern.height + 1) * BASE_CELL_SIZE;

        const scaleW = availableW / contentW;
        const scaleH = availableH / contentH;
        
        // Allow zooming out significantly for large patterns
        const newZoom = Math.min(scaleW, scaleH, 1.2);
        setZoomLevel(Math.max(0.05, newZoom)); // Min zoom 0.05x to fit big charts
    };

    // --- EXPORT FUNCTION ---
    const handleExport = (format: 'png' | 'pdf') => {
        if (!pattern) return;
        setIsExporting(true);

        setTimeout(() => {
            try {
                // OPTIMIZATION: Dynamic Resolution Scaling
                // Cap the maximum output dimension to approx 4000px (approx A3 size at 300dpi).
                // This prevents massive file sizes for 100+ pixel grids.
                const MAX_CANVAS_DIMENSION = 4000;
                const BASE_PX = 50; 
                const maxSide = Math.max(pattern.width, pattern.height);
                
                let PX_PER_CELL = BASE_PX;
                if (maxSide * BASE_PX > MAX_CANVAS_DIMENSION) {
                    PX_PER_CELL = Math.floor(MAX_CANVAS_DIMENSION / maxSide);
                }
                // Ensure a minimum readable size
                PX_PER_CELL = Math.max(PX_PER_CELL, 10);

                const RULER_SIZE = PX_PER_CELL;
                const PADDING = 40;
                
                // Canvas Dimensions for the Grid Part
                const gridW = pattern.width * PX_PER_CELL;
                const gridH = pattern.height * PX_PER_CELL;
                
                // --- LEGEND LAYOUT CALCULATIONS ---
                // We want: [Swatch (with text inside)] and [Count (below)]
                // Group Size:
                const SWATCH_SIZE = 90;
                const TEXT_HEIGHT_BELOW = 50;
                const GROUP_W = 100;
                const GROUP_H = SWATCH_SIZE + TEXT_HEIGHT_BELOW;
                const GAP_X = 30;
                const GAP_Y = 40;
                const LEGEND_PADDING_TOP = 100;

                // Total Width based on Grid
                const totalW = Math.max(gridW + RULER_SIZE + (PADDING * 2), 800);
                
                // Calculate columns for legend
                const legendAreaW = totalW - (PADDING * 2);
                const legendCols = Math.floor(legendAreaW / (GROUP_W + GAP_X));
                const distinctColors = Object.entries(pattern.counts);
                const legendRows = Math.ceil(distinctColors.length / legendCols);
                const legendH = (legendRows * (GROUP_H + GAP_Y)) + LEGEND_PADDING_TOP + 100; // +100 for footer/buffer

                const totalH = gridH + RULER_SIZE + (PADDING * 2) + legendH;

                const cvs = document.createElement('canvas');
                cvs.width = totalW;
                cvs.height = totalH;
                const ctx = cvs.getContext('2d');
                if (!ctx) return;

                // 1. Background
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, cvs.width, cvs.height);

                // 2. Draw Grid & Content
                const startX = PADDING + RULER_SIZE;
                const startY = PADDING + RULER_SIZE;

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // Draw Rulers
                ctx.fillStyle = '#64748b'; // Slate 500
                ctx.font = `bold ${PX_PER_CELL * 0.4}px sans-serif`;
                
                // Top Ruler (Columns)
                for (let x = 0; x < pattern.width; x++) {
                    const cx = startX + (x * PX_PER_CELL) + (PX_PER_CELL/2);
                    ctx.fillText(`${x + 1}`, cx, PADDING + (RULER_SIZE/2));
                }
                
                // Left Ruler (Rows)
                for (let y = 0; y < pattern.height; y++) {
                    const cy = startY + (y * PX_PER_CELL) + (PX_PER_CELL/2);
                    ctx.fillText(`${y + 1}`, PADDING + (RULER_SIZE/2), cy);
                }

                // Draw Pixels
                pattern.pixels.forEach(p => {
                    const px = startX + (p.x * PX_PER_CELL);
                    const py = startY + (p.y * PX_PER_CELL);
                    
                    if (p.color.hex !== 'transparent') {
                        ctx.fillStyle = p.color.hex;
                        ctx.fillRect(px, py, PX_PER_CELL, PX_PER_CELL);

                        // Text Contrast
                        const r = parseInt(p.color.hex.slice(1,3), 16);
                        const g = parseInt(p.color.hex.slice(3,5), 16);
                        const b = parseInt(p.color.hex.slice(5,7), 16);
                        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                        
                        ctx.fillStyle = brightness > 140 ? '#000000' : '#FFFFFF';
                        ctx.font = `bold ${PX_PER_CELL * 0.35}px sans-serif`;
                        ctx.fillText(p.color.symbol, px + PX_PER_CELL/2, py + PX_PER_CELL/2);
                    } else {
                        // Empty cell pattern
                         ctx.fillStyle = '#f8fafc';
                         ctx.fillRect(px, py, PX_PER_CELL, PX_PER_CELL);
                    }
                });

                // Draw Grid Lines (After pixels so they sit on top)
                ctx.lineWidth = 1;
                ctx.strokeStyle = '#cbd5e1'; // Light grey

                // Vertical Lines
                for (let x = 0; x <= pattern.width; x++) {
                    const xPos = startX + (x * PX_PER_CELL);
                    ctx.beginPath();
                    ctx.moveTo(xPos, startY);
                    ctx.lineTo(xPos, startY + gridH);
                    
                    // Bold every 5th line
                    if (x % 5 === 0) {
                        ctx.lineWidth = 3;
                        ctx.strokeStyle = '#94a3b8';
                    } else {
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = '#e2e8f0';
                    }
                    ctx.stroke();
                }

                // Horizontal Lines
                for (let y = 0; y <= pattern.height; y++) {
                    const yPos = startY + (y * PX_PER_CELL);
                    ctx.beginPath();
                    ctx.moveTo(startX, yPos);
                    ctx.lineTo(startX + gridW, yPos);
                    
                    if (y % 5 === 0) {
                        ctx.lineWidth = 3;
                        ctx.strokeStyle = '#94a3b8';
                    } else {
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = '#e2e8f0';
                    }
                    ctx.stroke();
                }

                // 3. Draw Legend - NEW LAYOUT
                const legendStartY = startY + gridH + LEGEND_PADDING_TOP;
                
                // Legend Title (Centered)
                ctx.textAlign = 'center';
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 48px sans-serif'; 
                ctx.fillText(`- 调色板: BrickGift V1 -`, totalW / 2, legendStartY - 40);

                const counts = Object.entries(pattern.counts).sort(([, a], [, b]) => (b as number) - (a as number));
                
                counts.forEach((entry, idx) => {
                    const [colorId, count] = entry;
                    const color = BEAD_COLORS.find(c => c.id === colorId);
                    if (!color) return;

                    const col = idx % legendCols;
                    const row = Math.floor(idx / legendCols);
                    
                    // Calculate center position for this group
                    const groupX = PADDING + (col * (GROUP_W + GAP_X)) + (GROUP_W / 2);
                    const groupY = legendStartY + (row * (GROUP_H + GAP_Y));

                    // 1. Draw Swatch (Rounded Rect)
                    const swatchX = groupX - (SWATCH_SIZE / 2);
                    const swatchY = groupY;
                    
                    ctx.beginPath();
                    ctx.roundRect(swatchX, swatchY, SWATCH_SIZE, SWATCH_SIZE, 16);
                    ctx.fillStyle = color.hex;
                    ctx.fill();
                    // Border slightly
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                    ctx.stroke();

                    // 2. Draw Code Inside Swatch
                    const r = parseInt(color.hex.slice(1,3), 16);
                    const g = parseInt(color.hex.slice(3,5), 16);
                    const b = parseInt(color.hex.slice(5,7), 16);
                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                    ctx.fillStyle = brightness > 140 ? '#000000' : '#FFFFFF';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold 32px sans-serif';
                    ctx.fillText(color.symbol, groupX, swatchY + (SWATCH_SIZE / 2));

                    // 3. Draw Count Below Swatch
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillStyle = '#000000';
                    ctx.font = 'bold 36px monospace'; 
                    ctx.fillText(`${count}`, groupX, swatchY + SWATCH_SIZE + 10);
                });
                
                const finalName = projectName.trim() || `brick-gift-${boardSize}x${boardSize}`;

                if (format === 'png') {
                    const link = document.createElement('a');
                    link.download = `${finalName}.png`;
                    link.href = cvs.toDataURL('image/png');
                    link.click();
                } else {
                    // PDF Logic Optimized
                    // A4 size: 210mm x 297mm
                    const pdf = new jsPDF({
                        orientation: cvs.width > cvs.height ? 'l' : 'p',
                        unit: 'mm',
                        format: 'a4',
                        compress: true // Turn on compression
                    });
                    
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    
                    // Add margins
                    const margin = 10;
                    const maxW = pageWidth - (margin * 2);
                    const maxH = pageHeight - (margin * 2);
                    
                    const ratio = Math.min(maxW / cvs.width, maxH / cvs.height);
                    
                    const imgW = cvs.width * ratio;
                    const imgH = cvs.height * ratio;
                    
                    const x = (pageWidth - imgW) / 2;
                    const y = margin; // Top align with margin
                    
                    // Use JPEG compression (0.7 quality) for PDF to significantly reduce size
                    // PNG base64 is huge for large dimensions.
                    const imgData = cvs.toDataURL('image/jpeg', 0.7);
                    
                    pdf.addImage(imgData, 'JPEG', x, y, imgW, imgH);
                    pdf.save(`${finalName}.pdf`);
                }

            } catch (e) {
                console.error(e);
                alert("导出失败");
            } finally {
                setIsExporting(false);
            }
        }, 100);
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
                    <h2 className="text-lg font-black text-slate-800 mb-4">1. 上传图片</h2>
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="cursor-pointer border-4 border-dashed border-indigo-100 rounded-xl aspect-square flex flex-col items-center justify-center hover:bg-indigo-50 transition-colors relative overflow-hidden group"
                    >
                         {originalImage ? (
                             <img src={originalImage} className="w-full h-full object-contain bg-slate-50 p-2" alt="Original" />
                         ) : (
                             <div className="text-center p-4">
                                 <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">📸</div>
                                 <span className="font-bold text-slate-400">选择照片</span>
                             </div>
                         )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>

                {/* 2. STYLE & PROCESS */}
                {originalImage && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-fade-in">
                        <h2 className="text-lg font-black text-slate-800 mb-4">2. 风格与尺寸</h2>
                        
                        <div className="space-y-4">
                            {/* Style Mode */}
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: 'original', label: '原图直出' },
                                    { id: 'chibi', label: '卡通头像' },
                                    { id: 'icon', label: '扁平图标' }
                                ].map((mode) => (
                                    <button
                                        key={mode.id}
                                        onClick={() => { 
                                            setStyleMode(mode.id as any); 
                                            if(mode.id === 'original') setProcessedImage(originalImage);
                                            else setProcessedImage(null);
                                        }}
                                        className={`py-2 px-1 rounded-lg text-xs font-bold border-2 transition-all ${styleMode === mode.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>

                            {/* Prompt */}
                            {styleMode !== 'original' && (
                                <div className="animate-fade-in">
                                    <textarea
                                        value={customPrompt}
                                        onChange={(e) => setCustomPrompt(e.target.value)}
                                        placeholder="例如：粉色头发，戴眼镜..."
                                        className="w-full border-2 border-slate-200 rounded-lg p-2 text-sm focus:border-indigo-500 outline-none h-16 resize-none bg-slate-50"
                                    />
                                    
                                    <div className="mt-2">
                                        {!processedImage ? (
                                            <button 
                                                onClick={handleGenerateAI}
                                                disabled={isGeneratingAI}
                                                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                                            >
                                                {isGeneratingAI ? 'AI 绘制中...' : '生成 AI 效果图'}
                                            </button>
                                        ) : (
                                            <div className="relative rounded-lg overflow-hidden border border-slate-200">
                                                <img src={processedImage} alt="AI Result" className="w-full h-auto" />
                                                <div className="absolute bottom-1 right-1 flex gap-1">
                                                     <button onClick={() => setShowRefineModal(true)} className="bg-white/90 text-slate-700 px-2 py-1 rounded text-xs font-bold shadow-sm hover:bg-white">修改</button>
                                                     <button onClick={() => setProcessedImage(null)} className="bg-white/90 text-red-600 px-2 py-1 rounded text-xs font-bold shadow-sm hover:bg-white">重试</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <hr className="border-slate-100" />
                            
                            {/* Size Slider - UPDATED with Input */}
                            {currentPreview && (
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-xs font-bold text-slate-400">像素尺寸</label>
                                            <div className="flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1">
                                                <input 
                                                    type="number"
                                                    min="10"
                                                    max="300"
                                                    value={boardSize}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value);
                                                        if (!isNaN(val)) setBoardSize(val);
                                                    }}
                                                    className="w-12 text-right bg-transparent text-indigo-600 font-mono font-bold text-sm outline-none border-b border-transparent focus:border-indigo-400"
                                                />
                                                <span className="text-xs text-slate-400 font-bold">px</span>
                                            </div>
                                        </div>
                                        <input 
                                            type="range"
                                            min="20" 
                                            max="300"
                                            step="1"
                                            value={boardSize}
                                            onChange={(e) => setBoardSize(parseInt(e.target.value))}
                                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                    </div>

                                    <button 
                                        onClick={handleGeneratePattern}
                                        disabled={isPixelating}
                                        className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-md disabled:opacity-50"
                                    >
                                        {isPixelating ? '计算中...' : '生成图纸 🧩'}
                                    </button>
                                </div>
                            )}
                        </div>
                        {statusMsg && <div className="text-center text-xs font-bold text-indigo-500 mt-2">{statusMsg}</div>}
                    </div>
                )}
            </div>

            {/* --- RIGHT PANEL: PREVIEW & RESULTS --- */}
            <div className="flex-1 flex flex-col min-w-0 gap-4 min-h-[600px] lg:h-full print:h-auto print:block">
                
                {/* --- VIEWPORT --- */}
                <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative print:shadow-none print:border-none print:overflow-visible print:h-auto">
                    
                    <div className="border-b border-slate-100 p-4 flex flex-wrap gap-4 justify-between items-center bg-slate-50 no-print z-10 relative shrink-0">
                         <div className="flex items-center gap-4 flex-wrap">
                             <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-400">缩放</span>
                                <button onClick={handleAutoFit} className="px-2 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded text-slate-600">适配</button>
                                <input 
                                    type="range"
                                    min="0.05" 
                                    max="2.5"
                                    step="0.05"
                                    value={zoomLevel}
                                    onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                                    className="w-24 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                />
                             </div>
                             {/* Symbol Visibility Toggle */}
                             <label className="flex items-center gap-2 cursor-pointer select-none">
                                 <div className={`w-10 h-6 rounded-full p-1 transition-colors ${showSymbols ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                                     <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showSymbols ? 'translate-x-4' : ''}`}></div>
                                 </div>
                                 <input type="checkbox" checked={showSymbols} onChange={(e) => setShowSymbols(e.target.checked)} className="hidden" />
                                 <span className="text-xs font-bold text-slate-500">显示色号</span>
                             </label>
                         </div>
                         
                         {/* Export Controls */}
                         <div className="flex items-center gap-2">
                            <input 
                                type="text" 
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                placeholder="项目名称"
                                className="w-32 lg:w-48 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 font-bold text-slate-600"
                            />
                            <div className="flex bg-indigo-600 rounded-lg p-0.5 shadow-sm">
                                 <button 
                                    onClick={() => handleExport('png')}
                                    disabled={!pattern || isExporting}
                                    className="px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 rounded-md transition-colors disabled:opacity-50"
                                 >
                                    PNG
                                 </button>
                                 <div className="w-[1px] bg-white/20 my-1"></div>
                                 <button 
                                    onClick={() => handleExport('pdf')}
                                    disabled={!pattern || isExporting}
                                    className="px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 rounded-md transition-colors disabled:opacity-50"
                                 >
                                    PDF
                                 </button>
                            </div>
                         </div>
                    </div>

                    <div ref={viewportRef} className="flex-1 relative overflow-auto bg-slate-100 print:overflow-visible print:bg-white print:h-auto">
                        <div className="min-w-max min-h-max p-10 print:p-0 print:block">
                            {pattern ? (
                                <div className="bg-white shadow-2xl inline-block p-4 rounded-sm">
                                    {/* Ruler Top */}
                                    <div className="flex" style={{ marginLeft: `${cellSize}px` }}>
                                        {Array.from({ length: pattern.width }).map((_, i) => (
                                            <div 
                                                key={`col-${i}`} 
                                                style={{ width: `${cellSize}px` }} 
                                                className="text-center text-slate-400 font-bold text-[10px] pb-1"
                                            >
                                                {i + 1}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex">
                                        {/* Ruler Left */}
                                        <div className="flex flex-col" style={{ marginRight: '4px' }}>
                                            {Array.from({ length: pattern.height }).map((_, i) => (
                                                <div 
                                                    key={`row-${i}`} 
                                                    style={{ height: `${cellSize}px` }} 
                                                    className="flex items-center justify-end pr-2 text-slate-400 font-bold text-[10px]"
                                                >
                                                    {i + 1}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Grid */}
                                        <div 
                                            className="border-t border-l border-slate-300"
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: `repeat(${pattern.width}, ${cellSize}px)`,
                                                width: `${pattern.width * cellSize}px`,
                                            }}
                                        >
                                            {pattern.pixels.map((p, i) => {
                                                // Contrast calculation for text
                                                let textColor = 'transparent';
                                                if (p.color.hex !== 'transparent') {
                                                    const r = parseInt(p.color.hex.slice(1,3), 16);
                                                    const g = parseInt(p.color.hex.slice(3,5), 16);
                                                    const b = parseInt(p.color.hex.slice(5,7), 16);
                                                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                                                    textColor = brightness > 140 ? '#000000' : '#FFFFFF';
                                                }

                                                // Thick border logic for every 5th cell
                                                const isRightThick = (p.x + 1) % 5 === 0;
                                                const isBottomThick = (p.y + 1) % 5 === 0;

                                                return (
                                                    <div 
                                                        key={i}
                                                        style={{ 
                                                            backgroundColor: p.color.hex,
                                                            aspectRatio: '1/1',
                                                        }}
                                                        className={`
                                                            flex items-center justify-center font-bold relative
                                                            border-r border-b 
                                                            ${isRightThick ? 'border-r-slate-400 border-r-2' : 'border-r-slate-200'}
                                                            ${isBottomThick ? 'border-b-slate-400 border-b-2' : 'border-b-slate-200'}
                                                        `}
                                                    >
                                                        {p.color.symbol && showSymbols && (
                                                            <span style={{ fontSize: `${cellSize * 0.4}px`, color: textColor }}>
                                                                {p.color.symbol}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-400">
                                    <div className="text-center">
                                        <div className="text-6xl mb-4 opacity-20">📐</div>
                                        <p>设置参数并点击 "生成图纸"</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* --- BOTTOM: MATERIALS --- */}
                {pattern && (
                    <div className="h-48 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col shrink-0 no-print">
                        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 rounded-t-2xl flex justify-between items-center">
                             <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">材料清单</h3>
                             <span className="text-xs font-bold text-slate-400">{pattern.pixels.filter(p => p.color.hex !== 'transparent').length} 颗 • {Object.keys(pattern.counts).length} 色</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
                             <div className="flex flex-wrap gap-3">
                                {Object.entries(pattern.counts)
                                    .sort(([,a], [,b]) => (b as number) - (a as number))
                                    .map(([colorId, count]) => {
                                        const color = BEAD_COLORS.find(c => c.id === colorId);
                                        if (!color) return null;
                                        
                                        // Contrast check for badge
                                        const r = parseInt(color.hex.slice(1,3), 16);
                                        const g = parseInt(color.hex.slice(3,5), 16);
                                        const b = parseInt(color.hex.slice(5,7), 16);
                                        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                                        const textCol = brightness > 140 ? '#000' : '#FFF';

                                        return (
                                            <div key={colorId} className="flex items-center gap-3 bg-slate-50 pr-4 pl-1 py-1 rounded-full border border-slate-100 hover:border-slate-300 transition-colors">
                                                <div 
                                                    className="w-8 h-8 rounded-full border border-black/10 shadow-sm flex items-center justify-center text-[10px] font-bold shrink-0"
                                                    style={{ backgroundColor: color.hex, color: textCol }}
                                                >
                                                    {color.symbol}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-slate-700">{color.id}</span>
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
                        <h3 className="text-lg font-black text-slate-800 mb-2">修改细节</h3>
                        <p className="text-slate-500 text-sm mb-4">
                            请描述您希望修改的地方 (例如: "把头发改浅一点", "左眼修整一下")
                        </p>
                        <textarea 
                            value={refinePrompt}
                            onChange={(e) => setRefinePrompt(e.target.value)}
                            className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm focus:border-indigo-500 outline-none min-h-[100px]"
                            placeholder="输入修改指令..."
                        />
                        <div className="flex gap-3 mt-6">
                            <button 
                                onClick={() => setShowRefineModal(false)}
                                className="flex-1 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                取消
                            </button>
                            <button 
                                onClick={handleRefine}
                                disabled={!refinePrompt.trim() || isRefining}
                                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
                            >
                                {isRefining ? '处理中...' : '确认修改'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};