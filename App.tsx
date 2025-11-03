import React, { useState, useCallback, useRef, useEffect } from 'react';
import PassageSelector from './components/PassageSelector';
import BibleText from './components/BibleText';
import WordTooltip from './components/WordTooltip';
import BibleTrackerModal from './components/BibleTrackerModal';
import FloatingPlayer from './components/FloatingPlayer';
import AudioControls from './components/AudioControls';
import Spinner from './components/Spinner';
import { getWordDefinition, setSessionApiKey, getOriginalPassageText, getVersePronunciation, streamPassageText } from './services/geminiService';
import { TooltipData, BibleBookStructure, OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS, OriginalPassage } from './types';
import { BIBLE_STRUCTURE } from './data/bibleStructure';
import { decode, decodeAudioData } from './utils/audioUtils';

export type ChapterAudioState = 'idle' | 'loading' | 'playing' | 'error';

const App: React.FC = () => {
    const [passage, setPassage] = useState<string>('');
    const [originalPassage, setOriginalPassage] = useState<OriginalPassage | null>(null);
    const [passageRef, setPassageRef] = useState<string>('');
    const [isLoadingPassage, setIsLoadingPassage] = useState<boolean>(false);
    const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);
    const [isScrolling, setIsScrolling] = useState(false);
    
    const [selectedTestament, setSelectedTestament] = useState<'구약성경' | '신약성경'>('구약성경');
    const [selectedBook, setSelectedBook] = useState<string>(OLD_TESTAMENT_BOOKS[0]);
    const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
    const [currentBookStructure, setCurrentBookStructure] = useState<BibleBookStructure | null>(null);
    
    const [apiKeyNeeded, setApiKeyNeeded] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);

    const [isTrackerVisible, setIsTrackerVisible] = useState(false);

    const [chapterAudioState, setChapterAudioState] = useState<ChapterAudioState>('idle');
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [currentlyPlayingVerse, setCurrentlyPlayingVerse] = useState<string | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const activeAudioSources = useRef(new Set<AudioBufferSourceNode>());
    const playbackController = useRef<{ isCancelled: boolean } | null>(null);
    const verseRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const mainRef = useRef<HTMLElement>(null);

    const hoverTimeoutRef = useRef<number | null>(null);
    const hideTimeoutRef = useRef<number | null>(null);
    const scrollTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        const key = process.env.API_KEY || sessionStorage.getItem('GEMINI_API_KEY');
        if (!key) {
            setApiKeyNeeded(true);
        } else {
            setApiKeyNeeded(false);
        }
    }, []);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolling(true);
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
            }
            setTooltipData(null);

            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
            scrollTimeoutRef.current = window.setTimeout(() => {
                setIsScrolling(false);
            }, 150);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        // This effect should only run when the selected book changes.
        // It resets the chapter, passage, and other related states.
        setSelectedChapter(null);
        setPassage('');
        setOriginalPassage(null);
        setPassageRef('');
        setCurrentBookStructure(BIBLE_STRUCTURE[selectedBook] || null);
    }, [selectedBook]);

    const cleanupChapterAudio = useCallback(() => {
        if (playbackController.current) {
            playbackController.current.isCancelled = true;
            playbackController.current = null;
        }
        activeAudioSources.current.forEach(source => {
            try { source.stop(); } catch (e) {}
            source.disconnect();
        });
        activeAudioSources.current.clear();
        setChapterAudioState('idle');
        setCurrentlyPlayingVerse(null);
    }, []);

    useEffect(() => {
        return () => cleanupChapterAudio();
    }, [cleanupChapterAudio]);

    const handleTestamentChange = (testament: '구약성경' | '신약성경') => {
        setSelectedTestament(testament);
        const newBook = testament === '구약성경' ? OLD_TESTAMENT_BOOKS[0] : NEW_TESTAMENT_BOOKS[0];
        setSelectedBook(newBook);
    };

    const handleBookChange = (book: string) => {
        setSelectedBook(book);
    };
    
    const handleApiKeySubmit = (apiKey: string) => {
        if (apiKey.trim()) {
            setSessionApiKey(apiKey.trim());
            setApiKeyNeeded(false);
            setApiError(null);
        }
    };
    
    const consumeStream = async (stream: AsyncGenerator<string>) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of stream) { /* consume to cache */ }
    };

    const handlePassageSelect = useCallback(async (book: string, chapter: string) => {
        if (apiKeyNeeded) return;
        
        mainRef.current?.scrollIntoView({ behavior: 'smooth' });
        cleanupChapterAudio();
        setSelectedChapter(chapter);
        setIsLoadingPassage(true);
        setPassage('');
        setOriginalPassage(null);
        setTooltipData(null);
        setApiError(null);
        verseRefs.current = {};

        try {
            // Fetch original passage in the background, don't wait for it
            getOriginalPassageText(book, chapter, selectedTestament)
                .then(setOriginalPassage)
                .catch(err => {
                    console.error('Failed to fetch original passage:', err);
                     setApiError('원어 본문을 가져오는 데 실패했습니다.');
                });

            const verseCount = BIBLE_STRUCTURE[book]?.[chapter];

            // Stream the main passage text
            const stream = streamPassageText(book, chapter, verseCount);
            let fullText = '';
            for await (const chunk of stream) {
                fullText += chunk;
                setPassage(fullText);
            }

            setPassageRef(`${book} ${chapter}장`);

            // Pre-fetching for smoother navigation
            const chapters = Object.keys(BIBLE_STRUCTURE[book] || {});
            const currentChapterIndex = chapters.indexOf(chapter);
            
            const prefetchChapter = (b: string, c: string, testament: '구약성경' | '신약성경') => {
                const vc = BIBLE_STRUCTURE[b]?.[c];
                consumeStream(streamPassageText(b, c, vc)).catch(err => console.warn(`[Pre-fetch] Failed: ${b} ${c}`, err));
                getOriginalPassageText(b, c, testament).catch(err => console.warn(`[Pre-fetch Original] Failed: ${b} ${c}`, err));
            };

            if (currentChapterIndex < chapters.length - 1) {
                const nextChapter = chapters[currentChapterIndex + 1];
                prefetchChapter(book, nextChapter, selectedTestament);
            }
            if (currentChapterIndex > 0) {
                const prevChapter = chapters[currentChapterIndex - 1];
                prefetchChapter(book, prevChapter, selectedTestament);
            }

        } catch (error) {
            console.error('Failed to fetch passage:', error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            setPassage(`본문을 가져오는 데 실패했습니다: ${errorMessage}`);
            if (errorMessage.includes("API")) {
                setApiError(errorMessage);
            }
        } finally {
            setIsLoadingPassage(false);
        }
    }, [apiKeyNeeded, selectedTestament, cleanupChapterAudio]);

    const handlePlayChapter = useCallback(async () => {
        if (playbackController.current && !playbackController.current.isCancelled) {
            cleanupChapterAudio();
            return;
        }
    
        if (chapterAudioState === 'loading' || !passage) return;
    
        setChapterAudioState('loading');
    
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
    
        const controller = { isCancelled: false };
        playbackController.current = controller;
    
        const streamAndPlay = async () => {
            const audioContext = audioContextRef.current!;
            let nextStartTime = audioContext.currentTime;
    
            const verses = passage.split('\n').filter(line => line.trim() !== '').map(line => {
                const match = line.match(/^(\d+)\.\s*(.*)/);
                return match ? { number: match[1], text: match[2].replace(/^\d+\.\s*/gm, '') } : null;
            }).filter((v): v is { number: string; text: string } => v !== null);
    
            const prefetchCount = 5; // Increase prefetch for smoother playback
            const audioPromises: Promise<{ buffer: AudioBuffer, verseNumber: string } | null>[] = [];
    
            const fetchAndDecode = async (verse: { number: string, text: string }): Promise<{ buffer: AudioBuffer, verseNumber: string } | null> => {
                try {
                    const base64Audio = await getVersePronunciation(verse.text);
                    if (controller.isCancelled) return null;
                    const buffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
                    if (controller.isCancelled) return null;
                    return { buffer, verseNumber: verse.number };
                } catch (err) {
                    console.error(`Error pre-fetching audio for verse ${verse.number}:`, err);
                    return null; // Return null on error instead of throwing
                }
            };
    
            for (let i = 0; i < Math.min(prefetchCount, verses.length); i++) {
                audioPromises.push(fetchAndDecode(verses[i]));
            }
    
            setChapterAudioState('playing');
    
            for (let i = 0; i < verses.length; i++) {
                if (controller.isCancelled) break;
    
                const nextVerseIndex = i + prefetchCount;
                if (nextVerseIndex < verses.length) {
                    audioPromises.push(fetchAndDecode(verses[nextVerseIndex]));
                }
    
                const audioResult = await audioPromises[i];
                if (controller.isCancelled) break;
    
                if (audioResult) {
                    const { buffer, verseNumber } = audioResult;
                    nextStartTime = Math.max(nextStartTime, audioContext.currentTime);
    
                    const delay = (nextStartTime - audioContext.currentTime) * 1000;
                    setTimeout(() => {
                        if (controller.isCancelled) return;
                        setCurrentlyPlayingVerse(verseNumber);
                        verseRefs.current[verseNumber]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, Math.max(0, delay));
    
                    const source = audioContext.createBufferSource();
                    source.buffer = buffer;
                    source.playbackRate.value = playbackRate;
                    source.connect(audioContext.destination);
    
                    activeAudioSources.current.add(source);
                    source.onended = () => activeAudioSources.current.delete(source);
    
                    source.start(nextStartTime);
                    nextStartTime += buffer.duration / playbackRate;
                } else {
                    console.error(`Skipping verse ${verses[i].number} due to audio fetch failure.`);
                }
            }
    
            if (!controller.isCancelled) {
                const finalCleanupDelay = (nextStartTime - audioContext.currentTime) * 1000;
                setTimeout(() => {
                    if (!playbackController.current?.isCancelled) {
                        cleanupChapterAudio();
                    }
                }, Math.max(0, finalCleanupDelay) + 500);
            }
        };
    
        streamAndPlay().catch(err => {
            console.error("Audio streaming failed:", err);
            if (!controller.isCancelled) {
                setChapterAudioState('error');
                cleanupChapterAudio();
            }
        });
    }, [passage, chapterAudioState, playbackRate, cleanupChapterAudio]);

    const handlePlaybackRateChange = (rate: number) => {
        const wasPlaying = chapterAudioState === 'playing' || chapterAudioState === 'loading';
        if (wasPlaying) {
            cleanupChapterAudio();
        }
        setPlaybackRate(rate);
        if (wasPlaying) {
            setTimeout(() => handlePlayChapter(), 100); 
        }
    };

    const cancelHideTooltip = useCallback(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
    }, []);

    const scheduleHideTooltip = useCallback(() => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        hideTimeoutRef.current = window.setTimeout(() => {
            setTooltipData(null);
        }, 300);
    }, []);

    const handleWordHover = useCallback((word: string, verseNumber: string, event: React.MouseEvent<HTMLSpanElement>) => {
        if (apiKeyNeeded || isScrolling) return;
        cancelHideTooltip();

        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }

        const cleanedWord = word.replace(/[.,;:?!()"']/g, '');
        if (!cleanedWord) return;

        hoverTimeoutRef.current = window.setTimeout(async () => {
            setTooltipData({
                x: event.clientX,
                y: event.clientY,
                word: cleanedWord,
                verseNumber: verseNumber,
                definition: null,
                isLoading: true,
                error: null,
            });

            try {
                const definition = await getWordDefinition(cleanedWord, passage);
                setTooltipData((prev) => prev && prev.word === cleanedWord ? { ...prev, definition, isLoading: false } : prev);
            } catch (error) {
                console.error('Failed to get word definition:', error);
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
                 if (errorMessage.includes("API")) {
                    setApiError(errorMessage);
                }
                setTooltipData((prev) => prev && prev.word === cleanedWord ? { ...prev, error: `'${cleanedWord}'의 뜻을 찾지 못했습니다.`, isLoading: false } : prev);
            }
        }, 800);

    }, [passage, cancelHideTooltip, apiKeyNeeded, isScrolling]);

    const chapters = currentBookStructure ? Object.keys(currentBookStructure) : [];
    const currentChapterIndex = selectedChapter ? chapters.indexOf(selectedChapter) : -1;

    const canGoToPrev = currentChapterIndex > 0;
    const canGoToNext = currentChapterIndex > -1 && currentChapterIndex < chapters.length - 1;

    const goToPrevChapter = () => {
        if (canGoToPrev) {
            const prevChapter = chapters[currentChapterIndex - 1];
            handlePassageSelect(selectedBook, prevChapter);
        }
    };

    const goToNextChapter = () => {
        if (canGoToNext && selectedChapter) {
            const nextChapter = chapters[currentChapterIndex + 1];
            handlePassageSelect(selectedBook, nextChapter);
        }
    };

    const registerVerseRef = useCallback((verseNumber: string, element: HTMLDivElement | null) => {
        verseRefs.current[verseNumber] = element;
    }, []);

    const showFloatingPlayer = passage && !isLoadingPassage;

    return (
        <div className="min-h-screen p-4 sm:p-8 flex flex-col">
            <div className="flex-grow">
                {showFloatingPlayer && (
                    <FloatingPlayer
                        passageRef={passageRef}
                        audioState={chapterAudioState}
                        onPlayPause={handlePlayChapter}
                        playbackRate={playbackRate}
                        onRateChange={handlePlaybackRateChange}
                    />
                )}
                <div className={`max-w-6xl mx-auto transition-all duration-300 ${showFloatingPlayer ? 'pt-24' : ''}`}>
                    <header className="text-center mb-12">
                        <div className="flex justify-center items-center gap-4 mb-4">
                            <h1 className="text-4xl sm:text-5xl font-bold text-cyan-800 tracking-tight">원어 성경 분석기</h1>
                            <button 
                                onClick={() => setIsTrackerVisible(true)}
                                className="bg-cyan-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-cyan-700 transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                            >
                                나의 성경통독표
                            </button>
                        </div>
                        <p className="text-lg text-gray-600 max-w-2xl mx-auto">성경 본문에 마우스를 올리면 원어 단어의 뜻과 문법을 분석해줍니다.</p>
                    </header>

                    <main ref={mainRef}>
                        <PassageSelector 
                            onPassageSelect={handlePassageSelect}
                            selectedTestament={selectedTestament}
                            onTestamentChange={handleTestamentChange}
                            selectedBook={selectedBook}
                            onBookChange={handleBookChange}
                            bookStructure={currentBookStructure}
                            selectedChapter={selectedChapter}
                            onApiKeySubmit={handleApiKeySubmit}
                            apiKeyNeeded={apiKeyNeeded}
                            apiError={apiError}
                        />
                        
                        <div 
                            onMouseLeave={scheduleHideTooltip}
                            className={`bg-white border border-gray-200/80 p-6 sm:p-8 rounded-xl shadow-lg mt-8 transition-all duration-500 ${!passage ? 'min-h-[20rem] flex justify-center items-center' : 'opacity-100'}`}
                        >
                            {isLoadingPassage && !passage && (
                                <div className="flex items-center text-gray-500"><Spinner /><span className="ml-3 text-lg">본문을 스트리밍하는 중입니다...</span></div>
                            )}
                            {!isLoadingPassage && !passage && (
                                <div className="text-center text-gray-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v11.494m-9-5.747h18" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15.536 8.464l-7.072 7.072M8.464 8.464l7.072 7.072" />
                                    </svg>
                                    <p className="mt-4 text-lg">
                                        위에서 성경과 장을 선택하여 본문을 표시하세요.
                                    </p>
                                </div>

                            )}
                            {passage && (
                                <div className="w-full animate-[fadeIn_0.5s_ease-in-out]">
                                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 border-b border-gray-200 pb-4">
                                        <h2 className="text-3xl font-bold text-cyan-800">{passageRef}</h2>
                                        <AudioControls 
                                            audioState={chapterAudioState}
                                            onPlayPause={handlePlayChapter}
                                            playbackRate={playbackRate}
                                            onRateChange={handlePlaybackRateChange}
                                        />
                                    </div>
                                    <BibleText 
                                        text={passage} 
                                        onWordHover={handleWordHover}
                                        originalPassage={originalPassage}
                                        testament={selectedTestament}
                                        tooltipData={tooltipData}
                                        registerVerseRef={registerVerseRef}
                                        currentlyPlayingVerse={currentlyPlayingVerse}
                                    />
                                </div>
                            )}
                        </div>
                    </main>
                    <WordTooltip 
                        data={tooltipData} 
                        onMouseEnter={cancelHideTooltip} 
                        onMouseLeave={scheduleHideTooltip} 
                    />
                    <BibleTrackerModal 
                        isOpen={isTrackerVisible}
                        onClose={() => setIsTrackerVisible(false)}
                    />
                </div>
            </div>
             {passage && !isLoadingPassage && (
                <footer className="w-full mt-12 py-6 bg-gray-50/50 border-t border-gray-200/80">
                    <div className="max-w-3xl mx-auto flex justify-between items-center px-4 sm:px-0">
                        <button
                            onClick={goToPrevChapter}
                            disabled={!canGoToPrev || isLoadingPassage}
                            className="flex items-center gap-2 px-5 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-gray-800 font-semibold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:-translate-y-0.5"
                            aria-label="이전 장으로 이동"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            이전 장
                        </button>
                        <button
                            onClick={goToNextChapter}
                            disabled={!canGoToNext || isLoadingPassage}
                            className="flex items-center gap-2 px-5 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-gray-800 font-semibold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:-translate-y-0.5"
                            aria-label="다음 장으로 이동"
                        >
                            다음 장
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                </footer>
            )}
             <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.5s ease-in-out;
                }
            `}</style>
        </div>
    );
};

export default App;