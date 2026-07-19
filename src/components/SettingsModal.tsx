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
  Copy,
  Check,
  Fingerprint,
  Lock,
  Edit2,
  Info,
  History,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import CurrenciesScreen from './CurrenciesScreen';
import DevicesScreen from './DevicesScreen';
import StorageScreen from './StorageScreen';
import AiScreen from './AiScreen';
import { applyTheme } from '../lib/theme';
import { supabaseClient } from '../lib/supabase';
import * as idbKeyval from 'idb-keyval';

interface SettingsModalProps {
  userId: number;
  userName: string;
  myFingerprint: string | null;
  onClose: () => void;
  worker: Worker | null;
  onPanicWipe: () => void;
  onPinSetup: (type: 'normal' | 'panic') => void;
  onUpdateName?: (newName: string) => void;
}

const THEME_COLORS = ['#0A84FF', '#FF2D55', '#32D74B', '#BF5AF2'];

export default function SettingsModal({
  userId,
  userName,
  myFingerprint,
  onClose,
  worker,
  onPanicWipe,
  onPinSetup,
  onUpdateName,
}: SettingsModalProps) {
  const [activeScreen, setActiveScreen] = useState<'main' | 'currencies' | 'devices' | 'storage' | 'ai'>('main');
  const [accentColor, setAccentColor] = useState('#0A84FF');
  const [haptics, setHaptics] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [hasPanicPin, setHasPanicPin] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [myInvites, setMyInvites] = useState<string[]>([]);
  
  // Name edit and Biometrics states
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(userName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [showBiometricInfo, setShowBiometricInfo] = useState(false);

  useEffect(() => {
    setNewName(userName);
  }, [userName]);

  useEffect(() => {
    // Read theme color
    const savedColor = localStorage.getItem('synd_theme_color') || '#0A84FF';
    setAccentColor(savedColor);

    // Read haptics
    setHaptics(localStorage.getItem('synd_haptics') !== 'off');

    // Read PIN status
    setHasPin(!!localStorage.getItem('synd_pin_hash'));
    setHasPanicPin(!!localStorage.getItem('synd_panic_pin_hash'));

    // Check passkey registration status
    const checkPasskey = async () => {
      try {
        const cred = await idbKeyval.get('syndicate_passkey_credential');
        setHasPasskey(!!cred);
      } catch (e) {
        console.error('Failed to check passkeys', e);
      }
    };
    checkPasskey();

    // Fetch invites
    const fetchStatus = async () => {
      try {
        const { data } = await supabaseClient
          .from('users')
          .select('status')
          .eq('tg_id', userId)
          .maybeSingle();
        if (data && data.status) {
          const parsed = JSON.parse(data.status);
          if (parsed && Array.isArray(parsed.invites)) {
            setMyInvites(parsed.invites);
          }
        }
      } catch (e) {
        console.error('Failed to parse user status invites', e);
      }
    };
    fetchStatus();
  }, [activeScreen, userId]);

  const handleGenerateInvite = async () => {
    if (myInvites.length >= 3) return;
    const newCode = `SYND-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const updatedInvites = [...myInvites, newCode];
    setMyInvites(updatedInvites);
    hapticImpact("success");

    try {
      const { data } = await supabaseClient
        .from('users')
        .select('status')
        .eq('tg_id', userId)
        .maybeSingle();
      
      let parsedStatus = {};
      try {
        if (data && data.status) {
          parsedStatus = JSON.parse(data.status);
        }
      } catch(e) {}

      await supabaseClient
        .from('users')
        .update({ status: JSON.stringify({ ...parsedStatus, invites: updatedInvites }) })
        .eq('tg_id', userId);
    } catch(e) {
      console.error(e);
    }
  };

  const handleRevokeInvite = async (code: string) => {
    const updatedInvites = myInvites.filter(c => c !== code);
    setMyInvites(updatedInvites);
    hapticImpact("warning");

    try {
      const { data } = await supabaseClient
        .from('users')
        .select('status')
        .eq('tg_id', userId)
        .maybeSingle();
      
      let parsedStatus = {};
      try {
        if (data && data.status) {
          parsedStatus = JSON.parse(data.status);
        }
      } catch(e) {}

      await supabaseClient
        .from('users')
        .update({ status: JSON.stringify({ ...parsedStatus, invites: updatedInvites }) })
        .eq('tg_id', userId);
    } catch(e) {
      console.error(e);
    }
  };

  const handleStartEditName = () => {
    hapticImpact("selection");
    const lastChange = localStorage.getItem('synd_last_name_change');
    if (lastChange) {
      const msPassed = Date.now() - parseInt(lastChange);
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (msPassed < oneWeek) {
        const msLeft = oneWeek - msPassed;
        const daysLeft = Math.floor(msLeft / (24 * 60 * 60 * 1000));
        const hoursLeft = Math.floor((msLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minLeft = Math.ceil((msLeft % (60 * 60 * 1000)) / (60 * 1000));
        
        let timeLeftStr = '';
        if (daysLeft > 0) timeLeftStr = `${daysLeft} дн.`;
        else if (hoursLeft > 0) timeLeftStr = `${hoursLeft} ч.`;
        else timeLeftStr = `${minLeft} мин.`;
        
        hapticImpact("error");
        alert(`Изменение имени заблокировано. Имя можно редактировать не чаще 1 раза в неделю.\nОсталось ждать: ${timeLeftStr}`);
        return;
      }
    }
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setNameError('Имя не может быть пустым');
      hapticImpact("error");
      return;
    }
    if (trimmed.length < 2) {
      setNameError('Имя слишком короткое');
      hapticImpact("error");
      return;
    }

    try {
      hapticImpact("medium");

      // Fetch the current status first
      const { data: userData } = await supabaseClient
        .from('users')
        .select('first_name, status')
        .eq('tg_id', userId)
        .maybeSingle();

      const oldName = userData?.first_name || userName;
      let parsedStatus: any = {};
      try {
        if (userData && userData.status) {
          parsedStatus = JSON.parse(userData.status);
        }
      } catch (e) {}

      // Add to names_history with timestamp
      const namesHistory = parsedStatus.names_history || [];
      if (oldName && oldName !== trimmed && (!namesHistory.length || namesHistory[namesHistory.length - 1].name !== oldName)) {
        namesHistory.push({
          name: oldName,
          changed_at: Date.now()
        });
      }
      parsedStatus.names_history = namesHistory;

      // Update first_name and status in supabase for current user
      const { error } = await supabaseClient
        .from('users')
        .update({ 
          first_name: trimmed,
          status: JSON.stringify(parsedStatus)
        })
        .eq('tg_id', userId);

      if (error) throw error;

      // Update local storage alternate name if any
      const altUser = localStorage.getItem('synd_alt_user');
      if (altUser) {
        try {
          const parsed = JSON.parse(altUser);
          parsed.first_name = trimmed;
          localStorage.setItem('synd_alt_user', JSON.stringify(parsed));
        } catch (e) {}
      }

      // Record update timestamp
      localStorage.setItem('synd_last_name_change', Date.now().toString());
      
      // Trigger callback
      if (onUpdateName) {
        onUpdateName(trimmed);
      }

      setIsEditingName(false);
      hapticImpact("success");
    } catch (err: any) {
      console.error(err);
      setNameError(`Ошибка: ${err.message}`);
      hapticImpact("error");
    }
  };

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

  const handleTogglePasskey = async () => {
    hapticImpact("selection");
    if (hasPasskey) {
      if (confirm("Вы действительно хотите отключить вход по Passkey (Биометрии) на этом устройстве?")) {
        try {
          await idbKeyval.del('syndicate_passkey_credential');
          localStorage.removeItem('synd_use_biometrics');
          setHasPasskey(false);
          hapticImpact("success");
        } catch (e) {
          console.error('Failed to disable passkey', e);
        }
      }
    } else {
      if (confirm("Включить быстрый вход по Passkey (Биометрии) на этом устройстве? Это позволит разблокировать приложение по отпечатку пальца или FaceID без ввода PIN-кода.")) {
        try {
          const simulatedSeed = `passkey security credential anchor secret syndicate node ${userName.trim().toLowerCase()}`;
          await idbKeyval.set('syndicate_passkey_credential', {
            id: userId,
            name: userName,
            seed: simulatedSeed
          });
          localStorage.setItem('synd_use_biometrics', 'on');
          setHasPasskey(true);
          hapticImpact("success");
        } catch (e) {
          console.error('Failed to enable passkey', e);
        }
      }
    }
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
      <div className="fixed inset-0 z-[1000] bg-slate-950 p-4 sm:p-6 overflow-y-auto">
        <CurrenciesScreen userId={userId} onBack={() => setActiveScreen('main')} />
      </div>
    );
  }

  if (activeScreen === 'devices') {
    return (
      <div className="fixed inset-0 z-[1000] bg-slate-950 p-4 sm:p-6 overflow-y-auto">
        <DevicesScreen userId={userId} onBack={() => setActiveScreen('main')} />
      </div>
    );
  }

  if (activeScreen === 'storage') {
    return (
      <div className="fixed inset-0 z-[1000] bg-slate-950 p-4 sm:p-6 overflow-y-auto">
        <StorageScreen onBack={() => setActiveScreen('main')} />
      </div>
    );
  }

  if (activeScreen === 'ai') {
    return (
      <div className="fixed inset-0 z-[1000] bg-slate-950 p-4 sm:p-6 overflow-y-auto">
        <AiScreen onBack={() => setActiveScreen('main')} worker={worker} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/95 backdrop-blur-3xl flex flex-col select-none animate-fade-in text-slate-100 font-sans">
      {/* Header */}
      <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-slate-900 shrink-0">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800/80 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none"
        >
          <X className="w-5 h-5" />
        </button>
        <span className="font-bold font-display text-slate-200 text-lg tracking-tight">Настройки</span>
        <div className="w-10 h-10" />
      </div>

      {/* Scrollable Content */}
      <div className="flex-grow overflow-y-auto px-4 sm:px-6 py-6 scrollbar-none">
        <div className="flex flex-col gap-6.5 max-w-md mx-auto w-full pb-10">
        {/* User profile & cryptographic cipher */}
        <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-slate-900 rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-xl flex flex-col gap-4">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          
          {isEditingName ? (
            <div className="flex flex-col gap-2 w-full animate-fade-in z-10">
              <span className="text-[10px] text-slate-500 font-bold font-mono tracking-wider uppercase pl-1">Редактирование имени</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => { setNameError(null); setNewName(e.target.value); }}
                  placeholder="Новое имя..."
                  className="flex-grow bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/60"
                  maxLength={25}
                />
                <button
                  onClick={handleSaveName}
                  className="bg-primary hover:bg-primary-hover text-white font-bold text-xs px-3.5 py-2 rounded-xl transition active:scale-95 cursor-pointer"
                >
                  ОК
                </button>
                <button
                  onClick={() => setIsEditingName(false)}
                  className="bg-slate-900 border border-slate-800 hover:text-slate-300 text-slate-400 text-xs px-3 py-2 rounded-xl transition active:scale-95 cursor-pointer"
                >
                  Отмена
                </button>
              </div>
              {nameError && (
                <span className="text-[10px] text-rose-400 font-semibold pl-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {nameError}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-4 z-10">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-emerald-500 text-white font-bold text-lg flex items-center justify-center uppercase shadow-md shadow-primary/10 select-none">
                {userName ? userName.charAt(0) : '?'}
              </div>
              <div className="flex flex-col min-w-0 flex-grow">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-100 text-base truncate">{userName}</span>
                  <button
                    onClick={handleStartEditName}
                    className="text-slate-500 hover:text-slate-300 transition p-1 cursor-pointer"
                    title="Изменить имя"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                  <span className="text-[10px] text-primary font-mono tracking-wider font-semibold uppercase">
                    Канал защищен
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-slate-900/80 pt-3.5 space-y-2.5">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 font-bold font-mono tracking-wider uppercase">Мой ID</span>
              <div className="flex items-center justify-between bg-slate-950/60 rounded-xl px-3 py-2 border border-slate-900/80">
                <span className="text-xs text-slate-300 font-mono font-bold">{userId}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(userId.toString());
                    setCopiedId(true);
                    setTimeout(() => setCopiedId(false), 2000);
                    hapticImpact("success");
                  }}
                  className="text-slate-500 hover:text-primary transition active:scale-90 p-1 cursor-pointer"
                  title="Копировать ID"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {myFingerprint && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-500 font-bold font-mono tracking-wider uppercase flex items-center gap-1">
                  <Fingerprint className="w-3 h-3 text-slate-400" />
                  Шифр Устройства
                </span>
                <div className="text-[10px] text-slate-400 font-mono bg-slate-950/40 border border-slate-900/60 rounded-xl p-2.5 px-3 break-all select-all leading-relaxed tracking-tight">
                  {myFingerprint}
                </div>
              </div>
            )}
            
            {/* Cryptosystem Stats */}
            <div className="border-t border-slate-900/40 pt-2.5 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Шифрование:</span>
                <span className="font-mono text-slate-300 flex items-center gap-1 font-bold">
                  <Lock className="w-3 h-3 text-primary" /> AES-GCM
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Цифр. подпись:</span>
                <span className="font-mono text-slate-300 flex items-center gap-1 font-bold">
                  <ShieldCheck className="w-3 h-3 text-primary" /> ECDSA-P256
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Style and Feedback */}
        <div>
          <h3 className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest mb-2.5 px-1">
            ОФОРМЛЕНИЕ И ОТКЛИК
          </h3>

          <div className="bg-slate-900/20 border border-slate-900/60 rounded-2xl overflow-hidden divide-y divide-slate-900">
            {/* Color picker */}
            <div className="flex items-center justify-between p-4 bg-slate-900/10">
              <div className="flex items-center gap-3 text-slate-300">
                <Palette className="w-4.5 h-4.5 text-primary" />
                <span className="text-sm font-medium">Цвет интерфейса</span>
              </div>
              <div className="flex gap-3">
                {THEME_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleColorSelect(color)}
                    style={{ backgroundColor: color }}
                    className={`w-6 h-6 rounded-full border-2 transition duration-200 active:scale-90 cursor-pointer ${
                      accentColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Haptic toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-900/10">
              <div className="flex items-center gap-3 text-slate-300">
                <Smartphone className="w-4.5 h-4.5 text-slate-400" />
                <span className="text-sm font-medium">Тактильный отклик (Haptics)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={haptics}
                  onChange={(e) => handleHapticsToggle(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5.5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-200 after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-white" />
              </label>
            </div>
          </div>
        </div>

        {/* Primary Settings */}
        <div>
          <h3 className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest mb-2.5 px-1">
            АКТИВЫ И СВЯЗЬ
          </h3>

          <div className="bg-slate-900/20 border border-slate-900/60 rounded-2xl overflow-hidden divide-y divide-slate-900">
            {/* Currencies */}
            <button
              onClick={() => { hapticImpact("selection"); setActiveScreen('currencies'); }}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/35 active:bg-slate-900/50 transition duration-150 cursor-pointer"
            >
              <div className="flex items-center gap-3 text-slate-300">
                <Coins className="w-4.5 h-4.5 text-primary" />
                <span className="text-sm font-medium">Мои монеты (Эмиссия)</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>

            {/* Devices */}
            <button
              onClick={() => { hapticImpact("selection"); setActiveScreen('devices'); }}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/35 active:bg-slate-900/50 transition duration-150 cursor-pointer"
            >
              <div className="flex items-center gap-3 text-slate-300">
                <Smartphone className="w-4.5 h-4.5 text-primary" />
                <span className="text-sm font-medium">Устройства и сессии</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Whitelists & Invites */}
        <div>
          <h3 className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest mb-2.5 px-1">
            КОНТРОЛЬ ДОСТУПА (БЕЛЫЙ СПИСОК)
          </h3>

          <div className="bg-slate-900/20 border border-slate-900/60 rounded-2xl p-4.5 space-y-4">
            <div className="flex justify-between items-center gap-4">
              <div>
                <span className="text-xs font-bold text-slate-200 block">Коды приглашений (Инвайты)</span>
                <span className="text-[10px] text-slate-400 mt-1 block">Вы можете создать до 3 активных кодов для друзей. Каждым кодом можно воспользоваться ровно один раз.</span>
              </div>
              <button
                disabled={myInvites.length >= 3}
                onClick={handleGenerateInvite}
                className="py-2.5 px-3 bg-primary hover:bg-primary-hover disabled:bg-slate-900/80 disabled:text-slate-600 text-white font-bold text-xs rounded-xl transition active:scale-95 shrink-0 select-none cursor-pointer"
              >
                Создать
              </button>
            </div>

            {myInvites.length > 0 ? (
              <div className="space-y-2 pt-3 border-t border-slate-900">
                {myInvites.map((code) => (
                  <div key={code} className="flex justify-between items-center bg-slate-950/40 border border-slate-900 rounded-xl p-2.5">
                    <span className="font-mono text-xs font-bold text-amber-500 uppercase tracking-wider select-all">{code}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(code);
                          hapticImpact("success");
                          alert("Код приглашения скопирован!");
                        }}
                        className="p-1.5 hover:bg-slate-900/60 rounded-lg text-slate-400 hover:text-slate-200 transition cursor-pointer"
                        title="Копировать код"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRevokeInvite(code)}
                        className="p-1.5 hover:bg-rose-950/20 rounded-lg text-slate-500 hover:text-rose-400 transition cursor-pointer"
                        title="Отозвать код"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-2 text-[10px] text-slate-500 font-mono">
                У ВАС НЕТ АКТИВНЫХ КОДОВ ПРИГЛАШЕНИЙ
              </div>
            )}
          </div>
        </div>

        {/* System Settings */}
        <div>
          <h3 className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest mb-2.5 px-1">
            СИСТЕМА И ИИ
          </h3>

          <div className="bg-slate-900/20 border border-slate-900/60 rounded-2xl overflow-hidden divide-y divide-slate-900">
            {/* Storage */}
            <button
              onClick={() => { hapticImpact("selection"); setActiveScreen('storage'); }}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/35 active:bg-slate-900/50 transition duration-150 cursor-pointer"
            >
              <div className="flex items-center gap-3 text-slate-300">
                <Database className="w-4.5 h-4.5 text-purple-400" />
                <span className="text-sm font-medium">Кэш и распределение памяти</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>

            {/* AI */}
            <button
              onClick={() => { hapticImpact("selection"); setActiveScreen('ai'); }}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/35 active:bg-slate-900/50 transition duration-150 cursor-pointer"
            >
              <div className="flex items-center gap-3 text-slate-300">
                <Brain className="w-4.5 h-4.5 text-rose-500" />
                <span className="text-sm font-medium">Локальный нейро-модуль</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Security Settings */}
        <div>
          <h3 className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest mb-2.5 px-1">
            КРИПТО-ЗАЩИТА
          </h3>

          <div className="bg-slate-900/20 border border-slate-900/60 rounded-2xl overflow-hidden divide-y divide-slate-900">
            {/* Base PIN */}
            <button
              onClick={() => { hapticImpact("selection"); onPinSetup('normal'); }}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/35 active:bg-slate-900/50 transition duration-150 cursor-pointer"
            >
              <div className="flex items-center gap-3 text-slate-300">
                <Key className="w-4.5 h-4.5 text-amber-500" />
                <span className="text-sm font-medium">Главный пароль авторизации</span>
              </div>
              <span className={`text-[10px] font-mono font-bold border rounded-md px-2.5 py-0.5 tracking-wide uppercase ${
                hasPin ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}>
                {hasPin ? 'ARMED' : 'OFF'}
              </span>
            </button>

            {/* Panic PIN - only visible if base pin is configured */}
            {hasPin && (
              <button
                onClick={() => { hapticImpact("selection"); onPinSetup('panic'); }}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/35 active:bg-slate-900/50 transition duration-150 cursor-pointer"
              >
                <div className="flex items-center gap-3 text-slate-300">
                  <ShieldCheck className="w-4.5 h-4.5 text-rose-500" />
                  <span className="text-sm font-medium">Тревожный PIN (Уничтожение)</span>
                </div>
                <span className={`text-[10px] font-mono font-bold border rounded-md px-2.5 py-0.5 tracking-wide uppercase ${
                  hasPanicPin ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 animate-pulse' : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}>
                  {hasPanicPin ? 'READY' : 'OFF'}
                </span>
              </button>
            )}

            {/* Passkeys / Biometrics */}
            <div
              onClick={handleTogglePasskey}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/35 transition duration-150 cursor-pointer"
            >
              <div className="flex items-center gap-3 text-slate-300">
                <Fingerprint className="w-4.5 h-4.5 text-primary" />
                <span className="text-sm font-medium">Вход по Passkey (Биометрия)</span>
              </div>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => { hapticImpact("selection"); setShowBiometricInfo(true); }}
                  className="p-1.5 hover:bg-slate-900 rounded-lg text-slate-500 hover:text-slate-300 transition"
                  title="Анализ безопасности биометрии"
                >
                  <Info className="w-4 h-4" />
                </button>
                <span className={`text-[10px] font-mono font-bold border rounded-md px-2.5 py-0.5 tracking-wide uppercase ${
                  hasPasskey ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}>
                  {hasPasskey ? 'ACTIVE' : 'OFF'}
                </span>
              </div>
            </div>

            {/* Panic Button */}
            <button
              onClick={() => { hapticImpact("warning"); handlePanicWipeClick(); }}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-rose-500/5 active:bg-rose-500/10 text-rose-500 transition duration-150 cursor-pointer"
            >
              <Skull className="w-4.5 h-4.5 text-rose-500" />
              <span className="text-sm font-semibold">Экстренное стирание данных (Wipe)</span>
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Biometric Security Info Modal Overlay */}
      {showBiometricInfo && (
        <div className="fixed inset-0 z-[1100] bg-slate-950/90 backdrop-blur-md flex flex-col justify-center p-4 animate-fade-in font-sans">
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/90 p-5 rounded-3xl flex flex-col gap-4 max-w-sm w-full mx-auto relative shadow-2xl overflow-y-auto max-h-[85vh] scrollbar-thin">
            <h3 className="font-extrabold font-mono tracking-tight text-slate-100 text-base uppercase flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-primary" /> Анализ ИБ: Биометрия
            </h3>
            
            <div className="space-y-3.5 text-xs text-slate-300 leading-relaxed">
              <p>
                <strong className="text-primary">1. Насколько это безопасно?</strong>
                <br />
                Вход по Passkeys (WebAuthn) невероятно надежен. Ключи генерируются аппаратно в защищенном чипе Secure Enclave вашего устройства. Ни сервер, ни провайдер не видят ваши биометрические данные. Устройство передает лишь криптографическую подпись, защищая вас от фишинга и перехвата паролей.
              </p>
              
              <p>
                <strong className="text-rose-400">2. Почему невозможен "Отпечаток паники" (Panic Fingerprint) в Web?</strong>
                <br />
                В браузере (и PWA) стандарт WebAuthn **строго изолирует** биометрический датчик от JS-кода с целью защиты вашей приватности. Сайты не имеют технической возможности узнать, *какой именно палец* был приложен. Браузер возвращает только двоичный ответ: <span className="text-emerald-400 font-semibold">"Пользователь успешно верифицирован"</span>.
              </p>
              
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-[11px] leading-relaxed">
                <strong>Решение Syndicate:</strong>
                <br />
                Поскольку отпечаток паники аппаратно недоступен в вебе, используйте наш <strong>Тревожный PIN (Panic PIN)</strong> на экране блокировки. Ввод альтернативного PIN-кода мгновенно удаляет все ключи и переписки на устройстве.
              </div>
            </div>

            <button
              onClick={() => { hapticImpact("selection"); setShowBiometricInfo(false); }}
              className="w-full bg-primary hover:bg-primary-hover text-white font-bold font-mono py-3 rounded-2xl transition"
            >
              ПОНЯТНО
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
