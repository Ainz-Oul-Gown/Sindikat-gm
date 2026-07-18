import { hapticImpact } from "../lib/haptics";
import { useState, useEffect } from 'react';
import * as idbKeyval from 'idb-keyval';
import { ChevronLeft, Database, Trash, HardDrive, RefreshCw, AlertCircle } from 'lucide-react';

interface StorageScreenProps {
  onBack: () => void;
}

export default function StorageScreen({ onBack }: StorageScreenProps) {
  const [chatSize, setChatSize] = useState('0.00');
  const [mediaSize, setMediaSize] = useState('0.00');
  const [totalSize, setTotalSize] = useState('0.00');
  const [cacheLimit, setCacheLimit] = useState(50); // MB
  const [loading, setLoading] = useState(false);

  const calculateStorage = async () => {
    setLoading(true);
    try {
      // 1. Calculate Chat history size in IDB
      const keys = await idbKeyval.keys();
      const chatKeys = keys.filter((k) => k.toString().startsWith('chat_hist_'));
      let chatBytes = 0;
      for (const k of chatKeys) {
        const data: any = await idbKeyval.get(k);
        if (data && data.history) {
          chatBytes += JSON.stringify(data.history).length * 2; // ~2 bytes per char
        }
      }

      // 2. Calculate Media cache size (syndicate-media-cache)
      let mediaBytes = 0;
      try {
        const hasMediaCache = await caches.has('syndicate-media-cache');
        if (hasMediaCache) {
          const cache = await caches.open('syndicate-media-cache');
          const requests = await cache.keys();
          for (const req of requests) {
            const response = await cache.match(req);
            if (response) {
              const blob = await response.blob();
              mediaBytes += blob.size;
            }
          }
        }
      } catch (e) {
        console.warn(e);
      }

      const chatMB = (chatBytes / (1024 * 1024)).toFixed(2);
      const mediaMB = (mediaBytes / (1024 * 1024)).toFixed(2);
      const totalMB = ((chatBytes + mediaBytes) / (1024 * 1024)).toFixed(2);

      setChatSize(chatMB);
      setMediaSize(mediaMB);
      setTotalSize(totalMB);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getCacheLimit = () => {
    const saved = localStorage.getItem('synd_cache_limit_mb');
    return saved ? parseInt(saved, 10) : 50;
  };

  useEffect(() => {
    setCacheLimit(getCacheLimit());
    calculateStorage();
  }, []);

  const enforceCacheLimit = async (limitMB: number) => {
    const limitBytes = limitMB * 1024 * 1024;
    const keys = await idbKeyval.keys();
    const chatKeys = keys.filter((k) => k.toString().startsWith('chat_hist_'));

    let totalBytes = 0;
    const cachesArr: { key: IDBValidKey; size: number; updated_at: number }[] = [];

    for (const k of chatKeys) {
      const data: any = await idbKeyval.get(k);
      if (data && data.history) {
        const size = JSON.stringify(data.history).length * 2;
        totalBytes += size;
        cachesArr.push({ key: k, size, updated_at: data.updated_at || Date.now() });
      }
    }

    if (totalBytes > limitBytes) {
      // Sort oldest caches first
      cachesArr.sort((a, b) => a.updated_at - b.updated_at);
      while (totalBytes > limitBytes && cachesArr.length > 0) {
        const oldest = cachesArr.shift();
        if (oldest) {
          await idbKeyval.del(oldest.key);
          totalBytes -= oldest.size;
        }
      }
    }
  };

  const handleLimitChange = async (val: number) => {
    setCacheLimit(val);
    localStorage.setItem('synd_cache_limit_mb', val.toString());
    await enforceCacheLimit(val);
    calculateStorage();

hapticImpact("selection");
  };

  const handleClearChats = async () => {
    if (
      !confirm(
        'Удалить кэш всех сообщений? \n\nЧаты будут грузиться из интернета чуть дольше, но ничего не потеряется.'
      )
    )
      return;

    const keys = await idbKeyval.keys();
    const chatKeys = keys.filter((k) => k.toString().startsWith('chat_hist_'));
    for (const k of chatKeys) {
      await idbKeyval.del(k);
    }

hapticImpact("success");
    calculateStorage();
  };

  const handleClearMedia = async () => {
    if (!confirm('Очистить кэш скачанных голосовых сообщений?')) return;

    try {
      await caches.delete('syndicate-media-cache');
    } catch (e) {
      console.error(e);
    }

hapticImpact("success");
    calculateStorage();
  };

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
        <span className="font-semibold text-slate-200">Данные и память</span>
        <button
          onClick={calculateStorage}
          disabled={loading}
          className="text-blue-500 hover:text-blue-400 p-1"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main card representation */}
      <div className="bg-slate-900/60 border border-slate-900/80 rounded-2xl p-6 flex flex-col items-center justify-center text-center mb-6 shadow-xl shadow-purple-900/5">
        <Database className="w-14 h-14 text-purple-500 mb-4 animate-pulse" />
        <h3 className="text-3xl font-bold text-slate-100 mb-1">{totalSize} МБ</h3>
        <span className="text-xs text-slate-400 font-medium tracking-wide">
          Использовано на этом устройстве
        </span>
      </div>

      {/* Cache limits */}
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
        Лимит кэширования
      </h3>

      <div className="bg-slate-900/40 border border-slate-900 p-5 rounded-2xl mb-6">
        <div className="flex justify-between items-center mb-4">
          <span className="font-semibold text-sm text-slate-200">Максимальный размер</span>
          <span className="font-bold text-purple-500">{cacheLimit} МБ</span>
        </div>

        <input
          type="range"
          min="10"
          max="500"
          step="10"
          value={cacheLimit}
          onChange={(e) => handleLimitChange(parseInt(e.target.value, 10))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500 mb-4"
        />

        <div className="flex justify-between text-[11px] text-slate-500 font-semibold mb-3">
          <span>10 МБ</span>
          <span>500 МБ</span>
        </div>

        <div className="flex gap-2 text-xs leading-relaxed text-slate-400 bg-purple-950/10 border border-purple-500/10 p-3.5 rounded-xl">
          <AlertCircle className="w-4.5 h-4.5 text-purple-500 flex-shrink-0 mt-0.5" />
          <span>
            При превышении лимита старые сообщения удаляются из памяти устройства. Они
            остаются на сервере в зашифрованном виде и подгружаются при скролле.
          </span>
        </div>
      </div>

      {/* Manual cleaner list */}
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
        Ручная очистка
      </h3>

      <div className="flex flex-col gap-3">
        {/* Chat Cache Cleaner */}
        <div className="flex items-center justify-between p-4 bg-slate-900/40 border border-slate-900/60 rounded-xl hover:bg-slate-900/60 transition">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-slate-100 text-base">Кэш переписки</div>
              <div className="text-xs text-slate-400 mt-0.5">{chatSize} МБ</div>
            </div>
          </div>

          <button
            onClick={handleClearChats}
            className="p-2.5 text-rose-500 hover:bg-rose-500/10 rounded-lg active:scale-95 transition"
          >
            <Trash className="w-5 h-5" />
          </button>
        </div>

        {/* Media Cache Cleaner */}
        <div className="flex items-center justify-between p-4 bg-slate-900/40 border border-slate-900/60 rounded-xl hover:bg-slate-900/60 transition">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-slate-100 text-base">Голосовые и медиа</div>
              <div className="text-xs text-slate-400 mt-0.5">{mediaSize} МБ</div>
            </div>
          </div>

          <button
            onClick={handleClearMedia}
            className="p-2.5 text-rose-500 hover:bg-rose-500/10 rounded-lg active:scale-95 transition"
          >
            <Trash className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
