import { hapticImpact } from "../lib/haptics";
import { useState, useEffect } from 'react';
import * as idbKeyval from 'idb-keyval';
import { Lock, Unlock, UserCheck, Delete, ShieldAlert } from 'lucide-react';

interface PinScreenProps {
  onSuccess: () => void;
  mode: 'unlock' | 'setup_1' | 'setup_2' | 'disable_normal' | 'disable_panic';
  type?: 'normal' | 'panic';
  onCancel?: () => void;
  triggerPanicWipe: () => void;
}

export default function PinScreen({
  onSuccess,
  mode: initialMode,
  type: initialType = 'normal',
  onCancel,
  triggerPanicWipe,
}: PinScreenProps) {
  const [mode, setMode] = useState(initialMode);
  const [type, setType] = useState(initialType);
  const [enteredPin, setEnteredPin] = useState('');
  const [tempSetupPin, setTempSetupPin] = useState('');
  const [isError, setIsError] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const [attemptsLeft, setAttemptsLeft] = useState(() => {
    const saved = localStorage.getItem('synd_pin_attempts_left');
    return saved ? parseInt(saved, 10) : 10;
  });
  const [cooldownTime, setCooldownTime] = useState(0);

  useEffect(() => {
    setMode(initialMode);
    setType(initialType);
    setEnteredPin('');
    setTempSetupPin('');
    setIsError(false);
    setIsShaking(false);
  }, [initialMode, initialType]);

  useEffect(() => {
    if (cooldownTime > 0) {
      const timer = setTimeout(() => {
        setCooldownTime((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownTime]);

  const legacyHashPin = async (pin: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + 'syndicate_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const hashPin = async (pin: string) => {
    const encoder = new TextEncoder();
    const pinData = encoder.encode(pin);
    const salt = encoder.encode('syndicate_pbkdf2_v1_salt_2026');
    const baseKey = await crypto.subtle.importKey(
      'raw',
      pinData,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    const derivedKeyBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      256
    );
    const hashArray = Array.from(new Uint8Array(derivedKeyBits));
    return 'pbkdf2:' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const verifyPin = async (pin: string, storedHash: string | null) => {
    if (!storedHash) return false;
    if (storedHash.startsWith('pbkdf2:')) {
      const computed = await hashPin(pin);
      return computed === storedHash;
    } else {
      // Legacy check
      const computed = await legacyHashPin(pin);
      if (computed === storedHash) {
        // Upgrade on-the-fly!
        const upgraded = await hashPin(pin);
        if (storedHash === localStorage.getItem('synd_pin_hash')) {
          localStorage.setItem('synd_pin_hash', upgraded);
        } else if (storedHash === localStorage.getItem('synd_panic_pin_hash')) {
          localStorage.setItem('synd_panic_pin_hash', upgraded);
        }
        return true;
      }
      return false;
    }
  };

  const handleKeyPress = async (val: string) => {
    if (cooldownTime > 0) {
      hapticImpact("warning");
      return;
    }

    // Vibrate briefly if TG API is available
    hapticImpact("light");

    if (val === 'cancel') {
      if (onCancel) onCancel();
      return;
    }

    if (val === 'del') {
      setEnteredPin((prev) => prev.slice(0, -1));
      return;
    }

    if (enteredPin.length >= 4) return;

    const newPin = enteredPin + val;
    setEnteredPin(newPin);

    if (newPin.length === 4) {
      // Process full PIN input
      if (mode === 'unlock') {
        const savedHash = localStorage.getItem('synd_pin_hash');
        const panicHash = localStorage.getItem('synd_panic_pin_hash');

        let isPanic = false;
        if (panicHash) {
          isPanic = await verifyPin(newPin, panicHash);
        }

        if (isPanic) {
          // PANIC WIPE!
          triggerPanicWipe();
          return;
        }

        const isCorrect = await verifyPin(newPin, savedHash);

        if (isCorrect) {
          localStorage.setItem('synd_pin_attempts_left', '10');
          setAttemptsLeft(10);
          hapticImpact("success");
          onSuccess();
        } else {
          const nextAttempts = attemptsLeft - 1;
          setAttemptsLeft(nextAttempts);
          localStorage.setItem('synd_pin_attempts_left', nextAttempts.toString());

          if (nextAttempts <= 0) {
            triggerPanicWipe();
            return;
          }

          let penalty = 0;
          if (nextAttempts === 7) penalty = 5;
          else if (nextAttempts === 6) penalty = 10;
          else if (nextAttempts === 5) penalty = 20;
          else if (nextAttempts === 4) penalty = 40;
          else if (nextAttempts <= 3) penalty = 60;

          if (penalty > 0) {
            setCooldownTime(penalty);
          }

          triggerShake();
        }
      } else if (mode === 'setup_1') {
        setTempSetupPin(newPin);
        setEnteredPin('');
        setMode('setup_2');
      } else if (mode === 'setup_2') {
        if (newPin === tempSetupPin) {
          const hash = await hashPin(newPin);
          if (type === 'normal') {
            localStorage.setItem('synd_pin_hash', hash);
            localStorage.setItem('synd_pin_attempts_left', '10');
          } else if (type === 'panic') {
            localStorage.setItem('synd_panic_pin_hash', hash);
          }
          hapticImpact("success");
          onSuccess();
        } else {
          triggerShake();
          setMode('setup_1');
          setTempSetupPin('');
        }
      } else if (mode === 'disable_normal') {
        const savedHash = localStorage.getItem('synd_pin_hash');
        const isCorrect = await verifyPin(newPin, savedHash);
        if (isCorrect) {
          localStorage.removeItem('synd_pin_hash');
          localStorage.removeItem('synd_panic_pin_hash'); // Disable panic too
          localStorage.removeItem('synd_pin_attempts_left');
          hapticImpact("success");
          onSuccess();
        } else {
          triggerShake();
        }
      } else if (mode === 'disable_panic') {
        const savedPanic = localStorage.getItem('synd_panic_pin_hash');
        const isCorrect = await verifyPin(newPin, savedPanic);
        if (isCorrect) {
          localStorage.removeItem('synd_panic_pin_hash');
          hapticImpact("success");
          onSuccess();
        } else {
          triggerShake();
        }
      }
    }
  };

  const triggerShake = () => {
    setIsError(true);
    setIsShaking(true);
hapticImpact("error");
    setTimeout(() => {
      setIsShaking(false);
      setEnteredPin('');
    }, 400);
  };

  const getTitle = () => {
    switch (mode) {
      case 'unlock':
        return 'Введите PIN-код';
      case 'setup_1':
        return type === 'panic' ? 'Новый ТРЕВОЖНЫЙ PIN' : 'Новый PIN-код';
      case 'setup_2':
        return 'Повторите PIN-код';
      case 'disable_normal':
        return 'Текущий PIN для отключения';
      case 'disable_panic':
        return 'Тревожный PIN для отключения';
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-[99999] flex flex-col items-center justify-center pb-12 select-none animate-fade-in font-sans overflow-hidden">
      {/* Background matrix-like digital pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

      {/* Top security status */}
      <div className="absolute top-4 left-0 right-0 px-6 flex justify-between text-[10px] text-slate-500 font-mono tracking-widest uppercase pointer-events-none select-none max-w-sm mx-auto">
        <span>GATEWAY: {type === 'panic' ? 'PANIC_ARMED' : 'SECURE'}</span>
        <span>CIPHER: ACTIVE</span>
      </div>

      <div className="flex flex-col items-center mb-10 relative z-10">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800/80 flex items-center justify-center mb-5 shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          {type === 'panic' ? (
            <ShieldAlert className="w-7 h-7 text-rose-500 animate-pulse" />
          ) : (
            <Lock className="w-7 h-7 text-primary" />
          )}
        </div>
        <h2 className="text-xl font-bold font-display tracking-tight text-slate-100 text-center">
          {getTitle()}
        </h2>
        <p className="text-[11px] text-slate-500 font-mono mt-1 tracking-wider">
          {type === 'panic' ? 'ТРЕВОЖНЫЙ РЕЖИМ СТИРАНИЯ' : 'ТРЕБУЕТСЯ АВТОРИЗАЦИЯ'}
        </p>
      </div>

      {/* Dots indicator */}
      <div
        className={`flex gap-5 mb-12 h-5 justify-center relative z-10 ${
          isShaking ? 'animate-shake' : ''
        }`}
      >
        {[0, 1, 2, 3].map((index) => {
          const isActive = index < enteredPin.length;
          return (
            <div
              key={index}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                isActive
                  ? isError
                    ? 'bg-rose-500 border-rose-500 shadow-lg shadow-rose-500/50 scale-110'
                    : 'bg-primary border-primary shadow-lg shadow-primary/50 scale-110'
                  : 'border-slate-700 bg-transparent scale-100'
              }`}
            />
          );
        })}
      </div>

      {/* Cooldown or attempts display */}
      <div className="h-6 flex items-center justify-center mb-6 relative z-10 font-mono text-xs">
        {cooldownTime > 0 ? (
          <span className="text-rose-500 font-black animate-pulse uppercase tracking-wider">
            ВВОД ЗАБЛОКИРОВАН: {cooldownTime} СЕК
          </span>
        ) : mode === 'unlock' && attemptsLeft < 10 ? (
          <span className="text-rose-400 font-bold animate-pulse uppercase tracking-widest">
            ОСТАЛОСЬ ПОПЫТОК: {attemptsLeft} / 10
          </span>
        ) : null}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-5 max-w-[290px] w-full px-4 relative z-10">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            onClick={() => handleKeyPress(num.toString())}
            className="w-16.5 h-16.5 rounded-2xl bg-slate-900/60 border border-slate-800/60 hover:bg-slate-900 hover:border-slate-700/80 active:scale-95 text-2xl font-bold font-mono text-slate-200 hover:text-white flex items-center justify-center transition-all duration-200 shadow-md focus:outline-none"
          >
            {num}
          </button>
        ))}

        {mode !== 'unlock' ? (
          <button
            onClick={() => handleKeyPress('cancel')}
            className="w-16.5 h-16.5 rounded-2xl text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 active:scale-95 text-xs font-semibold uppercase tracking-wider flex items-center justify-center transition focus:outline-none"
          >
            Отмена
          </button>
        ) : (
          <div className="w-16.5 h-16.5" />
        )}

        <button
          onClick={() => handleKeyPress('0')}
          className="w-16.5 h-16.5 rounded-2xl bg-slate-900/60 border border-slate-800/60 hover:bg-slate-900 hover:border-slate-700/80 active:scale-95 text-2xl font-bold font-mono text-slate-200 hover:text-white flex items-center justify-center transition-all duration-200 shadow-md focus:outline-none"
        >
          0
        </button>

        <button
          onClick={() => handleKeyPress('del')}
          className="w-16.5 h-16.5 rounded-2xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/5 active:scale-95 flex items-center justify-center transition focus:outline-none"
        >
          <Delete className="w-6 h-6" />
        </button>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
}
