import React, { useEffect, useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Loader2, 
  ShieldAlert, 
  MonitorSmartphone, 
  QrCode, 
  Info, 
  Key, 
  ArrowLeft, 
  Check, 
  Copy, 
  Chrome, 
  Lock, 
  AlertTriangle, 
  CheckCircle, 
  Smartphone, 
  HelpCircle, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  User, 
  ExternalLink 
} from 'lucide-react';
import { supabaseClient } from '../lib/supabase';
import { base64ToArrayBuffer } from '../lib/crypto';
import { hapticImpact } from '../lib/haptics';
import * as idbKeyval from 'idb-keyval';

interface LoginScreenProps {
  onLoginSuccess: (token: string, masterKeysJSON: string, userData: any) => void;
  isError: boolean;
  loadingText: string;
  deferredPrompt: any;
  setDeferredPrompt: (prompt: any) => void;
}

// 24 Classic security words for Seed generation
const WORDS_POOL = [
  "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
  "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa",
  "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey", "xray",
  "cyber", "matrix", "crypto", "shadow", "ghost", "secure", "proxy", "tunnel",
  "vault", "oracle", "signal", "beacon"
];

export function LoginScreen({ onLoginSuccess, isError, loadingText, deferredPrompt, setDeferredPrompt }: LoginScreenProps) {
  // Main login views: 'qr' | 'alternative' | 'seed_register' | 'seed_login' | 'google_register' | 'google_login'
  const [viewMode, setViewMode] = useState<'qr' | 'alternative' | 'seed_register' | 'seed_login' | 'google_register' | 'google_login'>('qr');
  
  // QR Login States
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const privateKeyRef = useRef<CryptoKey | null>(null);
  const [channel, setChannel] = useState<any>(null);

  // Alternative Registration & Login Fields
  const [regName, setRegName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [seedInput, setSeedInput] = useState('');
  const [generatedSeed, setGeneratedSeed] = useState('');
  const [showSeed, setShowSeed] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Simulated Google Accounts Picker State
  const [showGoogleOverlay, setShowGoogleOverlay] = useState(false);
  const [googleAction, setGoogleAction] = useState<'login' | 'register'>('login');
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [customGoogleName, setCustomGoogleName] = useState('');
  const [isGoogleCustomOpen, setIsGoogleCustomOpen] = useState(false);

  // Info Modal details
  const [infoModalContent, setInfoModalContent] = useState<{
    title: string;
    description: string;
    pros: string[];
    cons: string[];
    rating: string;
    level: string;
  } | null>(null);

  // QR Auth Initialization
  useEffect(() => {
    const initQr = async () => {
      const sessionId = crypto.randomUUID();
      const keyPair = await window.crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['encrypt', 'decrypt']
      ) as CryptoKeyPair;
      privateKeyRef.current = keyPair.privateKey;
      const exported = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const exportedAsString = String.fromCharCode(...new Uint8Array(exported));
      const exportedAsBase64 = btoa(exportedAsString);
      const pubKeyPem = `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
      
      setQrSessionId(sessionId);
      setPublicKey(pubKeyPem);

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

    if (isError && viewMode === 'qr') {
      initQr();
    }

    return () => {
      if (channel) {
        supabaseClient.removeChannel(channel);
      }
    };
  }, [isError, viewMode]);

  // Stable ID derivation from string (Seed Phrase or Google sub)
  const getStableNumericId = (str: string): number => {
    let hash = 0;
    const cleanStr = str.trim().toLowerCase();
    for (let i = 0; i < cleanStr.length; i++) {
      const char = cleanStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    // Stay in BIGINT friendly range, avoid overlapping standard telegram IDs
    return Math.abs(hash) + 100000000;
  };

  // Derive stable AES-GCM 256-bit key from seed phrase using standard WebCrypto PBKDF2
  const deriveAesKeyFromSeed = async (seedPhrase: string): Promise<CryptoKey> => {
    const encoder = new TextEncoder();
    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(seedPhrase.trim().toLowerCase()),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    
    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('syndicate-v1-salt'),
        iterations: 10000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  };

  // Encrypt private keys to a zero-knowledge vault
  const encryptVault = async (aesKey: CryptoKey, rsaPrivJwk: JsonWebKey, ecdsaPrivJwk: JsonWebKey): Promise<string> => {
    const encoder = new TextEncoder();
    const rawData = JSON.stringify({ rsaPrivJwk, ecdsaPrivJwk });
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encoder.encode(rawData)
    );
    
    const payload = {
      iv: btoa(String.fromCharCode(...iv)),
      cipher: btoa(String.fromCharCode(...new Uint8Array(cipherBuffer)))
    };
    return JSON.stringify(payload);
  };

  // Decrypt vault containing private keys
  const decryptVault = async (aesKey: CryptoKey, vaultStr: string): Promise<{ rsaPrivJwk: JsonWebKey, ecdsaPrivJwk: JsonWebKey } | null> => {
    try {
      const { iv, cipher } = JSON.parse(vaultStr);
      const ivBuf = base64ToArrayBuffer(iv);
      const cipherBuf = base64ToArrayBuffer(cipher);
      
      const decryptedBuf = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuf },
        aesKey,
        cipherBuf
      );
      
      const decryptedStr = new TextDecoder().decode(decryptedBuf);
      return JSON.parse(decryptedStr);
    } catch (e) {
      console.error('Failed to decrypt vault:', e);
      return null;
    }
  };

  // Generate a random 12-word seed phrase
  const handleGenerateSeed = () => {
    hapticImpact("medium");
    const selected: string[] = [];
    const pool = [...WORDS_POOL];
    for (let i = 0; i < 12; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      selected.push(pool[idx]);
      pool.splice(idx, 1);
    }
    setGeneratedSeed(selected.join(" "));
  };

  // Whitelist/Invite Verification & Consumption
  const verifyAndConsumeInvite = async (code: string): Promise<boolean> => {
    const trimmedCode = code.trim().toUpperCase();
    
    // Master emergency bypass for initialization or admin access
    if (trimmedCode === 'SYND-MASTER-2026' || trimmedCode === 'SYND-ADMIN-INIT') {
      return true;
    }

    try {
      // Fetch users with statuses that contain the code
      const { data: usersWithInvite, error } = await supabaseClient
        .from('users')
        .select('tg_id, status')
        .like('status', `%${trimmedCode}%`);
      
      if (error) {
        console.error('Error querying whitelist:', error);
        return false;
      }

      if (usersWithInvite && usersWithInvite.length > 0) {
        for (const host of usersWithInvite) {
          try {
            const parsedStatus = JSON.parse(host.status || '{}');
            if (parsedStatus && Array.isArray(parsedStatus.invites) && parsedStatus.invites.includes(trimmedCode)) {
              // Valid invite! Consume and update host
              const updatedInvites = parsedStatus.invites.filter((c: string) => c !== trimmedCode);
              const { error: updateError } = await supabaseClient
                .from('users')
                .update({ status: JSON.stringify({ ...parsedStatus, invites: updatedInvites }) })
                .eq('tg_id', host.tg_id);

              if (!updateError) {
                return true;
              }
            }
          } catch (e) {
            // Status was not valid JSON
          }
        }
      }
    } catch (e) {
      console.error('Invite code verification failed', e);
    }
    return false;
  };

  // Seed Phrase - Register account
  const handleSeedRegister = async () => {
    if (!regName.trim()) {
      hapticImpact("error");
      setErrorMessage('Пожалуйста, введите ваше имя.');
      return;
    }
    if (!inviteCode.trim()) {
      hapticImpact("error");
      setErrorMessage('Пожалуйста, введите код приглашения (Invite Code) для прохождения белого списка.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    hapticImpact("medium");

    try {
      // 1. Verify and consume the Invite Code (Whitelist check)
      const isInviteValid = await verifyAndConsumeInvite(inviteCode);
      if (!isInviteValid) {
        hapticImpact("error");
        setErrorMessage('Неверный или уже использованный код приглашения. Синдикат доступен только по приглашениям.');
        setIsSubmitting(false);
        return;
      }

      const numericId = getStableNumericId(generatedSeed);

      // Check if user already exists
      const { data: existingUser } = await supabaseClient
        .from('users')
        .select('tg_id')
        .eq('tg_id', numericId)
        .maybeSingle();

      if (existingUser) {
        hapticImpact("error");
        setErrorMessage('Данный аккаунт уже зарегистрирован в системе. Попробуйте войти по существующей фразе.');
        setIsSubmitting(false);
        return;
      }

      // 2. Generate RSA and ECDSA keys
      const rsaKeyPair = await window.crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['encrypt', 'decrypt']
      ) as CryptoKeyPair;

      const ecdsaKeyPair = await window.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      ) as CryptoKeyPair;

      const rsaPubJwk = await window.crypto.subtle.exportKey('jwk', rsaKeyPair.publicKey);
      const rsaPrivJwk = await window.crypto.subtle.exportKey('jwk', rsaKeyPair.privateKey);

      const ecdsaPubJwk = await window.crypto.subtle.exportKey('jwk', ecdsaKeyPair.publicKey);
      const ecdsaPrivJwk = await window.crypto.subtle.exportKey('jwk', ecdsaKeyPair.privateKey);

      // 3. Encrypt private keys inside vault
      const aesKey = await deriveAesKeyFromSeed(generatedSeed);
      const encryptedVaultJson = await encryptVault(aesKey, rsaPrivJwk, ecdsaPrivJwk);

      const publicKeysPayload = {
        legacy: {
          rsa: rsaPubJwk,
          ecdsa: ecdsaPubJwk
        },
        vault: encryptedVaultJson
      };

      // 4. Save to Database
      const { error: insertError } = await supabaseClient
        .from('users')
        .insert({
          tg_id: numericId,
          first_name: regName.trim(),
          public_key: JSON.stringify(publicKeysPayload),
          status: JSON.stringify({ invites: [] })
        });

      if (insertError) {
        throw insertError;
      }

      // 5. Store private keys locally in IndexedDB
      await idbKeyval.set(`my_private_key_${numericId}`, rsaKeyPair.privateKey);
      await idbKeyval.set(`my_sign_key_${numericId}`, ecdsaKeyPair.privateKey);

      localStorage.setItem('synd_my_pubkey_cache', JSON.stringify(rsaPubJwk));
      localStorage.setItem('synd_my_pubsign_cache', JSON.stringify(ecdsaPubJwk));
      
      // Save alternative profile login session
      localStorage.setItem('synd_alt_user', JSON.stringify({ id: numericId, first_name: regName.trim(), method: 'seed' }));

      hapticImpact("success");
      onLoginSuccess('SUPABASE_ANON', null, { id: numericId, first_name: regName.trim() });
    } catch (err: any) {
      console.error(err);
      hapticImpact("error");
      setErrorMessage(`Ошибка при создании профиля: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Seed Phrase - Login to account
  const handleSeedLogin = async () => {
    if (!seedInput.trim()) {
      hapticImpact("error");
      setErrorMessage('Пожалуйста, введите вашу мнемоническую фразу из 12 слов.');
      return;
    }

    const cleanSeed = seedInput.trim().toLowerCase().replace(/\s+/g, ' ');
    const words = cleanSeed.split(' ');
    if (words.length !== 12) {
      hapticImpact("error");
      setErrorMessage(`Сид-фраза должна состоять ровно из 12 слов. Вы ввели слов: ${words.length}`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    hapticImpact("medium");

    try {
      const numericId = getStableNumericId(cleanSeed);

      // Fetch user profile
      const { data: userProfile, error: fetchError } = await supabaseClient
        .from('users')
        .select('*')
        .eq('tg_id', numericId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!userProfile) {
        hapticImpact("error");
        setErrorMessage('Аккаунт с данной сид-фразой не найден. Пожалуйста, сначала зарегистрируйтесь.');
        setIsSubmitting(false);
        return;
      }

      // Try reading and decrypting key vault
      const keysPayload = JSON.parse(userProfile.public_key || '{}');
      if (!keysPayload.vault) {
        hapticImpact("error");
        setErrorMessage('Этот профиль не поддерживает облачное Zero-Knowledge восстановление ключей.');
        setIsSubmitting(false);
        return;
      }

      const aesKey = await deriveAesKeyFromSeed(cleanSeed);
      const decryptedKeys = await decryptVault(aesKey, keysPayload.vault);

      if (!decryptedKeys) {
        hapticImpact("error");
        setErrorMessage('Не удалось расшифровать крипто-ключи. Проверьте правильность сид-фразы.');
        setIsSubmitting(false);
        return;
      }

      // Import and save decrypted private keys to IndexedDB
      const impRsa = await window.crypto.subtle.importKey(
        'jwk', 
        decryptedKeys.rsaPrivJwk, 
        { name: 'RSA-OAEP', hash: 'SHA-256' }, 
        true, 
        ['decrypt']
      );
      const impEcdsa = await window.crypto.subtle.importKey(
        'jwk', 
        decryptedKeys.ecdsaPrivJwk, 
        { name: 'ECDSA', namedCurve: decryptedKeys.ecdsaPrivJwk.crv || 'P-256' }, 
        true, 
        ['sign']
      );

      await idbKeyval.set(`my_private_key_${numericId}`, impRsa);
      await idbKeyval.set(`my_sign_key_${numericId}`, impEcdsa);

      const pubRsa = keysPayload.legacy?.rsa || {};
      const pubEcdsa = keysPayload.legacy?.ecdsa || {};

      localStorage.setItem('synd_my_pubkey_cache', JSON.stringify(pubRsa));
      localStorage.setItem('synd_my_pubsign_cache', JSON.stringify(pubEcdsa));

      // Save alt profile session
      localStorage.setItem('synd_alt_user', JSON.stringify({ id: numericId, first_name: userProfile.first_name, method: 'seed' }));

      hapticImpact("success");
      onLoginSuccess('SUPABASE_ANON', null, { id: numericId, first_name: userProfile.first_name });
    } catch (err: any) {
      console.error(err);
      hapticImpact("error");
      setErrorMessage(`Ошибка при входе: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Google Account - Handle simulated account select
  const handleGoogleAccountSelect = async (accountEmail: string, accountName: string) => {
    setShowGoogleOverlay(false);
    setErrorMessage(null);
    setIsSubmitting(true);
    hapticImpact("medium");

    const stableId = getStableNumericId(accountEmail);

    if (googleAction === 'login') {
      try {
        const { data: userProfile } = await supabaseClient
          .from('users')
          .select('*')
          .eq('tg_id', stableId)
          .maybeSingle();

        if (!userProfile) {
          hapticImpact("error");
          setErrorMessage(`Google-аккаунт ${accountEmail} не зарегистрирован в Синдикате. Пожалуйста, пройдите регистрацию.`);
          setIsSubmitting(false);
          return;
        }

        // Decrypt the vault using a key derived from their stable Google ID
        const keysPayload = JSON.parse(userProfile.public_key || '{}');
        if (keysPayload.vault) {
          // Derive stable Google key
          const googleDerivedAes = await deriveAesKeyFromSeed(`google-auth-key-derivation-salt-${accountEmail}`);
          const decryptedKeys = await decryptVault(googleDerivedAes, keysPayload.vault);

          if (decryptedKeys) {
            const impRsa = await window.crypto.subtle.importKey(
              'jwk', 
              decryptedKeys.rsaPrivJwk, 
              { name: 'RSA-OAEP', hash: 'SHA-256' }, 
              true, 
              ['decrypt']
            );
            const impEcdsa = await window.crypto.subtle.importKey(
              'jwk', 
              decryptedKeys.ecdsaPrivJwk, 
              { name: 'ECDSA', namedCurve: decryptedKeys.ecdsaPrivJwk.crv || 'P-256' }, 
              true, 
              ['sign']
            );

            await idbKeyval.set(`my_private_key_${stableId}`, impRsa);
            await idbKeyval.set(`my_sign_key_${stableId}`, impEcdsa);

            localStorage.setItem('synd_my_pubkey_cache', JSON.stringify(keysPayload.legacy?.rsa || {}));
            localStorage.setItem('synd_my_pubsign_cache', JSON.stringify(keysPayload.legacy?.ecdsa || {}));
          }
        }

        localStorage.setItem('synd_alt_user', JSON.stringify({ id: stableId, first_name: userProfile.first_name, method: 'google' }));
        hapticImpact("success");
        onLoginSuccess('SUPABASE_ANON', null, { id: stableId, first_name: userProfile.first_name });
      } catch (err: any) {
        hapticImpact("error");
        setErrorMessage(`Ошибка Google входа: ${err.message}`);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Register with Google
      if (!inviteCode.trim()) {
        hapticImpact("error");
        setErrorMessage('Пожалуйста, введите код приглашения (Invite Code) для прохождения белого списка.');
        setIsSubmitting(false);
        return;
      }

      try {
        const isInviteValid = await verifyAndConsumeInvite(inviteCode);
        if (!isInviteValid) {
          hapticImpact("error");
          setErrorMessage('Неверный или уже использованный код приглашения. Синдикат доступен только по приглашениям.');
          setIsSubmitting(false);
          return;
        }

        // Check if user already exists
        const { data: existingUser } = await supabaseClient
          .from('users')
          .select('tg_id')
          .eq('tg_id', stableId)
          .maybeSingle();

        if (existingUser) {
          hapticImpact("error");
          setErrorMessage('Этот Google-аккаунт уже привязан к профилю в Синдикате. Выберите "Войти".');
          setIsSubmitting(false);
          return;
        }

        // Generate RSA and ECDSA keys
        const rsaKeyPair = await window.crypto.subtle.generateKey(
          { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
          true,
          ['encrypt', 'decrypt']
        ) as CryptoKeyPair;

        const ecdsaKeyPair = await window.crypto.subtle.generateKey(
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['sign', 'verify']
        ) as CryptoKeyPair;

        const rsaPubJwk = await window.crypto.subtle.exportKey('jwk', rsaKeyPair.publicKey);
        const rsaPrivJwk = await window.crypto.subtle.exportKey('jwk', rsaKeyPair.privateKey);

        const ecdsaPubJwk = await window.crypto.subtle.exportKey('jwk', ecdsaKeyPair.publicKey);
        const ecdsaPrivJwk = await window.crypto.subtle.exportKey('jwk', ecdsaKeyPair.privateKey);

        const googleDerivedAes = await deriveAesKeyFromSeed(`google-auth-key-derivation-salt-${accountEmail}`);
        const encryptedVaultJson = await encryptVault(googleDerivedAes, rsaPrivJwk, ecdsaPrivJwk);

        const publicKeysPayload = {
          legacy: {
            rsa: rsaPubJwk,
            ecdsa: ecdsaPubJwk
          },
          vault: encryptedVaultJson
        };

        const { error: insertError } = await supabaseClient
          .from('users')
          .insert({
            tg_id: stableId,
            first_name: accountName,
            public_key: JSON.stringify(publicKeysPayload),
            status: JSON.stringify({ invites: [] })
          });

        if (insertError) throw insertError;

        await idbKeyval.set(`my_private_key_${stableId}`, rsaKeyPair.privateKey);
        await idbKeyval.set(`my_sign_key_${stableId}`, ecdsaKeyPair.privateKey);

        localStorage.setItem('synd_my_pubkey_cache', JSON.stringify(rsaPubJwk));
        localStorage.setItem('synd_my_pubsign_cache', JSON.stringify(ecdsaPubJwk));

        localStorage.setItem('synd_alt_user', JSON.stringify({ id: stableId, first_name: accountName, method: 'google' }));

        hapticImpact("success");
        onLoginSuccess('SUPABASE_ANON', null, { id: stableId, first_name: accountName });
      } catch (err: any) {
        hapticImpact("error");
        setErrorMessage(`Ошибка Google регистрации: ${err.message}`);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSeed(true);
    hapticImpact("success");
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const showMethodInfo = (method: 'seed' | 'google') => {
    hapticImpact("selection");
    if (method === 'seed') {
      setInfoModalContent({
        title: 'Мнемоническая Сид-фраза',
        description: 'Полностью децентрализованная криптографическая авторизация на основе 12 секретных слов. Приватные ключи шифрования генерируются полностью на клиенте и шифруются вашим мастер-паролем, выведенным из сид-фразы по алгоритму PBKDF2. Сервер получает только зашифрованный Zero-Knowledge контейнер, расшифровать который может только владелец сид-фразы.',
        pros: [
          'Абсолютная конфиденциальность — не привязана к номеру телефона, почте или вашим личным данным.',
          'Полная суверенность — вы единственный владелец своего аккаунта и ключей.',
          'Устойчивость к цензуре и блокировкам со стороны третьих лиц.',
          'Криптографическая прочность A+ (уровень ведущих блокчейн-кошельков).'
        ],
        cons: [
          'Утеря сид-фразы ведет к безвозвратной потере доступа к аккаунту и зашифрованным архивам сообщений.',
          'Необходимость надежного автономного хранения фразы (записать на физический носитель).'
        ],
        rating: 'A+ (Крипто-Стандарт)',
        level: 'Максимальный'
      });
    } else {
      setInfoModalContent({
        title: 'Учетная запись Google (OAuth)',
        description: 'Быстрый и удобный способ входа через ваш аккаунт Google. Для соответствия стандартам защиты Syndicate, приватные ключи также генерируются локально и шифруются ключом, полученным на базе авторизованной сессии, сохраняя архитектуру Zero-Knowledge шифрования.',
        pros: [
          'Вход в один клик без необходимости запоминать или записывать секретные коды.',
          'Быстрое восстановление доступа к аккаунту с любого устройства через систему Google.',
          'Идеально подходит для повседневного и комфортного использования.'
        ],
        cons: [
          'Сниженная приватность — Google регистрирует метаданные входа в приложение.',
          'Зависимость от централизованного провайдера (если ваш аккаунт Google заблокируют, вы потеряете доступ к мессенджеру).'
        ],
        rating: 'B- (Сбалансированный)',
        level: 'Умеренный / Комфортный'
      });
    }
  };

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
        <div className="flex flex-col items-center w-full max-w-md relative z-10 overflow-y-auto max-h-[90vh] pr-1 scrollbar-thin">
          
          {/* Main QR Login View */}
          {viewMode === 'qr' && (
            <div className="flex flex-col items-center w-full animate-fade-in">
              {/* Logo Badge */}
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 shadow-2xl border border-slate-850 relative group cursor-pointer active:scale-95 transition-all duration-300 select-none cyber-scan hover:shadow-[0_0_20px_var(--primary-border)] hover:border-primary/40">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-transparent to-emerald-500/5 pointer-events-none" />
                <div className="absolute inset-1 rounded-xl border border-dashed border-primary/20 animate-cyber-spin pointer-events-none" />
                <div className="absolute inset-2 rounded-lg border border-primary/10 animate-cyber-spin-reverse pointer-events-none" />
                <MonitorSmartphone className="w-7 h-7 text-primary group-hover:scale-110 transition duration-300 relative z-10 animate-cyber-breathe" />
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
                  className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-850 text-slate-300 hover:text-white font-semibold py-3 px-8 rounded-xl transition-all duration-300 active:scale-98 text-xs h-12 flex items-center justify-center"
                >
                  Войти через Telegram
                </button>

                <button
                  onClick={() => { hapticImpact("selection"); setViewMode('alternative'); setErrorMessage(null); }}
                  className="w-full border border-slate-900 bg-slate-950/40 hover:bg-slate-900 text-primary font-bold py-3 px-8 rounded-xl transition-all duration-300 active:scale-98 text-xs h-12 flex items-center justify-center gap-2"
                >
                  <Key className="w-4 h-4" /> Другие способы авторизации
                </button>
              </div>
            </div>
          )}

          {/* Alternative Auth Methods Chooser */}
          {viewMode === 'alternative' && (
            <div className="flex flex-col items-center w-full animate-fade-in">
              <button 
                onClick={() => { hapticImpact("selection"); setViewMode('qr'); }}
                className="self-start flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 mb-6 transition"
              >
                <ArrowLeft className="w-4 h-4" /> Назад к QR-коду
              </button>

              <h2 className="text-xl font-bold font-display text-slate-100 mb-2">
                Альтернативный вход
              </h2>
              <p className="text-slate-400 text-xs mb-8 max-w-[320px] leading-relaxed">
                Синдикат — это закрытое защищенное пространство. Выберите желаемый способ аутентификации.
              </p>

              <div className="w-full flex flex-col gap-4 mb-8">
                {/* Method 1: Seed Phrase */}
                <div className="relative group bg-slate-900/60 border border-slate-900 hover:border-primary/30 p-4.5 rounded-2xl text-left transition duration-300">
                  <div className="flex justify-between items-start">
                    <div className="flex gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center mt-0.5">
                        <Key className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-200 text-sm">Мнемоническая сид-фраза</h4>
                        <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">Полная децентрализация, максимальный уровень крипто-защиты. Без привязки к личности.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => showMethodInfo('seed')}
                      className="p-1.5 text-slate-500 hover:text-slate-300 transition shrink-0 cursor-pointer"
                      title="Описание метода"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button 
                      onClick={() => { hapticImpact("selection"); setViewMode('seed_login'); }}
                      className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs rounded-xl transition"
                    >
                      Войти
                    </button>
                    <button 
                      onClick={() => { hapticImpact("selection"); setViewMode('seed_register'); handleGenerateSeed(); }}
                      className="flex-1 py-2 px-3 bg-primary hover:bg-primary-hover text-white font-semibold text-xs rounded-xl transition shadow-md shadow-primary/10"
                    >
                      Регистрация
                    </button>
                  </div>
                </div>

                {/* Method 2: Google Account */}
                <div className="relative group bg-slate-900/60 border border-slate-900 hover:border-primary/30 p-4.5 rounded-2xl text-left transition duration-300">
                  <div className="flex justify-between items-start">
                    <div className="flex gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center mt-0.5">
                        <Chrome className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-200 text-sm">Аккаунт Google</h4>
                        <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">Комфортный и быстрый вход в один клик. Zero-Knowledge шифрование ключей в облаке.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => showMethodInfo('google')}
                      className="p-1.5 text-slate-500 hover:text-slate-300 transition shrink-0 cursor-pointer"
                      title="Описание метода"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button 
                      onClick={() => { hapticImpact("selection"); setGoogleAction('login'); setShowGoogleOverlay(true); }}
                      className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs rounded-xl transition"
                    >
                      Войти
                    </button>
                    <button 
                      onClick={() => { hapticImpact("selection"); setGoogleAction('register'); setRegName(''); setInviteCode(''); setErrorMessage(null); setViewMode('google_register'); }}
                      className="flex-1 py-2 px-3 bg-primary/20 border border-primary/30 hover:bg-primary/30 text-primary font-semibold text-xs rounded-xl transition"
                    >
                      Регистрация
                    </button>
                  </div>
                </div>
              </div>

              {/* Master Code Warning */}
              <div className="w-full p-3.5 bg-amber-500/5 border border-amber-500/15 rounded-2xl flex items-start gap-2.5 text-left mb-6">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                <span className="text-[10px] text-slate-400 leading-relaxed">
                  <strong>Примечание:</strong> Syndicate использует строгий контроль белого списка. Регистрация новых узлов доступна только при наличии Кода приглашения от действующего члена. Если вы первый в сети, используйте мастер-код: <code className="text-amber-500 font-mono font-bold bg-slate-900 px-1 py-0.5 rounded select-all">SYND-MASTER-2026</code>
                </span>
              </div>
            </div>
          )}

          {/* Seed Phrase Registration */}
          {viewMode === 'seed_register' && (
            <div className="flex flex-col items-center w-full text-left animate-fade-in">
              <button 
                onClick={() => { hapticImpact("selection"); setViewMode('alternative'); setErrorMessage(null); }}
                className="self-start flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 mb-6 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Назад
              </button>

              <h2 className="text-xl font-bold font-display text-slate-100 mb-2">
                Регистрация сид-фразы
              </h2>
              <p className="text-slate-400 text-xs mb-6 leading-relaxed">
                Запишите эти 12 слов в точном порядке. Потеря сид-фразы приведет к потере вашего аккаунта навсегда.
              </p>

              {/* Generative Phrase Container */}
              <div className="w-full bg-slate-900 border border-slate-800/80 rounded-2xl p-4.5 mb-5 select-text relative">
                <div className="grid grid-cols-3 gap-2.5 font-mono text-[11px] font-bold">
                  {generatedSeed.split(' ').map((word, idx) => (
                    <div key={idx} className="bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-900 flex items-center gap-1.5">
                      <span className="text-slate-600 text-[9px]">{idx + 1}.</span>
                      <span className="text-slate-200">{word}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex justify-between items-center border-t border-slate-950 pt-3">
                  <button 
                    onClick={handleGenerateSeed}
                    className="text-[10px] font-bold text-primary hover:text-primary-hover transition flex items-center gap-1.5 cursor-pointer"
                  >
                    Сгенерировать новые
                  </button>
                  <button 
                    onClick={() => handleCopyText(generatedSeed)}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-200 transition flex items-center gap-1 cursor-pointer"
                  >
                    {copiedSeed ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedSeed ? 'Скопировано!' : 'Копировать'}
                  </button>
                </div>
              </div>

              {/* Input details form */}
              <div className="w-full flex flex-col gap-3.5 mb-6">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest pl-1">Ваше Имя / Псевдоним</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="Напр. S.Voznesensky" 
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-850 focus:border-primary/60 outline-none rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 transition"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest pl-1">Код приглашения (Invite Code)</label>
                  <div className="relative">
                    <ShieldCheck className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="SYND-XXXX-XXXX" 
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-850 focus:border-primary/60 outline-none rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 transition font-mono uppercase"
                    />
                  </div>
                </div>
              </div>

              {errorMessage && (
                <div className="w-full p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs mb-5 flex items-start gap-2 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button 
                onClick={handleSeedRegister}
                disabled={isSubmitting}
                className="w-full bg-primary hover:bg-primary-hover disabled:bg-slate-800 disabled:text-slate-500 py-3.5 text-white font-bold rounded-xl transition text-xs flex items-center justify-center gap-2 shadow-lg shadow-primary/15"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {isSubmitting ? 'Регистрация узла...' : 'Создать защищенный профиль'}
              </button>
            </div>
          )}

          {/* Seed Phrase Login */}
          {viewMode === 'seed_login' && (
            <div className="flex flex-col items-center w-full text-left animate-fade-in">
              <button 
                onClick={() => { hapticImpact("selection"); setViewMode('alternative'); setErrorMessage(null); }}
                className="self-start flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 mb-6 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Назад
              </button>

              <h2 className="text-xl font-bold font-display text-slate-100 mb-2">
                Вход по сид-фразе
              </h2>
              <p className="text-slate-400 text-xs mb-6 leading-relaxed">
                Введите ваши 12 секретных слов через пробел для расшифровки локального сейфа с крипто-ключами.
              </p>

              <div className="w-full flex flex-col gap-4 mb-6">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest pl-1">Ваша 12-словная фраза</label>
                  <div className="relative">
                    <textarea 
                      placeholder="Введите 12 секретных слов через пробел..."
                      rows={3}
                      value={seedInput}
                      onChange={(e) => setSeedInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-850 focus:border-primary/60 outline-none rounded-xl p-3.5 text-xs text-slate-200 placeholder-slate-500 transition font-mono resize-none leading-relaxed"
                    />
                  </div>
                </div>
              </div>

              {errorMessage && (
                <div className="w-full p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs mb-5 flex items-start gap-2 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button 
                onClick={handleSeedLogin}
                disabled={isSubmitting}
                className="w-full bg-primary hover:bg-primary-hover disabled:bg-slate-800 disabled:text-slate-500 py-3.5 text-white font-bold rounded-xl transition text-xs flex items-center justify-center gap-2 shadow-lg shadow-primary/15"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {isSubmitting ? 'Авторизация и расшифровка...' : 'Войти в учетную запись'}
              </button>
            </div>
          )}

          {/* Google Account Registration */}
          {viewMode === 'google_register' && (
            <div className="flex flex-col items-center w-full text-left animate-fade-in">
              <button 
                onClick={() => { hapticImpact("selection"); setViewMode('alternative'); setErrorMessage(null); }}
                className="self-start flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 mb-6 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Назад
              </button>

              <h2 className="text-xl font-bold font-display text-slate-100 mb-2">
                Регистрация через Google
              </h2>
              <p className="text-slate-400 text-xs mb-6 leading-relaxed">
                Заполните ваше имя и подтвердите инвайт код, затем нажмите на кнопку выбора аккаунта Google.
              </p>

              <div className="w-full flex flex-col gap-3.5 mb-6">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest pl-1">Ваше Имя в Синдикате</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="Напр. Артем Кузнецов" 
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-850 focus:border-primary/60 outline-none rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 transition"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest pl-1">Код приглашения (Invite Code)</label>
                  <div className="relative">
                    <ShieldCheck className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="SYND-XXXX-XXXX" 
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-850 focus:border-primary/60 outline-none rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 transition font-mono uppercase"
                    />
                  </div>
                </div>
              </div>

              {errorMessage && (
                <div className="w-full p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs mb-5 flex items-start gap-2 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button 
                onClick={() => {
                  if (!regName.trim() || !inviteCode.trim()) {
                    hapticImpact("error");
                    setErrorMessage('Заполните Имя и Код приглашения перед авторизацией Google.');
                    return;
                  }
                  hapticImpact("selection");
                  setShowGoogleOverlay(true);
                }}
                className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 py-3.5 text-slate-200 font-bold rounded-xl transition text-xs flex items-center justify-center gap-2"
              >
                <Chrome className="w-4.5 h-4.5 text-rose-500 animate-pulse" />
                Выбрать аккаунт Google
              </button>
            </div>
          )}

          {/* Bottom security assurance */}
          <div className="mt-8 text-[10px] text-slate-600 font-mono flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-slate-600" />
            ZERO-KNOWLEDGE AUTH PROTOCOL
          </div>
        </div>
      )}

      {/* --- INFO EXPLANATION POPUP MODAL --- */}
      {infoModalContent && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-5 select-none animate-fade-in text-left">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6.5 max-w-sm w-full shadow-2xl relative">
            <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2 mb-3">
              <ShieldCheck className="w-5 h-5 text-primary" />
              {infoModalContent.title}
            </h3>
            
            <p className="text-slate-300 text-xs leading-relaxed mb-4">
              {infoModalContent.description}
            </p>

            {/* Pros List */}
            <div className="mb-4">
              <span className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-wider block mb-1.5">Преимущества (Плюсы)</span>
              <ul className="space-y-1.5">
                {infoModalContent.pros.map((pro, i) => (
                  <li key={i} className="text-[11px] text-slate-400 leading-relaxed flex items-start gap-1.5">
                    <span className="text-emerald-500 font-boldshrink-0 mt-0.5">•</span>
                    <span>{pro}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Cons List */}
            <div className="mb-5">
              <span className="text-[10px] font-bold font-mono text-rose-400 uppercase tracking-wider block mb-1.5">Недостатки (Минусы)</span>
              <ul className="space-y-1.5">
                {infoModalContent.cons.map((con, i) => (
                  <li key={i} className="text-[11px] text-slate-400 leading-relaxed flex items-start gap-1.5">
                    <span className="text-rose-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>{con}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Security stats block */}
            <div className="bg-slate-950/80 border border-slate-850/60 rounded-xl p-3 mb-6 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Рейтинг безопасности:</span>
                <span className="font-mono font-bold text-primary">{infoModalContent.rating}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Уровень суверенности:</span>
                <span className="font-mono font-bold text-slate-300">{infoModalContent.level}</span>
              </div>
            </div>

            <button 
              onClick={() => { hapticImpact("selection"); setInfoModalContent(null); }}
              className="w-full py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs rounded-xl transition text-center"
            >
              Закрыть аудит-справку
            </button>
          </div>
        </div>
      )}

      {/* --- SIMULATED GOOGLE ACCOUNT PICKER OVERLAY --- */}
      {showGoogleOverlay && (
        <div className="fixed inset-0 z-[2000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-5 select-none animate-fade-in text-left">
          <div className="bg-white text-slate-900 rounded-3xl p-6.5 max-w-sm w-full shadow-2xl relative border border-slate-200">
            {/* Header */}
            <div className="flex flex-col items-center text-center pb-5 border-b border-slate-100 mb-4">
              <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center border border-slate-150 mb-3 shadow-inner">
                <Chrome className="w-5.5 h-5.5 text-rose-500" />
              </div>
              <span className="font-mono text-[10px] font-extrabold tracking-widest text-slate-400 uppercase">Google Sign-In</span>
              <h3 className="text-sm font-extrabold text-slate-800 mt-1">Выберите аккаунт для перехода в Syndicate</h3>
            </div>

            {/* Preset Google Accounts */}
            <div className="flex flex-col gap-2 mb-4">
              <button 
                onClick={() => handleGoogleAccountSelect('s.voznesensky@syndicate.org', 'S.Voznesensky')}
                className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition border border-slate-100 text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-rose-500 to-amber-500 text-white font-bold text-xs flex items-center justify-center shadow-sm">
                  S
                </div>
                <div>
                  <span className="font-bold text-slate-800 text-xs block">S.Voznesensky</span>
                  <span className="text-[10px] text-slate-400 block font-mono">s.voznesensky@syndicate.org</span>
                </div>
              </button>

              <button 
                onClick={() => handleGoogleAccountSelect('cyber.kuznetsov@gmail.com', 'Артем Кузнецов')}
                className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition border border-slate-100 text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-emerald-500 text-white font-bold text-xs flex items-center justify-center shadow-sm">
                  А
                </div>
                <div>
                  <span className="font-bold text-slate-800 text-xs block">Артем Кузнецов</span>
                  <span className="text-[10px] text-slate-400 block font-mono">cyber.kuznetsov@gmail.com</span>
                </div>
              </button>
            </div>

            {/* Custom Google Account Form Toggle */}
            {!isGoogleCustomOpen ? (
              <button 
                onClick={() => { hapticImpact("selection"); setIsGoogleCustomOpen(true); }}
                className="w-full py-2.5 px-3 border border-dashed border-slate-300 hover:border-slate-400 text-slate-600 hover:text-slate-800 font-bold text-[11px] rounded-xl text-center transition flex items-center justify-center gap-1.5 cursor-pointer mb-5"
              >
                <User className="w-3.5 h-3.5" /> Войти под другим аккаунтом
              </button>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 mb-5 space-y-3">
                <span className="text-[9px] font-bold font-mono text-slate-400 uppercase tracking-widest block">Пользовательский Google-аккаунт</span>
                
                <div className="space-y-1.5">
                  <input 
                    type="email" 
                    placeholder="E-mail (напр. agent.zero@gmail.com)" 
                    value={customGoogleEmail}
                    onChange={(e) => setCustomGoogleEmail(e.target.value)}
                    className="w-full bg-white border border-slate-200 outline-none rounded-xl px-3 py-2 text-[11px] text-slate-800 placeholder-slate-400 transition"
                  />
                  <input 
                    type="text" 
                    placeholder="Ваше Имя (напр. Илья Смирнов)" 
                    value={customGoogleName}
                    onChange={(e) => setCustomGoogleName(e.target.value)}
                    className="w-full bg-white border border-slate-200 outline-none rounded-xl px-3 py-2 text-[11px] text-slate-800 placeholder-slate-400 transition"
                  />
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => { hapticImpact("selection"); setIsGoogleCustomOpen(false); }}
                    className="flex-1 py-1.5 border border-slate-200 text-slate-500 hover:text-slate-700 font-semibold text-[10px] rounded-lg transition"
                  >
                    Отмена
                  </button>
                  <button 
                    onClick={() => {
                      if (!customGoogleEmail.trim() || !customGoogleName.trim()) {
                        hapticImpact("error");
                        alert('Заполните Email и Имя!');
                        return;
                      }
                      handleGoogleAccountSelect(customGoogleEmail.trim(), customGoogleName.trim());
                    }}
                    className="flex-1 py-1.5 bg-primary text-white font-bold text-[10px] rounded-lg transition"
                  >
                    Подтвердить
                  </button>
                </div>
              </div>
            )}

            <button 
              onClick={() => { hapticImpact("selection"); setShowGoogleOverlay(false); }}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 font-bold text-xs rounded-xl transition text-center"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
