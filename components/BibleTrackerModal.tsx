import React, { useState, useEffect } from 'react';
import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS, ReadingStatus } from '../types';
import { BIBLE_STRUCTURE } from '../data/bibleStructure';
import { getReadingStatus, isChapterRead, toggleChapterReadStatus } from '../utils/trackerUtils';

interface BibleTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BibleTrackerModal: React.FC<BibleTrackerModalProps> = ({ isOpen, onClose }) => {
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>({});
  const [activeTab, setActiveTab] = useState<'OT' | 'NT'>('OT');
  const [expandedBook, setExpandedBook] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReadingStatus(getReadingStatus());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBookClick = (book: string) => {
    setExpandedBook(prev => (prev === book ? null : book));
  };
  
  const handleChapterClick = (book: string, chapter: string) => {
    toggleChapterReadStatus(book, chapter);
    setReadingStatus(getReadingStatus()); // Re-fetch from storage to update UI
  };

  const booksToShow = activeTab === 'OT' ? OLD_TESTAMENT_BOOKS : NEW_TESTAMENT_BOOKS;
  
  const calculateProgress = (book: string) => {
      const chapters = Object.keys(BIBLE_STRUCTURE[book] || {});
      const totalChapters = chapters.length;
      if (totalChapters === 0) return { read: 0, total: 0, percentage: 0 };
      
      const readChapters = chapters.filter(ch => isChapterRead(readingStatus, book, ch)).length;
      return {
          read: readChapters,
          total: totalChapters,
          percentage: totalChapters > 0 ? Math.round((readChapters / totalChapters) * 100) : 0
      };
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex justify-between items-center p-4 border-b">
          <h2 className="text-2xl font-bold text-cyan-800">성경 통독 진행표</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">&times;</button>
        </header>
        
        <div className="p-4 border-b">
            <div className="flex gap-2">
                <button onClick={() => setActiveTab('OT')} className={`w-full py-2 px-4 rounded font-semibold ${activeTab === 'OT' ? 'bg-cyan-600 text-white' : 'bg-gray-200'}`}>구약</button>
                <button onClick={() => setActiveTab('NT')} className={`w-full py-2 px-4 rounded font-semibold ${activeTab === 'NT' ? 'bg-cyan-600 text-white' : 'bg-gray-200'}`}>신약</button>
            </div>
        </div>

        <main className="flex-grow overflow-y-auto p-4 space-y-2">
          {booksToShow.map(book => {
            const progress = calculateProgress(book);
            const isExpanded = expandedBook === book;
            return (
              <div key={book}>
                <button 
                    onClick={() => handleBookClick(book)} 
                    className="w-full text-left p-3 rounded-lg bg-gray-100 hover:bg-gray-200 flex justify-between items-center transition-colors"
                >
                    <span className="font-bold text-lg text-gray-800">{book}</span>
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-mono text-gray-600">{`${progress.read} / ${progress.total}`}</span>
                        <div className="w-24 bg-gray-300 rounded-full h-2.5">
                            <div className="bg-cyan-500 h-2.5 rounded-full" style={{ width: `${progress.percentage}%` }}></div>
                        </div>
                    </div>
                </button>
                {isExpanded && (
                  <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 p-4 bg-gray-50 rounded-b-lg border border-t-0">
                    {Object.keys(BIBLE_STRUCTURE[book] || {}).map(chapter => (
                      <button
                        key={chapter}
                        onClick={() => handleChapterClick(book, chapter)}
                        className={`
                            py-1 px-2 text-sm rounded border text-center font-semibold aspect-square flex items-center justify-center transition-colors cursor-pointer
                            ${isChapterRead(readingStatus, book, chapter)
                                ? 'bg-cyan-500 text-white border-cyan-500 hover:bg-cyan-600' 
                                : 'bg-white border-gray-300 hover:bg-gray-100'
                            }
                        `}
                      >
                        {chapter}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </main>
      </div>
    </div>
  );
};

export default BibleTrackerModal;