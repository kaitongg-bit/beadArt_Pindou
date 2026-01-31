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
    X = (X > 0.008856) ? Math.pow(X, 1 / 3) : (7.787 * X) + 16 / 116;
    Y = (Y > 0.008856) ? Math.pow(Y, 1 / 3) : (7.787 * Y) + 16 / 116;
    Z = (Z > 0.008856) ? Math.pow(Z, 1 / 3) : (7.787 * Z) + 16 / 116;

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
    const [imageDimensions, setImageDimensions] = useState<{ width: number, height: number } | null>(null);
    const [pattern, setPattern] = useState<BeadPattern | null>(null);

    // --- WORKFLOW STATES ---
    const [projectName, setProjectName] = useState('MyPattern');

    // Image Adjustments
    const [imgBrightness, setImgBrightness] = useState(100);
    const [imgSaturation, setImgSaturation] = useState(100);
    const [imgContrast, setImgContrast] = useState(100);

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
    const [showSymbols, setShowSymbols] = useState(false);
    const [showGrid, setShowGrid] = useState(false);
    const [keepWhite, setKeepWhite] = useState(false);
    const [showMobileTools, setShowMobileTools] = useState(false); // New state for expanding mobile toolbar

    // Touch Gesture State
    const [touchStartDist, setTouchStartDist] = useState<number>(0);
    const [startZoom, setStartZoom] = useState<number>(1);

    const [showNewCanvasModal, setShowNewCanvasModal] = useState(false);
    const [newCanvasBoards, setNewCanvasBoards] = useState({ w: 1, h: 1 });
    // Generic Confirm Modal State
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        confirmText?: string;
        cancelText?: string;
        isDanger?: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
    });

    // --- EDIT MODE STATES ---
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedBrushColor, setSelectedBrushColor] = useState<BeadColor>(BEAD_COLORS[6]); // Default some color
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [activeTool, setActiveTool] = useState<'paint' | 'eraser' | 'eyedropper' | 'pan'>('paint');
    const [isSymmetric, setIsSymmetric] = useState(false);
    const [brushSize, setBrushSize] = useState<1 | 2>(1); // 1 = 1x1, 2 = 2x2 (or 4x4 for eraser)
    const [isDrawingMouse, setIsDrawingMouse] = useState(false);

    // Check for unload (refresh/close warning)
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (pattern) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [pattern]);

    // --- REFERENCE IMAGE STATE ---
    const [refImage, setRefImage] = useState<string | null>(null);
    const [showRefImage, setShowRefImage] = useState(false);

    // --- HISTORY STATE ---
    const [history, setHistory] = useState<BeadPattern[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // --- REFINE MODAL STATES ---
    const [showRefineModal, setShowRefineModal] = useState(false);
    const [refinePrompt, setRefinePrompt] = useState('');
    const [isRefining, setIsRefining] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);

    const BASE_CELL_SIZE = 25;

    // Reset flow when new image uploaded
    // Reset flow when new image uploaded
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const processFile = () => {
            setStatusMsg('正在读取...');
            setPattern(null);
            setIsEditMode(false);
            setActiveTab('settings');

            // Reset adjustments & History
            setImgBrightness(100);
            setImgSaturation(100);
            setImgContrast(100);
            setHistory([]);
            setHistoryIndex(-1);

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

        // Warn if replacing existing work
        if (pattern && isEditMode) {
            setConfirmModal({
                isOpen: true,
                title: "覆盖画布警告",
                message: "上传新图片将覆盖当前画布，确定要继续吗？\n(如果只是想看参考图，请使用右下角的‘参考图’功能)",
                isDanger: true,
                confirmText: "确定覆盖",
                onConfirm: () => processFile()
            });
            e.target.value = ''; // Reset input
            return;
        }

        processFile();
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

    // --- UNDO / REDO HELPERS ---

    // Save state to history
    const addToHistory = (newPattern: BeadPattern) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newPattern);
        // Limit history size to 20
        if (newHistory.length > 20) newHistory.shift();
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setPattern(newPattern);
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const prevIndex = historyIndex - 1;
            setHistoryIndex(prevIndex);
            setPattern(history[prevIndex]);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const nextIndex = historyIndex + 1;
            setHistoryIndex(nextIndex);
            setPattern(history[nextIndex]);
        }
    };

    // --- PIXEL EDITING LOGIC ---
    const handlePixelClick = (index: number) => {
        if (!pattern || !isEditMode) return;
        if (activeTool === 'pan') return;

        // Eyedropper Logic
        if (activeTool === 'eyedropper') {
            const pixel = pattern.pixels[index];
            if (pixel.color.hex !== 'transparent') {
                setSelectedBrushColor(pixel.color);
                setActiveTool('paint'); // Auto-switch back to paint
            }
            return;
        }

        const width = pattern.width;
        const targetX = index % width;
        const targetY = Math.floor(index / width);

        let newPixels = [...pattern.pixels];
        const newColor = activeTool === 'eraser'
            ? { id: '', name: '', hex: 'transparent', symbol: '' }
            : selectedBrushColor;

        // List of points to update (x, y)
        let pointsToUpdate = [{ x: targetX, y: targetY }];

        // 1. Brush Size (2x2)
        if (brushSize === 2) {
            pointsToUpdate.push({ x: targetX + 1, y: targetY });
            pointsToUpdate.push({ x: targetX, y: targetY + 1 });
            pointsToUpdate.push({ x: targetX + 1, y: targetY + 1 });
        }

        // 2. Large Eraser (4x4) - checking 'eraser' tool specifically if brushSize is 2 could be an option, 
        // but let's make a specific "ActiveTool" for large eraser or just use brushSize.
        // User asked for "Super Large Eraser". Let's say if Tool is Eraser AND BrushSize is 2, make it 4x4.
        if (activeTool === 'eraser' && brushSize === 2) {
            // Add more points for 4x4
            for (let dx = 0; dx < 4; dx++) {
                for (let dy = 0; dy < 4; dy++) {
                    if (dx === 0 && dy === 0) continue; // Already added
                    pointsToUpdate.push({ x: targetX + dx, y: targetY + dy });
                }
            }
        }

        // 2. Symmetry (Horizontal Mirror)
        if (isSymmetric) {
            const currentPoints = [...pointsToUpdate];
            currentPoints.forEach(p => {
                const symX = width - 1 - p.x;
                // Avoid duplicating center line if it overlaps (though logic handles it naturally)
                pointsToUpdate.push({ x: symX, y: p.y });
            });
        }

        // Filter out of bounds
        pointsToUpdate = pointsToUpdate.filter(p => p.x >= 0 && p.x < width && p.y >= 0 && p.y < pattern.height);

        let hasChange = false;

        pointsToUpdate.forEach(p => {
            const idx = p.y * width + p.x;
            if (newPixels[idx].color.hex !== newColor.hex) {
                newPixels[idx] = { ...newPixels[idx], color: newColor };
                hasChange = true;
            }
        });

        if (!hasChange) return;

        // Re-calculate counts
        const newCounts: Record<string, number> = {};
        newPixels.forEach(p => {
            if (p.color.hex !== 'transparent') {
                newCounts[p.color.id] = (newCounts[p.color.id] || 0) + 1;
            }
        });

        const newPatternState = {
            ...pattern,
            pixels: newPixels,
            counts: newCounts
        };

        addToHistory(newPatternState);
    };

    const selectColor = (color: BeadColor) => {
        setSelectedBrushColor(color);
        setActiveTool('paint');
        if (!isEditMode) setIsEditMode(true);
        setShowMobilePalette(false); // Close sheet on selection
    };

    // --- MOUSE HANDLERS (DESKTOP SLIDE PAINT) ---
    const handleMouseDown = (index: number) => {
        setIsDrawingMouse(true);
        handlePixelClick(index);
    };

    const handleMouseEnter = (index: number, e: React.MouseEvent) => {
        // Only paint if we are in drawing state AND the primary button (1) is held down
        if (isDrawingMouse) {
            if (e.buttons === 1) {
                handlePixelClick(index);
            } else {
                // Safety: If no button is pressed but state is true, reset it.
                setIsDrawingMouse(false);
            }
        }
    };
    const handleMouseUp = () => {
        setIsDrawingMouse(false);
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
        } else if (e.touches.length === 1 && isEditMode && activeTab === 'preview' && activeTool !== 'pan') {
            // Slide Painting Logic
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            if (target) {
                const cell = target.closest('[data-pixel-index]') as HTMLElement;
                if (cell) {
                    const index = parseInt(cell.dataset.pixelIndex || '-1');
                    if (index !== -1) {
                        handlePixelClick(index);
                    }
                }
            }
        }
    };

    // --- NEW CANVAS LOGIC ---
    const handleCreateBlankCanvas = () => {
        const pixelW = newCanvasBoards.w * 52; // Assuming 52 is board size
        const pixelH = newCanvasBoards.h * 52;

        // Generate empty pixels
        // ... grid logic ... need to recreate or assume it's simple enough
        const totalPixels = pixelW * pixelH;
        // Optimization: Create array directly
        const pixels: BeadPixel[] = [];
        for (let y = 0; y < pixelH; y++) {
            for (let x = 0; x < pixelW; x++) {
                pixels.push({
                    x, y,
                    color: { id: '', name: '', hex: 'transparent', symbol: '' }
                });
            }
        }

        const emptyCounts = {};

        const doCreate = () => {
            setPattern({
                width: pixelW,
                height: pixelH,
                pixels: pixels, // use the prefetched ones
                counts: emptyCounts
            });

            // Init History
            setHistory([{
                width: pixelW,
                height: pixelH,
                pixels: JSON.parse(JSON.stringify(pixels)),
                counts: emptyCounts
            }]);
            setHistoryIndex(0);

            // Setup Editor
            setProjectName('MyDesign');
            setOriginalImage(null); // Clear image if any
            setIsEditMode(true);
            setActiveTab('preview');
            setStatusMsg('');
            setShowNewCanvasModal(false); // Close size modal

            // Auto fit
            setTimeout(handleAutoFit, 100);
        };

        // Confirm override if pattern exists
        if (pattern) {
            setConfirmModal({
                isOpen: true,
                title: "覆盖画布警告",
                message: "这将创建一个新的空白画布，当前未保存的内容将丢失。",
                isDanger: true,
                confirmText: "确定新建",
                onConfirm: () => doCreate()
            });
            return;
        }

        doCreate();
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
            ctx.filter = `brightness(${imgBrightness}%) saturate(${imgSaturation}%) contrast(${imgContrast}%)`;

            // Draw image exactly filling the calculated dimensions
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, width, height);

            // Reset filter
            ctx.filter = 'none';

            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;

            // --- STEP 1: SMART CONTRAST SNAP ---
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];

                if (a < 50) continue; // Skip transparency

                const isNeutral = Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && Math.abs(r - b) < 30;

                if (isNeutral && r < 120) {
                    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
                }
                else if (isNeutral && r > 240) {
                    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
                }
            }

            // --- STEP 2: FLOOD FILL BACKGROUND DETECTION ---
            // Adapted for rectangular grids
            const visited = new Int8Array(width * height);
            const queue: number[] = [];
            const getIdx = (x: number, y: number) => y * width + x;

            const matchBgColor = (idx: number) => {
                const i = idx * 4;
                if (data[i + 3] < 50) return false;
                if (keepWhite) return false;
                return data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240;
            };

            const corners = [0, width - 1, width * (height - 1), width * height - 1];
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

            let rawPixels: { x: number, y: number, color: BeadColor }[] = [];

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
                                const dist = (dL * dL) + (da * da) + (db * db);
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

            const initialPattern = {
                width: trimmedWidth,
                height: trimmedHeight,
                pixels: gridPixels,
                counts: finalCounts
            };
            setPattern(initialPattern);
            // Initialize History
            setHistory([initialPattern]);
            setHistoryIndex(0);

            setIsPixelating(false);
            setStatusMsg('');
            // Set default tool color to the most prominent color
            const mostProminent = Object.entries(finalCounts).sort(([, a], [, b]) => b - a)[0];
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
                        const cx = startX + (x * PX_PER_CELL) + (PX_PER_CELL / 2);
                        const label = (num / 5).toString();
                        ctx.fillText(label, cx, PADDING + (RULER_SIZE / 2));
                        ctx.fillText(label, cx, startY + gridH + (RULER_SIZE / 2));
                    }
                }

                for (let y = 0; y < pattern.height; y++) {
                    const num = y + 1;
                    if (num % 5 === 0) {
                        const cy = startY + (y * PX_PER_CELL) + (PX_PER_CELL / 2);
                        const label = (num / 5).toString();
                        ctx.fillText(label, PADDING + (RULER_SIZE / 2), cy);
                        ctx.fillText(label, startX + gridW + (RULER_SIZE / 2), cy);
                    }
                }

                pattern.pixels.forEach(p => {
                    const px = startX + (p.x * PX_PER_CELL);
                    const py = startY + (p.y * PX_PER_CELL);

                    if (p.color.hex !== 'transparent') {
                        ctx.fillStyle = p.color.hex;
                        ctx.fillRect(px, py, PX_PER_CELL, PX_PER_CELL);

                        const r = parseInt(p.color.hex.slice(1, 3), 16);
                        const g = parseInt(p.color.hex.slice(3, 5), 16);
                        const b = parseInt(p.color.hex.slice(5, 7), 16);
                        const brightness = (r * 299 + g * 587 + b * 114) / 1000;

                        ctx.fillStyle = brightness > 140 ? '#000000' : '#FFFFFF';
                        ctx.font = `bold ${PX_PER_CELL * 0.35}px sans-serif`;
                        ctx.fillText(p.color.symbol, px + PX_PER_CELL / 2, py + PX_PER_CELL / 2);
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

                    const r = parseInt(color.hex.slice(1, 3), 16);
                    const g = parseInt(color.hex.slice(3, 5), 16);
                    const b = parseInt(color.hex.slice(5, 7), 16);
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
                    <h2 className="text-lg font-black text-slate-800 mb-4 flex justify-between items-center">
                        <span>1. 开始设计</span>
                    </h2>

                    <div className="flex flex-col gap-3">
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="cursor-pointer border-4 border-dashed border-indigo-100 rounded-xl aspect-[4/3] flex flex-col items-center justify-center hover:bg-indigo-50 transition-colors relative overflow-hidden group"
                        >
                            {originalImage ? (
                                <img
                                    src={originalImage}
                                    className="w-full h-full object-contain bg-slate-50 p-2 transition-all duration-300"
                                    alt="Original"
                                    style={{ filter: `brightness(${imgBrightness}%) saturate(${imgSaturation}%) contrast(${imgContrast}%)` }}
                                />
                            ) : (
                                <div className="text-center p-4">
                                    <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">📸</div>
                                    <span className="font-bold text-slate-400">上传照片</span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-4 text-slate-300 font-bold text-xs justify-center uppercase tracking-widest my-1">
                            <div className="h-[1px] bg-slate-200 flex-1"></div>
                            OR
                            <div className="h-[1px] bg-slate-200 flex-1"></div>
                        </div>

                        <button
                            onClick={() => setShowNewCanvasModal(true)}
                            className="w-full py-4 bg-white border-2 border-slate-200 hover:border-indigo-500 hover:text-indigo-600 text-slate-500 font-bold rounded-xl transition-all flex items-center justify-center gap-2 group"
                        >
                            <span className="text-2xl group-hover:scale-110 transition-transform">🎨</span>
                            <span>新建空白画布</span>
                        </button>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>

                {/* 2. STYLE & PROCESS */}
                {originalImage && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-fade-in">
                        <h2 className="text-lg font-black text-slate-800 mb-4">2. 调整与生成</h2>

                        <div className="space-y-4">

                            {/* Pro Tip: Mobile Pre-processing */}
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex gap-3 text-xs text-blue-800 leading-relaxed mb-4">
                                <span className="text-lg">💡</span>
                                <div>
                                    <span className="font-bold">小贴士：</span> 这里的调整功能比较基础。如果想要更好的色彩效果，建议您<b>先在手机相册里</b>把图片的对比度、饱和度调高一些，再上传到这里转换，效果会像魔法一样好哦！✨
                                </div>
                            </div>

                            {/* NEW: Image Adjustments */}
                            <div className="bg-slate-50 p-4 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-500">图片预处理</label>
                                    <button
                                        onClick={() => { setImgBrightness(100); setImgSaturation(100); setImgContrast(100); }}
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

                                {/* Contrast */}
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-slate-400 w-8">对比</span>
                                    <input
                                        type="range" min="50" max="150" step="5"
                                        value={imgContrast}
                                        onChange={(e) => setImgContrast(Number(e.target.value))}
                                        className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    />
                                    <span className="text-xs font-mono text-slate-500 w-8 text-right">{imgContrast}%</span>
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
                            {/* --- STANDARD VIEW CONTROLS (Always Visible) --- */}
                            <div className="flex items-center gap-4">
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

                                    {/* Edit Mode Toggle (Desktop only mainly, but keep accessible) */}
                                    {pattern && (
                                        <button
                                            onClick={() => {
                                                const newMode = !isEditMode;
                                                setIsEditMode(newMode);
                                                if (newMode) setActiveTab('preview');
                                                if (!newMode) {
                                                    setActiveTool('paint');
                                                    setShowColorPicker(false);
                                                }
                                            }}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${isEditMode ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            <span>{isEditMode ? '🎨 正在编辑' : '✏️ 修改豆豆'}</span>
                                        </button>
                                    )}
                                </div>
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


                    {/* --- SECONDARY EDIT TOOLBAR (DESKTOP ONLY) --- */}
                    {isEditMode && pattern && (
                        <div className="hidden lg:flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white z-20 shadow-sm gap-4 overflow-x-auto no-scrollbar">
                            {/* Left Group: History & Tools */}
                            <div className="flex items-center gap-4 shrink-0">
                                {/* Undo/Redo */}
                                <div className="flex bg-slate-100 rounded-lg p-0.5">
                                    <button onClick={handleUndo} disabled={historyIndex <= 0} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm disabled:opacity-30 transition-all text-slate-600">↩</button>
                                    <div className="w-[1px] bg-slate-300 my-1"></div>
                                    <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm disabled:opacity-30 transition-all text-slate-600">↪</button>
                                </div>

                                <div className="w-[1px] h-6 bg-slate-200"></div>

                                {/* Tools */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setActiveTool('pan')}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${activeTool === 'pan' ? 'bg-slate-100 border-slate-300 text-slate-800 shadow-inner' : 'bg-white border-transparent hover:bg-slate-50 text-slate-500'}`}
                                        title="浏览模式 (防止误触)"
                                    >
                                        <span className="text-sm">✋</span>
                                        <span className="text-sm font-bold">浏览</span>
                                    </button>

                                    <button
                                        onClick={() => {
                                            if (activeTool === 'paint') setShowColorPicker(true);
                                            else setActiveTool('paint');
                                        }}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 transition-all ${activeTool === 'paint' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-600'}`}
                                        title="画笔 (点击切换颜色)"
                                    >
                                        <div className="w-4 h-4 rounded-full shadow-sm ring-1 ring-black/10" style={{ backgroundColor: selectedBrushColor.hex }}></div>
                                        <span className="text-sm font-bold">画笔</span>
                                    </button>

                                    <button
                                        onClick={() => setActiveTool('eyedropper')}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${activeTool === 'eyedropper' ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-transparent hover:bg-slate-50 text-slate-500'}`}
                                        title="吸管 (吸取颜色)"
                                    >
                                        <span className="text-sm">💉</span>
                                        <span className="text-sm font-bold">吸管</span>
                                    </button>

                                    <button
                                        onClick={() => setActiveTool('eraser')}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${activeTool === 'eraser' ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-white border-transparent hover:bg-slate-50 text-slate-500'}`}
                                    >
                                        <span className="text-sm">🧼</span>
                                        <span className="text-sm font-bold">橡皮</span>
                                    </button>
                                </div>
                            </div>

                            {/* Middle Group: Settings & Reference */}
                            <div className="flex items-center gap-4 shrink-0">
                                <div className="w-[1px] h-6 bg-slate-200"></div>

                                {/* Brush Size */}
                                <button
                                    onClick={() => setBrushSize(prev => prev === 1 ? 2 : 1)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${brushSize === 2 ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                >
                                    {brushSize === 1 ? '• 细笔刷' : '● 粗笔刷'}
                                </button>

                                {/* Symmetry */}
                                <button
                                    onClick={() => setIsSymmetric(!isSymmetric)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isSymmetric ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                >
                                    {isSymmetric ? '⇋ 对称: 开' : '⇋ 对称: 关'}
                                </button>

                                {/* Reference Image Toggle */}
                                <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1 border border-slate-100">
                                    <button
                                        onClick={() => refImage && setShowRefImage(!showRefImage)}
                                        disabled={!refImage}
                                        className={`px-2 py-1 rounded text-xs font-bold transition-all ${!refImage ? 'opacity-50 cursor-not-allowed' : (showRefImage ? 'bg-green-100 text-green-700' : 'hover:bg-slate-200 text-slate-600')}`}
                                    >
                                        {refImage ? (showRefImage ? '👁️ 原图' : 'To 隐藏') : '无原图'}
                                    </button>
                                    <label className="cursor-pointer px-2 py-1 hover:bg-slate-200 rounded text-xs font-bold text-indigo-600 transition-colors" title="更改参考图">
                                        📂
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onload = (ev) => {
                                                        setRefImage(ev.target?.result as string);
                                                        setShowRefImage(true);
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Right Group: Actions */}
                            <div className="flex items-center gap-4 shrink-0">
                                <div className="w-[1px] h-6 bg-slate-200"></div>

                                <button
                                    onClick={() => setConfirmModal({
                                        isOpen: true,
                                        title: "清空画布确认",
                                        message: "确定要清空画布吗？",
                                        isDanger: true,
                                        confirmText: "清空",
                                        onConfirm: () => {
                                            if (pattern) {
                                                const newPixels = pattern.pixels.map(p => ({ ...p, color: { id: '', name: '', hex: 'transparent', symbol: '' } }));
                                                const newCounts = {};
                                                const emptyP = { ...pattern, pixels: newPixels, counts: newCounts };
                                                setPattern(emptyP);
                                                setHistory([...history.slice(0, historyIndex + 1), emptyP]);
                                                setHistoryIndex(historyIndex + 1);
                                            }
                                        }
                                    })}
                                    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all font-bold text-xs flex items-center gap-1"
                                >
                                    <span>🗑️</span>
                                    <span>清空</span>
                                </button>
                            </div>
                        </div>
                    )}

                    <div
                        ref={viewportRef}
                        className="flex-1 relative overflow-auto bg-slate-100 print:overflow-visible print:bg-white print:h-auto"
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                    >












                        <div className="min-w-max min-h-max p-10 print:p-0 print:block">
                            {pattern ? (
                                <div className={`bg-white shadow-2xl inline-block p-4 rounded-sm ${isEditMode ? 'cursor-pointer' : ''}`}>
                                    {/* Ruler Top - STICKY (Hide if grid is off) */}
                                    {showGrid && (
                                        <div className="flex sticky top-0 z-20 bg-white shadow-sm" style={{ marginLeft: `${cellSize}px` }}>
                                            {Array.from({ length: pattern.width }).map((_, i) => {
                                                const num = i + 1;
                                                // Ruler Labels:
                                                // Pattern repeats every BOARD_SIZE (52)
                                                // Inside a board: 1, 6, 11... show 1, 2, 3...
                                                // But note: 51 (last cell of board) is NOT a start, it's just end.

                                                const BOARD_SIZE = 52;
                                                const localNum = (i % BOARD_SIZE) + 1; // 1...52

                                                // Major lines in local coordinates: 1, 6, 11...
                                                const isMajor = localNum === 1 || (localNum - 1) % 5 === 0;

                                                // Calculate which number to show: 1->1, 6->2... 46->10
                                                const lineNum = Math.floor((localNum - 1) / 5) + 1;

                                                // 1. Hide if zoomed out too much
                                                if (cellSize < 14) {
                                                    return <div key={`col-${i}`} style={{ width: `${cellSize}px` }} className="border-b border-slate-100"></div>;
                                                }

                                                // 2. Limit to 1-10
                                                if (lineNum > 10) {
                                                    return <div key={`col-${i}`} style={{ width: `${cellSize}px` }} className="border-b border-slate-100"></div>;
                                                }

                                                // Shift visualization: User says it looks "one cell to the right".
                                                // The current cell 'i' is where we render.
                                                // If we want the number '1' to clear appear over the 'end' of the first block (index 0), 
                                                // We are rendering it in cell index 0.
                                                // Visual feedback shows it over index 1 (2nd cell). 
                                                // Let's force alignment center relative to the RIGHT border of THIS cell.

                                                return (
                                                    <div
                                                        key={`col-${i}`}
                                                        style={{ width: `${cellSize}px`, fontSize: `${Math.max(10, cellSize * 0.4)}px` }}
                                                        className={`relative border-b border-slate-100`}
                                                    >
                                                        {isMajor && (
                                                            // -right-1.5 means shift RIGHT. If it is too right, we need to shift LEFT.
                                                            // Try centering on the right edge. right-0 translate-x-1/2 centers on the border line.
                                                            // If user feels it is "too right", maybe they want it centered on the CELL, not the border?
                                                            // No, "aligned with the axis line".
                                                            // If currently it looks "one cell right", maybe we are rendering in the WRONG cell?
                                                            // Index 0 (1st cell) has the thick border on its right.
                                                            // So we render Number 1 in Cell 0. 
                                                            // If it appears over Cell 1, it means our absolute positioning is pushing it too far.

                                                            // Let's try right-0 (align to right edge) and translate-x-1/2 (center on that edge).
                                                            <span className="absolute right-0 bottom-0.5 text-indigo-600 font-black translate-x-1/2 z-10">
                                                                {lineNum}
                                                            </span>
                                                        )}
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
                                                    const BOARD_SIZE = 52;
                                                    const localNum = (i % BOARD_SIZE) + 1;

                                                    const isMajor = localNum === 1 || (localNum - 1) % 5 === 0;
                                                    const lineNum = Math.floor((localNum - 1) / 5) + 1;

                                                    if (cellSize < 14) {
                                                        return <div key={`row-${i}`} style={{ height: `${cellSize}px` }} className="border-r border-slate-100"></div>;
                                                    }

                                                    if (lineNum > 10) {
                                                        return <div key={`row-${i}`} style={{ height: `${cellSize}px` }} className="border-r border-slate-100"></div>;
                                                    }

                                                    return (
                                                        <div
                                                            key={`row-${i}`}
                                                            style={{ height: `${cellSize}px`, fontSize: `${Math.max(10, cellSize * 0.4)}px` }}
                                                            className={`relative border-r border-slate-100`}
                                                        >
                                                            {isMajor && (
                                                                <span className="absolute -bottom-2 right-1 text-indigo-600 font-black translate-y-1/2 z-10 flex items-center justify-end">
                                                                    {lineNum}
                                                                </span>
                                                            )}
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
                                                    const r = parseInt(p.color.hex.slice(1, 3), 16);
                                                    const g = parseInt(p.color.hex.slice(3, 5), 16);
                                                    const b = parseInt(p.color.hex.slice(5, 7), 16);
                                                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                                                    textColor = brightness > 140 ? '#000000' : '#FFFFFF';
                                                }

                                                // Thick border logic: 
                                                // Pattern repeats every BOARD (52 pixels).
                                                // Inside a board:
                                                // - Index 0: Thick Right (1st cell)
                                                // - Index 5, 10, ... 45, 50: Thick Right (Every 5 cells)
                                                // - Index 51: End of board (Implicitly thick if next one starts, or end of grid)

                                                const BOARD_SIZE = 52;
                                                const localX = p.x % BOARD_SIZE;
                                                const localY = p.y % BOARD_SIZE;

                                                // Right border is thick if: 
                                                // 1. It's the 1st cell (localX === 0)
                                                // 2. It's a multiple of 5 (localX % 5 === 0) BUT NOT the very last cell (51). 
                                                //    Actually, 50 is a multiple of 5. 51 is not.
                                                //    So (localX % 5 === 0) covers 0, 5, 10... 50.
                                                //    Wait, 0 is covered. 5, 10... 50 are covered.
                                                //    Does localX=51 need a thick border? It's the end of the board, so YES, usually board edges are thick.
                                                //    The standard grid border will handle the very edge if it's the last pixel. 
                                                //    If there is another board to the right, we want a thick separator.

                                                const isBoardRightEdge = localX === BOARD_SIZE - 1; // 51
                                                const isBoardBottomEdge = localY === BOARD_SIZE - 1; // 51

                                                const isRightThick = showGrid && (
                                                    (localX === 0) ||
                                                    (localX % 5 === 0 && localX !== 0) || // 5, 10... 50
                                                    isBoardRightEdge // 51 (End of board)
                                                );

                                                const isBottomThick = showGrid && (
                                                    (localY === 0) ||
                                                    (localY % 5 === 0 && localY !== 0) ||
                                                    isBoardBottomEdge
                                                );


                                                // Edges always need borders (handled by base border-r/b, but let's ensure style consistency)

                                                return (
                                                    <div
                                                        key={i}
                                                        data-pixel-index={i}
                                                        onMouseDown={() => handleMouseDown(i)}
                                                        onMouseEnter={(e) => handleMouseEnter(i, e)}
                                                        onMouseUp={handleMouseUp}
                                                        style={{
                                                            backgroundColor: p.color.hex,
                                                            aspectRatio: '1/1',
                                                        }}
                                                        className={`
                                                            flex items-center justify-center font-bold relative
                                                            ${showGrid ? 'border-r border-b border-l border-t' : ''} 
                                                            ${isEditMode ? (activeTool === 'eraser' ? 'hover:bg-red-50 hover:opacity-50' : 'hover:opacity-80') : ''}
                                                            
                                                            ${/* Base Thin Borders */ ''}
                                                            ${showGrid ? 'border-slate-200' : 'border-transparent'}

                                                            ${/* Thick Right Borders */ ''}
                                                            ${showGrid && isRightThick ? '!border-r-slate-500 !border-r-2' : ''}
                                                            
                                                            ${/* Thick Bottom Borders */ ''}
                                                            ${showGrid && isBottomThick ? '!border-b-slate-500 !border-b-2' : ''}
                                                        `}
                                                        title={isEditMode ? `点击修改 (${p.x + 1},${p.y + 1})` : ''}
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

                {/* Reference Image Overlay */}
                {
                    showRefImage && refImage && (
                        <div className="absolute top-20 right-4 w-48 h-auto z-50 bg-white p-2 rounded-lg shadow-xl border border-slate-200 opacity-90 hover:opacity-100 transition-opacity">
                            <div className="relative">
                                <img src={refImage} alt="Ref" className="w-full h-auto rounded" />
                                <button
                                    className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-md border-2 border-white hover:bg-slate-700"
                                    onClick={() => setShowRefImage(false)}
                                    title="Hide Reference"
                                >✕</button>
                            </div>
                            <div className="text-[10px] text-center text-slate-400 mt-1 font-bold">参考图</div>
                        </div>
                    )
                }


                {/* Mobile: Show only if activeTab is 'palette'. Desktop: Always show (if pattern exists). */}
                {
                    pattern && (
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
                                        .sort(([, a], [, b]) => (b as number) - (a as number))
                                        .map(([colorId, count]) => {
                                            const color = BEAD_COLORS.find(c => c.id === colorId);
                                            if (!color) return null;

                                            const r = parseInt(color.hex.slice(1, 3), 16);
                                            const g = parseInt(color.hex.slice(3, 5), 16);
                                            const b = parseInt(color.hex.slice(5, 7), 16);
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
                    )
                }
            </div >

            {/* --- MOBILE EDIT DOCK (Fixed Bottom) --- */}
            {
                isEditMode && pattern && (
                    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 lg:hidden safe-area-bottom flex flex-col shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                        {/* EXPANDABLE TOOLS PANEL */}
                        {showMobileTools && (
                            <div className="p-3 border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm animate-in slide-in-from-bottom duration-200">
                                <div className="flex gap-3 justify-center">
                                    <button
                                        onClick={() => setBrushSize(prev => prev === 1 ? 2 : 1)}
                                        className={`flex-1 py-3 rounded-xl text-xs font-bold border shadow-sm transition-all active:scale-95 ${brushSize === 2 ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-200' : 'bg-white border-slate-200 text-slate-600'}`}
                                    >
                                        笔刷大小: {brushSize === 1 ? '1x' : '4x'}
                                    </button>

                                    <button
                                        onClick={() => setIsSymmetric(!isSymmetric)}
                                        className={`flex-1 py-3 rounded-xl text-xs font-bold border shadow-sm transition-all active:scale-95 ${isSymmetric ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-200' : 'bg-white border-slate-200 text-slate-600'}`}
                                    >
                                        对称模式: {isSymmetric ? '开' : '关'}
                                    </button>

                                    <button
                                        onClick={handleRedo}
                                        disabled={historyIndex >= history.length - 1}
                                        className="w-12 py-2 rounded-xl bg-white border border-slate-200 disabled:opacity-50 text-slate-600 flex items-center justify-center shadow-sm active:scale-95 transition-transform"
                                    >
                                        ↪
                                    </button>

                                    <button
                                        onClick={() => setConfirmModal({
                                            isOpen: true,
                                            title: "清空画布确认",
                                            message: "确定要清空画布吗？",
                                            isDanger: true,
                                            confirmText: "清空",
                                            onConfirm: () => {
                                                if (pattern) {
                                                    const newPixels = pattern.pixels.map(p => ({ ...p, color: { id: '', name: '', hex: 'transparent', symbol: '' } }));
                                                    const newCounts = {};
                                                    const emptyP = { ...pattern, pixels: newPixels, counts: newCounts };
                                                    setPattern(emptyP);
                                                    setHistory([...history.slice(0, historyIndex + 1), emptyP]);
                                                    setHistoryIndex(historyIndex + 1);
                                                }
                                            }
                                        })}
                                        className="w-12 py-2 rounded-xl bg-red-50 border border-red-100 text-red-500 hover:bg-red-100 flex items-center justify-center shadow-sm active:scale-95 transition-transform"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* MAIN TOOLBAR ROW */}
                        <div className="flex items-center justify-between px-4 py-3 gap-3 bg-white">
                            {/* Essential Tools Group */}
                            <div className="flex items-center gap-4">
                                {/* Undo */}
                                <button
                                    onClick={handleUndo}
                                    disabled={historyIndex <= 0}
                                    className="w-11 h-11 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-600 disabled:opacity-40 active:scale-95 transition-transform"
                                >
                                    ↩
                                </button>

                                <div className="w-[1px] h-6 bg-slate-200"></div>

                                {/* Pan / Scroll Tool */}
                                <button
                                    onClick={() => setActiveTool('pan')}
                                    className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all border active:scale-95 ${activeTool === 'pan' ? 'bg-slate-100 text-slate-600 border-slate-300 shadow-inner' : 'bg-white text-slate-400 border-slate-200'}`}
                                >
                                    ✋
                                </button>

                                {/* Color/Paint Tool */}
                                <button
                                    onClick={() => {
                                        if (activeTool === 'paint') setShowColorPicker(true);
                                        else setActiveTool('paint');
                                    }}
                                    className={`w-12 h-12 rounded-full border-2 p-0.5 transition-all relative active:scale-95 ${activeTool === 'paint' ? 'border-indigo-600 scale-105 shadow-md shadow-indigo-100' : 'border-slate-200'}`}
                                >
                                    <div className="w-full h-full rounded-full shadow-sm ring-1 ring-black/5" style={{ backgroundColor: selectedBrushColor.hex }}></div>
                                    {activeTool === 'paint' && (
                                        <div className="absolute -bottom-1 -right-1 bg-indigo-600 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full border border-white">
                                            🖊️
                                        </div>
                                    )}
                                </button>

                                {/* Eyedropper Tool */}
                                <button
                                    onClick={() => setActiveTool('eyedropper')}
                                    className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all border active:scale-95 ${activeTool === 'eyedropper' ? 'bg-amber-100 text-amber-600 border-amber-200 scale-105 shadow-md shadow-amber-100' : 'bg-white text-slate-400 border-slate-200'}`}
                                >
                                    💉
                                </button>

                                {/* Eraser Tool */}
                                <button
                                    onClick={() => setActiveTool('eraser')}
                                    className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all border active:scale-95 ${activeTool === 'eraser' ? 'bg-indigo-100 text-indigo-600 border-indigo-200 scale-105 shadow-md shadow-indigo-100' : 'bg-white text-slate-400 border-slate-200'}`}
                                >
                                    🧼
                                </button>
                            </div>

                            {/* Action Group */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowMobileTools(!showMobileTools)}
                                    className={`h-11 px-4 rounded-xl border-2 font-bold text-xs flex items-center gap-1 transition-all active:scale-95 ${showMobileTools ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-500'}`}
                                >
                                    更多 {showMobileTools ? '▼' : '▲'}
                                </button>

                                <button
                                    onClick={() => {
                                        setIsEditMode(false);
                                        setActiveTool('paint');
                                        setShowColorPicker(false);
                                    }}
                                    className="h-11 px-5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-green-200 active:scale-95 transition-all flex items-center gap-1"
                                >
                                    <span>✅</span>
                                    <span className="hidden xs:inline">完成</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

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
            {
                isEditMode && pattern && (
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
                                        .sort(([, a], [, b]) => (b as number) - (a as number))
                                        .map(([colorId, count]) => {
                                            const color = BEAD_COLORS.find(c => c.id === colorId);
                                            if (!color) return null;

                                            const r = parseInt(color.hex.slice(1, 3), 16);
                                            const g = parseInt(color.hex.slice(3, 5), 16);
                                            const b = parseInt(color.hex.slice(5, 7), 16);
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
                )
            }

            {/* --- REFINE MODAL --- */}
            {
                showRefineModal && (
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
                )
            }

            {/* --- COLOR PICKER MODAL --- */}
            {
                showColorPicker && (
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
                )
            }
            {/* --- NEW CANVAS MODAL --- */}
            {
                showNewCanvasModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowNewCanvasModal(false)}>
                        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-float" onClick={e => e.stopPropagation()}>
                            <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                                <span>🎨</span> 新建画布
                            </h3>

                            <div className="space-y-6">
                                {/* Width */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                                        横向板数 (Cols)
                                    </label>
                                    <div className="flex items-center justify-between bg-slate-50 rounded-xl p-2 border border-slate-200">
                                        <button
                                            className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 font-bold text-xl text-slate-600 active:scale-95 transition-transform"
                                            onClick={() => setNewCanvasBoards(prev => ({ ...prev, w: Math.max(1, prev.w - 1) }))}
                                        >-</button>
                                        <span className="font-black text-2xl text-slate-800 w-16 text-center">{newCanvasBoards.w}</span>
                                        <button
                                            className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 font-bold text-xl text-indigo-600 active:scale-95 transition-transform"
                                            onClick={() => setNewCanvasBoards(prev => ({ ...prev, w: Math.min(6, prev.w + 1) }))}
                                        >+</button>
                                    </div>
                                </div>

                                {/* Height */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                                        纵向板数 (Rows)
                                    </label>
                                    <div className="flex items-center justify-between bg-slate-50 rounded-xl p-2 border border-slate-200">
                                        <button
                                            className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 font-bold text-xl text-slate-600 active:scale-95 transition-transform"
                                            onClick={() => setNewCanvasBoards(prev => ({ ...prev, h: Math.max(1, prev.h - 1) }))}
                                        >-</button>
                                        <span className="font-black text-2xl text-slate-800 w-16 text-center">{newCanvasBoards.h}</span>
                                        <button
                                            className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 font-bold text-xl text-indigo-600 active:scale-95 transition-transform"
                                            onClick={() => setNewCanvasBoards(prev => ({ ...prev, h: Math.min(6, prev.h + 1) }))}
                                        >+</button>
                                    </div>
                                </div>

                                <div className="bg-indigo-50 p-4 rounded-xl text-center">
                                    <div className="text-xs font-bold text-indigo-400 mb-1">画布尺寸</div>
                                    <div className="text-xl font-black text-indigo-700">
                                        {newCanvasBoards.w * 52} x {newCanvasBoards.h * 52} px
                                    </div>
                                    <div className="text-[10px] bg-white inline-block px-2 py-1 rounded text-indigo-400 mt-2 font-bold">
                                        {newCanvasBoards.w * newCanvasBoards.h} 块大板 (52mm)
                                    </div>
                                </div>

                                <button
                                    onClick={handleCreateBlankCanvas}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all text-lg"
                                >
                                    创建画布
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Generic Confirmation Modal - MOVED TO END & FORCED Z-INDEX */}
            {
                confirmModal.isOpen && (
                    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 h-full w-full" style={{ zIndex: 99999 }}>
                        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-in fade-in zoom-in duration-200 mx-auto border border-slate-100 relative" onClick={e => e.stopPropagation()}>
                            <h3 className="text-xl font-black text-slate-800 mb-3">{confirmModal.title}</h3>
                            <p className="text-slate-600 text-sm mb-8 leading-relaxed whitespace-pre-wrap">{confirmModal.message}</p>
                            <div className="flex justify-end gap-3 touch-none">
                                <button
                                    onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                                    className="flex-1 px-4 py-3 text-slate-500 font-bold text-sm bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors active:scale-95"
                                >
                                    {confirmModal.cancelText || "取消"}
                                </button>
                                <button
                                    onClick={() => {
                                        confirmModal.onConfirm();
                                        setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                    }}
                                    className={`flex-1 px-4 py-3 text-white font-bold text-sm rounded-xl shadow-lg transition-transform active:scale-95 ${confirmModal.isDanger ? 'bg-red-500 active:bg-red-600 shadow-red-200' : 'bg-indigo-600 active:bg-indigo-700 shadow-indigo-200'}`}
                                >
                                    {confirmModal.confirmText || "确定"}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};