export interface User {
  tg_id: number;
  first_name: string;
  public_key?: string; // JSON structure string mapping device IDs to { rsa: JsonWebKey, ecdsa: JsonWebKey }
  status?: string;
}

export interface Friendship {
  id: number;
  requester_id: number;
  addressee_id: number;
  status: 'pending' | 'accepted';
}

export interface Chat {
  id: string;
  name: string;
  type: 'private' | 'group' | 'saved';
  friendId?: number;
}

export interface ChatKey {
  id: number;
  chat_id: string;
  user_id: number;
  encrypted_key: string; // JSON mapping deviceId -> string
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: number;
  encrypted_text: string;
  encrypted_vector?: string | null;
  created_at: string;
}

export interface Currency {
  id: string;
  owner_id: number;
  name: string;
  rub_value: number;
}

export interface Debt {
  id: string;
  creditor_id: number;
  debtor_id: number;
  amount: number;
  currency: string;
}

export interface UserDevice {
  user_id: number;
  device_id: string;
  device_name: string;
  last_active: string;
  added_at: string;
}

export interface DeviceRequest {
  id: string;
  user_id: number;
  device_name: string;
  temp_pub_key: string; // JWK string
  status: 'pending' | 'approved' | 'rejected';
  encrypted_master_keys?: string; // JSON with { encryptedAesKey, iv, encryptedMasterKeys }
}

export interface ReplyData {
  id: string;
  name: string;
  text: string;
}

export interface DecryptedMessage {
  id: string;
  sender_id: number;
  text: string;
  created_at: string;
  isMine: boolean;
  senderName: string;
  reply?: ReplyData;
  isAuthentic: boolean;
  isError: boolean;
  voiceData?: {
    fileName: string;
    waveform: number[];
    transcription: string;
    isProcessing: boolean;
    isError: boolean;
    hasTranscript: boolean;
  };
  inviteData?: {
    groupId: string;
    groupName: string;
    keysJSON: string;
  };
}
