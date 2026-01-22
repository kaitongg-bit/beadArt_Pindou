import React, { useState, useRef, useEffect } from 'react';
// import { generateCartoonAvatar, refinePixelArt, ArtStyle } from '../services/gemini'; // Disabled for China-ready branch
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
    if (r < 80 && g < 80 && b < 80) {
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

// --- COMPONENT ---

export const BrickMe: React.FC = () => {
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null);
    const [pattern, setPattern] = useState<BeadPattern | null>(null);
    
    // --- WORKFLOW STATES ---
    const [projectName, setProjectName] = useState('MyPattern');
    
    // Image Adjustments
    const [imgBrightness, setImgBrightness] = useState(100);
    const [imgSaturation, setImgSaturation] = useState(100);

    // Mobile UX State
    const [activeTab, setActiveTab] = useState<'settings' | 'preview' | 'palette'>('settings');
    const [showMobilePalette, setShowMobilePalette] = useState(false); // Bottom sheet state
    
    // Default to STANDARD board size (52)
    const [boardSize, setBoardSize] = useState<number>(32); 
    const [isPixelating, setIsPixelating] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    // View & Zoom
    const [zoomLevel, setZoomLevel] = useState<number>(1.0);
    const [isExporting, setIsExporting] = useState(false);
    const [showSymbols, setShowSymbols] = useState(true);
    const [showGrid, setShowGrid] = useState(true); 
    const [keepWhite, setKeepWhite] = useState(false); 

    // Touch Gesture State
    const [touchStartDist, setTouchStartDist] = useState<number>(0);
    const [startZoom, setStartZoom] = useState<number>(1);

    // --- EDIT MODE STATES ---
    const [isEditMode, setIsEditMode] = useState(false);
    const [activeTool, setActiveTool] = useState<'paint' | 'eraser'>('paint');
    const [selectedBrushColor, setSelectedBrushColor] = useState<BeadColor>(BEAD_COLORS[6]); // Default some color
    const [showColorPicker, setShowColorPicker] = useState(false);

    // --- REFINE MODAL STATES ---
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
        setIsEditMode(false);
        setActiveTab('settings'); // Stay on settings to adjust
        
        // Reset adjustments
        setImgBrightness(100);
        setImgSaturation(100);

        const reader = new FileReader();
        reader.onload = async (event) => {
            const rawBase64 = event.target?.result as string;
            
            const img = new Image();
            img.src = rawBase64;
            await new Promise((resolve) => {
                img.onload = () => {
                    setImageDimensions({ width: img.width, height: img.height });
                    resolve(true);
                };
            });

            setOriginalImage(rawBase64);
            setStatusMsg('');
        };
        reader.readAsDataURL(file);
    };

    const handleGeneratePattern = () => {
        const source = originalImage; // Use original directly, no AI
        if (!source) return;

        setIsPixelating(true);
        setStatusMsg('正在量化色彩...');
        setIsEditMode(false);
        
        setTimeout(() => {
            processBeadPattern(source, boardSize);
            // Switch tab to preview for better UX
            setActiveTab('preview');
        }, 100);
    };

    const handleRefine = () => {
        // AI feature disabled in this version
        setShowRefineModal(false);
    };

    // --- PIXEL EDITING LOGIC ---
    const handlePixelClick = (index: number) => {
        if (!pattern || !isEditMode) return;

        const newPixels = [...pattern.pixels];
        const oldPixel = newPixels[index];
        const newColor = activeTool === 'eraser' 
            ? { id: '', name: '', hex: 'transparent', symbol: '' }
            : selectedBrushColor;

        if (oldPixel.color.hex === newColor.hex) return;

        newPixels[index] = { ...oldPixel, color: newColor };

        // Re-calculate counts
        const newCounts: Record<string, number> = {};
        newPixels.forEach(p => {
            if (p.color.hex !== 'transparent') {
                newCounts[p.color.id] = (newCounts[p.color.id] || 0) + 1;
            }
        });

        setPattern({
            ...pattern,
            pixels: newPixels,
            counts: newCounts
        });
    };

    const selectColor = (color: BeadColor) => {
        setSelectedBrushColor(color);
        setActiveTool('paint');
        if (!isEditMode) setIsEditMode(true);
        setShowMobilePalette(false); // Close sheet on selection
    };

    // --- TOUCH GESTURE LOGIC (PINCH ZOOM) ---
    const onTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            setTouchStartDist(dist);
            setStartZoom(zoomLevel);
        }
    };

    const onTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            if (touchStartDist > 0) {
                const scale = dist / touchStartDist;
                const newZoom = Math.max(0.05, Math.min(2.5, startZoom * scale));
                setZoomLevel(newZoom);
            }
        }
    };

    // --- PIXELATION ALGORITHM ---
    const processBeadPattern = (imgSrc: string, maxDim: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.src = imgSrc;
        img.onload = () => {
            // Calculate scale based on the maximum dimension allowed
            const scale = maxDim / Math.max(img.width, img.height);
            const width = Math.floor(img.width * scale);
            const height = Math.floor(img.height * scale);

            canvas.width = width;
            canvas.height = height;
            
            // ENABLE smoothing for better connectivity of thin lines during downscale
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // Clear canvas to transparent
            ctx.clearRect(0, 0, width, height);

            // Apply Image Adjustments
            ctx.filter = `brightness(${imgBrightness}%) saturate(${imgSaturation}%)`;

            // Draw image exactly filling the calculated dimensions
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, width, height);

            // Reset filter
            ctx.filter = 'none';

            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            // --- STEP 1: SMART CONTRAST SNAP ---
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                const a = data[i+3];

                if (a < 50) continue; // Skip transparency

                const isNeutral = Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && Math.abs(r - b) < 30;

                if (isNeutral && r < 120) {
                    data[i] = 0; data[i+1] = 0; data[i+2] = 0;
                }
                else if (isNeutral && r > 240) {
                    data[i] = 255; data[i+1] = 255; data[i+2] = 255;
                }
            }

            // --- STEP 2: FLOOD FILL BACKGROUND DETECTION ---
            // Adapted for rectangular grids
            const visited = new Int8Array(width * height); 
            const queue: number[] = [];
            const getIdx = (x: number, y: number) => y * width + x;
            
            const matchBgColor = (idx: number) => {
                const i = idx * 4;
                if (data[i+3] < 50) return false;
                if (keepWhite) return false;
                return data[i] > 240 && data[i+1] > 240 && data[i+2] > 240;
            };

            const corners = [0, width-1, width*(height-1), width*height-1];
            corners.forEach(c => {
                 if (matchBgColor(c)) {
                     queue.push(c);
                     visited[c] = 1;
                 }
            });

            while (queue.length > 0) {
                const idx = queue.pop()!;
                const x = idx % width;
                const y = Math.floor(idx / width);
                const neighbors = [
                    { nx: x + 1, ny: y },
                    { nx: x - 1, ny: y },
                    { nx: x, ny: y + 1 },
                    { nx: x, ny: y - 1 }
                ];
                for (const { nx, ny } of neighbors) {
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nIdx = getIdx(nx, ny);
                        if (visited[nIdx] === 0 && matchBgColor(nIdx)) {
                            visited[nIdx] = 1;
                            queue.push(nIdx);
                        }
                    }
                }
            }

            let rawPixels: {x: number, y: number, color: BeadColor}[] = [];

            // --- STEP 3: MAPPING ---
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = y * width + x;
                    const i = idx * 4;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];

                    if (a < 50) continue;
                    if (visited[idx] === 1) continue;
                    if (!keepWhite && r > 240 && g > 240 && b > 240) continue;

                    const matchedColor = getNearestBeadColor(r, g, b);
                    rawPixels.push({ x, y, color: matchedColor });
                }
            }

            if (rawPixels.length > 0) {
                const tempCounts: Record<string, number> = {};
                rawPixels.forEach(p => {
                    tempCounts[p.color.id] = (tempCounts[p.color.id] || 0) + 1;
                });

                const totalDots = rawPixels.length;
                const threshold = totalDots * 0.015; 
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
                            if (minMajorDiff < 400) {
                                return { ...p, color: bestMajor };
                            }
                        }
                        return p;
                    });
                }
            }

            // --- AUTO CROP / TRIM LOGIC ---
            if (rawPixels.length === 0) {
                setPattern({ width: width, height: height, pixels: [], counts: {} });
                setIsPixelating(false);
                setStatusMsg('没有检测到有效像素');
                return;
            }

            let minX = width, maxX = 0, minY = height, maxY = 0;
            rawPixels.forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            });

            const trimmedWidth = maxX - minX + 1;
            const trimmedHeight = maxY - minY + 1;
            const finalCounts: Record<string, number> = {};
            const fullGrid: (BeadColor | null)[] = new Array(trimmedWidth * trimmedHeight).fill(null);

            rawPixels.forEach(p => {
                const newX = p.x - minX;
                const newY = p.y - minY;
                finalCounts[p.color.id] = (finalCounts[p.color.id] || 0) + 1;
                fullGrid[newY * trimmedWidth + newX] = p.color;
            });

            const gridPixels: BeadPixel[] = fullGrid.map((color, idx) => ({
                x: idx % trimmedWidth,
                y: Math.floor(idx / trimmedWidth),
                color: color || { id: '', name: '', hex: 'transparent', symbol: '' }
            }));

            setPattern({ 
                width: trimmedWidth, 
                height: trimmedHeight, 
                pixels: gridPixels, 
                counts: finalCounts 
            });

            setIsPixelating(false);
            setStatusMsg('');
            // Set default tool color to the most prominent color
            const mostProminent = Object.entries(finalCounts).sort(([,a], [,b]) => b-a)[0];
            if (mostProminent) {
                const c = BEAD_COLORS.find(bc => bc.id === mostProminent[0]);
                if (c) setSelectedBrushColor(c);
            }
            setTimeout(handleAutoFit, 100);
        };
    };

    const handleAutoFit = () => {
        if (!pattern || !viewportRef.current) return;
        const { clientWidth, clientHeight } = viewportRef.current;
        const padding = 60; 
        const availableW = clientWidth - padding;
        const availableH = clientHeight - padding;
        
        const contentW = (pattern.width + 1) * BASE_CELL_SIZE; 
        const contentH = (pattern.height + 1) * BASE_CELL_SIZE;

        const scaleW = availableW / contentW;
        const scaleH = availableH / contentH;
        
        const newZoom = Math.min(scaleW, scaleH, 1.2);
        setZoomLevel(Math.max(0.05, newZoom)); 
    };

    // --- EXPORT FUNCTION ---
    const handleExport = (format: 'png' | 'pdf') => {
        if (!pattern) return;
        setIsExporting(true);

        setTimeout(() => {
            try {
                const MAX_CANVAS_DIMENSION = 4000;
                const BASE_PX = 50; 
                const maxSide = Math.max(pattern.width, pattern.height);
                
                let PX_PER_CELL = BASE_PX;
                if (maxSide * BASE_PX > MAX_CANVAS_DIMENSION) {
                    PX_PER_CELL = Math.floor(MAX_CANVAS_DIMENSION / maxSide);
                }
                PX_PER_CELL = Math.max(PX_PER_CELL, 10);

                const RULER_SIZE = PX_PER_CELL * 1.5; 
                const PADDING = 40;
                
                const gridW = pattern.width * PX_PER_CELL;
                const gridH = pattern.height * PX_PER_CELL;
                
                const SWATCH_SIZE = 90;
                const TEXT_HEIGHT_BELOW = 50;
                const GROUP_W = 100;
                const GROUP_H = SWATCH_SIZE + TEXT_HEIGHT_BELOW;
                const GAP_X = 30;
                const GAP_Y = 40;
                const LEGEND_PADDING_TOP = 100;

                const totalW = Math.max(RULER_SIZE + gridW + RULER_SIZE + (PADDING * 2), 800);
                const legendAreaW = totalW - (PADDING * 2);
                const legendCols = Math.floor(legendAreaW / (GROUP_W + GAP_X));
                const distinctColors = Object.entries(pattern.counts);
                const legendRows = Math.ceil(distinctColors.length / legendCols);
                const legendH = (legendRows * (GROUP_H + GAP_Y)) + LEGEND_PADDING_TOP + 100;

                const totalH = RULER_SIZE + gridH + RULER_SIZE + (PADDING * 2) + legendH;

                const cvs = document.createElement('canvas');
                cvs.width = totalW;
                cvs.height = totalH;
                const ctx = cvs.getContext('2d');
                if (!ctx) return;

                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, cvs.width, cvs.height);

                const startX = PADDING + RULER_SIZE;
                const startY = PADDING + RULER_SIZE;

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                ctx.fillStyle = '#000000'; 
                ctx.font = `bold ${PX_PER_CELL * 0.8}px sans-serif`;
                
                for (let x = 0; x < pattern.width; x++) {
                    const num = x + 1;
                    if (num % 5 === 0) {
                        const cx = startX + (x * PX_PER_CELL) + (PX_PER_CELL/2);
                        const label = (num / 5).toString();
                        ctx.fillText(label, cx, PADDING + (RULER_SIZE/2));
                        ctx.fillText(label, cx, startY + gridH + (RULER_SIZE/2));
                    }
                }
                
                for (let y = 0; y < pattern.height; y++) {
                    const num = y + 1;
                    if (num % 5 === 0) {
                        const cy = startY + (y * PX_PER_CELL) + (PX_PER_CELL/2);
                        const label = (num / 5).toString();
                        ctx.fillText(label, PADDING + (RULER_SIZE/2), cy);
                        ctx.fillText(label, startX + gridW + (RULER_SIZE/2), cy);
                    }
                }

                pattern.pixels.forEach(p => {
                    const px = startX + (p.x * PX_PER_CELL);
                    const py = startY + (p.y * PX_PER_CELL);
                    
                    if (p.color.hex !== 'transparent') {
                        ctx.fillStyle = p.color.hex;
                        ctx.fillRect(px, py, PX_PER_CELL, PX_PER_CELL);

                        const r = parseInt(p.color.hex.slice(1,3), 16);
                        const g = parseInt(p.color.hex.slice(3,5), 16);
                        const b = parseInt(p.color.hex.slice(5,7), 16);
                        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                        
                        ctx.fillStyle = brightness > 140 ? '#000000' : '#FFFFFF';
                        ctx.font = `bold ${PX_PER_CELL * 0.35}px sans-serif`;
                        ctx.fillText(p.color.symbol, px + PX_PER_CELL/2, py + PX_PER_CELL/2);
                    } else {
                         ctx.fillStyle = '#f8fafc';
                         ctx.fillRect(px, py, PX_PER_CELL, PX_PER_CELL);
                    }
                });

                ctx.lineWidth = 1;
                ctx.strokeStyle = '#94a3b8'; 

                for (let x = 0; x <= pattern.width; x++) {
                    const xPos = startX + (x * PX_PER_CELL);
                    ctx.beginPath();
                    ctx.moveTo(xPos, startY);
                    ctx.lineTo(xPos, startY + gridH);
                    
                    if (x % 5 === 0) {
                        ctx.lineWidth = 3;
                        ctx.strokeStyle = '#475569'; 
                    } else {
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = '#cbd5e1';
                    }
                    ctx.stroke();
                }

                for (let y = 0; y <= pattern.height; y++) {
                    const yPos = startY + (y * PX_PER_CELL);
                    ctx.beginPath();
                    ctx.moveTo(startX, yPos);
                    ctx.lineTo(startX + gridW, yPos);
                    
                    if (y % 5 === 0) {
                        ctx.lineWidth = 3;
                        ctx.strokeStyle = '#475569';
                    } else {
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = '#cbd5e1';
                    }
                    ctx.stroke();
                }

                const legendStartY = startY + gridH + RULER_SIZE + LEGEND_PADDING_TOP;
                
                ctx.textAlign = 'center';
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 48px sans-serif'; 
                ctx.fillText(`- 调色板: 拼豆礼坊 V1 -`, totalW / 2, legendStartY - 40);

                const counts = Object.entries(pattern.counts).sort(([, a], [, b]) => (b as number) - (a as number));
                
                counts.forEach((entry, idx) => {
                    const [colorId, count] = entry;
                    const color = BEAD_COLORS.find(c => c.id === colorId);
                    if (!color) return;

                    const col = idx % legendCols;
                    const row = Math.floor(idx / legendCols);
                    
                    const groupX = PADDING + (col * (GROUP_W + GAP_X)) + (GROUP_W / 2);
                    const groupY = legendStartY + (row * (GROUP_H + GAP_Y));

                    const swatchX = groupX - (SWATCH_SIZE / 2);
                    const swatchY = groupY;
                    
                    ctx.beginPath();
                    ctx.roundRect(swatchX, swatchY, SWATCH_SIZE, SWATCH_SIZE, 16);
                    ctx.fillStyle = color.hex;
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                    ctx.stroke();

                    const r = parseInt(color.hex.slice(1,3), 16);
                    const g = parseInt(color.hex.slice(3,5), 16);
                    const b = parseInt(color.hex.slice(5,7), 16);
                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                    ctx.fillStyle = brightness > 140 ? '#000000' : '#FFFFFF';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold 32px sans-serif';
                    ctx.fillText(color.symbol, groupX, swatchY + (SWATCH_SIZE / 2));

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillStyle = '#000000';
                    ctx.font = 'bold 36px monospace'; 
                    ctx.fillText(`${count}`, groupX, swatchY + SWATCH_SIZE + 10);
                });
                
                const finalName = projectName.trim() || `bead-gift-${pattern.width}x${pattern.height}`;

                if (format === 'png') {
                    const link = document.createElement('a');
                    link.download = `${finalName}.png`;
                    link.href = cvs.toDataURL('image/png');
                    link.click();
                } else {
                    const pdf = new jsPDF({
                        orientation: cvs.width > cvs.height ? 'l' : 'p',
                        unit: 'mm',
                        format: 'a4',
                        compress: true
                    });
                    
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const margin = 10;
                    const maxW = pageWidth - (margin * 2);
                    const maxH = pageHeight - (margin * 2);
                    
                    const ratio = Math.min(maxW / cvs.width, maxH / cvs.height);
                    const imgW = cvs.width * ratio;
                    const imgH = cvs.height * ratio;
                    
                    const x = (pageWidth - imgW) / 2;
                    const y = margin;
                    
                    const imgData = cvs.toDataURL('image/jpeg', 0.8);
                    
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

    // Estimate Calculation for UI
    let estimationUI = null;
    if (imageDimensions) {
        // Calculate the scale that processBeadPattern will use (no padding now)
        const scale = boardSize / Math.max(imageDimensions.width, imageDimensions.height);
        const estW = Math.round(imageDimensions.width * scale);
        const estH = Math.round(imageDimensions.height * scale);
        
        // Calculate boards (52x52)
        const cols = Math.ceil(estW / 52);
        const rows = Math.ceil(estH / 52);
        const totalBoards = cols * rows;

        estimationUI = (
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-xs mb-4">
                <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-indigo-800">预计像素尺寸:</span>
                    <span className="font-mono text-indigo-600">{estW} x {estH} px</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="font-bold text-indigo-800">需用小板 (52x52):</span>
                    <span className="font-mono font-bold text-indigo-600 bg-white px-1.5 py-0.5 rounded shadow-sm">
                        {totalBoards} 块 ({cols}x{rows})
                    </span>
                </div>
            </div>
        );
    }

    // Helper classes for tab visibility
    const showSettings = activeTab === 'settings';
    const showPreview = activeTab === 'preview';
    const showPalette = activeTab === 'palette';

    return (
        <div className="flex flex-col lg:flex-row gap-6 relative h-auto lg:h-full print:h-auto print:block pb-24 lg:pb-0">
            <canvas ref={canvasRef} className="hidden" />

            {/* --- LEFT PANEL: CONTROLS --- */}
            {/* On Mobile: Only show if activeTab is 'settings'. On Desktop: Always show (lg:flex). */}
            <div className={`w-full lg:w-1/4 flex-col gap-6 no-print lg:h-full lg:overflow-y-auto shrink-0 pb-10 lg:flex ${showSettings ? 'flex' : 'hidden'}`}>
                
                {/* 1. UPLOAD */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-black text-slate-800 mb-4">1. 上传图片</h2>
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="cursor-pointer border-4 border-dashed border-indigo-100 rounded-xl aspect-square flex flex-col items-center justify-center hover:bg-indigo-50 transition-colors relative overflow-hidden group"
                    >
                         {originalImage ? (
                             <img 
                                src={originalImage} 
                                className="w-full h-full object-contain bg-slate-50 p-2 transition-all duration-300" 
                                alt="Original" 
                                style={{ filter: `brightness(${imgBrightness}%) saturate(${imgSaturation}%)` }}
                             />
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
                        <h2 className="text-lg font-black text-slate-800 mb-4">2. 调整与生成</h2>
                        
                        <div className="space-y-4">
                            
                            {/* NEW: Image Adjustments */}
                            <div className="bg-slate-50 p-4 rounded-xl space-y-3">
                                 <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-500">图片预处理</label>
                                    <button 
                                        onClick={() => { setImgBrightness(100); setImgSaturation(100); }}
                                        className="text-[10px] text-blue-500 font-bold hover:underline"
                                    >
                                        重置
                                    </button>
                                 </div>
                                 
                                 {/* Brightness */}
                                 <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-slate-400 w-8">亮度</span>
                                    <input 
                                        type="range" min="50" max="150" step="5" 
                                        value={imgBrightness}
                                        onChange={(e) => setImgBrightness(Number(e.target.value))}
                                        className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    />
                                    <span className="text-xs font-mono text-slate-500 w-8 text-right">{imgBrightness}%</span>
                                 </div>

                                 {/* Saturation */}
                                 <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-slate-400 w-8">鲜艳</span>
                                    <input 
                                        type="range" min="0" max="200" step="5" 
                                        value={imgSaturation}
                                        onChange={(e) => setImgSaturation(Number(e.target.value))}
                                        className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    />
                                    <span className="text-xs font-mono text-slate-500 w-8 text-right">{imgSaturation}%</span>
                                 </div>
                            </div>
                            
                            {/* Size Slider - UPDATED with Input */}
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-xs font-bold text-slate-400">最大尺寸 (像素/豆豆)</label>
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
                                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mb-3"
                                    />
                                </div>
                                
                                {estimationUI}

                                {/* White Bead Toggle */}
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <div className={`w-8 h-5 rounded-full p-0.5 transition-colors ${keepWhite ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${keepWhite ? 'translate-x-3' : ''}`}></div>
                                        </div>
                                        <input type="checkbox" checked={keepWhite} onChange={(e) => setKeepWhite(e.target.checked)} className="hidden" />
                                        <span className="text-xs font-bold text-slate-500">保留白色豆子</span>
                                    </label>
                                </div>

                                <button 
                                    onClick={handleGeneratePattern}
                                    disabled={isPixelating}
                                    className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-md disabled:opacity-50"
                                >
                                    {isPixelating ? '计算中...' : '生成图纸 🧩'}
                                </button>
                            </div>
                        </div>
                        {statusMsg && <div className="text-center text-xs font-bold text-indigo-500 mt-2">{statusMsg}</div>}
                    </div>
                )}
            </div>

            {/* --- RIGHT PANEL: PREVIEW & RESULTS --- */}
            {/* Wrapper: On Mobile, only show if preview OR palette is active. On Desktop, always show. */}
            <div className={`flex-1 flex-col min-w-0 gap-4 min-h-[600px] lg:h-full print:h-auto print:block ${(showPreview || showPalette) ? 'flex' : 'hidden'} lg:flex`}>
                
                {/* --- VIEWPORT (PREVIEW TAB) --- */}
                {/* Mobile: Show only if activeTab is 'preview'. Desktop: Always show. */}
                <div className={`flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex-col overflow-hidden relative print:shadow-none print:border-none print:overflow-visible print:h-auto ${showPreview ? 'flex' : 'hidden'} lg:flex`}>
                    
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
                             
                             <div className="flex items-center gap-4">
                                {/* Grid Toggle */}
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <div className={`w-8 h-5 rounded-full p-0.5 transition-colors ${showGrid ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showGrid ? 'translate-x-3' : ''}`}></div>
                                    </div>
                                    <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="hidden" />
                                    <span className="text-xs font-bold text-slate-500">网格</span>
                                </label>

                                {/* Symbol Visibility Toggle */}
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <div className={`w-8 h-5 rounded-full p-0.5 transition-colors ${showSymbols ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showSymbols ? 'translate-x-3' : ''}`}></div>
                                    </div>
                                    <input type="checkbox" checked={showSymbols} onChange={(e) => setShowSymbols(e.target.checked)} className="hidden" />
                                    <span className="text-xs font-bold text-slate-500">色号</span>
                                </label>

                                {/* Edit Mode Toggle */}
                                {pattern && (
                                    <button
                                        onClick={() => {
                                            const newMode = !isEditMode;
                                            setIsEditMode(newMode);
                                            if (newMode) setActiveTab('preview'); // Force preview tab when editing
                                        }}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${isEditMode ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        <span>{isEditMode ? '🎨 正在编辑' : '✏️ 修改豆豆'}</span>
                                    </button>
                                )}
                             </div>
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

                    <div 
                        ref={viewportRef} 
                        className="flex-1 relative overflow-auto bg-slate-100 print:overflow-visible print:bg-white print:h-auto"
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                    >
                        
                        {/* --- FLOATING EDIT TOOLBAR (DESKTOP ONLY) --- */}
                        {isEditMode && pattern && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white rounded-full shadow-lg border border-slate-200 p-1.5 gap-2 animate-float sticky mt-4 hidden lg:flex">
                                <button
                                    onClick={() => setActiveTool('paint')}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${activeTool === 'paint' ? 'border-indigo-500 scale-110' : 'border-transparent hover:bg-slate-100'}`}
                                    title="画笔"
                                >
                                    <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: selectedBrushColor.hex }}></div>
                                </button>
                                <button
                                    onClick={() => setActiveTool('eraser')}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${activeTool === 'eraser' ? 'bg-red-100 text-red-600 shadow-inner' : 'hover:bg-slate-100 text-slate-400'}`}
                                    title="橡皮擦"
                                >
                                    🧼
                                </button>
                                <div className="w-[1px] bg-slate-200 my-1"></div>
                                <button
                                    onClick={() => setShowColorPicker(true)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-indigo-600 font-bold text-lg"
                                    title="添加颜色"
                                >
                                    +
                                </button>
                            </div>
                        )}

                        <div className="min-w-max min-h-max p-10 print:p-0 print:block">
                            {pattern ? (
                                <div className={`bg-white shadow-2xl inline-block p-4 rounded-sm ${isEditMode ? 'cursor-pointer' : ''}`}>
                                    {/* Ruler Top - STICKY (Hide if grid is off) */}
                                    {showGrid && (
                                        <div className="flex sticky top-0 z-20 bg-white shadow-sm" style={{ marginLeft: `${cellSize}px` }}>
                                            {Array.from({ length: pattern.width }).map((_, i) => {
                                                const num = i + 1;
                                                const isMajor = num % 5 === 0;
                                                return (
                                                    <div 
                                                        key={`col-${i}`} 
                                                        style={{ width: `${cellSize}px` }} 
                                                        className={`text-center pb-1 border-b border-slate-100 ${isMajor ? 'text-black font-black text-lg' : 'text-slate-300 text-[8px]'}`}
                                                    >
                                                        {isMajor ? (num / 5) : ''}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div className="flex">
                                        {/* Ruler Left - STICKY (Hide if grid is off) */}
                                        {showGrid && (
                                            <div className="flex flex-col sticky left-0 z-20 bg-white shadow-sm" style={{ marginRight: '4px' }}>
                                                {Array.from({ length: pattern.height }).map((_, i) => {
                                                    const num = i + 1;
                                                    const isMajor = num % 5 === 0;
                                                    return (
                                                        <div 
                                                            key={`row-${i}`} 
                                                            style={{ height: `${cellSize}px` }} 
                                                            className={`flex items-center justify-end pr-2 border-r border-slate-100 ${isMajor ? 'text-black font-black text-lg' : 'text-slate-300 text-[8px]'}`}
                                                        >
                                                            {isMajor ? (num / 5) : ''}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Grid */}
                                        <div 
                                            className={`select-none ${showGrid ? 'border-t border-l border-slate-300' : ''}`}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: `repeat(${pattern.width}, ${cellSize}px)`,
                                                width: `${pattern.width * cellSize}px`,
                                            }}
                                            onMouseLeave={() => { /* Potential drag end logic */ }}
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
                                                const isRightThick = showGrid && (p.x + 1) % 5 === 0;
                                                const isBottomThick = showGrid && (p.y + 1) % 5 === 0;

                                                return (
                                                    <div 
                                                        key={i}
                                                        onClick={() => handlePixelClick(i)}
                                                        style={{ 
                                                            backgroundColor: p.color.hex,
                                                            aspectRatio: '1/1',
                                                        }}
                                                        className={`
                                                            flex items-center justify-center font-bold relative
                                                            ${showGrid ? 'border-r border-b' : ''} 
                                                            ${isEditMode ? (activeTool === 'eraser' ? 'hover:bg-red-50 hover:opacity-50' : 'hover:opacity-80') : ''}
                                                            ${showGrid && isRightThick ? 'border-r-slate-400 border-r-2' : (showGrid ? 'border-r-slate-200' : '')}
                                                            ${showGrid && isBottomThick ? 'border-b-slate-400 border-b-2' : (showGrid ? 'border-b-slate-200' : '')}
                                                        `}
                                                        title={isEditMode ? `点击修改 (${p.x+1},${p.y+1})` : ''}
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

                {/* --- BOTTOM: MATERIALS / PALETTE (PALETTE TAB) --- */}
                {/* Mobile: Show only if activeTab is 'palette'. Desktop: Always show (if pattern exists). */}
                {pattern && (
                    <div className={`h-48 bg-white rounded-2xl shadow-sm border border-slate-200 flex-col shrink-0 no-print lg:flex ${showPalette ? 'flex h-auto flex-1' : 'hidden'}`}>
                        <div className={`px-4 py-2 border-b border-slate-100 bg-slate-50 rounded-t-2xl flex justify-between items-center ${isEditMode ? 'bg-indigo-50' : ''}`}>
                             <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">
                                {isEditMode ? '🎨 调色板 (点击下方选择画笔)' : '材料清单'}
                             </h3>
                             <span className="text-xs font-bold text-slate-400">{pattern.pixels.filter(p => p.color.hex !== 'transparent').length} 颗 • {Object.keys(pattern.counts).length} 色</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
                             <div className="flex flex-wrap gap-3">
                                {Object.entries(pattern.counts)
                                    .sort(([,a], [,b]) => (b as number) - (a as number))
                                    .map(([colorId, count]) => {
                                        const color = BEAD_COLORS.find(c => c.id === colorId);
                                        if (!color) return null;
                                        
                                        const r = parseInt(color.hex.slice(1,3), 16);
                                        const g = parseInt(color.hex.slice(3,5), 16);
                                        const b = parseInt(color.hex.slice(5,7), 16);
                                        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                                        const textCol = brightness > 140 ? '#000' : '#FFF';
                                        
                                        const isSelected = isEditMode && activeTool === 'paint' && selectedBrushColor.id === color.id;

                                        return (
                                            <div 
                                                key={colorId} 
                                                onClick={() => isEditMode && selectColor(color)}
                                                className={`
                                                    flex items-center gap-3 pr-4 pl-1 py-1 rounded-full border transition-all 
                                                    ${isEditMode ? 'cursor-pointer' : ''}
                                                    ${isSelected ? 'bg-indigo-600 border-indigo-600 shadow-md ring-2 ring-indigo-200 text-white' : 'bg-slate-50 border-slate-100 hover:border-slate-300'}
                                                `}
                                            >
                                                <div 
                                                    className="w-8 h-8 rounded-full border border-black/10 shadow-sm flex items-center justify-center text-[10px] font-bold shrink-0"
                                                    style={{ backgroundColor: color.hex, color: textCol }}
                                                >
                                                    {color.symbol}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-700'}`}>{color.id}</span>
                                                    <span className={`text-[10px] font-bold ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>x{count}</span>
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

            {/* --- MOBILE TAB BAR (STANDARD) --- */}
            {/* HIDE when in Edit Mode */}
            <div className={`fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 justify-around items-center h-16 lg:hidden z-40 shadow-lg safe-area-bottom ${isEditMode ? 'hidden' : 'flex'}`}>
                 <button 
                    onClick={() => setActiveTab('settings')}
                    className={`flex flex-col items-center justify-center w-full h-full gap-1 ${activeTab === 'settings' ? 'text-indigo-600' : 'text-slate-400'}`}
                 >
                    <span className="text-xl">🎛️</span>
                    <span className="text-[10px] font-bold">设置</span>
                 </button>
                 <button 
                    onClick={() => setActiveTab('preview')}
                    className={`flex flex-col items-center justify-center w-full h-full gap-1 ${activeTab === 'preview' ? 'text-indigo-600' : 'text-slate-400'}`}
                 >
                    <span className="text-xl">🧩</span>
                    <span className="text-[10px] font-bold">预览</span>
                 </button>
                 <button 
                    onClick={() => setActiveTab('palette')}
                    className={`flex flex-col items-center justify-center w-full h-full gap-1 ${activeTab === 'palette' ? 'text-indigo-600' : 'text-slate-400'}`}
                 >
                    <span className="text-xl">🎨</span>
                    <span className="text-[10px] font-bold">清单</span>
                 </button>
            </div>

            {/* --- MOBILE EDIT TOOLBAR & BOTTOM SHEET --- */}
            {isEditMode && pattern && (
                <>
                    {/* Fixed Edit Toolbar */}
                    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-between items-center h-16 px-4 lg:hidden z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] safe-area-bottom">
                         <div className="flex gap-4 items-center">
                             {/* Eraser */}
                             <button
                                onClick={() => setActiveTool('eraser')}
                                className={`flex flex-col items-center justify-center px-2 ${activeTool === 'eraser' ? 'text-red-500' : 'text-slate-400'}`}
                             >
                                <span className="text-xl">🧼</span>
                                <span className="text-[10px] font-bold">橡皮</span>
                             </button>

                             <div className="w-[1px] h-8 bg-slate-200"></div>

                             {/* Current Color / Open Palette */}
                             <button
                                onClick={() => setShowMobilePalette(true)}
                                className="flex items-center gap-3 bg-slate-100 rounded-full pl-1 pr-4 py-1 border border-slate-200"
                             >
                                <div 
                                    className="w-8 h-8 rounded-full border border-black/10 shadow-sm"
                                    style={{ backgroundColor: selectedBrushColor.hex }}
                                ></div>
                                <div className="flex flex-col items-start">
                                    <span className="text-[10px] font-bold text-slate-400">当前颜色</span>
                                    <span className="text-xs font-black text-slate-700">{selectedBrushColor.id} ▾</span>
                                </div>
                             </button>
                             
                             <button 
                                onClick={() => setShowColorPicker(true)}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 border border-slate-200 bg-white"
                             >
                                +
                             </button>
                         </div>

                         <button 
                            onClick={() => setIsEditMode(false)}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold"
                         >
                            完成
                         </button>
                    </div>

                    {/* Bottom Sheet Palette */}
                    <div 
                        className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 transition-transform duration-300 ease-out shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] flex flex-col max-h-[60vh] lg:hidden ${showMobilePalette ? 'translate-y-0' : 'translate-y-full'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                            <h3 className="font-black text-slate-700">选择颜色</h3>
                            <button onClick={() => setShowMobilePalette(false)} className="text-slate-400 p-2 text-xl">&times;</button>
                        </div>
                        
                        <div className="overflow-y-auto p-4 pb-8">
                             <div className="flex flex-wrap gap-3 justify-center">
                                {Object.entries(pattern.counts)
                                    .sort(([,a], [,b]) => (b as number) - (a as number))
                                    .map(([colorId, count]) => {
                                        const color = BEAD_COLORS.find(c => c.id === colorId);
                                        if (!color) return null;
                                        
                                        const r = parseInt(color.hex.slice(1,3), 16);
                                        const g = parseInt(color.hex.slice(3,5), 16);
                                        const b = parseInt(color.hex.slice(5,7), 16);
                                        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                                        const textCol = brightness > 140 ? '#000' : '#FFF';
                                        
                                        const isSelected = selectedBrushColor.id === color.id;

                                        return (
                                            <div 
                                                key={colorId} 
                                                onClick={() => selectColor(color)}
                                                className={`
                                                    flex items-center gap-2 pr-3 pl-1 py-1 rounded-full border transition-all cursor-pointer
                                                    ${isSelected ? 'bg-indigo-600 border-indigo-600 ring-2 ring-indigo-200 text-white' : 'bg-slate-50 border-slate-100'}
                                                `}
                                            >
                                                <div 
                                                    className="w-8 h-8 rounded-full border border-black/10 shadow-sm flex items-center justify-center text-[10px] font-bold shrink-0"
                                                    style={{ backgroundColor: color.hex, color: textCol }}
                                                >
                                                    {color.symbol}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-700'}`}>{color.id}</span>
                                                    <span className={`text-[10px] font-bold ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>x{count}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                }
                                {/* Add New Color Button in Sheet */}
                                <button 
                                    onClick={() => { setShowMobilePalette(false); setShowColorPicker(true); }}
                                    className="flex items-center gap-2 px-4 py-1 rounded-full border border-dashed border-slate-300 text-slate-400 font-bold text-xs hover:bg-slate-50"
                                >
                                    + 添加新色
                                </button>
                             </div>
                        </div>
                    </div>
                    {/* Backdrop for sheet */}
                    {showMobilePalette && (
                        <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={() => setShowMobilePalette(false)}></div>
                    )}
                </>
            )}

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

            {/* --- COLOR PICKER MODAL --- */}
            {showColorPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowColorPicker(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-black text-slate-800">选择颜色</h3>
                            <button onClick={() => setShowColorPicker(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
                        </div>
                        <div className="p-6 overflow-y-auto grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
                            {BEAD_COLORS.map(c => (
                                <button 
                                    key={c.id} 
                                    onClick={() => { selectColor(c); setShowColorPicker(false); }}
                                    className="flex flex-col items-center gap-1 group"
                                >
                                    <div 
                                        className="w-10 h-10 rounded-full border border-black/10 shadow-sm group-hover:scale-110 transition-transform"
                                        style={{ backgroundColor: c.hex }}
                                    ></div>
                                    <span className="text-[10px] font-bold text-slate-500 group-hover:text-indigo-600">{c.id}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};