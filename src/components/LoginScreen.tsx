import React, { useEffect, useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, ShieldAlert, MonitorSmartphone, QrCode } from 'lucide-react';
import { supabaseClient } from '../lib/supabase';
import { base64ToArrayBuffer } from '../lib/crypto';
import { hapticImpact } from '../lib/haptics';

interface LoginScreenProps {
  onLoginSuccess: (token: string, masterKeysJSON: string, userData: any) => void;
  isError: boolean;
  loadingText: string;
  deferredPrompt: any;
  setDeferredPrompt: (prompt: any) => void;
}

export function LoginScreen({ onLoginSuccess, isError, loadingText, deferredPrompt, setDeferredPrompt }: LoginScreenProps) {
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const privateKeyRef = useRef<CryptoKey | null>(null);
  const [channel, setChannel] = useState<any>(null);

  useEffect(() => {
    // Generate session ID and keys for QR login
    const initQr = async () => {
      const sessionId = crypto.randomUUID();
      const keyPair = await window.crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']) as CryptoKeyPair;
      privateKeyRef.current = keyPair.privateKey;
      const exported = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const exportedAsString = String.fromCharCode(...new Uint8Array(exported));
      const exportedAsBase64 = btoa(exportedAsString);
      const pubKeyPem = `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
      
      setQrSessionId(sessionId);
      setPublicKey(pubKeyPem);

      // Subscribe to channel
      const newChannel = supabaseClient.channel(`qr-login-${sessionId}`);
      newChannel
        .on('broadcast', { event: 'auth-payload' }, async (payload) => {
          try {
            console.log('Received auth payload');
            const { encKey, iv, cipher } = payload.payload.data;
            const encKeyBuf = base64ToArrayBuffer(encKey);
            const ivBuf = base64ToArrayBuffer(iv);
            const cipherBuf = base64ToArrayBuffer(cipher);
            
            const decryptedAesKeyRaw = await crypto.subtle.decrypt(
              { name: 'RSA-OAEP' },
              privateKeyRef.current!,
              encKeyBuf
            );
            
            const aesKey = await crypto.subtle.importKey(
              'raw',
              decryptedAesKeyRaw,
              { name: 'AES-GCM' },
              false,
              ['decrypt']
            );
            
            const decryptedPayloadBuf = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: ivBuf },
              aesKey,
              cipherBuf
            );
            
            const decryptedStr = new TextDecoder().decode(decryptedPayloadBuf);
            const { token, masterKeys, user } = JSON.parse(decryptedStr);
            
            onLoginSuccess(token, masterKeys, user);
          } catch (e) {
            console.error('Failed to decrypt auth payload', e);
          }
        })
        .subscribe();
      
      setChannel(newChannel);
    };

    if (isError) {
      initQr();
    }

    return () => {
      if (channel) {
        supabaseClient.removeChannel(channel);
      }
    };
  }, [isError]);

  return (
    <div className="flex flex-col items-center justify-center h-[100dvh] bg-slate-950 p-6 text-center select-none text-slate-100 font-sans relative overflow-hidden">
      {/* Background cyber grid effect */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

      {/* Top telemetry status line */}
      <div className="absolute top-4 left-0 right-0 px-4 flex justify-between text-[10px] text-slate-500 font-mono tracking-widest uppercase pointer-events-none select-none max-w-md mx-auto">
        <span>TUNNEL: SECURE</span>
        <span>E2E: AES-256 • RSA-4096</span>
      </div>

      {!isError ? (
        <div className="flex flex-col items-center relative z-10 animate-pulse">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-6 glow-primary">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <p className="text-slate-300 text-sm max-w-[280px] leading-relaxed font-mono uppercase tracking-wider">
            {loadingText}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full max-w-sm relative z-10">
          {/* Logo Badge */}
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 shadow-2xl border border-slate-850 relative group cursor-pointer active:scale-95 transition-all duration-300 select-none cyber-scan hover:shadow-[0_0_20px_var(--primary-border)] hover:border-primary/40">
            {/* Ambient inner gradient */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-transparent to-emerald-500/5 pointer-events-none" />
            
            {/* Spinning tactical cyber rings */}
            <div className="absolute inset-1 rounded-xl border border-dashed border-primary/20 animate-cyber-spin pointer-events-none" />
            <div className="absolute inset-2 rounded-lg border border-primary/10 animate-cyber-spin-reverse pointer-events-none" />
            
            {/* Interactive animated icon */}
            <MonitorSmartphone className="w-7 h-7 text-primary group-hover:scale-110 transition duration-300 relative z-10 animate-cyber-breathe" />
            
            {/* Top-right cyber status dot */}
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)] z-10 animate-pulse" />
          </div>

          <h2 className="text-2xl font-bold font-display tracking-tight text-slate-100 mb-2">
            Вход в Синдикат
          </h2>
          <p className="text-slate-400 text-xs mb-8 px-4 leading-relaxed max-w-[320px]">
            Откройте Синдикат на телефоне, перейдите в <span className="text-slate-200 font-medium">Настройки &rarr; Устройства</span> и отсканируйте этот QR-код для защищенного импорта ключей.
          </p>

          {/* QR Frame with tactical corners */}
          <div className="relative p-6 bg-slate-900 border border-slate-800/80 rounded-3xl shadow-2xl mb-8 group">
            {/* Corner highlight decors */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-primary rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-primary rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-primary rounded-br-lg" />

            <div className="bg-white p-3 rounded-2xl shadow-inner relative">
              {qrSessionId && publicKey ? (
                <QRCodeSVG 
                  value={JSON.stringify({ sessionId: qrSessionId, publicKey })} 
                  size={200} 
                  level="M"
                  includeMargin={false}
                />
              ) : (
                <div className="w-[200px] h-[200px] flex flex-col items-center justify-center bg-slate-100 rounded-xl">
                  <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                </div>
              )}
            </div>

            <div className="absolute -bottom-3 -right-3 bg-primary text-white p-2.5 rounded-2xl shadow-lg border-4 border-slate-950 glow-primary">
              <QrCode className="w-5 h-5" />
            </div>
          </div>

          {/* Security details bar */}
          <div className="text-[11px] font-mono tracking-wider text-slate-500 flex items-center gap-2 mb-8 bg-slate-900/50 border border-slate-900 px-4 py-1.5 rounded-full select-none">
            <ShieldAlert className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            E2EE SESSION INSTANTIATED
          </div>

          {/* Action buttons */}
          <div className="w-full flex flex-col gap-3">
            {deferredPrompt && (
              <button 
                onClick={async () => {
                  hapticImpact("selection");
                  const promptEvent = deferredPrompt;
                  if (!promptEvent) return;
                  promptEvent.prompt();
                  const { outcome } = await promptEvent.userChoice;
                  if (outcome === 'accepted') {
                    setDeferredPrompt(null);
                    (window as any).deferredPrompt = null;
                  }
                }}
                className="w-full bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-white font-semibold py-3.5 px-8 rounded-xl transition-all duration-300 active:scale-98 text-sm glow-primary"
              >
                Установить Приложение (PWA)
              </button>
            )}

            <button 
              onClick={() => {
                hapticImpact("selection");
                const tgWebApp = window.Telegram?.WebApp as any;
                if (tgWebApp && tgWebApp.platform && tgWebApp.platform !== 'unknown') {
                  window.location.reload();
                } else {
                  alert('Пожалуйста, откройте мини-приложение в самом Telegram на этом устройстве, или отсканируйте QR-код с уже авторизованного устройства.');
                }
              }}
              className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 hover:text-white font-semibold py-3.5 px-8 rounded-xl transition-all duration-300 active:scale-98 text-sm"
            >
              Войти через Telegram
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
