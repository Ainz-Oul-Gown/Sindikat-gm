import { hapticImpact } from "../lib/haptics";
import { useState, useEffect } from 'react';
import { Search, Loader2, Sliders, Shield, Brain, Check, Calendar, HelpCircle } from 'lucide-react';
import { supabaseClient } from '../lib/supabase';
import { decryptText } from '../lib/crypto';
import { Message, DecryptedMessage } from '../types';
import { getEmbeddingPipeline } from '../lib/ai';

interface DeepSearchProps {
  chatId: string;
  aesKey: CryptoKey | null;
  userId: number;
}

export default function DeepSearch({ chatId, aesKey, userId }: DeepSearchProps) {
  const [query, setQuery] = useState('');
  const [isSemantic, setIsSemantic] = useState(false);
  const [threshold, setThreshold] = useState(0.4);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [statusText, setStatusText] = useState('');
  const [results, setResults] = useState<any[]>([]);

  const initAI = async () => {
    setStatusText('Запуск ИИ-модели...');
    return await getEmbeddingPipeline((percent) => {
      setDownloadProgress(percent);
    });
  };

  const cosineSimilarity = (vecA: number[] | Float32Array, vecB: number[] | Float32Array) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  const handleSearch = async () => {
    if (!query.trim() || !aesKey) return;
    setIsLoading(true);
    setResults([]);

    try {
      // Fetch entire chat history from DB
      const { data: messages, error } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('chat_id', chatId);

      if (error || !messages || messages.length === 0) {
        setResults([]);
        return;
      }

      let queryVector: Float32Array | null = null;

      if (isSemantic) {
        setStatusText('Подгружаем ИИ-модель (до 117 МБ)...');
        try {
          const ai = await initAI();
          setStatusText('Анализ смысла...');
          const output = await ai(query, { pooling: 'mean', normalize: true });
          queryVector = output.data;
        } catch (e: any) {
          console.error(e);
          alert('Ошибка ИИ-поиска: ' + e.message);
          setIsLoading(false);
          return;
        }
      }

      const found: any[] = [];

      for (const msg of messages) {
        try {
          // Decrypt text
          const decrypted = await decryptText(msg.encrypted_text, aesKey, userId, msg.sender_id);
          let plainText = decrypted.text;

          // Pretty formatting for special markers
          let displayText = plainText;
          if (plainText.startsWith('[VOICE]:')) {
            const parts = plainText.replace('[VOICE]:', '').split('|');
            let transText = 'Голосовое сообщение';
            for (let i = 1; i < parts.length; i++) {
              if (!parts[i].startsWith('WF:')) {
                transText = parts[i];
              }
            }
            displayText = `🎤 ${transText}`;
          } else if (plainText.startsWith('[GROUP_INVITE]:')) {
            const parts = plainText.replace('[GROUP_INVITE]:', '').split('|');
            const groupName = parts[1] || 'Неизвестная группа';
            displayText = `🎫 Приглашение в: ${groupName}`;
          }

          if (isSemantic && msg.encrypted_vector && queryVector) {
            // Decrypt encrypted vector
            const vecRaw = atob(msg.encrypted_vector);
            const vecBytes = new Uint8Array(vecRaw.length);
            for (let i = 0; i < vecRaw.length; i++) {
              vecBytes[i] = vecRaw.charCodeAt(i);
            }

            const decryptedVecBuffer = await window.crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: vecBytes.slice(0, 12) },
              aesKey,
              vecBytes.slice(12)
            );

            const msgVector = new Float32Array(decryptedVecBuffer);
            const score = cosineSimilarity(queryVector, msgVector);

            if (score >= threshold) {
              found.push({
                text: displayText,
                score,
                time: msg.created_at,
              });
            }
          } else if (!isSemantic) {
            if (displayText.toLowerCase().includes(query.toLowerCase())) {
              found.push({
                text: displayText,
                score: 1.0,
                time: msg.created_at,
              });
            }
          }
        } catch (err) {
          // Skip corrupt or un-decryptable messages
        }
      }

      if (isSemantic) {
        found.sort((a, b) => b.score - a.score);
      } else {
        found.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      }

      setResults(found);
    } catch (err: any) {
      alert('Ошибка поиска: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-1">
      {/* Search Input Box */}
      <div className="flex gap-2.5 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch();
          }}
          placeholder="Найти в переписке..."
          className="flex-grow bg-slate-900 border border-slate-800 text-slate-100 rounded-xl px-4 py-3 text-base focus:border-primary focus:ring-1 focus:ring-primary outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={isLoading}
          className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-xl px-5 flex items-center justify-center transition active:scale-95"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Search className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Semantic toggles and settings */}
      <div className="flex flex-col gap-3.5 bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-4">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2.5 cursor-pointer text-slate-200 select-none">
            <input
              type="checkbox"
              checked={isSemantic}
              onChange={(e) => {
                setIsSemantic(e.target.checked);
hapticImpact("selection");
              }}
              className="w-4.5 h-4.5 rounded text-primary bg-slate-950 border-slate-800 focus:ring-primary focus:ring-offset-0"
            />
            <div className="flex flex-col">
              <span className="font-semibold text-sm">ИИ-поиск по смыслу</span>
              <span className="text-xs text-slate-400">Находит близкие по значению фразы</span>
            </div>
          </label>

          {isSemantic && (
            <div className="flex items-center gap-2 text-slate-400">
              <Sliders className="w-4 h-4 text-primary" />
              <input
                type="range"
                min="0.3"
                max="0.8"
                step="0.05"
                value={threshold}
                onChange={(e) => {
                  setThreshold(parseFloat(e.target.value));
hapticImpact("selection");
                }}
                className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <span className="text-xs font-mono font-semibold text-primary w-8 text-right">
                {Math.round(threshold * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Results Area */}
      <div className="flex-grow overflow-y-auto min-h-[200px]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
            {downloadProgress !== null ? (
              <div className="flex flex-col items-center">
                <Brain className="w-12 h-12 text-primary animate-bounce mb-3" />
                <span className="font-semibold text-slate-200 mb-1">Загрузка ИИ-модели</span>
                <span className="text-xs text-slate-400 mb-3">Это нужно сделать только один раз</span>
                <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <span className="text-xs font-mono font-semibold text-primary">
                  {downloadProgress}%
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
                <span className="text-sm">{statusText}</span>
              </div>
            )}
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
            <HelpCircle className="w-10 h-10 text-slate-600 mb-2" />
            <span className="text-sm">Ничего не найдено</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {results.map((r, idx) => (
              <div
                key={idx}
                className="bg-slate-900 border border-slate-800 p-4 rounded-xl hover:border-slate-700 transition"
              >
                <div className="text-slate-100 text-sm mb-2 select-text whitespace-pre-wrap">
                  {r.text}
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(r.time).toLocaleDateString()} {new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isSemantic && (
                    <span className="text-emerald-400 font-mono font-semibold flex items-center gap-0.5">
                      <Brain className="w-3.5 h-3.5" />
                      {Math.round(r.score * 100)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
