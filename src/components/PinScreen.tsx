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

  useEffect(() => {
    setMode(initialMode);
    setType(initialType);
    setEnteredPin('');
    setTempSetupPin('');
    setIsError(false);
    setIsShaking(false);
  }, [initialMode, initialType]);

  const hashPin = async (pin: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + 'syndicate_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const handleKeyPress = async (val: string) => {
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
        const enteredHash = await hashPin(newPin);
        const savedHash = localStorage.getItem('synd_pin_hash');
        const panicHash = localStorage.getItem('synd_panic_pin_hash');

        if (panicHash && enteredHash === panicHash) {
          // PANIC WIPE!
          triggerPanicWipe();
        } else if (enteredHash === savedHash) {
hapticImpact("success");
          onSuccess();
        } else {
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
        const enteredHash = await hashPin(newPin);
        if (enteredHash === localStorage.getItem('synd_pin_hash')) {
          localStorage.removeItem('synd_pin_hash');
          localStorage.removeItem('synd_panic_pin_hash'); // Disable panic too
hapticImpact("success");
          onSuccess();
        } else {
          triggerShake();
        }
      } else if (mode === 'disable_panic') {
        const enteredHash = await hashPin(newPin);
        if (enteredHash === localStorage.getItem('synd_panic_pin_hash')) {
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
    <div className="fixed inset-0 bg-slate-950 z-[99999] flex flex-col items-center justify-center pb-12 select-none animate-fade-in">
      <div className="flex flex-col items-center mb-8">
        {type === 'panic' ? (
          <ShieldAlert className="w-12 h-12 text-rose-500 mb-4 animate-pulse" />
        ) : (
          <Lock className="w-12 h-12 text-primary mb-4" />
        )}
        <h2 className="text-xl font-semibold text-slate-200 tracking-wide text-center">
          {getTitle()}
        </h2>
      </div>

      {/* Dots indicator */}
      <div
        className={`flex gap-4 mb-10 h-4 justify-center ${
          isShaking ? 'animate-shake' : ''
        }`}
      >
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
              index < enteredPin.length
                ? isError
                  ? 'bg-rose-500 border-rose-500'
                  : 'bg-primary border-primary scale-110'
                : 'border-slate-500'
            }`}
          />
        ))}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-5 max-w-[280px] w-full px-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            onClick={() => handleKeyPress(num.toString())}
            className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 active:scale-95 text-2xl font-medium text-slate-200 flex items-center justify-center transition"
          >
            {num}
          </button>
        ))}

        {mode !== 'unlock' ? (
          <button
            onClick={() => handleKeyPress('cancel')}
            className="w-16 h-16 rounded-full text-slate-400 hover:text-slate-300 active:scale-95 text-sm font-medium flex items-center justify-center transition"
          >
            Отмена
          </button>
        ) : (
          <div />
        )}

        <button
          onClick={() => handleKeyPress('0')}
          className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 active:scale-95 text-2xl font-medium text-slate-200 flex items-center justify-center transition"
        >
          0
        </button>

        <button
          onClick={() => handleKeyPress('del')}
          className="w-16 h-16 rounded-full text-slate-400 hover:text-slate-300 active:scale-95 text-xl flex items-center justify-center transition"
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
