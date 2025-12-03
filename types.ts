
export enum ViewMode {
  LANDING = 'LANDING',
  BEADME = 'BEADME',
  GALLERY = 'GALLERY',
}

export interface BeadColor {
  id: string;
  name: string;
  hex: string;
  symbol: string; // For printable chart
}

export interface BeadPixel {
  x: number;
  y: number;
  color: BeadColor;
}

export interface BeadPattern {
  width: number;
  height: number;
  pixels: BeadPixel[];
  counts: Record<string, number>; // colorID -> count
}

export interface BrickPixel {
  x: number;
  y: number;
  color: string;
  height: number;
}
