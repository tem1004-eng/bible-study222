import React, { useState } from 'react';
import { OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS, BibleBookStructure } from '../types';

interface PassageSelectorProps {
  onPassageSelect: (book: string, chapter: string) => void;
  selectedTestament: '구약성경' | '신약성경';
  onTestamentChange: (testament: '구약성경' | '신약성경') => void;
  selectedBook: string;
  onBookChange: (book: string) => void;
  bookStructure: BibleBookStructure | null;
  selectedChapter: string | null;
  onApiKeySubmit: (apiKey: string) => void;
  apiKeyNeeded: boolean;
  apiError: string | null;
}

const ApiKeyForm: React.FC<{ onApiKeySubmit: (key: string) => void; apiError: string | null }> = ({ onApiKeySubmit, apiError }) => {
    const [apiKeyInput, setApiKeyInput] = useState('');
    
    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onApiKeySubmit(apiKeyInput);
    };

    return (
        <div className="w-full max-w-sm p-6 bg-white rounded-lg shadow-2xl border border-gray-200">
            <p className="text-red-500 font-semibold mb-2 text-lg">API 키가 필요합니다</p>
            <p className="text-gray-600 mb-4 text-sm">
                이 앱을 사용하려면 Gemini API 키가 필요합니다.
                <br />
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-cyan-600 underline hover:text-cyan-800">Google AI Studio</a>
                에서 API 키를 발급받아 아래에 입력해주세요.
            </p>
            <form onSubmit={handleFormSubmit}>
                <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Google Gemini API 키를 여기에 붙여넣으세요"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    aria-label="Google Gemini API Key"
                />
                {apiError && <p className="text-red-500 text-sm mt-2">{apiError}</p>}
                <button
                    type="submit"
                    className="mt-3 w-full bg-cyan-600 text-white font-bold py-2 px-4 rounded-md hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-colors shadow-md"
                >
                    API 키 저장 및 계속
                </button>
            </form>
        </div>
    );
};

const PassageSelector: React.FC<PassageSelectorProps> = ({ 
    onPassageSelect,
    selectedTestament,
    onTestamentChange,
    selectedBook,
    onBookChange,
    bookStructure,
    selectedChapter,
    onApiKeySubmit,
    apiKeyNeeded,
    apiError,
}) => {
  const chapters = bookStructure ? Object.keys(bookStructure) : [];
  const booksToShow = selectedTestament === '구약성경' ? OLD_TESTAMENT_BOOKS : NEW_TESTAMENT_BOOKS;

  const showApiKeyForm = apiKeyNeeded || (apiError && apiError.includes("API 키가 설정되지 않았습니다"));

  return (
    <div className="p-4 bg-white/60 border border-gray-200/80 rounded-xl shadow-lg flex flex-col md:flex-row gap-4 md:h-[400px]">
      {/* Left Panel: Testament and Book Selection */}
      <div className="w-full md:w-1/3 flex flex-col border-b-2 md:border-b-0 md:border-r-2 border-gray-200 pb-4 md:pb-0 md:pr-4">
        <div className="flex-shrink-0 flex gap-2 mb-4">
          <button
            onClick={() => onTestamentChange('구약성경')}
            className={`w-full py-2 px-4 rounded-lg transition-all duration-200 font-semibold ${
              selectedTestament === '구약성경' ? 'bg-cyan-600 text-white shadow-md' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            구약성경
          </button>
          <button
            onClick={() => onTestamentChange('신약성경')}
            className={`w-full py-2 px-4 rounded-lg transition-all duration-200 font-semibold ${
              selectedTestament === '신약성경' ? 'bg-cyan-600 text-white shadow-md' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            신약성경
          </button>
        </div>
        <div className="flex-grow overflow-y-auto pr-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 gap-2">
            {booksToShow.map((book) => (
              <button
                key={book}
                onClick={() => onBookChange(book)}
                className={`w-full text-left p-2 rounded-md transition-colors duration-200 text-sm ${
                  selectedBook === book ? 'bg-cyan-500 text-white font-bold shadow' : 'bg-white hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {book}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel: Chapter Selection */}
      <div className="w-full md:w-2/3 flex flex-col">
        <h3 className="flex-shrink-0 text-xl font-bold mb-4 text-gray-700 text-center pb-2 border-b border-gray-200">{selectedBook}</h3>
        <div className="flex-grow overflow-y-auto flex justify-center items-center relative">
            {chapters.length > 0 ? (
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1 pr-2 w-full">
                    {chapters.map((chapter) => (
                        <button
                            key={chapter}
                            onClick={() => onPassageSelect(selectedBook, chapter)}
                            className={`
                                py-1 px-2 text-sm rounded border transition-all duration-200 text-center font-semibold aspect-square
                                ${selectedChapter === chapter 
                                    ? 'bg-cyan-500 text-white border-cyan-500 shadow-inner' 
                                    : 'bg-white hover:bg-gray-100 border-gray-300 hover:border-gray-400'
                                }
                            `}
                        >
                            {chapter}
                        </button>
                    ))}
                </div>
            ) : (
                !showApiKeyForm && <p className="text-gray-500">성경을 선택하세요.</p>
            )}

            {showApiKeyForm && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-b-lg md:rounded-r-lg">
                    <ApiKeyForm onApiKeySubmit={onApiKeySubmit} apiError={apiError} />
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default PassageSelector;