import { GoogleGenAI, Modality, Type, GenerateContentResponse } from '@google/genai';
import { WordDefinition, OriginalPassage, VerseAnalysisItem } from '../types';

let ai: GoogleGenAI | null = null;
let currentApiKey: string | null = null;

function getAiClient(): GoogleGenAI {
    const apiKey = process.env.API_KEY || sessionStorage.getItem('GEMINI_API_KEY');

    if (!apiKey) {
        throw new Error("API 키가 설정되지 않았습니다. API 키를 입력하거나, 배포 플랫폼(Vercel 등)의 환경 변수 설정을 확인해주세요.");
    }

    if (!ai || currentApiKey !== apiKey) {
        ai = new GoogleGenAI({ apiKey: apiKey });
        currentApiKey = apiKey;
    }

    return ai;
}

export function setSessionApiKey(key: string) {
    sessionStorage.setItem('GEMINI_API_KEY', key);
    // Invalidate the old client instance so a new one is created on next call
    ai = null;
    currentApiKey = null;
}

const definitionSchema = {
  type: Type.OBJECT,
  properties: {
    originalWord: { type: Type.STRING, description: '원어(히브리어 또는 그리스어) 단어.' },
    transliteration: { type: Type.STRING, description: '원어 단어의 로마자 음역.' },
    partOfSpeech: { type: Type.STRING, description: '원어 단어의 품사.' },
    gender: { type: Type.STRING, description: '문법적 성 (남성, 여성, 중성, 또는 해당 없음).' },
    number: { type: Type.STRING, description: '문법적 수 (단수, 복수, 또는 해당 없음).' },
    case: { type: Type.STRING, description: '문법적 격 (주격, 소유격 등, 또는 해당 없음).' },
    basicMeaning: { type: Type.STRING, description: '단어의 핵심 의미와 주요 용법을 간결하게 설명하는 한글 정의.' },
  },
  required: ['originalWord', 'transliteration', 'partOfSpeech', 'gender', 'number', 'case', 'basicMeaning'],
};

export async function* streamPassageText(book: string, chapter: string, verseCount?: number): AsyncGenerator<string> {
    const cacheKey = `passage:${book}:${chapter}`;
    const cachedText = sessionStorage.getItem(cacheKey);

    if (cachedText) {
        yield cachedText;
        return;
    }
    
    const ai = getAiClient();
    const model = 'gemini-2.5-flash';
    
    let prompt = `성경 ${book} ${chapter}장의 본문을 '개역개정판'으로 제공해 주세요.`;
    if (verseCount) {
        prompt += ` 이 장은 총 ${verseCount}절로 이루어져 있습니다. 1절부터 ${verseCount}절까지 모든 내용을 빠짐없이 포함해주세요.`;
    }
    prompt += ` 각 절은 줄을 바꿔서 절 번호와 마침표로 시작하게 해주세요 (예: "1. [절 내용]"). 다른 제목이나 설명 없이 본문만 포함해주세요.`;

    const responseStream = await ai.models.generateContentStream({
        model,
        contents: prompt,
    });

    let fullText = '';
    for await (const chunk of responseStream) {
        const chunkText = chunk.text;
        if (chunkText) {
            fullText += chunkText;
            yield chunkText;
        }
    }

    if (fullText) {
        sessionStorage.setItem(cacheKey, fullText.trim());
    }
}


export async function getOriginalPassageText(book: string, chapter: string, testament: '구약성경' | '신약성경'): Promise<OriginalPassage> {
    const cacheKey = `original-passage:${book}:${chapter}`;
    const cachedText = sessionStorage.getItem(cacheKey);
    if (cachedText) {
        return Promise.resolve(JSON.parse(cachedText));
    }

    const ai = getAiClient();
    const model = 'gemini-2.5-flash';
    const language = testament === '구약성경' ? '히브리어' : '헬라어(코이네 그리스어)';
    const prompt = `성경 ${book} ${chapter}장의 본문을 원어(${language})로 제공해 주세요. 각 절의 내용은 JSON 형식으로, 절 번호를 키로 하고 절 내용을 값으로 하는 객체로 만들어 주세요. 다른 제목이나 설명 없이 JSON 객체만 반환해주세요. 예: {"1": "원문 내용...", "2": "원문 내용..."}`;

    const response: GenerateContentResponse = await ai.models.generateContent({
        model,
        contents: prompt,
    });
    
    let text = response.text.trim();
    if (text.startsWith('```json')) {
        text = text.substring(7, text.length - 3).trim();
    }
    
    const passageData: OriginalPassage = JSON.parse(text);

    if (passageData) {
        sessionStorage.setItem(cacheKey, JSON.stringify(passageData));
    }

    return passageData;
}


