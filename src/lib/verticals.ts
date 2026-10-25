import type { CSSProperties } from 'react';
import type { Category } from './types';

// Цвет клиента по первой букве кода: G — госсектор, B — банки и т. д.
const VERTICAL_COLOR: Record<string, string> = {
  G: '#3b5bdb',
  B: '#2b8a3e',
  T: '#7048e8',
  E: '#e67700',
  H: '#d6336c',
  R: '#0c8599',
  C: '#c2255c',
  A: '#495057',
  O: '#099268',
  F: '#1971c2',
  D: '#5f3dc4',
  Z: '#868e96',
};

export function verticalColor(code: string): string {
  return VERTICAL_COLOR[code.charAt(0).toUpperCase()] ?? '#868e96';
}

export function verticalStyle(code: string): CSSProperties {
  return { '--v': verticalColor(code) } as CSSProperties;
}

export const CATEGORY_COLOR: Record<Category, string> = {
  info: '#1971c2',
  marketing: '#e8590c',
  hq: '#16120e',
};
