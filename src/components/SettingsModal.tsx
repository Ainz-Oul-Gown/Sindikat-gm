import { hapticImpact } from "../lib/haptics";
import { useState, useEffect } from 'react';
import {
  X,
  Palette,
  Smartphone,
  Coins,
  Database,
  Brain,
  Key,
  Skull,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import CurrenciesScreen from './CurrenciesScreen';
import DevicesScreen from './DevicesScreen';
import StorageScreen from './StorageScreen';
import AiScreen from './AiScreen';
import { applyTheme } from '../lib/theme';

interface SettingsModalProps {
  userId: number;
  onClose: () => void;
  worker: Worker | null;
  onPanicWipe: () => void;
  onPinSetup: (type: 'normal' | 'panic') => void;
}

const THEME_COLORS = ['#0A84FF', '#FF2D55', '#32D74B', '#BF5AF2'];

export default function SettingsModal({
  userId,
  onClose,
  worker,
  onPanicWipe,
  onPinSetup,
}: SettingsModalProps) {
  const [activeScreen, setActiveScreen] = useState<'main' | 'currencies' | 'devices' | 'storage' | 'ai'>('main');
  const [accentColor, setAccentColor] = useState('#0A84FF');
  const [haptics, setHaptics] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [hasPanicPin, setHasPanicPin] = useState(false);

  useEffect(() => {
    // Read theme color
    const savedColor = localStorage.getItem('synd_theme_color') || '#0A84FF';
    setAccentColor(savedColor);

    // Read haptics
    setHaptics(localStorage.getItem('synd_haptics') !== 'off');

    // Read PIN status
    setHasPin(!!localStorage.getItem('synd_pin_hash'));
    setHasPanicPin(!!localStorage.getItem('synd_panic_pin_hash'));
  }, [activeScreen]);

  const handleColorSelect = (color: string) => {
    setAccentColor(color);
    localStorage.setItem('synd_theme_color', color);
    applyTheme(color);

hapticImpact("selection");
  };

  const handleHapticsToggle = (checked: boolean) => {
    setHaptics(checked);
    localStorage.setItem('synd_haptics', checked ? 'on' : 'off');

    hapticImpact("medium");
  };

  const handlePanicWipeClick = () => {
    if (
      confirm(
        '🚨 ВНИМАНИЕ!\n\nЭто действие мгновенно:\n1. Сотрет все RSA и AES ключи\n2. Удалит кэш сообщений\n3. Выбросит из аккаунта\n\nПродолжить?'
      )
    ) {
      onPanicWipe();
    }
  };

  if (activeScreen === 'currencies') {
    return (
      <div className="fixed inset-0 z-[1000] bg-slate-950 p-5 overflow-y-auto">
        <CurrenciesScreen userId={userId} onBack={() => setActiveScreen('main')} />
      </div>
    );
  }

  if (activeScreen === 'devices') {
    return (
      <div className="fixed inset-0 z-[1000] bg-slate-950 p-5 overflow-y-auto">
        <DevicesScreen userId={userId} onBack={() => setActiveScreen('main')} />
      </div>
    );
  }

  if (activeScreen === 'storage') {
    return (
      <div className="fixed inset-0 z-[1000] bg-slate-950 p-5 overflow-y-auto">
        <StorageScreen onBack={() => setActiveScreen('main')} />
      </div>
    );
  }

  if (activeScreen === 'ai') {
    return (
      <div className="fixed inset-0 z-[1000] bg-slate-950 p-5 overflow-y-auto">
        <AiScreen onBack={() => setActiveScreen('main')} worker={worker} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-2xl flex flex-col p-5 overflow-y-auto select-none animate-fade-in text-slate-100">
      {/* Header */}
      <div className="flex justify-between items-center pb-3 border-b border-slate-900 mb-6">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition focus:outline-none"
        >
          <X className="w-5 h-5" />
        </button>
        <span className="font-bold text-slate-200 text-lg">Настройки</span>
        <div className="w-10 h-10" />
      </div>

      <div className="flex flex-col gap-6">
        {/* Style and Feedback */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 px-1">
            Оформление и отклик
          </h3>

          <div className="bg-slate-900/40 border border-slate-900/60 rounded-2xl overflow-hidden divide-y divide-slate-900">
            {/* Color picker */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 text-slate-300">
                <Palette className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">Цвет темы</span>
              </div>
              <div className="flex gap-2.5">
                {THEME_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleColorSelect(color)}
                    style={{ backgroundColor: color }}
                    className={`w-6 h-6 rounded-full border-2 transition active:scale-95 ${
                      accentColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Haptic toggle */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 text-slate-300">
                <Smartphone className="w-5 h-5 text-slate-400" />
                <span className="text-sm font-medium">Вибрация (Тактильный отклик)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={haptics}
                  onChange={(e) => handleHapticsToggle(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
              </label>
            </div>
          </div>
        </div>

        {/* Primary Settings */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 px-1">
            Основные
          </h3>

          <div className="bg-slate-900/40 border border-slate-900/60 rounded-2xl overflow-hidden divide-y divide-slate-900">
            {/* Currencies */}
            <button
              onClick={() => setActiveScreen('currencies')}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/20 active:bg-slate-900/40 transition"
            >
              <div className="flex items-center gap-3 text-slate-300">
                <Coins className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">Мои валюты</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>

            {/* Devices */}
            <button
              onClick={() => setActiveScreen('devices')}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/20 active:bg-slate-900/40 transition"
            >
              <div className="flex items-center gap-3 text-slate-300">
                <Smartphone className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">Устройства</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* System Settings */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 px-1">
            Приложение
          </h3>

          <div className="bg-slate-900/40 border border-slate-900/60 rounded-2xl overflow-hidden divide-y divide-slate-900">
            {/* Storage */}
            <button
              onClick={() => setActiveScreen('storage')}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/20 active:bg-slate-900/40 transition"
            >
              <div className="flex items-center gap-3 text-slate-300">
                <Database className="w-5 h-5 text-purple-500" />
                <span className="text-sm font-medium">Данные и память</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>

            {/* AI */}
            <button
              onClick={() => setActiveScreen('ai')}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/20 active:bg-slate-900/40 transition"
            >
              <div className="flex items-center gap-3 text-slate-300">
                <Brain className="w-5 h-5 text-rose-500" />
                <span className="text-sm font-medium">Нейро-модуль</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Security Settings */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 px-1">
            Безопасность
          </h3>

          <div className="bg-slate-900/40 border border-slate-900/60 rounded-2xl overflow-hidden divide-y divide-slate-900">
            {/* Base PIN */}
            <button
              onClick={() => onPinSetup('normal')}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/20 active:bg-slate-900/40 transition"
            >
              <div className="flex items-center gap-3 text-slate-300">
                <Key className="w-5 h-5 text-amber-500" />
                <span className="text-sm font-medium">PIN-код для входа</span>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-slate-900 border border-slate-800 rounded-full px-2.5 py-1">
                {hasPin ? 'Вкл' : 'Выкл'}
              </span>
            </button>

            {/* Panic PIN - only visible if base pin is configured */}
            {hasPin && (
              <button
                onClick={() => onPinSetup('panic')}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/20 active:bg-slate-900/40 transition"
              >
                <div className="flex items-center gap-3 text-slate-300">
                  <ShieldCheck className="w-5 h-5 text-rose-500" />
                  <span className="text-sm font-medium">Тревожный PIN (Самоуничтожение)</span>
                </div>
                <span className="text-xs font-bold text-slate-500 bg-slate-900 border border-slate-800 rounded-full px-2.5 py-1">
                  {hasPanicPin ? 'Вкл' : 'Выкл'}
                </span>
              </button>
            )}

            {/* Panic Button */}
            <button
              onClick={handlePanicWipeClick}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-rose-500/5 active:bg-rose-500/10 text-rose-500 transition"
            >
              <Skull className="w-5 h-5 text-rose-500" />
              <span className="text-sm font-semibold">Экстренное стирание данных (Wipe)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
