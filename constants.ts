
import { BeadColor } from './types';

// Standard Perler/Hama/Artkal popular colors
// Symbols updated to Alphanumeric for professional charts
export const BEAD_COLORS: BeadColor[] = [
  { id: 'P01', name: 'White', hex: '#FFFFFF', symbol: '1' },
  { id: 'P02', name: 'Cream', hex: '#EFEBC0', symbol: '2' },
  { id: 'P03', name: 'Yellow', hex: '#F8DE34', symbol: '3' },
  { id: 'P04', name: 'Orange', hex: '#FF7F00', symbol: '4' },
  { id: 'P05', name: 'Red', hex: '#BE0032', symbol: '5' },
  { id: 'P06', name: 'Pink', hex: '#FF7FAC', symbol: '6' },
  { id: 'P07', name: 'Purple', hex: '#953495', symbol: '7' },
  { id: 'P08', name: 'Dark Blue', hex: '#1C2990', symbol: '8' },
  { id: 'P09', name: 'Light Blue', hex: '#3195D7', symbol: '9' },
  { id: 'P10', name: 'Green', hex: '#1D7336', symbol: 'A' },
  { id: 'P11', name: 'Light Green', hex: '#58C359', symbol: 'B' },
  { id: 'P12', name: 'Brown', hex: '#5E3827', symbol: 'C' },
  { id: 'P13', name: 'Grey', hex: '#878787', symbol: 'D' },
  { id: 'P14', name: 'Black', hex: '#000000', symbol: 'E' },
  { id: 'P15', name: 'Clear', hex: '#EBEBEB', symbol: 'F' },
  { id: 'P17', name: 'Blush', hex: '#FEB09F', symbol: 'G' },
  { id: 'P18', name: 'Peach', hex: '#FAC9A7', symbol: 'H' },
  { id: 'P19', name: 'Sand', hex: '#D2B48C', symbol: 'I' },
  { id: 'P20', name: 'Rust', hex: '#8B4513', symbol: 'J' },
  { id: 'P21', name: 'Tan', hex: '#C19A6B', symbol: 'K' },
  { id: 'P22', name: 'Magenta', hex: '#FF00FF', symbol: 'L' },
  { id: 'P23', name: 'Neon Green', hex: '#39FF14', symbol: 'M' },
  { id: 'P24', name: 'Turquoise', hex: '#40E0D0', symbol: 'N' },
  { id: 'P25', name: 'Pastel Blue', hex: '#AEC6CF', symbol: 'O' },
  { id: 'P26', name: 'Pastel Lavender', hex: '#C3B1E1', symbol: 'P' },
  { id: 'P27', name: 'Pastel Pink', hex: '#FFD1DC', symbol: 'Q' },
  { id: 'P28', name: 'Pastel Yellow', hex: '#FDFD96', symbol: 'R' },
  { id: 'P29', name: 'Cheddar', hex: '#FFA600', symbol: 'S' },
  { id: 'P30', name: 'Hot Coral', hex: '#FF6F61', symbol: 'T' },
  { id: 'P31', name: 'Plum', hex: '#DDA0DD', symbol: 'U' },
  { id: 'P32', name: 'Kiwi Lime', hex: '#8EE53F', symbol: 'V' },
  { id: 'P33', name: 'Toothpaste', hex: '#B2FFFF', symbol: 'W' },
  { id: 'P34', name: 'Dark Grey', hex: '#A9A9A9', symbol: 'X' },
  { id: 'P35', name: 'Cranapple', hex: '#800000', symbol: 'Y' },
  { id: 'P36', name: 'Butterscotch', hex: '#E3963E', symbol: 'Z' },
  { id: 'P37', name: 'Parrot Green', hex: '#008000', symbol: 'a' },
  { id: 'P38', name: 'Dark Spruce', hex: '#004225', symbol: 'b' },
  { id: 'P39', name: 'Midnight', hex: '#191970', symbol: 'c' },
  { id: 'P40', name: 'Blueberry', hex: '#4682B4', symbol: 'd' },
  { id: 'P41', name: 'Fawn', hex: '#E5AA70', symbol: 'e' },
  { id: 'P42', name: 'Light Grey', hex: '#D3D3D3', symbol: 'f' },
];

export const BOARD_SIZES = {
  MINI: 15,
  MIDI: 29, // Standard pegboard
  MAXI: 58  // 4 boards connected
};

export const LEGO_COLORS = [
    { id: 'L01', name: 'White', hex: '#FFFFFF', type: 'solid' },
    { id: 'L02', name: 'Brick Yellow', hex: '#D6BD83', type: 'solid' },
    { id: 'L03', name: 'Bright Red', hex: '#C91A09', type: 'solid' },
    { id: 'L04', name: 'Bright Blue', hex: '#0055BF', type: 'solid' },
    { id: 'L05', name: 'Bright Yellow', hex: '#F2CD37', type: 'solid' },
    { id: 'L06', name: 'Black', hex: '#05131D', type: 'solid' },
    { id: 'L07', name: 'Dark Green', hex: '#184632', type: 'solid' },
    { id: 'L08', name: 'Reddish Brown', hex: '#582A12', type: 'solid' },
    { id: 'L09', name: 'Medium Stone Grey', hex: '#A0A5A9', type: 'solid' },
    { id: 'L10', name: 'Dark Stone Grey', hex: '#6C6E68', type: 'solid' },
    { id: 'L11', name: 'Bright Orange', hex: '#FE8A18', type: 'solid' },
    { id: 'L12', name: 'Medium Blue', hex: '#5A93DB', type: 'solid' },
    { id: 'L13', name: 'Bright Green', hex: '#4B9F4A', type: 'solid' },
];
