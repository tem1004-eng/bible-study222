import React from 'react';
import AudioControls from './AudioControls';
import { ChapterAudioState } from '../App';

interface FloatingPlayerProps {
    passageRef: string;
    audioState: ChapterAudioState;
    onPlayPause: () => void;
    playbackRate: number;
    onRateChange: (rate: number) => void;
}

const FloatingPlayer: React.FC<FloatingPlayerProps> = ({ 
    passageRef,
    audioState, 
    onPlayPause,
    playbackRate,
    onRateChange
}) => {
    return (
        <div className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md shadow-lg border-b border-gray-200/80">
            <div className="max-w-6xl mx-auto flex items-center justify-between p-2 sm:p-3 h-20">
                <h3 className="text-lg sm:text-xl font-bold text-cyan-800 hidden sm:block truncate pr-4">
                    {passageRef}
                </h3>
                <div className="flex-grow flex items-center justify-center sm:justify-start">
                    <AudioControls 
                        audioState={audioState}
                        onPlayPause={onPlayPause}
                        playbackRate={playbackRate}
                        onRateChange={onRateChange}
                    />
                </div>
                 <div className="w-0 sm:w-48 hidden sm:block"></div> {/* Spacer for centering the controls */}
            </div>
        </div>
    );
};

export default FloatingPlayer;