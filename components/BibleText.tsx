import React, { useState, useRef, useEffect } from 'react';
import { OriginalPassage, VerseAnalysisItem, TooltipData } from '../types';
import { getVersePronunciation, getVerseAnalysis } from '../services/geminiService';
import { decode, decodeAudioData } from '../utils/audioUtils';
import Spinner from './Spinner';

interface BibleTextProps {
  text: string;
  onWordHover: (word: string, verseNumber: string, event: React.MouseEvent<HTMLSpanElement>) => void;
  originalPassage: OriginalPassage | null;
  testament: '구약성경' | '신약성경';
  tooltipData: TooltipData | null;
  registerVerseRef: (verseNumber: string, element: HTMLDivElement | null) => void;
  currentlyPlayingVerse: string | null;
}

type PlayingState = 'idle' | 'loading' | 'playing';

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

const BibleText: React.FC<BibleTextProps> = ({ text, onWordHover, originalPassage, testament, tooltipData, registerVerseRef, currentlyPlayingVerse }) => {
  const [playingState, setPlayingState] = useState<PlayingState>('idle');
  const [playingVerseNumber, setPlayingVerseNumber] = useState<string | null>(null);
  const [verseAnalysis, setVerseAnalysis] = useState<VerseAnalysisItem[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Clean punctuation from the API-provided original word for more reliable matching.
  const cleanedHighlightedOriginalWord = tooltipData?.definition?.originalWord?.replace(/[.,;:()׃“"”‘’']/g, '') || null;
  const activeVerseForHighlight = tooltipData?.verseNumber || null;

  const cleanupPlayback = () => {
    if (audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch (e) { /* already stopped */ }
        audioSourceRef.current.disconnect();
        audioSourceRef.current = null;
    }
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }
    setPlayingState('idle');
    setPlayingVerseNumber(null);
    setHighlightedIndex(-1);
    setVerseAnalysis([]);
  };

  useEffect(() => {
    return () => cleanupPlayback();
  }, []);

  const handlePlayVerse = async (originalVerseText: string, verseNumber: string) => {
    if (playingState !== 'idle') {
      cleanupPlayback();
      return;
    }

    setPlayingState('loading');
    setPlayingVerseNumber(verseNumber);

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Step 1 & 2: Get and decode audio first for immediate playback.
      const base64Audio = await getVersePronunciation(originalVerseText);
      const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      audioSourceRef.current = source;
      
      const playbackStartTime = audioContext.currentTime;
      setPlayingState('playing');

      // Step 3: Start audio playback immediately.
      source.onended = cleanupPlayback;
      source.start();

      // Step 4: Fetch analysis in the background for word highlighting.
      const koreanVerseText = text.split('\n').find(line => line.startsWith(`${verseNumber}.`))?.replace(/^\d+\.\s*/, '') || '';
      const language = testament === '구약성경' ? '히브리어' : '헬라어';
      
      getVerseAnalysis(koreanVerseText, originalVerseText, language, audioBuffer.duration)
        .then(analysis => {
            // Only start highlighting if we are still playing this verse.
            if (audioSourceRef.current === source) {
                setVerseAnalysis(analysis);

                const onPlaybackUpdate = () => {
                    // Stop the loop if the source has changed or stopped.
                    if (audioSourceRef.current !== source) {
                        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                        animationFrameRef.current = null;
                        return;
                    }
                    if (audioContext.currentTime < playbackStartTime) {
                        animationFrameRef.current = requestAnimationFrame(onPlaybackUpdate);
                        return;
                    };
                    const elapsedTimeMs = (audioContext.currentTime - playbackStartTime) * 1000;
                    const currentIndex = analysis.findIndex(item => elapsedTimeMs >= item.startTime && elapsedTimeMs < item.endTime);
                    setHighlightedIndex(currentIndex);
                    animationFrameRef.current = requestAnimationFrame(onPlaybackUpdate);
                };
                animationFrameRef.current = requestAnimationFrame(onPlaybackUpdate);
            }
        })
        .catch(err => {
            console.error(`Verse analysis failed for verse ${verseNumber}:`, err);
            // Audio will continue to play without highlighting, which is acceptable.
        });

    } catch (err) {
      console.error(`Failed to play pronunciation for verse ${verseNumber}:`, err);
      cleanupPlayback();
    }
  };

  const verses = text.split('\n').filter(line => line.trim() !== '');
  const languageClass = testament === '구약성경' ? 'font-hebrew' : 'font-greek';
  const languageDir = testament === '구약성경' ? 'rtl' : 'ltr';

  const renderVerseContent = (content: VerseAnalysisItem[], property: 'koreanWord' | 'originalWord') => {
    return content.map((item, index) => (
      <React.Fragment key={index}>
        <span className={`transition-colors duration-150 rounded px-1 ${index === highlightedIndex ? 'bg-yellow-300' : ''}`}>
          {item[property]}
        </span>
        {index < content.length - 1 ? ' ' : ''}
      </React.Fragment>
    ));
  };

  return (
    <div className="space-y-6">
      {verses.map((verse) => {
        const match = verse.match(/^(\d+)\.\s*(.*)/);
        if (!match) return null;

        const verseNumber = match[1];
        const verseText = match[2];
        const originalVerseText = originalPassage ? originalPassage[verseNumber] : null;
        const isPlayingThisVerse = playingVerseNumber === verseNumber;
        const isCurrentVerseActiveForHighlight = verseNumber === activeVerseForHighlight;
        const isCurrentlyPlayingForScroll = verseNumber === currentlyPlayingVerse;

        return (
          <div 
            key={verseNumber} 
            className={`flex items-start p-2 rounded-lg transition-colors duration-300 ${isCurrentlyPlayingForScroll ? 'bg-yellow-200' : ''}`}
            ref={(el) => registerVerseRef(verseNumber, el)}
          >
            <span className="text-sm md:text-base text-cyan-700/80 font-mono w-8 text-right pr-4 pt-2 select-none">
              {verseNumber}
            </span>
            <div className="flex-1">
              <p className="text-2xl md:text-3xl leading-loose">
                {isPlayingThisVerse && verseAnalysis.length > 0
                  ? renderVerseContent(verseAnalysis, 'koreanWord')
                  : verseText.split(/(\s+)/).map((word, wordIndex) => {
                      if (word.trim() === '') return <span key={wordIndex}>{word}</span>;
                      return (
                        <span
                          key={wordIndex}
                          onMouseEnter={(e) => onWordHover(word, verseNumber, e)}
                          className="cursor-pointer hover:bg-cyan-100 transition-colors duration-200 rounded px-1 py-0.5"
                        >
                          {word}
                        </span>
                      );
                    })
                }
              </p>
              {originalVerseText && (
                <div className="mt-2 flex items-center gap-3 bg-gray-100 p-3 rounded-md border">
                   <button
                    onClick={() => handlePlayVerse(originalVerseText, verseNumber)}
                    disabled={playingState === 'loading' && !isPlayingThisVerse}
                    className="text-gray-500 hover:text-cyan-600 disabled:opacity-50 flex-shrink-0"
                    aria-label={`${verseNumber}절 원어 발음 듣기`}
                  >
                    <SpeakerIcon isLoading={playingState === 'loading' && isPlayingThisVerse} />
                  </button>
                  <p 
                    className={`flex-1 text-xl md:text-2xl text-gray-700 ${languageClass}`}
                    dir={languageDir}
                  >
                    {isPlayingThisVerse && verseAnalysis.length > 0
                        ? renderVerseContent(verseAnalysis, 'originalWord')
                        : originalVerseText.split(/(\s+)/).map((word, index) => {
                          const cleanedWord = word.replace(/[.,;:()׃“"”‘’']/g, '');
                          const isHighlighted = isCurrentVerseActiveForHighlight && cleanedHighlightedOriginalWord && cleanedWord && cleanedWord === cleanedHighlightedOriginalWord;
                          return (
                            <span key={index} className={`transition-colors duration-150 rounded px-1 ${isHighlighted ? 'bg-yellow-300' : ''}`}>
                              {word}
                            </span>
                          );
                        })
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BibleText;