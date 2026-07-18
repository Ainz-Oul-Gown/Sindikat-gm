import { hapticImpact } from "../lib/haptics";
import { useState, useEffect } from 'react';
import { ChevronLeft, Brain, Cpu, ShieldAlert, Sparkles, Download, Trash, RefreshCw } from 'lucide-react';

interface AiScreenProps {
  onBack: () => void;
  worker: Worker | null;
}

export default function AiScreen({ onBack, worker }: AiScreenProps) {
  const [autoWhisper, setAutoWhisper] = useState(true);
  const [whisperModel, setWhisperModel] = useState('Xenova/whisper-tiny');
  const [searchSize, setSearchSize] = useState('0.00');
  const [whisperSize, setWhisperSize] = useState('0.00');
  const [totalSize, setTotalSize] = useState('0.00');

  const [searchLoading, setSearchLoading] = useState(false);
  const [whisperLoading, setWhisperLoading] = useState(false);
  const [searchProgress, setSearchProgress] = useState<number | null>(null);
  const [whisperProgress, setWhisperProgress] = useState<number | null>(null);

  const getModelSize = async (modelPath: string): Promise<number> => {
    let size = 0;
    try {
      const cache = await caches.open('transformers-cache');
      const requests = await cache.keys();
      for (const req of requests) {
        if (req.url.includes(modelPath)) {
          const response = await cache.match(req);
          if (response) {
            const blob = await response.blob();
            size += blob.size;
          }
        }
      }
    } catch (e) {}
    return size;
  };

  const deleteModel = async (modelPath: string) => {
    try {
      const cache = await caches.open('transformers-cache');
      const requests = await cache.keys();
      for (const req of requests) {
        if (req.url.includes(modelPath)) {
          await cache.delete(req);
        }
      }
    } catch (e) {}
  };

  const calculateSizes = async () => {
    const searchPath = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
    const searchBytes = await getModelSize(searchPath);
    const whisperBytes = await getModelSize(whisperModel);

    const sMB = (searchBytes / (1024 * 1024)).toFixed(2);
    const wMB = (whisperBytes / (1024 * 1024)).toFixed(2);
    const tMB = ((searchBytes + whisperBytes) / (1024 * 1024)).toFixed(2);

    setSearchSize(sMB);
    setWhisperSize(wMB);
    setTotalSize(tMB);
  };

  useEffect(() => {
    setAutoWhisper(localStorage.getItem('synd_auto_whisper') !== 'off');
    setWhisperModel(localStorage.getItem('synd_whisper_model') || 'Xenova/whisper-tiny');
  }, []);

  useEffect(() => {
    calculateSizes();
  }, [whisperModel]);

  // Set up listeners for worker feedback
  useEffect(() => {
    if (!worker) return;

    const handleWorkerMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setWhisperProgress(msg.percent);
      } else if (msg.type === 'ready') {
        setWhisperLoading(false);
        setWhisperProgress(null);
        calculateSizes();
hapticImpact("success");
      } else if (msg.type === 'error') {
        setWhisperLoading(false);
        setWhisperProgress(null);
        alert('Ошибка воркера: ' + msg.error);
      }
    };

    worker.addEventListener('message', handleWorkerMessage);
    return () => {
      worker.removeEventListener('message', handleWorkerMessage);
    };
  }, [worker]);

  const handleAutoWhisperToggle = (checked: boolean) => {
    setAutoWhisper(checked);
    localStorage.setItem('synd_auto_whisper', checked ? 'on' : 'off');
hapticImpact("selection");
  };

  const handleWhisperModelChange = (val: string) => {
    setWhisperModel(val);
    localStorage.setItem('synd_whisper_model', val);

    if (worker) {
      worker.postMessage({ type: 'change_model', model: val });
    }

hapticImpact("selection");
  };

  const handleDownloadSearch = async () => {
    setSearchLoading(true);
    setSearchProgress(0);

    try {
      const { pipeline } = await import('@xenova/transformers');
      await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
        quantized: true,
        progress_callback: (data: any) => {
          if (data.status === 'progress') {
            const percent = Math.round((data.loaded / data.total) * 100);
            setSearchProgress(percent);
          }
        },
      });

      setSearchProgress(null);
      calculateSizes();
