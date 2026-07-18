import { useState, useEffect, useRef, FormEvent, UIEvent } from 'react';
import {
  ChevronLeft,
  Search,
  Wallet,
  MoreVertical,
  Mic,
  Send,
  X,
  Trash2,
  Play,
  Pause,
  ArrowDown,
  UserMinus,
  UserPlus,
  Edit2,
  Trash,
  LogOut,
  HelpCircle,
  Loader2,
  Check,
  Shield,
  Plus,
} from 'lucide-react';
import * as idbKeyval from 'idb-keyval';
import { supabaseClient } from '../lib/supabase';
import {
  encryptText,
  decryptText,
  generateChatKey,
  encryptChatKeyForFriend,
  decryptChatKey,
  getFingerprint,
} from '../lib/crypto';
import { Chat, DecryptedMessage, Message, User, Currency, Debt, ReplyData } from '../types';
import VoicePlayer from './VoicePlayer';
import DeepSearch from './DeepSearch';
import { getCachedEmbeddingPipeline } from '../lib/ai';

interface ChatViewProps {
  chat: Chat;
  currentUser: { id: number; first_name: string };
  onBack: () => void;
  worker: Worker | null;
}

let globalAudioStream: MediaStream | null = null;

export default function ChatView({ chat, currentUser, onBack, worker }: ChatViewProps) {
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatKey, setChatKey] = useState<CryptoKey | null>(null);

  // Pagination & Loading states
  const [renderLimit, setRenderLimit] = useState(30);
  const [hasMoreInHistory, setHasMoreInHistory] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(true);

  // Nav, modals and screens
  const [activeModal, setActiveModal] = useState<'none' | 'info' | 'search' | 'debts' | 'add-debt' | 'invite-friend'>('none');
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Reply states
  const [replyTo, setReplyTo] = useState<ReplyData | null>(null);

  // Swipe gesture tracking
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipingMsgId = useRef<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isRecordLocked, setIsRecordingLocked] = useState(false);
  const [isRecordPaused, setIsRecordPaused] = useState(false);
  const [recordPreviewUrl, setRecordPreviewUrl] = useState<string | null>(null);
  const [isRecordPlaying, setIsRecordPlaying] = useState(false);
  const [recordPreviewProgress, setRecordPreviewProgress] = useState(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [recordWaveHistory, setRecordWaveHistory] = useState<number[]>([]);
  const [micPulseScale, setMicPulseScale] = useState(1);

  // Refs for recording logic
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recStartTimeRef = useRef<number>(0);
  const recAccumulatedTimeRef = useRef<number>(0);
  const recPauseTimeRef = useRef<number>(0);
  const recTimerRef = useRef<any>(null);
  const recordVolumeIntervalRef = useRef<any>(null);

  // Audio Context for visualizer
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Chat Info states (members, fingerprint, delete, name editing)
  const [chatFingerprint, setChatFingerprint] = useState('');
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [groupName, setGroupName] = useState(chat.name);
  const [friendsList, setFriendsList] = useState<User[]>([]);

  // Debts states
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtRubles, setDebtRubles] = useState('');
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(null);

  const messagesAreaRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Load chat symmetric key and fingerprint
  const loadChatKeys = async () => {
    try {
      if (chat.type === 'saved') {
        const fingerprint = 'Личное хранилище';
        setChatFingerprint(fingerprint);

        let cachedKey = await idbKeyval.get<CryptoKey>(`aes_key_${chat.id}`);
        if (!cachedKey) {
          const { data } = await supabaseClient
            .from('chat_keys')
            .select('encrypted_key')
            .eq('chat_id', chat.id)
            .eq('user_id', currentUser.id)
            .maybeSingle();

          if (data) {
            const keysDict = JSON.parse(data.encrypted_key);
            const devId = localStorage.getItem('syndicate_device_id') || 'legacy';
            const encKey = keysDict[devId] || keysDict['legacy_dev'] || keysDict['legacy'];
            cachedKey = await decryptChatKey(encKey, currentUser.id);
            if (cachedKey) {
              await idbKeyval.set(`aes_key_${chat.id}`, cachedKey);
            }
          }
        }
        setChatKey(cachedKey || null);
      } else if (chat.type === 'private') {
        // Load friend public key to generate fingerprint
        const friendId = chat.friendId || 0;
        const { data: friendData } = await supabaseClient
          .from('users')
          .select('public_key')
          .eq('tg_id', friendId)
          .maybeSingle();

        if (friendData?.public_key) {
          const fp = await getFingerprint(friendData.public_key);
          setChatFingerprint(`Шифр: ${fp}`);
        }

        let cachedKey = await idbKeyval.get<CryptoKey>(`aes_key_${chat.id}`);
        if (!cachedKey) {
          const { data } = await supabaseClient
            .from('chat_keys')
            .select('encrypted_key')
            .eq('chat_id', chat.id)
            .eq('user_id', currentUser.id)
            .maybeSingle();

          if (data) {
            let encKey = '';
            try {
              const keysDict = JSON.parse(data.encrypted_key);
              const devId = localStorage.getItem('syndicate_device_id') || 'legacy';
              encKey = keysDict[devId] || keysDict['legacy_dev'] || keysDict['legacy'];
            } catch (e) {
              encKey = data.encrypted_key;
            }
            cachedKey = await decryptChatKey(encKey, currentUser.id);
            if (cachedKey) {
              await idbKeyval.set(`aes_key_${chat.id}`, cachedKey);
            }
          }
        }
        setChatKey(cachedKey || null);
      } else if (chat.type === 'group') {
        setChatFingerprint('Группа');

        let cachedKey = await idbKeyval.get<CryptoKey>(`aes_key_${chat.id}`);
        if (!cachedKey) {
          const { data } = await supabaseClient
            .from('chat_keys')
            .select('encrypted_key')
            .eq('chat_id', chat.id)
            .eq('user_id', currentUser.id)
            .maybeSingle();

          if (data) {
            let encKey = '';
            try {
              const keysDict = JSON.parse(data.encrypted_key);
              const devId = localStorage.getItem('syndicate_device_id') || 'legacy';
              encKey = keysDict[devId] || keysDict['legacy_dev'] || keysDict['legacy'];
            } catch (e) {
              encKey = data.encrypted_key;
            }
            cachedKey = await decryptChatKey(encKey, currentUser.id);
            if (cachedKey) {
              await idbKeyval.set(`aes_key_${chat.id}`, cachedKey);
            }
          }
        }
        setChatKey(cachedKey || null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Process message model to decoupled render parameters
  const parseMessage = async (msg: Message, aesKey: CryptoKey): Promise<DecryptedMessage> => {
    const isMine = msg.sender_id === currentUser.id;
    const decrypted = await decryptText(msg.encrypted_text, aesKey, currentUser.id, msg.sender_id);

    const voiceData = decrypted.text.startsWith('[VOICE]:') ? parseVoicePayload(decrypted.text) : undefined;
    const inviteData = decrypted.text.startsWith('[GROUP_INVITE]:') ? parseInvitePayload(decrypted.text) : undefined;

    return {
      id: msg.id,
      sender_id: msg.sender_id,
      text: decrypted.text,
      created_at: msg.created_at,
      isMine,
      senderName: isMine ? 'Я' : 'Участник', // Name placeholder
      reply: decrypted.reply,
      isAuthentic: decrypted.isAuthentic,
      isError: decrypted.isError,
      voiceData,
      inviteData,
    };
  };

  const parseVoicePayload = (text: string) => {
    const rawParams = text.replace('[VOICE]:', '');
    const parts = rawParams.split('|');
    const fileName = parts[0];

    let wfStr = '';
    let transcription = '';
    let isProcessing = false;
    let isError = false;
    let hasTranscript = false;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].trim();
      if (part.startsWith('WF:')) {
        wfStr = part.substring(3);
      } else if (part.length > 0) {
        transcription = part;
        if (transcription.includes('⏳') || transcription.includes('анализирует')) {
          isProcessing = true;
        } else if (transcription.includes('❌') || transcription.includes('Ошибка')) {
          isError = true;
        } else {
          hasTranscript = true;
        }
      }
    }

    const waveform = wfStr ? wfStr.split(',').map(Number) : Array.from({ length: 30 }, () => Math.floor(10 + Math.random() * 90));

    return {
      fileName,
      waveform,
      transcription,
      isProcessing,
      isError,
      hasTranscript,
    };
  };

  const parseInvitePayload = (text: string) => {
    const parts = text.replace('[GROUP_INVITE]:', '').split('|');
    return {
      groupId: parts[0],
      groupName: parts[1],
      keysJSON: parts[2],
    };
  };

  // Load message history with E2EE decrypt
  const loadHistory = async (key: CryptoKey) => {
    setIsLoadingChat(true);
    try {
      // 1. Check local cache
      const cached = (await idbKeyval.get<any>(`chat_hist_${chat.id}`)) || { history: [] };
      let finalMessages: DecryptedMessage[] = [];

      if (cached.history.length > 0) {
        const decryptedCache = await Promise.all(
          cached.history.map((msg: Message) => parseMessage(msg, key))
        );
        finalMessages = decryptedCache;
        setMessages(decryptedCache);
        setIsLoadingChat(false);
      }

      // 2. Fetch new messages from Supabase in background
      const lastMsgDate = cached.history.length > 0 ? cached.history[cached.history.length - 1].created_at : null;
      let query = supabaseClient
        .from('messages')
        .select('*')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: true });

      if (lastMsgDate) {
        query = query.gt('created_at', lastMsgDate);
      }

      const { data: newMsgs, error } = await query;
      if (error) throw error;

      if (newMsgs && newMsgs.length > 0) {
        const decryptedNew = await Promise.all(newMsgs.map((msg: Message) => parseMessage(msg, key)));

        // Merge, save and update
        const mergedHistory = [...cached.history, ...newMsgs];
        await idbKeyval.set(`chat_hist_${chat.id}`, {
          updated_at: Date.now(),
          history: mergedHistory,
        });

        const mergedDecrypted = [...finalMessages, ...decryptedNew];
        setMessages(mergedDecrypted);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingChat(false);
    }
  };

  useEffect(() => {
    loadChatKeys();
    if (chat.type === 'group') {
      loadChatInfoDetails();
    }
  }, [chat.id]);

  useEffect(() => {
    if (chatKey) {
      loadHistory(chatKey);

      // Subscribe to real-time additions
      const channel = supabaseClient
        .channel(`live-chat-${chat.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chat.id}` },
          async (payload: any) => {
            if (payload.eventType === 'DELETE') return;
            const newMsg: Message = payload.new;
            if (!newMsg) return;

            const parsed = await parseMessage(newMsg, chatKey);
            setMessages((prev) => {
              const existingIdx = prev.findIndex((m) => m.id === parsed.id);
              if (existingIdx !== -1) {
                const updated = [...prev];
                updated[existingIdx] = parsed;
                return updated;
              } else {
                return [...prev, parsed];
              }
            });

            // Trigger background speech translation for incoming voice notes if active
            if (
              newMsg.sender_id !== currentUser.id &&
              parsed.voiceData &&
              !parsed.voiceData.hasTranscript &&
              localStorage.getItem('synd_auto_whisper') !== 'off'
            ) {
              handleVoiceTranslation(parsed.voiceData.fileName, parsed.id);
            }
          }
        )
        .subscribe();

      return () => {
        supabaseClient.removeChannel(channel);
      };
    }
  }, [chatKey, chat.id]);

  // Dynamic textarea sizing
  const handleInputChange = (text: string) => {
    setInputText(text);
    if (inputRef.current) {
      inputRef.current.style.height = '42px';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleSendMessage = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !chatKey) return;

    const textToSend = inputText.trim();
    setInputText('');
    if (inputRef.current) inputRef.current.style.height = '42px';

    try {
      const encryptedPayload = await encryptText(textToSend, chatKey, currentUser.id, replyTo);
      setReplyTo(null);

      // Generate search vector index
      let encryptedVector: string | null = null;
      const pipelineInstance = getCachedEmbeddingPipeline();
      if (pipelineInstance) {
        try {
          const output = await pipelineInstance(textToSend, { pooling: 'mean', normalize: true });
          const arrayBuffer = output.data.buffer;
          const iv = window.crypto.getRandomValues(new Uint8Array(12));
          const encryptedVec = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            chatKey,
            arrayBuffer
          );

          const bytes = new Uint8Array(iv.length + encryptedVec.byteLength);
          bytes.set(iv, 0);
          bytes.set(new Uint8Array(encryptedVec), iv.length);
          encryptedVector = btoa(String.fromCharCode.apply(null, Array.from(bytes)));
        } catch (vErr) {
          console.warn('Vector gen failed', vErr);
        }
      }

      await supabaseClient.from('messages').insert({
        chat_id: chat.id,
        sender_id: currentUser.id,
        encrypted_text: encryptedPayload,
        encrypted_vector: encryptedVector,
      });

      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Scrolling indicators
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const area = e.currentTarget;
    if (Math.abs(area.scrollTop) > 150) {
      setShowScrollBottom(true);
    } else {
      setShowScrollBottom(false);
    }
    
    if (Math.abs(area.scrollTop) + area.clientHeight >= area.scrollHeight - 300) {
      if (renderLimit < messages.length) {
        setRenderLimit(prev => prev + 30);
      }
    }
  };

  const handleScrollToBottom = () => {
    if (messagesAreaRef.current) {
      messagesAreaRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Voice Note Recording Logic
  const startRecording = async (e?: React.TouchEvent | React.MouseEvent) => {
    if (e && 'touches' in e) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    }

    try {
      if (!globalAudioStream) {
        globalAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      mediaRecorderRef.current = new MediaRecorder(globalAudioStream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        clearInterval(recTimerRef.current);
        clearInterval(recordVolumeIntervalRef.current);

        if (audioCtxRef.current) {
          await audioCtxRef.current.close();
          audioCtxRef.current = null;
          analyserRef.current = null;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' });
        audioChunksRef.current = [];

        // Save recorded waveform parameters
        const barsCount = 30;
        let finalWaveform = [...recordWaveHistory];
        if (finalWaveform.length < barsCount) {
          while (finalWaveform.length < barsCount) {
            finalWaveform.push(Math.floor(10 + Math.random() * 40));
          }
        }
        const maxVol = Math.max(...finalWaveform, 1);
        const wfString = finalWaveform.map((v) => Math.floor((v / maxVol) * 100)).join(',');

        setIsRecording(false);
        setIsRecordingLocked(false);
        setIsRecordPaused(false);
        setRecordingDuration(0);
        setRecordWaveHistory([]);
        setMicPulseScale(1);

        // Upload voice to Storage
        if (audioBlob.size > 800) {
          await uploadVoiceNote(audioBlob, wfString);
        }
      };

      mediaRecorderRef.current.start();
      recStartTimeRef.current = Date.now();
      recAccumulatedTimeRef.current = 0;
      setIsRecording(true);

      // Start duration updates
      recTimerRef.current = setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          setRecordingDuration(Math.floor((Date.now() - recStartTimeRef.current + recAccumulatedTimeRef.current) / 1000));
        }
      }, 100);

      // Setup audio analyzer for dynamic pulsing button animation
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const tempVolumes: number[] = [];

        recordVolumeIntervalRef.current = setInterval(() => {
          if (!isRecordPaused) {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;

            // Update mic pulse scales
            const scale = 1 + Math.min(0.4, avg / 40);
            setMicPulseScale(scale);

            tempVolumes.push(avg);
            setRecordWaveHistory([...tempVolumes]);
          }
        }, 150);
      } catch (analyserErr) {
        console.warn('Analyser node failed', analyserErr);
      }

      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
      }
    } catch (err) {
      alert('Ошибка доступа к микрофону!');
    }
  };

  const uploadVoiceNote = async (audioBlob: Blob, waveformStr: string) => {
    if (!chatKey) return;
    const fileName = `voice_${Date.now()}_${currentUser.id}.bin`;

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        chatKey,
        arrayBuffer
      );

      const payload = new Uint8Array(iv.length + encrypted.byteLength);
      payload.set(iv, 0);
      payload.set(new Uint8Array(encrypted), iv.length);

      // Upload encrypted audio
      const { error: uploadError } = await supabaseClient.storage
        .from('voice_messages')
        .upload(fileName, payload.buffer, { contentType: 'application/octet-stream' });

      if (uploadError) throw uploadError;

      // Wrap voice text representation
      const isAutoWhisperOn = localStorage.getItem('synd_auto_whisper') !== 'off';
      const textMarker = isAutoWhisperOn
        ? `[VOICE]:${fileName}|WF:${waveformStr}|⏳ ИИ анализирует...`
        : `[VOICE]:${fileName}|WF:${waveformStr}`;

      const encryptedText = await encryptText(textMarker, chatKey, currentUser.id, replyTo);
      setReplyTo(null);

      const { data: insertedMsg, error: insertError } = await supabaseClient
        .from('messages')
        .insert({
          chat_id: chat.id,
          sender_id: currentUser.id,
          encrypted_text: encryptedText,
        })
        .select()
        .maybeSingle();

      if (insertError) throw insertError;

      // Trigger automatic Whisper transcription in separate thread if active
      if (isAutoWhisperOn) {
        handleVoiceTranslation(fileName, insertedMsg.id, waveformStr);
      }
    } catch (err: any) {
      alert('Ошибка отправки голосового сообщения: ' + err.message);
    }
  };

  const handleVoiceTranslation = async (fileName: string, msgId: string, waveformStr?: string) => {
    if (!worker || !chatKey) return;

    try {
      // 1. Download file
      const { data, error } = await supabaseClient.storage.from('voice_messages').download(fileName);

      if (error || !data) throw error || new Error('No data');

      // 2. Decrypt
      const arrayBuffer = await data.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const iv = bytes.slice(0, 12);
      const encData = bytes.slice(12);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        chatKey,
        encData
      );

      // 3. Audio Context decoding into Float32Array (16kHz standard for Whisper)
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const decoded = await audioCtx.decodeAudioData(decrypted);
      const float32 = decoded.getChannelData(0);

      // 4. Send to Web Worker
      const taskId = Date.now() + Math.random();
      worker.postMessage({ type: 'transcribe', id: taskId, audioData: float32 });

      const handleResponse = async (e: MessageEvent) => {
        const res = e.data;
        if (res.id === taskId) {
          worker.removeEventListener('message', handleResponse);
          if (res.type === 'result') {
            const transText = res.text.trim();
            const wfSuffix = waveformStr ? `|WF:${waveformStr}` : '';
            const newMarker = `[VOICE]:${fileName}${wfSuffix}|${transText}`;
            const newEncText = await encryptText(newMarker, chatKey, currentUser.id);

            await supabaseClient.from('messages').update({ encrypted_text: newEncText }).eq('id', msgId);
          } else if (res.type === 'error') {
            throw new Error(res.error);
          }
        }
      };

      worker.addEventListener('message', handleResponse);
    } catch (err: any) {
      console.warn('Voice translation failed', err);
      // Fail gracefully: update text to error marker
      const wfSuffix = waveformStr ? `|WF:${waveformStr}` : '';
      const newMarker = `[VOICE]:${fileName}${wfSuffix}|❌ Ошибка расшифровки`;
      try {
        const newEncText = await encryptText(newMarker, chatKey, currentUser.id);
        await supabaseClient.from('messages').update({ encrypted_text: newEncText }).eq('id', msgId);
      } catch (e) {}
    }
  };

  const handleManualTranscribe = async (fileName: string, msgId: string) => {
    const parentMsg = messages.find((m) => m.id === msgId);
    let wfStr = '';
    if (parentMsg && parentMsg.text.includes('|WF:')) {
      const parts = parentMsg.text.split('|');
      for (const p of parts) {
        if (p.startsWith('WF:')) wfStr = p.substring(3);
      }
    }
    await handleVoiceTranslation(fileName, msgId, wfStr);
  };

  const stopRecordingAndSend = () => {
    if (isRecordLocked && !isRecordPaused) return; // if locked and not paused, do nothing on mouse up
    if (mediaRecorderRef.current && (isRecording || isRecordPaused)) {
      mediaRecorderRef.current.stop();
    }
  };

  const forceStopRecordingAndSend = () => {
    if (mediaRecorderRef.current && (isRecording || isRecordPaused)) {
      mediaRecorderRef.current.stop();
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isRecordPaused) {
      mediaRecorderRef.current.pause();
      recAccumulatedTimeRef.current += Date.now() - recStartTimeRef.current;
      setIsRecordPaused(true);
      // Generate preview
      try {
        mediaRecorderRef.current.requestData();
        setTimeout(() => {
          if (audioChunksRef.current.length > 0) {
            const tempBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const url = URL.createObjectURL(tempBlob);
            setRecordPreviewUrl(url);
          }
        }, 150);
      } catch (e) {}
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isRecordPaused) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setRecordPreviewUrl(null);
      setIsRecordPlaying(false);
      recStartTimeRef.current = Date.now();
      mediaRecorderRef.current.resume();
      setIsRecordPaused(false);
    }
  };

  const cancelRecording = () => {
    audioChunksRef.current = [];
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = () => {
        setIsRecording(false);
        setIsRecordingLocked(false);
        setIsRecordPaused(false);
        setRecordPreviewUrl(null);
        setIsRecordPlaying(false);
        setRecordingDuration(0);
        setRecordWaveHistory([]);
        setMicPulseScale(1);
      };
      mediaRecorderRef.current.stop();
    } else {
      setIsRecording(false);
      setIsRecordingLocked(false);
      setIsRecordPaused(false);
      setRecordPreviewUrl(null);
      setIsRecordPlaying(false);
      setRecordingDuration(0);
      setRecordWaveHistory([]);
      setMicPulseScale(1);
    }
  };

  // Swipe-to-reply gesture handlers
  const handleTouchStart = (e: any, msgId: string) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipingMsgId.current = msgId;
    setSwipeOffset(0);
  };

  const handleTouchMove = (e: any, msgId: string) => {
    if (swipingMsgId.current !== msgId) return;

    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    // Horizonal swipe verification
    if (deltaX < 0 && Math.abs(deltaX) > Math.abs(deltaY)) {
      setSwipeOffset(Math.max(deltaX, -80)); // Limit visual pull
      if (Math.abs(deltaX) > 50) {
        // Trigger reply UI preview
        const targetMsg = messages.find((m) => m.id === msgId);
        if (targetMsg) {
          let cleanText = targetMsg.text;
          if (cleanText.startsWith('[VOICE]:')) cleanText = '🎤 Голосовое сообщение';
          if (cleanText.startsWith('[GROUP_INVITE]:')) cleanText = '🎫 Приглашение в группу';

          setReplyTo({
            id: targetMsg.id,
            name: targetMsg.isMine ? 'Я' : getSenderName(targetMsg.sender_id),
            text: cleanText,
          });

          if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.selectionChanged();
          }

          swipingMsgId.current = null;
          setSwipeOffset(0);
        }
      }
    } else {
      setSwipeOffset(0);
    }
  };

  const handleMicTouchMove = (e: React.TouchEvent | any) => {
    if (!isRecording || isRecordLocked) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    if (deltaX < -100) {
      cancelRecording();
    } else if (deltaY < -100) {
      setIsRecordingLocked(true);
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
      }
    }
  };

  const handleTouchEnd = () => {
    swipingMsgId.current = null;
    setSwipeOffset(0);
  };

  const handleScrollToMessage = (targetId: string) => {
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-animation');
      setTimeout(() => el.classList.remove('highlight-animation'), 1500);
    }
  };

  // Group invitations accepting
  const handleAcceptGroupInvite = async (groupId: string, keysJSONBase64: string) => {
    try {
      const keysJSON = atob(keysJSONBase64);

      // Verify group membership duplication
      const { data: existing } = await supabaseClient
        .from('chat_keys')
        .select('id')
        .eq('chat_id', groupId)
        .eq('user_id', currentUser.id);

      if (existing && existing.length > 0) {
        alert('Вы уже вступили в эту группу!');
        return;
      }

      const { error } = await supabaseClient.from('chat_keys').insert({
        chat_id: groupId,
        user_id: currentUser.id,
        encrypted_key: keysJSON,
      });

      if (error) throw error;

      alert('Вы успешно вступили в группу!');
      onBack(); // Refresh main lists
    } catch (err: any) {
      alert('Ошибка вступления: ' + err.message);
    }
  };

  // Load chat detailed information
  async function loadChatInfoDetails() {
    if (chat.type === 'group') {
      try {
        const { data: keys } = await supabaseClient
          .from('chat_keys')
          .select('user_id')
          .eq('chat_id', chat.id);

        if (keys && keys.length > 0) {
          const userIds = keys.map((k) => k.user_id);
          const { data: users } = await supabaseClient
            .from('users')
            .select('*')
            .in('tg_id', userIds);

          setGroupMembers(users || []);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  const getSenderName = (senderId: number) => {
    if (senderId === currentUser.id) return 'Я';
    const member = groupMembers.find((m) => m.tg_id === senderId);
    return member ? member.first_name : 'Участник';
  };

  useEffect(() => {
    if (activeModal === 'info') {
      loadChatInfoDetails();
    } else if (activeModal === 'debts') {
      loadDebtsSummary();
    } else if (activeModal === 'add-debt') {
      loadAddDebtSettings();
    } else if (activeModal === 'invite-friend') {
      loadInviteFriendsList();
    }
  }, [activeModal]);

  const handleEditGroupName = async () => {
    const newName = prompt('Новое название группы:', groupName);
    if (!newName || !newName.trim() || newName === groupName) return;

    const trimmed = newName.trim();
    try {
      await supabaseClient.from('chats').update({ name: trimmed }).eq('id', chat.id);
      setGroupName(trimmed);
      chat.name = trimmed;
    } catch (e) {
      console.error(e);
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Выйти из группы? Вы потеряете доступ к переписке.')) return;

    try {
      await supabaseClient
        .from('chat_keys')
        .delete()
        .eq('chat_id', chat.id)
        .eq('user_id', currentUser.id);

      // Clean local cache
      await idbKeyval.del(`chat_hist_${chat.id}`);
      await idbKeyval.del(`aes_key_${chat.id}`);

      alert('Вы вышли из группы.');
      onBack();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteGroupForEveryone = async () => {
    if (!confirm('УДАЛИТЬ ГРУППУ ДЛЯ ВСЕХ? Это сотрет ее из базы навсегда.')) return;

    try {
      await supabaseClient.from('chats').delete().eq('id', chat.id);
      await idbKeyval.del(`chat_hist_${chat.id}`);
      await idbKeyval.del(`aes_key_${chat.id}`);

      alert('Группа удалена.');
      onBack();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const loadInviteFriendsList = async () => {
    try {
      const { data: friendships } = await supabaseClient
        .from('friendships')
        .select('*')
        .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`);

      const friendIds = (friendships || [])
        .filter((r) => r.status === 'accepted')
        .map((r) => (r.requester_id === currentUser.id ? r.addressee_id : r.requester_id));

      if (friendIds.length > 0) {
        const { data: users } = await supabaseClient
          .from('users')
          .select('*')
          .in('tg_id', friendIds);

        setFriendsList(users || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendGroupInvite = async (friendId: number) => {
    if (!chatKey) return;
    try {
      const { data: friendData } = await supabaseClient
        .from('users')
        .select('public_key')
        .eq('tg_id', friendId)
        .maybeSingle();

      if (!friendData) return;

      let friendKeys = JSON.parse(friendData.public_key);
      if (friendKeys.kty) friendKeys = { legacy: friendKeys };

      const encGroupKeys: Record<string, string> = {};
      for (const [devId, pubJwk] of Object.entries(friendKeys)) {
        encGroupKeys[devId] = await encryptChatKeyForFriend(chatKey, pubJwk);
      }

      // Format payload
      const invitePayload = `[GROUP_INVITE]:${chat.id}|${chat.name}|${JSON.stringify(encGroupKeys)}`;

      // Resolve pm chat ID with friend
      const { data: pmChatId } = await supabaseClient.rpc('get_private_chat', {
        user1_id: currentUser.id,
        user2_id: friendId,
      });

      if (!pmChatId) {
        alert('Сначала начните личный чат с этим другом, чтобы отправить инвайт.');
        return;
      }

      // Decrypt PM AES Key
      let pmAesKey = await idbKeyval.get<CryptoKey>(`aes_key_${pmChatId}`);
      if (!pmAesKey) {
        const { data: keyData } = await supabaseClient
          .from('chat_keys')
          .select('encrypted_key')
          .eq('chat_id', pmChatId)
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (keyData) {
          let encK = '';
          try {
            const keysDict = JSON.parse(keyData.encrypted_key);
            const devId = localStorage.getItem('syndicate_device_id') || 'legacy';
            encK = keysDict[devId] || keysDict['legacy_dev'] || keysDict['legacy'];
          } catch (e) {
            encK = keyData.encrypted_key;
          }
          pmAesKey = await decryptChatKey(encK, currentUser.id);
        }
      }

      if (!pmAesKey) {
        alert('Нет ключа расшифровки от личной переписки.');
        return;
      }

      const encryptedInvite = await encryptText(invitePayload, pmAesKey, currentUser.id);
      await supabaseClient.from('messages').insert({
        chat_id: pmChatId,
        sender_id: currentUser.id,
        encrypted_text: encryptedInvite,
      });

      alert('Приглашение отправлено!');
      setActiveModal('none');
    } catch (err: any) {
      alert('Ошибка отправки: ' + err.message);
    }
  };

  const handleRemoveFriendship = async () => {
    if (!confirm('Удалить друга из списка? Личные переписки станут недоступны.')) return;

    try {
      const friendId = chat.friendId || 0;
      await supabaseClient
        .from('friendships')
        .delete()
        .or(`and(requester_id.eq.${currentUser.id},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${currentUser.id})`);

      alert('Друг удален.');
      onBack();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Debts logic
  const loadDebtsSummary = async () => {
    if (chat.type !== 'private') return;
    const friendId = chat.friendId || 0;

    try {
      const { data, error } = await supabaseClient
        .from('debts')
        .select('*')
        .or(`and(creditor_id.eq.${friendId},debtor_id.eq.${currentUser.id}),and(creditor_id.eq.${currentUser.id},debtor_id.eq.${friendId})`);

      if (error) throw error;
      setDebts(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadAddDebtSettings = async () => {
    if (chat.type !== 'private') return;
    const friendId = chat.friendId || 0;

    try {
      const { data } = await supabaseClient.from('currencies').select('*').in('owner_id', [friendId, currentUser.id]);
      setCurrencies(data || []);
      if (data && data.length > 0) {
        setSelectedCurrency(data[0]);
      } else {
        setSelectedCurrency({ id: 'rub', owner_id: friendId, name: 'Руб.', rub_value: 1 });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveDebt = async () => {
    const rubles = parseFloat(debtRubles);
    if (isNaN(rubles) || rubles <= 0) {
      alert('Введите корректную сумму!');
      return;
    }

    const friendId = chat.friendId || 0;
    const price = selectedCurrency ? selectedCurrency.rub_value : 1;
    const currencyName = selectedCurrency ? selectedCurrency.name : 'Руб.';

    const finalAmount = parseFloat((rubles / price).toFixed(2));

    try {
      const { error } = await supabaseClient.from('debts').insert({
        creditor_id: friendId,
        debtor_id: currentUser.id,
        amount: finalAmount,
        currency: currencyName,
      });

      if (error) throw error;

      setDebtRubles('');
      setActiveModal('debts');
      loadDebtsSummary();
    } catch (err: any) {
      alert('Ошибка добавления: ' + err.message);
    }
  };

  const handleDeleteDebt = async (id: string) => {
    if (!confirm('Подтвердить выполнение долга?')) return;

    try {
      await supabaseClient.from('debts').delete().eq('id', id);
      loadDebtsSummary();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const isGroup = chat.type === 'group';

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col bg-slate-950 relative select-none animate-fade-in text-slate-100">
      {/* Top Header info */}
      <div className="flex items-center justify-between border-b border-slate-900 pb-3 p-4 bg-slate-900/40 relative z-10 flex-shrink-0">
        <button
          onClick={onBack}
          className="text-primary hover:text-primary-hover font-medium flex items-center focus:outline-none"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <div
          onClick={() => setActiveModal('info')}
          className="flex flex-col items-center justify-center text-center cursor-pointer flex-grow mx-4 overflow-hidden"
        >
          <span className="font-semibold text-slate-200 text-base truncate max-w-full">
            {isGroup ? groupName : chat.name}
          </span>
          <span className="text-xs text-emerald-500 font-mono truncate max-w-full">
            {chatFingerprint}
          </span>
        </div>

        <div className="flex gap-2.5">
          {chat.type === 'private' && (
            <button
              onClick={() => setActiveModal('debts')}
              className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-primary hover:text-primary-hover active:scale-95 transition focus:outline-none"
            >
              <Wallet className="w-4.5 h-4.5" />
            </button>
          )}
          <button
            onClick={() => setActiveModal('search')}
            className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-primary hover:text-primary-hover active:scale-95 transition focus:outline-none"
          >
            <Search className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Messages area in reverse layout */}
      <div className="chat-container flex-grow overflow-hidden relative">
        <div
          ref={messagesAreaRef}
          onScroll={handleScroll}
          className="messages-area h-full overflow-y-auto p-4 flex flex-col-reverse gap-3.5 select-text"
        >
          {isLoadingChat ? (
            <div className="flex flex-col gap-4 opacity-50 pointer-events-none w-full">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={`flex w-full ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                  <div className={`w-2/3 h-16 rounded-2xl animate-pulse ${i % 2 === 0 ? 'bg-primary/20' : 'bg-slate-800'}`} />
                </div>
              ))}
            </div>
          ) : (
            messages
              .slice()
              .reverse()
              .slice(0, renderLimit)
              .map((m) => {
                const msgDate = new Date(m.created_at);
                const timeStr = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const isSwiping = swipingMsgId.current === m.id;

                return (
                  <div
                    key={m.id}
                    id={`msg-${m.id}`}
                    onTouchStart={(e) => handleTouchStart(e, m.id)}
                    onTouchMove={(e) => handleTouchMove(e, m.id)}
                    onTouchEnd={handleTouchEnd}
                    className={`flex w-full relative ${m.isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      style={{
                        transform: isSwiping ? `translateX(${swipeOffset}px)` : 'translateX(0px)',
                        transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
                      }}
                      className={`msg-bubble flex flex-col px-4 py-3 relative max-w-[85%] break-words overflow-hidden ${
                        m.isMine
                          ? 'msg-mine bg-primary text-white rounded-[18px] rounded-br-[4px] shadow-md shadow-primary/10'
                          : 'msg-other bg-slate-900 border border-slate-850 text-slate-100 rounded-[18px] rounded-bl-[4px]'
                      }`}
                    >
                  {/* Sender Name in group */}
                  {isGroup && !m.isMine && (
                    <div className="sender-name text-xs font-bold text-primary mb-1">
                      {getSenderName(m.sender_id)}
                    </div>
                  )}

                  {/* Reply block wrapper */}
                  {m.reply && (
                    <div
                      onClick={() => handleScrollToMessage(m.reply!.id)}
                      className={`msg-reply-block cursor-pointer border-l-2 p-1.5 rounded mb-2.5 text-xs ${
                        m.isMine
                          ? 'bg-white/10 border-white text-white/95'
                          : 'bg-black/10 border-primary text-slate-300'
                      }`}
                    >
                      <div className="font-bold mb-0.5">{m.reply.name}</div>
                      <div className="truncate">{m.reply.text}</div>
                    </div>
                  )}

                  {/* Message main bodies */}
                  {m.voiceData ? (
                    <VoicePlayer
                      fileName={m.voiceData.fileName}
                      waveformString={m.voiceData.waveform.join(',')}
                      aesKey={chatKey}
                      transcription={m.voiceData.transcription}
                      isProcessing={m.voiceData.isProcessing}
                      isError={m.voiceData.isError}
                      hasTranscript={m.voiceData.hasTranscript}
                      msgId={m.id}
                      onTranscribe={handleManualTranscribe}
                    />
                  ) : m.inviteData ? (
                    <div className="flex flex-col gap-3 p-2 bg-black/15 rounded-xl border border-white/5">
                      <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                        Приглашение в группу
                      </span>
                      <span className="font-bold text-base text-slate-100">{m.inviteData.groupName}</span>
                      {!m.isMine && (
                        <button
                          onClick={() => handleAcceptGroupInvite(m.inviteData!.groupId, m.inviteData!.keysJSON)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition"
                        >
                          Вступить в группу
                        </button>
                      )}
                    </div>
                  ) : m.isError ? (
                    <span className="text-rose-300 flex items-center gap-1.5 italic text-sm">
                      <Shield className="w-4 h-4 text-rose-500 flex-shrink-0" /> {m.text}
                    </span>
                  ) : !m.isAuthentic ? (
                    <span className="text-rose-300 flex items-center gap-1.5 italic text-sm font-semibold">
                      <Shield className="w-4 h-4 text-rose-500 flex-shrink-0 animate-bounce" /> [ОТКЛОНЕНО: Подпись подделана!]
                    </span>
                  ) : (
                    <div className="whitespace-pre-wrap select-text text-sm leading-relaxed">{m.text}</div>
                  )}

                  {/* Timestamps */}
                  <span
                    className={`text-[10px] text-right mt-1 w-full block tracking-wide select-none ${
                      m.isMine ? 'text-white/60' : 'text-slate-500'
                    }`}
                  >
                    {timeStr}
                  </span>
                    </div>

                  {isSwiping && swipeOffset < 0 && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-slate-300 z-0">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>

        {/* Scroll back bottom float button */}
        <button
          onClick={handleScrollToBottom}
          className={`absolute right-4 bottom-5 w-11 h-11 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 shadow-xl transition-all duration-300 focus:outline-none z-40 transform ${
            showScrollBottom ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-75 pointer-events-none'
          }`}
        >
          <ArrowDown className="w-5 h-5 animate-bounce" />
        </button>
      </div>

      {/* Input controller bar */}
      <div className="chat-input-area flex-shrink-0 flex flex-col bg-slate-900/80 backdrop-blur-xl border-t border-slate-900 px-4 py-2 relative z-10">
        {/* Reply Preview */}
        {replyTo && (
          <div className="flex items-center gap-2 bg-slate-950/40 p-2.5 rounded-xl border border-slate-900/60 mb-2 select-none animate-slide-up">
            <div className="flex-grow border-l-2 border-primary pl-3">
              <div className="text-xs font-semibold text-primary">{replyTo.name}</div>
              <div className="text-xs text-slate-400 truncate max-w-[260px]">{replyTo.text}</div>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="text-slate-500 hover:text-slate-300 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Form controls */}
        <div className="flex items-end gap-3 w-full relative">
          {isRecording && (
            <div className="absolute inset-y-0 left-0 right-[56px] bg-slate-900 z-20 flex items-center justify-between px-2 rounded-2xl">
              <div className="flex items-center gap-3">
                {!isRecordLocked ? (
                  <>
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-slate-200 font-mono font-bold tracking-widest text-lg">
                      {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:{(recordingDuration % 60).toString().padStart(2, '0')}
                    </span>
                  </>
                ) : (
                  <button onClick={cancelRecording} className="text-slate-400 p-2 hover:bg-slate-800 rounded-full transition">
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
              
              {!isRecordLocked ? (
                <div className="flex flex-col items-end gap-1 select-none pointer-events-none mr-2">
                  <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1"><span className="text-lg leading-none">&larr;</span> Отмена</span>
                  <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">Замок <span className="text-lg leading-none">&uarr;</span></span>
                </div>
              ) : (
                <div className="flex items-center justify-center flex-grow">
                  {recordPreviewUrl && (
                    <audio
                      ref={previewAudioRef}
                      src={recordPreviewUrl}
                      onEnded={() => {
                        setIsRecordPlaying(false);
                        setRecordPreviewProgress(0);
                      }}
                      onTimeUpdate={(e) => {
                        const target = e.target as HTMLAudioElement;
                        if (target.duration) {
                          setRecordPreviewProgress(target.currentTime / target.duration);
                        }
                      }}
                      className="hidden"
                    />
                  )}
                  {isRecordPaused ? (
                    <div className="flex items-center gap-3 bg-slate-800/50 py-1 px-3 rounded-full flex-grow mx-2">
                      <button
                        onClick={() => {
                          if (previewAudioRef.current) {
                            if (isRecordPlaying) {
                              previewAudioRef.current.pause();
                              setIsRecordPlaying(false);
                            } else {
                              previewAudioRef.current.play();
                              setIsRecordPlaying(true);
                            }
                          }
                        }}
                        className="text-primary hover:scale-105 transition flex-shrink-0"
                      >
                        {isRecordPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                      </button>
                      
                      <div className="flex items-center gap-0.5 h-6 flex-grow overflow-hidden justify-center opacity-70">
                        {recordWaveHistory.slice(-20).map((vol, idx) => {
                          const isActive = idx < Math.floor(recordPreviewProgress * 20);
                          return (
                            <div
                              key={idx}
                              className={`w-1 rounded-full transition-all ${isActive ? 'bg-primary' : 'bg-slate-400'}`}
                              style={{ height: `${Math.max(10, Math.min(100, (vol / 150) * 100))}%` }}
                            />
                          );
                        })}
                      </div>

                      <span className="text-slate-300 font-mono font-bold tracking-widest text-sm flex-shrink-0">
                        {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:{(recordingDuration % 60).toString().padStart(2, '0')}
                      </span>
                      <div className="w-px h-5 bg-slate-700 flex-shrink-0" />
                      <button onClick={resumeRecording} className="text-slate-400 hover:text-red-400 transition flex items-center flex-shrink-0">
                        <Mic className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 w-full max-w-[150px] mx-auto">
                      <button onClick={pauseRecording} className="text-red-400 hover:text-red-300 transition p-1 bg-red-400/10 rounded-full flex-shrink-0">
                        <Pause className="w-5 h-5 fill-current" />
                      </button>
                      <span className="text-red-400 font-mono font-bold tracking-widest text-sm">
                        {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:{(recordingDuration % 60).toString().padStart(2, '0')}
                      </span>
                      <div className="flex items-center gap-0.5 h-6 flex-grow overflow-hidden justify-end">
                        {recordWaveHistory.slice(-15).map((vol, idx) => (
                          <div
                            key={idx}
                            className="w-1 bg-red-400 rounded-full transition-all"
                            style={{ height: `${Math.max(10, Math.min(100, (vol / 150) * 100))}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <textarea
            ref={inputRef}
            rows={1}
            value={inputText}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Сообщение..."
            className="flex-grow bg-slate-950 border border-slate-850 text-slate-200 rounded-2xl px-4 py-2.5 text-base focus:border-primary outline-none max-h-[120px] resize-none overflow-y-auto leading-[20px] min-h-[42px]"
          />

          {inputText.trim() || isRecordLocked ? (
            <button
              onClick={() => isRecordLocked ? forceStopRecordingAndSend() : handleSendMessage()}
              className="w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-primary/10 focus:outline-none z-30 flex-shrink-0"
            >
              <Send className="w-5 h-5 transform rotate-[-15deg] translate-x-[-1px] translate-y-[1px]" />
            </button>
          ) : (
            <button
              onMouseDown={startRecording}
              onTouchStart={startRecording}
              onMouseUp={stopRecordingAndSend}
              onTouchEnd={stopRecordingAndSend}
              onTouchMove={handleMicTouchMove}
              onMouseMove={handleMicTouchMove}
              style={{ transform: `scale(${micPulseScale})` }}
              className={`w-11 h-11 rounded-full border text-slate-300 flex items-center justify-center transition shadow-lg focus:outline-none touch-none select-none z-30 flex-shrink-0 ${isRecording ? 'bg-red-500 border-red-500 text-white shadow-red-500/20' : 'bg-slate-900 border-slate-800 active:bg-slate-800'}`}
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Info details screen */}
      {activeModal === 'info' && (
        <div className="fixed inset-0 z-[1000] bg-slate-950 p-6 overflow-y-auto animate-fade-in flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setActiveModal('none')} className="text-primary font-medium">
              Закрыть
            </button>
            <span className="font-bold text-slate-200">Информация</span>
            <div className="w-10" />
          </div>

          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 rounded-full bg-primary-light border border-primary-border text-primary flex items-center justify-center text-3xl font-bold mb-3">
              {(isGroup ? groupName : chat.name).charAt(0).toUpperCase()}
            </div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              {isGroup ? groupName : chat.name}
              {isGroup && (
                <button onClick={handleEditGroupName} className="text-slate-500 hover:text-slate-300">
                  <Edit2 className="w-4.5 h-4.5" />
                </button>
              )}
            </h2>
            <span className="text-xs text-slate-500 font-mono mt-1 select-text">ID: {chat.id}</span>
          </div>

          {isGroup ? (
            <div className="flex flex-col gap-5 flex-grow">
              <button
                onClick={() => setActiveModal('invite-friend')}
                className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <UserPlus className="w-5 h-5" /> Позвать брата
              </button>

              <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Участники ({groupMembers.length})
                </h4>
                <div className="flex flex-col gap-3">
                  {groupMembers.map((m) => (
                    <div key={m.tg_id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-sm font-bold">
                        {m.first_name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold text-slate-200">
                        {m.first_name} {m.tg_id === currentUser.id && '(Вы)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-auto">
                <button
                  onClick={handleLeaveGroup}
                  className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-1.5 transition"
                >
                  <LogOut className="w-5 h-5" /> Выйти из группы
                </button>
                <button
                  onClick={handleDeleteGroupForEveryone}
                  className="w-full border border-rose-500/30 hover:bg-rose-500/5 text-rose-500 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-1.5 transition"
                >
                  <Trash className="w-5 h-5" /> Удалить для всех
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 mt-auto">
              <button
                onClick={handleRemoveFriendship}
                className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <UserMinus className="w-5 h-5" /> Удалить из друзей
              </button>
            </div>
          )}
        </div>
      )}

      {/* Deep Search screen */}
      {activeModal === 'search' && (
        <div className="fixed inset-0 z-[1000] bg-slate-950 p-5 overflow-y-auto animate-fade-in flex flex-col">
          <div className="flex justify-between items-center mb-6 flex-shrink-0">
            <button onClick={() => setActiveModal('none')} className="text-primary font-medium">
              Закрыть
            </button>
            <span className="font-bold text-slate-200">Поиск в чате</span>
            <div className="w-10" />
          </div>
          <div className="flex-grow overflow-hidden">
            <DeepSearch chatId={chat.id} aesKey={chatKey} userId={currentUser.id} />
          </div>
        </div>
      )}

      {/* Debt summary list screen */}
      {activeModal === 'debts' && (
        <div className="fixed inset-0 z-[1000] bg-slate-950 p-6 overflow-y-auto animate-fade-in flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setActiveModal('none')} className="text-primary font-medium">
              Закрыть
            </button>
            <span className="font-bold text-slate-200">Сводка долгов</span>
            <div className="w-10" />
          </div>

          <div className="bg-slate-900/40 border border-slate-900 p-5 rounded-2xl mb-6">
            {debts.length === 0 ? (
              <div className="text-center py-10 flex flex-col items-center justify-center text-slate-500 text-sm">
                <HelpCircle className="w-10 h-10 text-slate-700 mb-2" />
                Никто никому не должен
              </div>
            ) : (
              <div className="flex flex-col gap-4 divide-y divide-slate-900">
                {debts.map((d, idx) => {
                  const friendId = chat.friendId || 0;
                  const amIDebtor = d.debtor_id === currentUser.id;

                  return (
                    <div
                      key={d.id}
                      className={`flex justify-between items-center ${idx > 0 ? 'pt-4' : ''}`}
                    >
                      <div className="flex flex-col">
                        <span
                          className={`font-bold text-lg ${
                            amIDebtor ? 'text-rose-500' : 'text-emerald-500'
                          }`}
                        >
                          {amIDebtor ? '-' : '+'} {d.amount} {d.currency}
                        </span>
                        <span className="text-xs text-slate-400 mt-1">
                          {amIDebtor ? 'Вы должны' : 'Вам должны'}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteDebt(d.id)}
                        className="bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-100 font-semibold py-2 px-4 rounded-lg text-sm transition"
                      >
                        {amIDebtor ? 'Отдал' : 'Простить'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => setActiveModal('add-debt')}
            className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-1.5 mt-auto transition"
          >
            <Plus className="w-5 h-5" /> Оформить долг
          </button>
        </div>
      )}

      {/* Add Debt view screen */}
      {activeModal === 'add-debt' && (
        <div className="fixed inset-0 z-[1000] bg-slate-950 p-6 overflow-y-auto animate-fade-in flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setActiveModal('debts')} className="text-primary font-medium">
              Назад
            </button>
            <span className="font-bold text-slate-200">Оформление долга</span>
            <div className="w-10" />
          </div>

          <div className="bg-slate-900/60 border border-slate-900 p-5 rounded-2xl flex flex-col gap-4">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                Я должен (в рублях)
              </label>
              <input
                type="number"
                value={debtRubles}
                onChange={(e) => setDebtRubles(e.target.value)}
                placeholder="Сумма..."
                className="w-full bg-slate-950 border border-slate-900 text-slate-200 rounded-xl px-4 py-3 text-lg font-bold text-center focus:border-primary outline-none"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                В чем принимает друг
              </label>
              <div className="relative w-full">
                <select
                  onChange={(e) => {
                    const selected = currencies.find((c) => c.id === e.target.value);
                    setSelectedCurrency(selected || null);
                  }}
                  className="w-full bg-slate-950 border border-slate-900 text-slate-200 rounded-xl px-4 py-3 text-base focus:border-primary outline-none appearance-none"
                >
                  {currencies.length === 0 && <option value="">Загрузка...</option>}
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Курс: {c.rub_value} ₽)
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                  <ArrowDown className="w-4 h-4" />
                </div>
              </div>
            </div>

            {selectedCurrency && debtRubles && parseFloat(debtRubles) > 0 && (
              <div className="text-center py-4 bg-slate-950/40 rounded-xl border border-slate-900 my-2">
                <span className="text-xs text-slate-500 font-semibold tracking-wide uppercase">
                  Итого к выплате
                </span>
                <span className="text-2xl font-bold text-emerald-500 block mt-1.5">
                  {(parseFloat(debtRubles) / selectedCurrency.rub_value).toFixed(2)}{' '}
                  {selectedCurrency.name}
                </span>
              </div>
            )}

            <button
              onClick={handleSaveDebt}
              className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-1.5 transition"
            >
              Закрепить долг
            </button>
          </div>
        </div>
      )}

      {/* Invite friends list selection screen */}
      {activeModal === 'invite-friend' && (
        <div className="fixed inset-0 z-[1000] bg-slate-950 p-6 overflow-y-auto animate-fade-in flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setActiveModal('info')} className="text-primary font-medium">
              Назад
            </button>
            <span className="font-bold text-slate-200">Кого позвать?</span>
            <div className="w-10" />
          </div>

          <div className="flex flex-col gap-3">
            {friendsList.length === 0 ? (
              <p className="text-slate-500 text-center py-10 text-sm">
                Список друзей пуст
              </p>
            ) : (
              friendsList.map((f) => (
                <div
                  key={f.tg_id}
                  className="flex items-center justify-between p-4 bg-slate-900/40 border border-slate-900/60 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-200 flex items-center justify-center text-sm font-bold">
                      {f.first_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold text-slate-200 text-sm">{f.first_name}</span>
                  </div>

                  <button
                    onClick={() => handleSendGroupInvite(f.tg_id)}
                    className="bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-lg text-xs transition"
                  >
                    Позвать
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }

        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }

        @keyframes highlight-msg {
          0% { background-color: rgba(10, 132, 255, 0.4); }
          100% { background-color: transparent; }
        }
        .highlight-animation {
          animation: highlight-msg 1.5s ease-out;
        }
      `}</style>
    </div>
  );
}
