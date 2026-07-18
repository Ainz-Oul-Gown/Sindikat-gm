import { useState, useEffect, useRef } from 'react';
import * as idbKeyval from 'idb-keyval';
import {
  ShieldAlert,
  Smartphone,
  Bookmark,
  Users,
  UserCheck,
  UserMinus,
  Settings,
  UserPlus,
  ChevronRight,
  Plus,
  Loader2,
  X,
  LogOut,
  HelpCircle,
  Key,
} from 'lucide-react';
import { supabaseClient, setSupabaseToken, parseJwt } from './lib/supabase';
import { checkCryptoKeys, generateChatKey, encryptChatKeyForFriend, decryptChatKey, getFingerprint } from './lib/crypto';
import { Chat, Friendship, User, DeviceRequest } from './types';
import StealthOverlay from './components/StealthOverlay';
import PinScreen from './components/PinScreen';
import ChatView from './components/ChatView';
import SettingsModal from './components/SettingsModal';
import { applyTheme } from './lib/theme';

export default function App() {
  const [currentUser, setCurrentUser] = useState<{ id: number; first_name: string } | null>(null);
  const [isAuth, setIsAuth] = useState(false);
  const [loadingText, setLoadingText] = useState('Загрузка Синдиката...');

  // Navigation states
  const [activeScreen, setActiveScreen] = useState<'main' | 'chat' | 'sync_waiting'>('main');
  const [activeChat, setActiveChat] = useState<Chat | null>(null);

  // Modals & Panels
  const [showSettings, setShowSettings] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Local PIN lock
  const [isPinLocked, setIsPinLocked] = useState(false);
  const [pinMode, setPinMode] = useState<'unlock' | 'setup_1' | 'setup_2' | 'disable_normal' | 'disable_panic'>('unlock');
  const [pinType, setPinType] = useState<'normal' | 'panic'>('normal');

  // Master device approvals and requests
  const [pendingSyncRequest, setPendingSyncRequest] = useState<DeviceRequest | null>(null);

  // Chat/Friend List states
  const [chats, setChats] = useState<Chat[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [friendRequests, setFriendRequests] = useState<any[]>([]);
  const [groupChats, setGroupChats] = useState<Chat[]>([]);

  // Input bindings
  const [friendIdInput, setFriendIdInput] = useState('');
  const [groupNameInput, setGroupNameInput] = useState('');
  const [searchSpinner, setSearchSpinner] = useState(false);

  // Background Web Worker
  const workerRef = useRef<Worker | null>(null);

  const getDeviceId = () => {
    let did = localStorage.getItem('syndicate_device_id');
    if (!did) {
      did = 'dev_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('syndicate_device_id', did);
    }
    return did;
  };

  // 1. Authenticate user from Telegram WebApp context or custom saved JWT tokens
  const authUser = async (): Promise<boolean> => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const urlToken = hashParams.get('token');
    const tgInitData = window.Telegram?.WebApp?.initData;

    if (tgInitData) {
      try {
        setLoadingText('Авторизация через Telegram...');
        const oldToken = localStorage.getItem('synd_token');
        setSupabaseToken(null); // Clear header to invoke cleanly

        const { data: result } = await supabaseClient.functions.invoke('tg-auth', {
          body: { initData: tgInitData },
        });

        if (result && result.token) {
          setSupabaseToken(result.token);
          setCurrentUser({ id: result.id, first_name: result.first_name });
          return true;
        } else if (oldToken) {
          setSupabaseToken(oldToken);
        }
      } catch (e) {
        console.error('Telegram auth failed', e);
      }
    }

    const tokenToUse = urlToken && urlToken.startsWith('eyJ') ? urlToken : localStorage.getItem('synd_token');
    if (tokenToUse) {
      setSupabaseToken(tokenToUse);
      const payload = parseJwt(tokenToUse);

      if (payload && payload.tg_id) {
        setLoadingText('Связь с сервером...');
        const { data } = await supabaseClient
          .from('users')
          .select('first_name')
          .eq('tg_id', payload.tg_id)
          .single();

        if (data) {
          setCurrentUser({ id: payload.tg_id, first_name: data.first_name });
          if (urlToken) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          return true;
        }
      }
    }

    return false;
  };

  // 2. Perform RSA/ECDSA key synchronizations (Decentralized Master Sync protocol)
  const syncDeviceKeys = async (userId: number) => {
    setActiveScreen('sync_waiting');
    setLoadingText('Ожидание подтверждения от главного устройства...');

    try {
      // Create ephemeral RSA key pair for secure key transport
      const tempKeyPair = await window.crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 4096,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
      );

      await idbKeyval.set('temp_sync_priv_key', tempKeyPair.privateKey);
      const tempPubJwk = await window.crypto.subtle.exportKey('jwk', tempKeyPair.publicKey);

      const platform = navigator.userAgent.substring(0, 45) || 'Неизвестное устройство';

      const { data: requestData, error } = await supabaseClient
        .from('device_requests')
        .insert({
          user_id: userId,
          device_name: platform,
          temp_pub_key: JSON.stringify(tempPubJwk),
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        alert('Ошибка подачи заявки на синхронизацию: ' + error.message);
        return;
      }

      // Proctored approvals listener
      const channel = supabaseClient
        .channel(`sync-waiter-${requestData.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'device_requests',
            filter: `id=eq.${requestData.id}`,
          },
          async (payload: any) => {
            const updated = payload.new;
            if (updated.status === 'approved') {
              supabaseClient.removeChannel(channel);
              await handleApprovedKeys(updated, tempKeyPair.privateKey, userId);
            } else if (updated.status === 'rejected') {
              supabaseClient.removeChannel(channel);
              alert('Доступ отклонен главным устройством.');
              localStorage.clear();
              window.location.reload();
            }
          }
        )
        .subscribe();

      // Reliable polling fallback
      const poll = setInterval(async () => {
        const { data } = await supabaseClient
          .from('device_requests')
          .select('*')
          .eq('id', requestData.id)
          .single();

        if (data && data.status === 'approved') {
          clearInterval(poll);
          supabaseClient.removeChannel(channel);
          await handleApprovedKeys(data, tempKeyPair.privateKey, userId);
        } else if (data && data.status === 'rejected') {
          clearInterval(poll);
          supabaseClient.removeChannel(channel);
          alert('Доступ отклонен главным устройством.');
          localStorage.clear();
          window.location.reload();
        }
      }, 4000);
    } catch (e: any) {
      alert('Ошибка синхронизации: ' + e.message);
    }
  };

  const handleApprovedKeys = async (request: any, tempPrivKey: CryptoKey, userId: number) => {
    setLoadingText('Расшифровка и сохранение ключей...');

    try {
      const finalPayload = JSON.parse(request.encrypted_master_keys);

      const encryptedAesKeyBuffer = new Uint8Array(finalPayload.encryptedAesKey);
      const iv = new Uint8Array(finalPayload.iv);
      const encryptedMasterKeysBuffer = new Uint8Array(finalPayload.encryptedMasterKeys);

      // Decrypt symmetric AES wrapper key
      const rawAesKey = await window.crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        tempPrivKey,
        encryptedAesKeyBuffer
      );

      const tempAesKey = await window.crypto.subtle.importKey(
        'raw',
        rawAesKey,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      // Decrypt private master-keys
      const masterKeysRaw = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        tempAesKey,
        encryptedMasterKeysBuffer
      );

      const masterKeysJson = JSON.parse(new TextDecoder().decode(masterKeysRaw));

      // Rectify key properties to ensure decryption rights are explicitly stated
      masterKeysJson.rsa.key_ops = ['decrypt'];
      if (masterKeysJson.ecdsa) {
        masterKeysJson.ecdsa.key_ops = ['sign'];
      }

      const rsaKey = await window.crypto.subtle.importKey(
        'jwk',
        masterKeysJson.rsa,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['decrypt']
      );

      const ecdsaKey = await window.crypto.subtle.importKey(
        'jwk',
        masterKeysJson.ecdsa,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign']
      );

      await idbKeyval.set(`my_private_key_${userId}`, rsaKey);
      await idbKeyval.set(`my_sign_key_${userId}`, ecdsaKey);
      await idbKeyval.del('temp_sync_priv_key');

      // Delete request trace
      await supabaseClient.from('device_requests').delete().eq('id', request.id);

      window.location.reload();
    } catch (err: any) {
      alert('Ошибка при импорте ключей: ' + err.message);
    }
  };

  // 3. Monitor active devices and handle remote kill switch deletions
  const registerDevice = async (userId: number) => {
    const deviceId = getDeviceId();
    const platform = navigator.userAgent.substring(0, 45) || 'Неизвестное устройство';

    await supabaseClient.from('user_devices').upsert(
      {
        user_id: userId,
        device_id: deviceId,
        device_name: platform,
        last_active: new Date().toISOString(),
      },
      { onConflict: 'user_id, device_id' }
    );

    // Dynamic kill switch subscription
    supabaseClient
      .channel('kill-switch')
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'user_devices', filter: `device_id=eq.${deviceId}` },
        async () => {
          await idbKeyval.clear();
          localStorage.clear();
          alert('Сеанс завершен: Устройство удалено из аккаунта.');
          window.location.reload();
        }
      )
      .subscribe();
  };

  // 4. Listen to inbound key sync requests on primary administrator device
  const listenToSyncRequests = (userId: number) => {
    supabaseClient
      .channel('admin-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'device_requests', filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const req = payload.new;
          if (req && req.status === 'pending') {
            setPendingSyncRequest(req);
          }
        }
      )
      .subscribe();

    // Check for pending requests on load
    supabaseClient
      .from('device_requests')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setPendingSyncRequest(data[0]);
        }
      });
  };

  const handleDeviceDecision = async (requestId: string, safePubKey: string, status: 'approved' | 'rejected') => {
    if (!currentUser) return;
    setPendingSyncRequest(null);

    const updatePayload: any = { status };

    if (status === 'approved') {
      try {
        const myPrivRsa = await idbKeyval.get<CryptoKey>(`my_private_key_${currentUser.id}`);
        const myPrivEcdsa = await idbKeyval.get<CryptoKey>(`my_sign_key_${currentUser.id}`);

        if (!myPrivRsa || !myPrivEcdsa) return;

        const rsaJwk = await window.crypto.subtle.exportKey('jwk', myPrivRsa);
        const ecdsaJwk = await window.crypto.subtle.exportKey('jwk', myPrivEcdsa);

        const keysPayload = JSON.stringify({ rsa: rsaJwk, ecdsa: ecdsaJwk });
        const encodedPayload = new TextEncoder().encode(keysPayload);

        // Generate temporary symmetric wrapper key
        const tempAesKey = await window.crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt']
        );

        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encryptedMasterKeys = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          tempAesKey,
          encodedPayload
        );

        // Encrypt temporary AES key with new device public RSA key
        const exportedAesKey = await window.crypto.subtle.exportKey('raw', tempAesKey);
        const newDevicePubKey = await window.crypto.subtle.importKey(
          'jwk',
          JSON.parse(safePubKey),
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          true,
          ['encrypt']
        );

        const encryptedAesKey = await window.crypto.subtle.encrypt(
          { name: 'RSA-OAEP' },
          newDevicePubKey,
          exportedAesKey
        );

        // Map arrays to allow robust transmissions
        updatePayload.encrypted_master_keys = JSON.stringify({
          encryptedAesKey: Array.from(new Uint8Array(encryptedAesKey)),
          iv: Array.from(iv),
          encryptedMasterKeys: Array.from(new Uint8Array(encryptedMasterKeys)),
        });
      } catch (err) {
        console.error('Secure key wrap failed', err);
        return;
      }
    }

    await supabaseClient.from('device_requests').update(updatePayload).eq('id', requestId);
  };

  // 5. Query active chats, friends and pending requests lists
  const loadChatsAndFriends = async (userId: number) => {
    try {
      // Retrieve relationships
      const { data: rels } = await supabaseClient
        .from('friendships')
        .select('*')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      const relsArray = rels || [];

      // Extrapolate accepted friend ids
      const friendIds = relsArray
        .filter((r) => r.status === 'accepted')
        .map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));

      if (friendIds.length > 0) {
        const { data: users } = await supabaseClient.from('users').select('*').in('tg_id', friendIds);
        setFriends(users || []);
        localStorage.setItem('synd_cached_users', JSON.stringify(users || []));
      }

      // Extrapolate pending requests
      const pendingRels = relsArray.filter((r) => r.status === 'pending' && r.addressee_id === userId);
      if (pendingRels.length > 0) {
        const reqUserIds = pendingRels.map((r) => r.requester_id);
        const { data: pUsers } = await supabaseClient.from('users').select('*').in('tg_id', reqUserIds);
        if (pUsers) {
          const reqs = pendingRels
            .map((rel) => ({
              id: rel.id,
              user: pUsers.find((u) => u.tg_id === rel.requester_id),
            }))
            .filter((r) => r.user);
          setFriendRequests(reqs);
        }
      } else {
        setFriendRequests([]);
      }

      // Retrieve chat lists
      const { data: myKeys } = await supabaseClient
        .from('chat_keys')
        .select('chat_id')
        .eq('user_id', userId);

      if (myKeys && myKeys.length > 0) {
        const chatIds = myKeys.map((k) => k.chat_id);
        const { data: chatsData } = await supabaseClient
          .from('chats')
          .select('*')
          .in('id', chatIds);

        const groups = (chatsData || []).filter((c) => c.type === 'group');
        setGroupChats(groups);
        localStorage.setItem('synd_cached_groups', JSON.stringify(groups));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenSavedMessages = async () => {
    if (!currentUser) return;

    // Retrieve or instantiate saved self chat
    let savedChatId = '';
    try {
      const { data: myKeys } = await supabaseClient
        .from('chat_keys')
        .select('chat_id')
        .eq('user_id', currentUser.id);

      if (myKeys && myKeys.length > 0) {
        const chatIds = myKeys.map((k) => k.chat_id);
        const { data: chatsData } = await supabaseClient
          .from('chats')
          .select('*')
          .eq('type', 'saved')
          .in('id', chatIds);

        if (chatsData && chatsData.length > 0) {
          savedChatId = chatsData[0].id;
        }
      }

      let activeChatObj: Chat;

      if (savedChatId) {
        activeChatObj = { id: savedChatId, name: 'Избранное', type: 'saved' };
      } else {
        // Instantiate first-time Saved Messages E2EE chat
        const { data: myData } = await supabaseClient
          .from('users')
          .select('public_key')
          .eq('tg_id', currentUser.id)
          .single();

        const aesKey = await generateChatKey();
        const { data: newChat } = await supabaseClient
          .from('chats')
          .insert({ name: 'saved', type: 'saved' })
          .select()
          .single();

        let myKeysJson = JSON.parse(myData?.public_key || '{}');
        if (myKeysJson.kty) myKeysJson = { legacy: myKeysJson };

        const encKeys: Record<string, string> = {};
        for (const [devId, pubJwk] of Object.entries(myKeysJson)) {
          encKeys[devId] = await encryptChatKeyForFriend(aesKey, pubJwk);
        }

        await supabaseClient.from('chat_keys').insert({
          chat_id: newChat.id,
          user_id: currentUser.id,
          encrypted_key: JSON.stringify(encKeys),
        });

        // Set local IDB fast key cache
        await idbKeyval.set(`aes_key_${newChat.id}`, aesKey);

        activeChatObj = { id: newChat.id, name: 'Избранное', type: 'saved' };
      }

      setActiveChat(activeChatObj);
      setActiveScreen('chat');
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenPrivateChat = async (friend: User) => {
    if (!currentUser) return;

    try {
      // Find private chat ID from RPC
      const { data: chatId } = await supabaseClient.rpc('get_private_chat', {
        user1_id: currentUser.id,
        user2_id: friend.tg_id,
      });

      let activeChatObj: Chat;

      if (chatId) {
        activeChatObj = { id: chatId, name: friend.first_name, type: 'private' };
      } else {
        // Generate new PM chat
        const { data: friendData } = await supabaseClient
          .from('users')
          .select('public_key')
          .eq('tg_id', friend.tg_id)
          .single();

        const { data: myData } = await supabaseClient
          .from('users')
          .select('public_key')
          .eq('tg_id', currentUser.id)
          .single();

        const aesKey = await generateChatKey();
        const { data: newChat } = await supabaseClient
          .from('chats')
          .insert({ name: 'private', type: 'private' })
          .select()
          .single();

        let friendKeys = JSON.parse(friendData?.public_key || '{}');
        if (friendKeys.kty) friendKeys = { legacy: friendKeys };
        const encFriendKeys: Record<string, string> = {};
        for (const [devId, pubJwk] of Object.entries(friendKeys)) {
          encFriendKeys[devId] = await encryptChatKeyForFriend(aesKey, pubJwk);
        }

        let myKeys = JSON.parse(myData?.public_key || '{}');
        if (myKeys.kty) myKeys = { legacy: myKeys };
        const encMyKeys: Record<string, string> = {};
        for (const [devId, pubJwk] of Object.entries(myKeys)) {
          encMyKeys[devId] = await encryptChatKeyForFriend(aesKey, pubJwk);
        }

        await supabaseClient.from('chat_keys').insert([
          {
            chat_id: newChat.id,
            user_id: friend.tg_id,
            encrypted_key: JSON.stringify(encFriendKeys),
          },
          {
            chat_id: newChat.id,
            user_id: currentUser.id,
            encrypted_key: JSON.stringify(encMyKeys),
          },
        ]);

        await idbKeyval.set(`aes_key_${newChat.id}`, aesKey);

        activeChatObj = { id: newChat.id, name: friend.first_name, type: 'private' };
      }

      setActiveChat(activeChatObj);
      setActiveScreen('chat');
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenGroupChat = (g: Chat) => {
    setActiveChat(g);
    setActiveScreen('chat');
  };

  // Add friend workflow
  const handleAddFriend = async () => {
    const targetId = parseInt(friendIdInput.trim(), 10);
    if (!targetId || isNaN(targetId) || !currentUser) {
      alert('Введите корректный ID!');
      return;
    }

    if (targetId === currentUser.id) {
      alert('Это ваш собственный ID!');
      return;
    }

    setSearchSpinner(true);
    try {
      const { data: user } = await supabaseClient
        .from('users')
        .select('id')
        .eq('tg_id', targetId)
        .single();

      if (!user) {
        alert('Пользователь не зарегистрирован!');
        return;
      }

      const { error } = await supabaseClient.from('friendships').insert({
        requester_id: currentUser.id,
        addressee_id: targetId,
        status: 'pending',
      });

      if (error) {
        alert('Запрос уже отправлен или вы уже друзья!');
      } else {
        alert('Запрос отправлен!');
        setFriendIdInput('');
        setShowAddFriend(false);
        loadChatsAndFriends(currentUser.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSearchSpinner(false);
    }
  };

  // Group creation workflow
  const handleCreateGroup = async () => {
    if (!groupNameInput.trim() || !currentUser) return;

    try {
      const gName = groupNameInput.trim();
      setGroupNameInput('');
      setShowCreateGroup(false);

      const aesKey = await generateChatKey();
      const { data: newChat } = await supabaseClient
        .from('chats')
        .insert({ name: gName, type: 'group' })
        .select()
        .single();

      const { data: myData } = await supabaseClient
        .from('users')
        .select('public_key')
        .eq('tg_id', currentUser.id)
        .single();

      let myKeys = JSON.parse(myData?.public_key || '{}');
      if (myKeys.kty) myKeys = { legacy: myKeys };

      const encKeys: Record<string, string> = {};
      for (const [devId, pubJwk] of Object.entries(myKeys)) {
        encKeys[devId] = await encryptChatKeyForFriend(aesKey, pubJwk);
      }

      await supabaseClient.from('chat_keys').insert({
        chat_id: newChat.id,
        user_id: currentUser.id,
        encrypted_key: JSON.stringify(encKeys),
      });

      await idbKeyval.set(`aes_key_${newChat.id}`, aesKey);

      loadChatsAndFriends(currentUser.id);
      alert(`Группа "${gName}" успешно создана!`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAcceptFriend = async (reqId: number) => {
    if (!currentUser) return;
    try {
      await supabaseClient.from('friendships').update({ status: 'accepted' }).eq('id', reqId);
      loadChatsAndFriends(currentUser.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRejectFriend = async (reqId: number) => {
    if (!currentUser) return;
    try {
      await supabaseClient.from('friendships').delete().eq('id', reqId);
      loadChatsAndFriends(currentUser.id);
    } catch (e) {
      console.error(e);
    }
  };

  const triggerPanicWipe = async () => {
    if (currentUser) {
      const devId = localStorage.getItem('syndicate_device_id');
      if (devId) {
        try {
          await supabaseClient.from('user_devices').delete().eq('device_id', devId);
        } catch (e) {}
      }
    }
    await idbKeyval.clear();
    localStorage.clear();

    try {
      await caches.delete('syndicate-media-cache');
    } catch (e) {}

    window.location.reload();
  };

  // Bootstrap initialization
  useEffect(() => {
    const bootstrap = async () => {
      try {
        // Try reading cache for instant UI
        const cachedUsers = localStorage.getItem('synd_cached_users');
        const cachedGroups = localStorage.getItem('synd_cached_groups');
        if (cachedUsers) setFriends(JSON.parse(cachedUsers));
        if (cachedGroups) setGroupChats(JSON.parse(cachedGroups));

        const authenticated = await authUser();
        if (authenticated && currentUser) {
          setIsAuth(true);

          // Listen to kill switches and requests
          registerDevice(currentUser.id);
          listenToSyncRequests(currentUser.id);

          // Check if local keys exist or we are on a new device
          const keyStatus = await checkCryptoKeys(currentUser.id);
          if (keyStatus.ready) {
            // Check local PIN code status
            if (localStorage.getItem('synd_pin_hash')) {
              setPinMode('unlock');
              setIsPinLocked(true);
            }

            // Sync data
            loadChatsAndFriends(currentUser.id);

            // Initialize background translation worker
            const worker = new Worker(new URL('./ai-worker.ts', import.meta.url), { type: 'module' });
            workerRef.current = worker;

            const savedWhisper = localStorage.getItem('synd_whisper_model') || 'Xenova/whisper-tiny';
            worker.postMessage({ type: 'init', model: savedWhisper });
          } else {
            // New device! Prompt sync request popup
            await syncDeviceKeys(currentUser.id);
          }
        } else {
          setLoadingText('Вам необходимо запустить приложение из Telegram или получить токен авторизации.');
        }
      } catch (err: any) {
        console.error(err);
        setLoadingText('Ошибка инициализации: ' + err.message);
      }
    };

    bootstrap();

    // Load custom themes on boot
    const themeColor = localStorage.getItem('synd_theme_color') || '#0A84FF';
    applyTheme(themeColor);

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [currentUser?.id]);

  if (isPinLocked) {
    return (
      <PinScreen
        mode={pinMode}
        type={pinType}
        onCancel={() => {
          setIsPinLocked(false);
          setPinMode('unlock');
        }}
        onSuccess={() => {
          setIsPinLocked(false);
          setPinMode('unlock');
          if (currentUser) {
            loadChatsAndFriends(currentUser.id);
          }
        }}
        triggerPanicWipe={triggerPanicWipe}
      />
    );
  }

  if (!isAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-6 text-center select-none text-slate-100">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-5" />
        <p className="text-slate-300 text-base max-w-[280px] leading-relaxed font-semibold">
          {loadingText}
        </p>
      </div>
    );
  }

  if (activeScreen === 'sync_waiting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-6 text-center select-none text-slate-100">
        <Smartphone className="w-12 h-12 text-primary animate-bounce mb-5" />
        <h3 className="text-lg font-bold text-slate-200 mb-2">Авторизация устройства</h3>
        <p className="text-slate-400 text-sm max-w-[280px] leading-relaxed">
          {loadingText}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 select-none overflow-hidden flex flex-col relative">
      <StealthOverlay />

      {/* Primary alert wrapper for device approvals */}
      {pendingSyncRequest && (
        <div className="fixed top-4 left-4 right-4 bg-slate-900 border-2 border-amber-500 p-4.5 rounded-2xl z-[999999] shadow-2xl flex flex-col gap-3 animate-slide-up text-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <span className="font-bold text-sm block">Запрос на вход</span>
              <span className="text-xs text-slate-400 leading-relaxed block mt-0.5">
                Новое устройство пытается получить доступ к вашим ключам шифрования:{' '}
                <strong>{pendingSyncRequest.device_name}</strong>
              </span>
            </div>
          </div>
          <div className="flex gap-2 w-full mt-1.5">
            <button
              onClick={() => handleDeviceDecision(pendingSyncRequest.id, pendingSyncRequest.temp_pub_key, 'approved')}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-xl text-xs transition"
            >
              Разрешить
            </button>
            <button
              onClick={() => handleDeviceDecision(pendingSyncRequest.id, pendingSyncRequest.temp_pub_key, 'rejected')}
              className="flex-1 bg-slate-800 hover:bg-slate-750 text-rose-500 font-semibold py-2 px-4 rounded-xl text-xs transition"
            >
              Отклонить
            </button>
          </div>
        </div>
      )}

      {/* Screens routers */}
      {activeScreen === 'chat' && activeChat ? (
        <ChatView
          chat={activeChat}
          currentUser={currentUser!}
          onBack={() => {
            setActiveScreen('main');
            setActiveChat(null);
            if (currentUser) loadChatsAndFriends(currentUser.id);
          }}
          worker={workerRef.current}
        />
      ) : (
        <div className="flex flex-col h-full overflow-y-auto p-4 flex-grow pb-24">
          {/* Header */}
          <div className="flex items-center justify-between py-3 mb-5 border-b border-slate-900 flex-shrink-0">
            <h2 className="text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-400">
              СИНДИКАТ
            </h2>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-slate-400 hover:text-slate-200 active:scale-95 transition focus:outline-none"
            >
              <Settings className="w-5.5 h-5.5" />
            </button>
          </div>

          {/* Profile overview card */}
          <div className="bg-slate-900/60 border border-slate-900 rounded-2xl p-4 flex items-center justify-between mb-5 flex-shrink-0 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-500 to-rose-500 text-white font-bold text-base flex items-center justify-center uppercase shadow-md shadow-amber-500/10">
                {currentUser?.first_name.charAt(0)}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-slate-100 text-base">{currentUser?.first_name}</span>
                <span className="text-[11px] text-slate-500 font-semibold tracking-wide uppercase mt-0.5">
                  Мой ID: {currentUser?.id}
                </span>
              </div>
            </div>
          </div>

          {/* Friend relationships workflows */}
          <div className="flex justify-between items-center mb-3.5 pr-1 flex-shrink-0">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Братва
            </h3>
            <button
              onClick={() => setShowAddFriend(true)}
              className="w-8 h-8 bg-primary-light text-primary border border-primary-border rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition focus:outline-none"
            >
              <UserPlus className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Chats view lists */}
          <div className="flex-grow flex flex-col gap-2.5 overflow-y-auto">
            {/* 1. Saved Messages self-chat */}
            <div
              onClick={handleOpenSavedMessages}
              className="flex items-center justify-between p-4 bg-slate-900/40 border border-slate-900/60 rounded-xl hover:bg-slate-900/60 transition cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-light text-primary flex items-center justify-center shadow-inner">
                  <Bookmark className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 text-base">Избранное</div>
                  <div className="text-xs text-primary mt-0.5 font-medium">Заметки и файлы</div>
                </div>
              </div>
              <ChevronRight className="w-4.5 h-4.5 text-slate-500" />
            </div>

            {/* 2. Inbound friend requests */}
            {friendRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-sm">
                    {req.user.first_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 text-sm">{req.user.first_name}</div>
                    <div className="text-[11px] text-amber-500 font-medium mt-0.5">
                      Хочет добавить вас в друзья
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptFriend(req.id)}
                    className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition active:scale-95"
                  >
                    <UserCheck className="w-4.5 h-4.5" />
                  </button>
                  <button
                    onClick={() => handleRejectFriend(req.id)}
                    className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center hover:bg-rose-500/20 transition active:scale-95"
                  >
                    <UserMinus className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* 3. Group Chats */}
            {groupChats.map((g) => (
              <div
                key={g.id}
                onClick={() => handleOpenGroupChat(g)}
                className="flex items-center justify-between p-4 bg-slate-900/40 border border-slate-900/60 rounded-xl hover:bg-slate-900/60 transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-base shadow-inner uppercase">
                    {g.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 text-base">{g.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5 font-medium">Группа</div>
                  </div>
                </div>
                <ChevronRight className="w-4.5 h-4.5 text-slate-500" />
              </div>
            ))}

            {/* 4. Friends List */}
            {friends.length === 0 && groupChats.length === 0 ? (
              <p className="text-slate-500 text-center py-12 text-sm">
                Братва пуста. Добавьте друзей по Telegram ID!
              </p>
            ) : (
              friends.map((f) => (
                <div
                  key={f.tg_id}
                  onClick={() => handleOpenPrivateChat(f)}
                  className="flex items-center justify-between p-4 bg-slate-900/40 border border-slate-900/60 rounded-xl hover:bg-slate-900/60 transition cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-200 flex items-center justify-center font-bold text-base shadow-inner uppercase">
                      {f.first_name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-100 text-base">{f.first_name}</div>
                      <div className="text-xs text-slate-400 mt-0.5 font-medium">Личная переписка</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4.5 h-4.5 text-slate-500" />
                </div>
              ))
            )}
          </div>

          {/* Floated Group creation action trigger */}
          <button
            onClick={() => setShowCreateGroup(true)}
            className="fixed bottom-6 right-6 w-14 h-14 bg-primary hover:bg-primary-hover text-white rounded-full flex items-center justify-center shadow-xl shadow-primary/20 active:scale-95 transition-all outline-none focus:outline-none"
          >
            <Plus className="w-6.5 h-6.5" />
          </button>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && currentUser && (
        <SettingsModal
          userId={currentUser.id}
          onClose={() => setShowSettings(false)}
          worker={workerRef.current}
          onPanicWipe={triggerPanicWipe}
          onPinSetup={(type) => {
            setPinType(type);
            const savedHash = localStorage.getItem(type === 'panic' ? 'synd_panic_pin_hash' : 'synd_pin_hash');
            setPinMode(savedHash ? (type === 'panic' ? 'disable_panic' : 'disable_normal') : 'setup_1');
            setIsPinLocked(true);
            setShowSettings(false);
          }}
        />
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex flex-col justify-center p-6 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col gap-4 max-w-md w-full mx-auto relative">
            <button
              onClick={() => setShowCreateGroup(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-bold text-slate-100 text-lg mb-1">Создать новую группу</h3>
            <input
              type="text"
              placeholder="Название группы..."
              value={groupNameInput}
              onChange={(e) => setGroupNameInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-900 text-slate-200 rounded-xl px-4 py-3 outline-none focus:border-primary"
            />
            <button
              onClick={handleCreateGroup}
              className="bg-primary hover:bg-primary-hover text-white font-semibold py-3.5 rounded-xl transition"
            >
              Создать
            </button>
          </div>
        </div>
      )}

      {/* Add Friend Modal */}
      {showAddFriend && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex flex-col justify-center p-6 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col gap-4 max-w-md w-full mx-auto relative">
            <button
              onClick={() => setShowAddFriend(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-bold text-slate-100 text-lg">Найти брата</h3>
            <p className="text-xs text-slate-400 mt-[-5px]">
              Введите Telegram ID друга. Чтобы узнать свой ID, посмотрите на ID in карточке вашего
              профиля.
            </p>
            <input
              type="number"
              placeholder="ID друга..."
              value={friendIdInput}
              onChange={(e) => setFriendIdInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-900 text-slate-200 rounded-xl px-4 py-3 font-bold tracking-widest text-center outline-none focus:border-primary"
            />
            <button
              onClick={handleAddFriend}
              disabled={searchSpinner}
              className="bg-primary hover:bg-primary-hover text-white font-semibold py-3.5 rounded-xl transition flex items-center justify-center gap-1.5"
            >
              {searchSpinner ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Отправить запрос'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
