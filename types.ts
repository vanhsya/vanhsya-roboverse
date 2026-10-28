import type { Color } from 'three';

export type EmotionalState = 'stoic' | 'empathetic' | 'curious' | 'concerned' | 'playful';

export interface RobotStates {
  isHappy: boolean;
  isScared: boolean;
  isLoveMode: boolean;
  isRomanceDance: boolean;
  isDangerMode: boolean;
  cygnusEmotion: EmotionalState;
  lyraEmotion: EmotionalState;
}

export interface LoveMetrics {
  loveLevel: number;
  attractionLevel: number;
  harmonyLevel: number;
  energySync: number;
  cosmicBond: number;
}

export type ColorSchemeName = 'cosmic' | 'romance' | 'danger' | 'stealth' | 'overdrive';

export type ModeName = 'cosmic' | 'romance' | 'danger' | 'stealth' | 'overdrive';

export interface ModeConfig {
  id: ModeName;
  label: string;
  secretWord: string;
  description: string;
  gradient: string;
  primaryColor: string;
  statusLabel: string;
  cygnusEmotion: EmotionalState;
  lyraEmotion: EmotionalState;
}

export const MODE_CONFIGS: Record<ModeName, ModeConfig> = {
  cosmic: {
    id: 'cosmic',
    label: 'Cosmic',
    secretWord: 'robovrze',
    description: 'Normal guardian mode. Balanced emotions and standard visuals.',
    gradient: 'radial-gradient(ellipse at center, #0a0a2e 0%, #03051a 50%, #000000 100%)',
    primaryColor: '#00ffff',
    statusLabel: 'Secure',
    cygnusEmotion: 'stoic',
    lyraEmotion: 'empathetic',
  },
  romance: {
    id: 'romance',
    label: 'Romance',
    secretWord: 'cosmic love',
    description: 'Love mode activated. Warm pink and rose visuals with heightened emotional sync.',
    gradient: 'radial-gradient(ellipse at center, #2a0a2e 0%, #1a051a 50%, #200010 100%)',
    primaryColor: '#ff69b4',
    statusLabel: 'Romance',
    cygnusEmotion: 'playful',
    lyraEmotion: 'empathetic',
  },
  danger: {
    id: 'danger',
    label: 'Danger',
    secretWord: 'sentinel protocol',
    description: 'Threat response mode. Red alert visuals, defensive posture, and heightened threat detection.',
    gradient: 'radial-gradient(ellipse at center, #2a0505 0%, #1a0000 50%, #0d0000 100%)',
    primaryColor: '#ff073a',
    statusLabel: 'THREAT',
    cygnusEmotion: 'concerned',
    lyraEmotion: 'concerned',
  },
  stealth: {
    id: 'stealth',
    label: 'Stealth',
    secretWord: 'ghost protocol',
    description: 'Low-visibility reconnaissance mode. Dark visuals, quiet audio, and observation-first behavior.',
    gradient: 'radial-gradient(ellipse at center, #050a0a 0%, #020505 50%, #000000 100%)',
    primaryColor: '#00ff99',
    statusLabel: 'STEALTH',
    cygnusEmotion: 'curious',
    lyraEmotion: 'curious',
  },
  overdrive: {
    id: 'overdrive',
    label: 'Overdrive',
    secretWord: 'nova ignition',
    description: 'Maximum power mode. Bright visuals, fast responses, and amplified energy.',
    gradient: 'radial-gradient(ellipse at center, #1a0a2e 0%, #0d051a 50%, #05000d 100%)',
    primaryColor: '#ffd700',
    statusLabel: 'OVERDRIVE',
    cygnusEmotion: 'playful',
    lyraEmotion: 'playful',
  },
};

export type ColorSchemes = {
  [key in ColorSchemeName]: Color[];
};

export type Speaker = 'Cygnus' | 'Lyra' | 'User' | 'System';

export interface ChatMessage {
    speaker: Speaker;
    text: string;
}