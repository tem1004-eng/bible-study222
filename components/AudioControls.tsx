import React from 'react';
import Spinner from './Spinner';
import { ChapterAudioState } from '../App';

const PLAYBACK_RATES = [1.0, 1.3, 1.6, 2.0];

interface AudioControlsProps {
    audioState: ChapterAudioState;
    onPlayPause: () => void;
    playbackRate: number;
    onRateChange: (rate: number) => void;
}

const AudioControls: React.FC<AudioControlsProps> = ({ audioState, onPlayPause, playbackRate, onRateChange }) => {
    return (
        <div className="flex items-center gap-4">
            <button 
                onClick={onPlayPause} 
                aria-label="장 전체 듣기/일시정지" 
                className="text-cyan-700 hover:text-cyan-900 disabled:opacity-50 transition-transform transform hover:scale-110" 
                disabled={audioState === 'loading'}
            >
                {audioState === 'loading' ? <Spinner /> : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 20 20" fill="currentColor">
                        {audioState === 'playing' 
                            ? <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            : <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        }
                    </svg>
                )}
            </button>
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">속도:</span>
                {PLAYBACK_RATES.map(rate => (
                    <button 
                        key={rate}
                        onClick={() => onRateChange(rate)}
                        className={`px-2.5 py-1 text-sm font-semibold rounded-full transition-all duration-200 ${
                            playbackRate === rate 
                                ? 'bg-cyan-600 text-white shadow' 
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        {`${rate}x`}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default AudioControls;
