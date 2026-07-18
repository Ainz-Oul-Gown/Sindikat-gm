import React, { useEffect, useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, ShieldAlert, MonitorSmartphone, QrCode } from 'lucide-react';
import { supabaseClient } from '../lib/supabase';
import { base64ToArrayBuffer } from '../lib/crypto';

interface LoginScreenProps {
  onLoginSuccess: (token: string, masterKeysJSON: string, userData: any) => void;
  isError: boolean;
  loadingText: string;
}

export function LoginScreen({ onLoginSuccess, isError, loadingText }: LoginScreenProps) {
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
    <div className="flex flex-col items-center justify-center h-[100dvh] bg-slate-950 p-6 text-center select-none text-slate-100">
      {!isError ? (
        <div className="flex flex-col items-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mb-5" />
          <p className="text-slate-300 text-base max-w-[280px] leading-relaxed font-semibold">
            {loadingText}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full max-w-sm">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 shadow-lg border border-slate-800">
            <MonitorSmartphone className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Вход в Синдикат</h2>
          <p className="text-slate-400 text-sm mb-8 px-4 leading-relaxed">
            Откройте Синдикат на телефоне, перейдите в <strong className="text-slate-200">Настройки &rarr; Мои устройства</strong> и отсканируйте этот QR-код для безопасного входа.
          </p>

          <div className="bg-white p-4 rounded-3xl shadow-2xl mb-8 relative">
            {qrSessionId && publicKey ? (
              <QRCodeSVG 
                value={JSON.stringify({ sessionId: qrSessionId, publicKey })} 
                size={220} 
                level="M"
                includeMargin={false}
              />
            ) : (
              <div className="w-[220px] h-[220px] flex flex-col items-center justify-center bg-slate-100 rounded-2xl">
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
              </div>
            )}
            <div className="absolute -bottom-3 -right-3 bg-primary text-white p-2.5 rounded-2xl shadow-lg border-4 border-slate-950">
              <QrCode className="w-6 h-6" />
            </div>
          </div>

          <div className="text-xs text-slate-500 flex items-center gap-2 mb-6">
            <ShieldAlert className="w-4 h-4 text-emerald-500" />
            E2E Шифрование сессии
          </div>

          {deferredPrompt && (
            <button 
              onClick={async () => {
                const promptEvent = deferredPrompt;
                if (!promptEvent) return;
                promptEvent.prompt();
                const { outcome } = await promptEvent.userChoice;
                if (outcome === 'accepted') {
                  setDeferredPrompt(null);
                  (window as any).deferredPrompt = null;
                }
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 px-8 rounded-xl transition-colors active:scale-95 mb-3"
            >
              Установить Приложение (PWA)
            </button>
          )}

          <button 
            onClick={() => {
              const tgWebApp = window.Telegram?.WebApp as any;
              if (tgWebApp && tgWebApp.platform && tgWebApp.platform !== 'unknown') {
                window.location.reload();
              } else {
                alert('Пожалуйста, откройте мини-приложение в самом Telegram на этом устройстве, или отсканируйте QR-код с уже авторизованного устройства.');
              }
            }}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3.5 px-8 rounded-xl transition-colors active:scale-95"
          >
            Войти через Telegram
          </button>
        </div>
      )}
    </div>
  );
}
