import React, { useState, useRef, useEffect } from 'react';
import { TooltipData } from '../types';
import Spinner from './Spinner';
import { getWordPronunciation } from '../services/geminiService';
import { decode, decodeAudioData } from '../utils/audioUtils';

interface WordTooltipProps {
  data: TooltipData | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const SpeakerIcon: React.FC<{isLoading: boolean}> = ({isLoading}) => {
    if (isLoading) {
        return <Spinner />;
    }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
    </svg>
  );
};


const WordTooltip: React.FC<WordTooltipProps> = ({ data, onMouseEnter, onMouseLeave }) => {
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (data && tooltipRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      let newTop = data.y + 20;
      let newLeft = data.x;

      if (newTop + tooltipRect.height > window.innerHeight) {
        newTop = data.y - tooltipRect.height - 20;
      }
      if (newLeft + tooltipRect.width > window.innerWidth) {
        newLeft = window.innerWidth - tooltipRect.width - 20;
      }
      if (newLeft < 0) {
        newLeft = 20;
      }
      
      setPosition({ top: newTop, left: newLeft });
    }
  }, [data]);

  if (!data) return null;

  const { word, definition, isLoading, error } = data;

  const handlePlayPronunciation = async () => {
    if (!definition?.originalWord || isAudioLoading) return;

    setIsAudioLoading(true);
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const audioContext = audioContextRef.current;
      const base64Audio = await getWordPronunciation(definition.originalWord);
      const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
    } catch (err) {
      console.error("Failed to play pronunciation:", err);
    } finally {
      setIsAudioLoading(false);
    }
  };

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 p-4 bg-white border border-gray-200 rounded-lg shadow-xl w-80 transition-opacity duration-200"
      style={{ top: `${position.top}px`, left: `${position.left}px`, opacity: data ? 1 : 0, pointerEvents: data ? 'auto' : 'none' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {isLoading && (
        <div className="flex items-center">
          <Spinner />
          <span className="ml-2 text-gray-600">'{word}' 분석 중...</span>
        </div>
      )}
      {error && <p className="text-red-500">{error}</p>}
      {!isLoading && !error && definition && (
        <>
            <div className="flex items-center gap-3 border-b border-gray-200 pb-2 mb-3">
                <h3 className="text-xl font-bold text-cyan-800">{definition.originalWord}</h3>
                <span className="text-gray-500 italic">({definition.transliteration})</span>
                <button 
                    onClick={handlePlayPronunciation} 
                    disabled={isAudioLoading}
                    className="ml-auto text-gray-500 hover:text-cyan-600 disabled:opacity-50"
                    aria-label="Play pronunciation"
                >
                    <SpeakerIcon isLoading={isAudioLoading} />
                </button>
            </div>
            <div className="space-y-4 text-gray-700">
                <div>
                    <h4 className="font-bold text-sm text-gray-500 uppercase tracking-wider mb-1.5">문법 정보</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-base bg-gray-50 p-3 rounded-md border">
                        <div>
                            <div className="text-xs font-semibold text-gray-500">품사</div>
                            <div className="font-medium">{definition.partOfSpeech}</div>
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-gray-500">성</div>
                            <div className="font-medium">{definition.gender}</div>
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-gray-500">수</div>
                            <div className="font-medium">{definition.number}</div>
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-gray-500">격</div>
                            <div className="font-medium">{definition.case}</div>
                        </div>
                    </div>
                </div>
                <div>
                    <h4 className="font-bold text-sm text-gray-500 uppercase tracking-wider mb-1">기본 의미</h4>
                    <p className="text-base" style={{ whiteSpace: 'pre-wrap' }}>
                        {definition.basicMeaning}
                    </p>
                </div>
            </div>
        </>
      )}
    </div>
  );
};

export default WordTooltip;