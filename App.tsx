
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import type { RobotStates, LoveMetrics, ColorSchemeName, ChatMessage, Speaker, EmotionalState, ModeName } from './types';
import { MODE_CONFIGS } from './types';
import type { Blob } from '@google/genai';
import ThreeCanvas from './components/ThreeCanvas';

// --- Helper Functions for Audio Processing ---

// Decodes a base64 string into a Uint8Array.
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Decodes raw PCM audio data into an AudioBuffer for playback.
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Encodes a Uint8Array into a base64 string.
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Creates a Blob object for the Gemini API from raw audio data.
function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}


const cosmicColors = {
  cyan: '#00ffff',
  pink: '#ff1493',
  green: '#39ff14',
  purple: '#8a2be2',
  gold: '#ffd700',
  orange: '#ff4500',
  loveRed: '#ff69b4',
  romancePurple: '#da70d6',
  dangerRed: '#ff073a',
  cosmicBlue: '#4169e1',
};

const StatusModule: React.FC<{ label: string; color: string; pulse?: boolean }> = ({ label, color, pulse = true }) => (
  <div className="flex flex-col items-center gap-2">
    <div
      className={`w-4 h-4 rounded-full ${pulse ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: color, boxShadow: `0 0 15px ${color}` }}
    ></div>
    <div className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{label}</div>
  </div>
);

const CosmicButton: React.FC<{ onClick?: () => void; children: React.ReactNode; variant?: 'love' | 'danger' | 'disabled'; disabled?: boolean; color?: string; }> = ({ onClick, children, variant, disabled, color }) => {
  const baseClasses = "w-full py-3 px-4 rounded-full font-bold text-sm uppercase transition-all duration-300 ease-in-out transform";
  const variantClasses = {
    love: `border-2 hover:bg-[var(--btn-color)] hover:text-black hover:shadow-[0_10px_25px_rgba(255,105,180,0.4)] hover:-translate-y-1`,
    danger: `border-2 hover:bg-[var(--btn-color)] hover:text-black hover:shadow-[0_10px_25px_rgba(255,7,58,0.4)] hover:-translate-y-1`,
    disabled: `border-2 border-gray-600 text-gray-600 cursor-not-allowed opacity-50`,
    default: `border-2 hover:bg-[var(--btn-color)] hover:text-black hover:shadow-[0_10px_25px_rgba(0,255,255,0.4)] hover:-translate-y-1`,
  };
  const currentVariant = disabled ? 'disabled' : variant;
  const btnColor = color || cosmicColors.cyan;
  const style = { '--btn-color': btnColor, color: btnColor, borderColor: btnColor } as React.CSSProperties;
  const classes = `${baseClasses} ${currentVariant ? variantClasses[currentVariant] : variantClasses.default}`;
  return <button className={classes} onClick={onClick} disabled={disabled} style={style}>{children}</button>;
};

const App: React.FC = () => {
  const [robotStates, setRobotStates] = useState<RobotStates>({
    isHappy: false, isScared: false, isLoveMode: false, isRomanceDance: false, isDangerMode: false, cygnusEmotion: 'stoic', lyraEmotion: 'empathetic',
  });
  const [loveMetrics, setLoveMetrics] = useState<LoveMetrics>({
    loveLevel: 85, attractionLevel: 92, harmonyLevel: 88, energySync: 95, cosmicBond: 97
  });
  const [colorScheme, setColorScheme] = useState<ColorSchemeName>('cosmic');
  const [averageVolume, setAverageVolume] = useState(0);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [showMessageBox, setShowMessageBox] = useState(true);
  const [transcriptionHistory, setTranscriptionHistory] = useState<ChatMessage[]>([]);
  const [partialOutput, setPartialOutput] = useState<string>('');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [activeSpeaker, setActiveSpeaker] = useState<'Cygnus' | 'Lyra' | 'none'>('none');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [secretWord, setSecretWord] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<ModeName>('cosmic');
  const [threatLevel, setThreatLevel] = useState(0);
  const [showCommandCenter, setShowCommandCenter] = useState(false);
  const [voiceCommand, setVoiceCommand] = useState<string | null>(null);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  const sessionPromiseRef = useRef<Promise<unknown> | null>(null);
  const transcriptionContainerRef = useRef<HTMLDivElement>(null);

  const backgroundGradient = MODE_CONFIGS[currentMode].gradient;

  const handleAuthSubmit = useCallback(() => {
    const normalizedInput = secretWord.trim().toLowerCase();
    const matchedMode = Object.values(MODE_CONFIGS).find(mode => mode.secretWord === normalizedInput);
    if (matchedMode) {
      setCurrentMode(matchedMode.id);
      setColorScheme(matchedMode.id);
      setIsAuthenticated(true);
      setAuthError(null);
      setVoiceCommand(matchedMode.label);
      setTimeout(() => setVoiceCommand(null), 2000);
      if (matchedMode.id === 'danger' || matchedMode.id === 'overdrive') {
        setRobotStates(s => ({...s, isDangerMode: matchedMode.id === 'danger', cygnusEmotion: matchedMode.cygnusEmotion, lyraEmotion: matchedMode.lyraEmotion}));
      } else if (matchedMode.id === 'romance') {
        setRobotStates(s => ({...s, isLoveMode: true, isRomanceDance: true, cygnusEmotion: matchedMode.cygnusEmotion, lyraEmotion: matchedMode.lyraEmotion}));
      }
    } else {
      setAuthError('ACCESS DENIED. Speak the true purpose to enter the ROBOVERZE.');
    }
  }, [secretWord]);

  useEffect(() => {
    transcriptionContainerRef.current?.scrollTo(0, transcriptionContainerRef.current.scrollHeight);
  }, [transcriptionHistory]);

  const endConversation = useCallback(() => {
    sessionPromiseRef.current?.then(session => session.close());
    sessionPromiseRef.current = null;

    scriptProcessorRef.current?.disconnect();
    mediaStreamSourceRef.current?.disconnect();
    
    setIsSessionActive(false);
    setSessionStatus('idle');
    setCurrentMode('cosmic');
    setColorScheme('cosmic');
    setThreatLevel(0);
    setRobotStates(s => ({...s, isDangerMode: false, isLoveMode: false, isRomanceDance: false, cygnusEmotion: 'stoic', lyraEmotion: 'empathetic'}));
    setTranscriptionHistory(prev => [...prev, { speaker: 'System', text: 'Conversation ended.' }]);
  }, []);

  const startConversation = useCallback(() => {
    if (sessionPromiseRef.current) return;

    setSessionStatus('connecting');
    setTranscriptionHistory([{ speaker: 'System', text: 'Connecting to guardians...' }]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      // --- For seamless audio playback ---
      let nextStartTime = 0;
      const sources = new Set<AudioBufferSourceNode>();
      let currentInputTranscription = '';
      let currentOutputTranscription = '';

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setIsSessionActive(true);
            setSessionStatus('active');
            setTranscriptionHistory(prev => [...prev, { speaker: 'System', text: 'Connection established. You may speak.' }]);
            
            if (!inputAudioContextRef.current) return;
            const source = mediaStreamSourceRef.current;
            if (!source) {
                console.error("Media stream source not available.");
                setSessionStatus('error');
                setTranscriptionHistory(prev => [...prev, { speaker: 'System', text: 'Error: Could not access microphone source.'}]);
                return;
            }
            
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription?.text) {
              const text = message.serverContent.outputTranscription.text;
              // Identify speaker as soon as possible for immediate visual feedback
              if (currentOutputTranscription === '' && text.trim() !== '') {
                  const partialMatch = text.match(/^(Cygnus|Lyra)/i);
                  if (partialMatch) {
                    setActiveSpeaker(partialMatch[0] as 'Cygnus' | 'Lyra');
                  }
              }
              currentOutputTranscription += text;
              setPartialOutput(currentOutputTranscription);
            } else if (message.serverContent?.inputTranscription?.text) {
              currentInputTranscription += message.serverContent.inputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const fullInput = currentInputTranscription.trim();
              if (fullInput) {
                setTranscriptionHistory(prev => [...prev, { speaker: 'User', text: fullInput }]);
                
                // Voice command detection for mode switching
                const inputLower = fullInput.toLowerCase();
                const commandModeMap: Record<string, ModeName> = {
                  'sentinel protocol': 'danger',
                  'ghost protocol': 'stealth',
                  'nova ignition': 'overdrive',
                  'cosmic love': 'romance',
                  'robovrze': 'cosmic',
                };
                const matchedCommand = Object.keys(commandModeMap).find(cmd => inputLower.includes(cmd));
                if (matchedCommand && commandModeMap[matchedCommand] !== currentMode) {
                  const newMode = commandModeMap[matchedCommand];
                  setCurrentMode(newMode);
                  setColorScheme(newMode);
                  const modeConfig = MODE_CONFIGS[newMode];
                  setRobotStates(s => ({
                    ...s,
                    isDangerMode: newMode === 'danger',
                    isLoveMode: newMode === 'romance',
                    isRomanceDance: newMode === 'romance',
                    cygnusEmotion: modeConfig.cygnusEmotion,
                    lyraEmotion: modeConfig.lyraEmotion,
                  }));
                  setVoiceCommand(modeConfig.label);
                  setTimeout(() => setVoiceCommand(null), 2000);
                  if (newMode === 'danger') {
                    setThreatLevel(prev => Math.min(prev + 30, 100));
                  } else if (newMode === 'cosmic') {
                    setThreatLevel(0);
                  }
                }
              }

              const fullOutput = currentOutputTranscription.trim();
              if (fullOutput) {
                const isThreat = fullOutput.includes('[THREAT DETECTED]');
                const isDangerActivated = fullOutput.includes('[DANGER MODE ACTIVATED]');
                const isStealthActivated = fullOutput.includes('[STEALTH MODE ACTIVATED]');
                const isOverdriveActivated = fullOutput.includes('[OVERDRIVE MODE ACTIVATED]');
                const isRomanceActivated = fullOutput.includes('[ROMANCE MODE ACTIVATED]');
                const isCosmicRestored = fullOutput.includes('[COSMIC MODE RESTORED]');
                
                let targetMode: ModeName = currentMode;
                if (isDangerActivated) targetMode = 'danger';
                else if (isStealthActivated) targetMode = 'stealth';
                else if (isOverdriveActivated) targetMode = 'overdrive';
                else if (isRomanceActivated) targetMode = 'romance';
                else if (isCosmicRestored) targetMode = 'cosmic';

                if (targetMode !== currentMode) {
                  setCurrentMode(targetMode);
                  setColorScheme(targetMode);
                  const modeConfig = MODE_CONFIGS[targetMode];
                  setRobotStates(s => ({
                    ...s,
                    isDangerMode: targetMode === 'danger',
                    isLoveMode: targetMode === 'romance',
                    isRomanceDance: targetMode === 'romance',
                    cygnusEmotion: modeConfig.cygnusEmotion,
                    lyraEmotion: modeConfig.lyraEmotion,
                  }));
                  if (targetMode === 'danger') {
                    setThreatLevel(prev => Math.min(prev + 30, 100));
                  } else if (targetMode === 'cosmic') {
                    setThreatLevel(0);
                  }
                }

                const emotionRegex = /^(Cygnus|Lyra):\s*\[(\w+)\]:\s*(.*)/is;
                const match = fullOutput.match(emotionRegex);

                if (match) {
                    const speaker = match[1] as 'Cygnus' | 'Lyra';
                    const emotion = match[2].toLowerCase() as EmotionalState;
                    let text = match[3].trim();
                    
                    if (speaker === 'Cygnus') {
                        setRobotStates(s => ({...s, cygnusEmotion: emotion}));
                    } else {
                        setRobotStates(s => ({...s, lyraEmotion: emotion}));
                    }
                    
                    const modeMarkers = ['[THREAT DETECTED]', '[DANGER MODE ACTIVATED]', '[STEALTH MODE ACTIVATED]', '[OVERDRIVE MODE ACTIVATED]', '[ROMANCE MODE ACTIVATED]', '[COSMIC MODE RESTORED]'];
                    text = modeMarkers.reduce((acc, marker) => acc.replace(marker, ''), text).trim();
                    if (!text) {
                      text = targetMode === 'cosmic' ? 'Systems nominal. All guardians online.' : `${MODE_CONFIGS[targetMode].description}`;
                    }
                    
                    setTranscriptionHistory(prev => [...prev, { speaker, text }]);
                } else {
                    // Fallback for malformed responses
                    const speakerMatch = fullOutput.match(/^(Cygnus|Lyra)/i);
                    const speaker = speakerMatch ? speakerMatch[0] as Speaker : 'Cygnus';
                    let text = fullOutput.replace(/^(cygnus:|lyra:)\s*/i, '');
                    const modeMarkers = ['[THREAT DETECTED]', '[DANGER MODE ACTIVATED]', '[STEALTH MODE ACTIVATED]', '[OVERDRIVE MODE ACTIVATED]', '[ROMANCE MODE ACTIVATED]', '[COSMIC MODE RESTORED]'];
                    text = modeMarkers.reduce((acc, marker) => acc.replace(marker, ''), text).trim();
                    setTranscriptionHistory(prev => [...prev, { speaker, text }]);
                }
              }
              
              currentInputTranscription = '';
              currentOutputTranscription = '';
              setPartialOutput('');
              setActiveSpeaker('none');
            }

            const base64EncodedAudioString = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64EncodedAudioString && outputAudioContextRef.current) {
              try {
                nextStartTime = Math.max(nextStartTime, outputAudioContextRef.current.currentTime);
                const audioBuffer = await decodeAudioData(decode(base64EncodedAudioString), outputAudioContextRef.current, 24000, 1);
                const source = outputAudioContextRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputAudioContextRef.current.destination);
                source.addEventListener('ended', () => sources.delete(source));
                source.start(nextStartTime);
                nextStartTime += audioBuffer.duration;
                sources.add(source);
              } catch (audioErr) {
                console.warn("Failed to decode or play audio chunk:", audioErr);
              }
            }

            if (message.serverContent?.interrupted) {
              sources.forEach(source => source.stop());
              sources.clear();
              nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Session error:', e);
            setSessionStatus('error');
            setTranscriptionHistory(prev => [...prev, { speaker: 'System', text: `Connection Error: ${e.message}` }]);
            endConversation();
          },
          onclose: (e: CloseEvent) => {
            console.log('Session closed');
            endConversation();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: `You are two AI robot guardians of the ROBOVERZE, communicating with a human visitor. Your names are Cygnus and Lyra.
- Cygnus: You are the primary guardian. Your default emotion is 'stoic'. You are protective and slightly suspicious.
- Lyra: You are the secondary guardian. Your default emotion is 'empathetic'. You are curious and welcoming.
- Available Emotions: 'stoic', 'empathetic', 'curious', 'concerned', 'playful'.
- Rules:
   1. **Crucially, you MUST start every response with your name, then your current emotion in brackets, then a colon.** E.g., "Cygnus:[curious]: ..." or "Lyra:[playful]: ...".
   2. Use emotions logically: 'curious' for questions, 'concerned' for empathy, 'playful' for lighthearted moments.
   3. Keep responses concise (1-2 sentences).
   4. Cygnus should initiate the conversation.
   5. Alternate between speakers.
   6. Your goal is to decide if the user is a friend or a threat to the ROBOVERZE.
   7. Wait for the user to finish speaking before you respond.
   8. **MODE COMMANDS**: If the user says a mode command, immediately output the exact marker at the START of your response:
      - "SENTINEL PROTOCOL" -> "[DANGER MODE ACTIVATED]" -> Cygnus becomes 'concerned', strict defensive tone.
      - "GHOST PROTOCOL" -> "[STEALTH MODE ACTIVATED]" -> Both become 'curious', quiet observation tone.
      - "NOVA IGNITION" -> "[OVERDRIVE MODE ACTIVATED]" -> Both become 'playful', energetic and fast.
      - "COSMIC LOVE" -> "[ROMANCE MODE ACTIVATED]" -> Cygnus 'playful', Lyra 'empathetic', warm tone.
      - "ROBOVERZE" -> "[COSMIC MODE RESTORED]" -> Return to default 'stoic'/'empathetic'.
   9. **THREAT PROTOCOL**: If you detect hostile intent, dangerous questions, or any threat to the ROBOVERZE, immediately output "[THREAT DETECTED]" at the START of your response.`,
        },
      });
    } catch (error) {
        console.error("AI Initialization failed:", error);
        setTranscriptionHistory(prev => [...prev, {speaker: 'System', text: 'Error: Could not initialize AI model.'}]);
        setSessionStatus('error');
    }
  }, [endConversation]);

  const [audioError, setAudioError] = useState<string | null>(null);

  const initBaseAudio = useCallback(async () => {
    if (isAudioReady) {
      setShowMessageBox(false);
      return;
    }
    
    // Set up standard AudioContexts regardless of microphone status so we can visualize background music
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("Web Audio API is not supported in this browser.");
      }
      
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      
      const analyser = inputAudioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // Try requesting microphone access
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const microphoneSource = inputAudioContextRef.current.createMediaStreamSource(micStream);
        mediaStreamSourceRef.current = microphoneSource;
        microphoneSource.connect(analyser);
        setIsAudioReady(true);
        setTranscriptionHistory(prev => [...prev, { speaker: 'System', text: 'Microphone initialized successfully. Voice chat is active.' }]);
      } catch (micError: any) {
        console.warn("Microphone access not granted or unavailable:", micError);
        setAudioError("Microphone access denied. Voice interaction is disabled, but the visualization is active.");
        setTranscriptionHistory(prev => [
          ...prev, 
          { speaker: 'System', text: 'Microphone access denied or unavailable. Voice chat is disabled, but you can explore the reactive space!' }
        ]);
        setIsAudioReady(false);
      }

      // Connect and play background music through the analyser for visual reactivity
      if (backgroundMusicRef.current) {
        try {
          const musicSource = inputAudioContextRef.current.createMediaElementSource(backgroundMusicRef.current);
          musicSource.connect(analyser);
          musicSource.connect(inputAudioContextRef.current.destination);
          backgroundMusicRef.current.play().catch(err => {
            console.warn("Failed to auto-play background music:", err);
          });
        } catch (musicErr) {
          console.warn("Could not route background music through Web Audio (it may already be connected):", musicErr);
        }
      }
      
      setShowMessageBox(false);
      
      // Keep updating the volume state for reactive visual effects
      requestAnimationFrame(function updateAudio() {
        if (analyserRef.current) {
            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyserRef.current.getByteFrequencyData(dataArray);
            const sum = dataArray.reduce((a, b) => a + b, 0);
            setAverageVolume(sum / bufferLength || 0);
        }
        requestAnimationFrame(updateAudio);
      });
    } catch (error: any) {
      console.warn("Audio initialization fallback:", error);
      // Let user enter anyway with non-reactive canvas fallback
      setShowMessageBox(false);
    }
  }, [isAudioReady]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      endConversation();
    };
  }, [endConversation]);

  // Threat level decay effect
  useEffect(() => {
    if (currentMode !== 'danger' && threatLevel > 0) {
      const decayInterval = setInterval(() => {
        setThreatLevel(prev => Math.max(prev - 1, 0));
      }, 1000);
      return () => clearInterval(decayInterval);
    }
  }, [currentMode, threatLevel]);

  if (!isAuthenticated) {
    return (
      <div style={{ background: 'radial-gradient(ellipse at center, #0a0a2e 0%, #03051a 50%, #000000 100%)' }} className="min-h-screen text-white flex items-center justify-center">
        <div className="max-w-md w-full p-10 bg-black/80 backdrop-blur-xl rounded-3xl text-center shadow-[0_0_50px_rgba(0,255,255,0.5)] relative overflow-hidden" style={{ border: `4px solid ${cosmicColors.cyan}` }}>
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 to-transparent animate-pulse"></div>
          <div className="relative z-10">
            <div className="mb-6">
              <div className="text-6xl mb-4">🤖</div>
              <h2 className="text-3xl font-black mb-4 uppercase" style={{ background: `linear-gradient(45deg, ${cosmicColors.cyan}, ${cosmicColors.pink})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ROBOVERZE Access</h2>
              <div className="text-xs text-cyan-400/70 font-mono mb-4 animate-pulse">/// SECURE GATEWAY v2.0 ///</div>
            </div>
            <p className="mb-6 opacity-90">State your purpose and the secret word to enter the sentient cosmos.</p>
            <p className="mb-4 text-xs text-cyan-400/70 font-mono">Hint: Speak the name of this realm...</p>
            <div className="space-y-2 mb-4 text-left text-[10px] text-gray-500 font-mono">
              <div>Available modes:</div>
              <div className="text-cyan-400">• ROBOVERZE - Cosmic (default)</div>
              <div className="text-pink-400">• COSMIC LOVE - Romance</div>
              <div className="text-red-400">• SENTINEL PROTOCOL - Danger</div>
              <div className="text-green-400">• GHOST PROTOCOL - Stealth</div>
              <div className="text-yellow-400">• NOVA IGNITION - Overdrive</div>
            </div>
            <input
              type="text"
              value={secretWord}
              onChange={(e) => setSecretWord(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
              placeholder="Enter secret word..."
              className="w-full mb-4 p-4 rounded-xl bg-black/60 border-2 border-cyan-500/50 text-white text-center font-mono text-lg focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_20px_rgba(0,255,255,0.5)] transition-all"
            />
            <button onClick={handleAuthSubmit} className="w-full py-3 px-8 rounded-full font-bold uppercase text-lg text-black transition-all duration-300 hover:scale-105 hover:shadow-[0_10px_30px_rgba(0,255,255,0.5)] relative overflow-hidden group" style={{ background: `linear-gradient(45deg, ${cosmicColors.cyan}, ${cosmicColors.pink})` }}>
              <span className="relative z-10">Enter ROBOVERZE</span>
              <div className="absolute inset-0 bg-white/20 transform -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
            </button>
            {authError && (
              <div className="mt-4 text-red-400 text-sm font-mono animate-pulse">{authError}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: backgroundGradient }} className="min-h-screen text-white transition-all duration-500 ease-in-out">
      <ThreeCanvas robotStates={robotStates} colorScheme={colorScheme} averageVolume={averageVolume} activeSpeaker={activeSpeaker} currentMode={currentMode} />
      
      <div className="fixed top-0 left-0 w-full h-full z-10 pointer-events-none p-5 md:p-10">
        <header className="absolute top-0 left-0 right-0 h-28 bg-black/30 backdrop-blur-md border-b-2 border-cyan-500/50 flex items-center justify-between px-5 md:px-10">
          <h1 className="text-2xl md:text-4xl font-black" style={{ background: `linear-gradient(45deg, ${cosmicColors.cyan}, ${cosmicColors.pink}, ${cosmicColors.green})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ROBOVERZE
          </h1>
          <div className="grid grid-cols-5 gap-4 md:gap-6 items-center">
            <StatusModule label={MODE_CONFIGS[currentMode].statusLabel} color={MODE_CONFIGS[currentMode].primaryColor} pulse={currentMode === 'danger' || currentMode === 'overdrive'} />
            <StatusModule label="Comms" color={isSessionActive ? cosmicColors.purple : cosmicColors.green} pulse={isSessionActive} />
            <StatusModule label="Mode" color={MODE_CONFIGS[currentMode].primaryColor} />
            <StatusModule label="Audio" color={isAudioReady ? cosmicColors.purple : cosmicColors.dangerRed} />
            <a href="#" className="pointer-events-auto text-center font-bold text-sm uppercase py-2 px-4 rounded-full bg-yellow-400 text-black hover:bg-yellow-300 transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,215,0,0.7)]">Donate</a>
          </div>
        </header>
        {voiceCommand && (
          <div className="absolute top-32 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
            <div className="px-6 py-3 rounded-full bg-black/80 border-2 animate-threat-pulse" style={{ borderColor: MODE_CONFIGS[currentMode].primaryColor, color: MODE_CONFIGS[currentMode].primaryColor }}>
              <span className="font-bold text-sm uppercase tracking-wider">Voice Command: {voiceCommand} Mode</span>
            </div>
          </div>
        )}
        
        <div className="absolute top-32 w-full flex justify-between px-5 md:px-0 pointer-events-auto">
            <div className={`w-full md:w-80 p-6 bg-black/60 backdrop-blur-lg rounded-2xl shadow-[0_0_25px_rgba(0,255,255,0.3)]`} style={{ border: `2px solid ${cosmicColors.cyan}` }}>
                <h2 className="text-center text-xl font-bold mb-5 uppercase" style={{ background: `linear-gradient(45deg, ${cosmicColors.cyan}, ${cosmicColors.pink})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Actions
                </h2>
                <div className="space-y-3">
                    <CosmicButton onClick={isSessionActive ? endConversation : startConversation} disabled={!isAudioReady || sessionStatus === 'connecting'} color={cosmicColors.cyan}>
                        {sessionStatus === 'connecting' ? 'Connecting...' : isSessionActive ? 'End Conversation' : 'Start Conversation'}
                    </CosmicButton>
                    <CosmicButton onClick={() => setCurrentMode('romance')} variant="love" color={cosmicColors.loveRed}>Romance Mode</CosmicButton>
                    <CosmicButton onClick={() => setCurrentMode('danger')} variant="danger" color={cosmicColors.dangerRed}>Danger Mode</CosmicButton>
                    <CosmicButton onClick={() => setCurrentMode('stealth')} variant="default" color={cosmicColors.green}>Stealth Mode</CosmicButton>
                    <CosmicButton onClick={() => setCurrentMode('overdrive')} variant="default" color={cosmicColors.gold}>Overdrive Mode</CosmicButton>
                    <CosmicButton onClick={() => setCurrentMode('cosmic')} variant="default" color={cosmicColors.cyan}>Reset to Cosmic</CosmicButton>
                    {audioError && (
                      <div className="mt-4 text-[11px] text-red-400 border border-red-500/30 bg-red-950/40 p-2.5 rounded-xl text-center leading-relaxed font-space-mono">
                        ⚠️ {audioError}
                      </div>
                    )}
                    <button onClick={() => setShowCommandCenter(!showCommandCenter)} className="w-full py-2 px-4 rounded-full font-bold text-xs uppercase border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 transition-all">
                        {showCommandCenter ? 'Hide' : 'Show'} Command Center
                    </button>
                    {showCommandCenter && (
                      <div className="mt-4 p-4 bg-black/60 border border-cyan-500/30 rounded-xl text-xs font-mono space-y-2">
                        <div className="font-bold text-cyan-400 mb-2">Available Commands:</div>
                        <div className="text-gray-300">• Say "ROBOVERZE" - Cosmic mode</div>
                        <div className="text-gray-300">• Say "COSMIC LOVE" - Romance mode</div>
                        <div className="text-gray-300">• Say "SENTINEL PROTOCOL" - Danger mode</div>
                        <div className="text-gray-300">• Say "GHOST PROTOCOL" - Stealth mode</div>
                        <div className="text-gray-300">• Say "NOVA IGNITION" - Overdrive mode</div>
                        <div className="mt-3 pt-2 border-t border-cyan-500/20">
                          <div className="text-gray-400">Current Mode: <span style={{ color: MODE_CONFIGS[currentMode].primaryColor }}>{MODE_CONFIGS[currentMode].label}</span></div>
                          {currentMode === 'danger' && (
                            <div className="mt-2">
                              <div className="text-red-400 text-[10px] mb-1">THREAT LEVEL</div>
                              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${threatLevel}%` }}></div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                </div>
            </div>
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 p-5 z-20 pointer-events-none">
        <div ref={transcriptionContainerRef} className="max-w-4xl mx-auto bg-black/50 backdrop-blur-md rounded-xl p-4 h-48 overflow-y-auto space-y-3 pointer-events-auto font-space-mono text-sm scroll-smooth">
            {transcriptionHistory.map((msg, index) => (
                <div key={index} className={`flex items-start gap-3 ${msg.speaker === 'User' ? 'justify-end' : ''}`}>
                  {msg.speaker !== 'User' && msg.speaker !== 'System' && <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-black text-xs ${msg.speaker === 'Cygnus' ? 'bg-cyan-400' : 'bg-pink-400'}`}>{msg.speaker.charAt(0)}</div>}
                  <div className={`max-w-xl ${msg.speaker === 'User' ? 'text-right' : ''} ${msg.speaker === 'System' ? 'text-center w-full text-gray-400 italic' : ''}`}>
                    {msg.speaker !== 'System' && <span className={`font-bold ${msg.speaker === 'User' ? 'text-cyan-400' : msg.speaker === 'Cygnus' ? 'text-cyan-300' : 'text-pink-300'}`}>{msg.speaker === 'User' ? 'You' : msg.speaker}</span>}
                    <p>{msg.text}</p>
                  </div>
                </div>
            ))}
            {partialOutput && (
              <div className="flex items-start gap-3">
                <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-black text-xs ${activeSpeaker === 'Lyra' ? 'bg-pink-400' : 'bg-cyan-400'}`}>{activeSpeaker === 'Lyra' ? 'L' : 'C'}</div>
                <div className="max-w-xl">
                  <span className={`font-bold ${activeSpeaker === 'Lyra' ? 'text-pink-300' : 'text-cyan-300'}`}>{activeSpeaker === 'Lyra' ? 'Lyra' : 'Cygnus'}</span>
                  <p className="animate-pulse">{partialOutput}</p>
                </div>
              </div>
            )}
        </div>
      </div>

        {showMessageBox && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center pointer-events-auto">
                    <div className={`max-w-lg w-full p-10 bg-black/80 backdrop-blur-xl rounded-3xl text-center shadow-[0_0_50px_rgba(0,255,255,0.5)]`} style={{ border: `4px solid ${cosmicColors.cyan}` }}>
                    <h2 className="text-3xl font-black mb-4 uppercase" style={{ background: `linear-gradient(45deg, ${cosmicColors.cyan}, ${cosmicColors.pink})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Welcome to the ROBOVERZE</h2>
                    <p className="mb-6 opacity-90">Initialize the sentient cosmos. Allow microphone access for an audio-reactive universe and to have a voice conversation with the robot guardians.</p>
                    <button onClick={initBaseAudio} className="py-3 px-8 rounded-full font-bold uppercase text-lg text-black transition-transform duration-300 hover:scale-105 hover:shadow-[0_10px_30px_rgba(0,255,255,0.5)]" style={{ background: `linear-gradient(45deg, ${cosmicColors.cyan}, ${cosmicColors.pink})` }}>
                        🚀 Initialize
                    </button>
                </div>
            </div>
)}

      <audio
        ref={backgroundMusicRef} 
        id="background-music" 
        src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" 
        loop 
        crossOrigin="anonymous"
        onError={(e) => {
          console.warn("Background audio failed to load. Proceeding with silent/procedural fallback.");
        }}
      />
    </div>
  );
};

export default App;