export async function getWordDefinition(word: string, context: string): Promise<WordDefinition> {
  const ai = getAiClient();
  const model = 'gemini-2.5-flash';
  const prompt = `주어진 한국어 성경 단어와 문맥을 바탕으로, 해당하는 원어(히브리어/그리스어) 단어의 상세한 문법 정보와 기본 의미를 분석해주세요.

**매우 중요한 규칙:** 분석할 단어('${word}')에 한국어 조사('은/는', '이/가', '을/를', '의', '에', '에게' 등)가 포함된 경우, **절대로** 조사와 함께 분석하지 마세요. **반드시** 조사를 완벽하게 제거한 후, 단어의 기본형(원형)을 찾아서 그 원형에 대한 정보를 제공해야 합니다. 예를 들어, '${word}'가 '상자를'이라면, 당신의 분석 대상은 '상자'가 되어야 합니다.

- 분석할 단어: "${word}"
- 전체 문맥: "${context}"

**요청 정보:**
1.  **originalWord**: 원어(히브리어 또는 그리스어) 단어.
2.  **transliteration**: 원어 단어의 로마자 음역.
3.  **partOfSpeech**: 원어 단어의 품사.
4.  **gender**: 문법적 성 (예: '남성', '여성', '중성'). 문법적 성이 없는 품사일 경우 '해당 없음'으로 응답.
5.  **number**: 수 (예: '단수', '복수'). 문법적 수가 없는 품사일 경우 '해당 없음'으로 응답.
6.  **case**: 격 (예: '주격', '소유격', '여격', '대격', '호격'). 격이 없는 언어(히브리어 등)나 품사일 경우 '해당 없음'으로 응답.
7.  **basicMeaning**: 단어의 핵심적인 기본 의미를 간결하게 설명.

응답은 반드시 지정된 JSON 스키마를 따라야 합니다. 다른 설명 없이 JSON 객체만 반환해 주세요.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: definitionSchema,
    },
  });

  const jsonText = response.text.trim();
  return JSON.parse(jsonText);
}

export async function getWordPronunciation(originalWord: string): Promise<string> {
    const ai = getAiClient();
    const model = 'gemini-2.5-flash-preview-tts';
    const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: `Pronounce the following word: ${originalWord}` }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("No audio data received from API.");
    }
    return base64Audio;
}

export async function getVersePronunciation(verseText: string): Promise<string> {
    const ai = getAiClient();
    const model = 'gemini-2.5-flash-preview-tts';
    const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: verseText }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("No audio data received from API.");
    }
    return base64Audio;
}

const verseAnalysisSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            koreanWord: { type: Type.STRING, description: '한국어 번역의 단어 또는 구절.' },
            originalWord: { type: Type.STRING, description: '한국어 단어에 해당하는 원어(히브리어/그리스어) 단어 또는 구절.' },
            startTime: { type: Type.NUMBER, description: '음성 재생 시작 시간 (밀리초 단위).' },
            endTime: { type: Type.NUMBER, description: '음성 재생 종료 시간 (밀리초 단위).' },
        },
        required: ['koreanWord', 'originalWord', 'startTime', 'endTime'],
    }
};

export async function getVerseAnalysis(
    koreanVerse: string, 
    originalVerse: string, 
    language: '히브리어' | '헬라어', 
    audioDurationSeconds: number
): Promise<VerseAnalysisItem[]> {
    const ai = getAiClient();
    const model = 'gemini-2.5-pro'; // Use a more powerful model for this complex task
    const durationMs = Math.round(audioDurationSeconds * 1000);

    const prompt = `당신은 언어학과 음성학의 전문가입니다. 당신의 임무는 한국어와 원어(${language})로 제공된 성경 구절을 분석하는 것입니다. 두 가지 작업을 수행하고 결과를 단일 JSON 배열로 결합해야 합니다:

1.  **단어 정렬:** 한국어 번역의 단어들을 원어(${language}) 텍스트의 단어들과 정렬합니다.
2.  **단어 타이밍:** 전체 구절을 소리 내어 말할 때 각 원어 단어의 시작 및 종료 시간을 추정합니다. 음성 구절의 총 길이는 정확히 ${audioDurationSeconds.toFixed(2)}초입니다.

최종 JSON 출력은 객체의 배열이어야 합니다. 각 객체는 다음을 포함해야 합니다:
- \`koreanWord\`: 한국어 단어 또는 구절.
- \`originalWord\`: 해당하는 원어 단어 또는 구절.
- \`startTime\`: 음성 원어 단어의 예상 시작 시간 (밀리초 단위).
- \`endTime\`: 음성 원어 단어의 예상 종료 시간 (밀리초 단위).

**제약 조건:**
- 첫 단어의 \`startTime\`은 0이어야 합니다.
- 마지막 단어의 \`endTime\`은 ${durationMs}이어야 합니다.
- 한 단어의 \`endTime\`은 다음 단어의 \`startTime\`과 같아야 합니다.
- 배열의 단어들은 올바른 음성 순서여야 합니다.
- 일대다 또는 다대일 정렬이 가능합니다. 그에 따라 단어를 그룹화하세요. (예: "여호와께서" -> "וַיֹּאמֶר יְהוָה")

**입력:**
- 한국어 구절: "${koreanVerse}"
- 원어 (${language}) 구절: "${originalVerse}"

다른 설명 없이 JSON 배열만 응답으로 제공해 주세요.`;

    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: verseAnalysisSchema,
        },
    });

    const jsonText = response.text.trim();
    return JSON.parse(jsonText);
}