hapticImpact("success");
    } catch (err: any) {
      alert('Ошибка загрузки: ' + err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleDeleteSearch = async () => {
    if (!confirm('Удалить модель поиска?')) return;
    await deleteModel('Xenova/paraphrase-multilingual-MiniLM-L12-v2');
    calculateSizes();
hapticImpact("success");
  };

  const handleDownloadWhisper = () => {
    if (!worker) return;
    setWhisperLoading(true);
    setWhisperProgress(0);
    worker.postMessage({ type: 'force_download' });
  };

  const handleDeleteWhisper = async () => {
    if (!confirm('Удалить модель Whisper?')) return;
    await deleteModel(whisperModel);
    calculateSizes();
hapticImpact("success");
  };

  const isSearchDownloaded = parseFloat(searchSize) > 0;
  const isWhisperDownloaded = parseFloat(whisperSize) > 0;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 select-none animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-5 px-1">
        <button
          onClick={onBack}
          className="text-blue-500 hover:text-blue-400 font-medium flex items-center gap-1 focus:outline-none"
        >
          <ChevronLeft className="w-5 h-5" /> Назад
        </button>
        <span className="font-semibold text-slate-200">Нейро-модуль</span>
        <button onClick={calculateSizes} className="text-blue-500 p-1">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Main card */}
      <div className="bg-slate-900/60 border border-slate-900 p-6 rounded-2xl flex flex-col items-center justify-center text-center mb-6 shadow-xl shadow-rose-900/5">
        <Brain className="w-14 h-14 text-rose-500 mb-4 animate-pulse" />
        <h3 className="text-3xl font-bold text-slate-100 mb-1">{totalSize} МБ</h3>
        <span className="text-xs text-slate-400 font-medium tracking-wide">
          Занято нейросетевыми моделями в кэше
        </span>
      </div>

      {/* Embedded Search Settings */}
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
        Семантический поиск
      </h3>

      <div className="bg-slate-900/40 border border-slate-900 p-5 rounded-2xl mb-6">
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="font-semibold text-slate-200 text-sm">Multilingual MiniLM</div>
            <div className="text-xs text-slate-400 mt-1 leading-relaxed">
              Продвинутое понимание смысла и контекста сообщений (Ru/En)
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center border-t border-slate-900 mt-4 pt-4 text-xs font-semibold">
          <span className="text-slate-500">Занято: {searchSize} МБ</span>
          <span className={isSearchDownloaded ? 'text-emerald-500' : 'text-blue-500'}>
            {isSearchDownloaded ? 'Установлена' : 'Не загружена'}
          </span>
        </div>

        {searchProgress !== null ? (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-400 mb-2">
              <span>Скачивание модели...</span>
              <span className="font-mono">{searchProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${searchProgress}%` }}
              />
            </div>
          </div>
        ) : isSearchDownloaded ? (
          <button
            onClick={handleDeleteSearch}
            className="mt-4 w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-sm font-semibold py-3 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-98"
          >
            <Trash className="w-4 h-4" /> Удалить модель поиска
          </button>
        ) : (
          <button
            onClick={handleDownloadSearch}
            disabled={searchLoading}
            className="mt-4 w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-sm font-semibold py-3 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-98"
          >
            <Download className="w-4 h-4" /> Скачать модель (~117 МБ)
          </button>
        )}
      </div>

      {/* Speech transcription Whisper model */}
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
        Распознавание речи
      </h3>

      {/* Auto transcription toggle */}
      <div className="flex items-center justify-between p-4 bg-slate-900/40 border border-slate-900/60 rounded-xl mb-3">
        <div>
          <div className="font-semibold text-slate-200 text-sm">Авто-расшифровка</div>
          <div className="text-xs text-slate-400 mt-1">Переводить новые ГС в текст</div>
        </div>

        <label className="relative inline-flex items-center cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoWhisper}
            onChange={(e) => handleAutoWhisperToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
        </label>
      </div>

      <div className="bg-slate-900/40 border border-slate-900 p-5 rounded-2xl mb-4">
        <label className="text-xs font-semibold text-slate-400 mb-2.5 block">
          Модель Whisper (Качество):
        </label>
        <div className="relative w-full mb-3">
          <select
            value={whisperModel}
            onChange={(e) => handleWhisperModelChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-900 text-slate-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none appearance-none"
          >
            <option value="Xenova/whisper-tiny">Tiny (Самая быстрая, ~40 МБ)</option>
            <option value="Xenova/whisper-base">Base (Средняя, ~75 МБ)</option>
            <option value="Xenova/whisper-small">Small (Точная, ~240 МБ)</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="flex justify-between items-center border-t border-slate-900 mt-4 pt-4 text-xs font-semibold">
          <span className="text-slate-500">Занято: {whisperSize} МБ</span>
          <span className={isWhisperDownloaded ? 'text-emerald-500' : 'text-blue-500'}>
            {isWhisperDownloaded ? 'Установлена' : 'Не загружена'}
          </span>
        </div>

        {whisperProgress !== null ? (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-400 mb-2">
              <span>Скачивание модели...</span>
              <span className="font-mono">{whisperProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${whisperProgress}%` }}
              />
            </div>
          </div>
        ) : isWhisperDownloaded ? (
          <button
            onClick={handleDeleteWhisper}
            className="mt-4 w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-sm font-semibold py-3 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-98"
          >
            <Trash className="w-4 h-4" /> Удалить модель Whisper
          </button>
        ) : (
          <button
            onClick={handleDownloadWhisper}
            disabled={whisperLoading}
            className="mt-4 w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-sm font-semibold py-3 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-98"
          >
            <Download className="w-4 h-4" /> Скачать выбранную модель
          </button>
        )}
      </div>
    </div>
  );
}
