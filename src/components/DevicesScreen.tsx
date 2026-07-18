import { useState, useEffect } from 'react';
import { supabaseClient } from '../lib/supabase';
import { UserDevice } from '../types';
import { ChevronLeft, Trash2, ShieldAlert, Key, Crown, Laptop, Smartphone } from 'lucide-react';

interface DevicesScreenProps {
  userId: number;
  onBack: () => void;
}

export default function DevicesScreen({ userId, onBack }: DevicesScreenProps) {
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [loading, setLoading] = useState(false);

  const getDeviceId = () => {
    let did = localStorage.getItem('syndicate_device_id');
    if (!did) {
      did = 'dev_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('syndicate_device_id', did);
    }
    return did;
  };

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('user_devices')
        .select('*')
        .eq('user_id', userId)
        .order('added_at', { ascending: true });

      if (error) throw error;
      setDevices(data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, [userId]);

  const handleDeleteDevice = async (deviceId: string, deviceName: string) => {
    if (!confirm(`Точно удалить устройство "${deviceName}"? Сеанс на нем будет мгновенно завершен.`)) return;

    try {
      const { error } = await supabaseClient
        .from('user_devices')
        .delete()
        .eq('device_id', deviceId);

      if (error) throw error;

      setDevices((prev) => prev.filter((d) => d.device_id !== deviceId));

      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch (err: any) {
      alert('Ошибка удаления устройства: ' + err.message);
    }
  };

  const myDeviceId = getDeviceId();
  const masterDevice = devices[0]; // Chronologically first
  const myDevice = devices.find((d) => d.device_id === myDeviceId);

  const amIMaster = myDevice && masterDevice && myDevice.device_id === masterDevice.device_id;
  const msInDay = 1000 * 3600 * 24;
  const myAgeDays = myDevice ? (Date.now() - new Date(myDevice.added_at).getTime()) / msInDay : 0;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 select-none animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-5 px-1">
        <button
          onClick={onBack}
          className="text-primary hover:text-primary-hover font-medium flex items-center gap-1 focus:outline-none"
        >
          <ChevronLeft className="w-5 h-5" /> Назад
        </button>
        <span className="font-semibold text-slate-200">Мои устройства</span>
        <div className="w-16" />
      </div>

      <div className="text-slate-400 text-xs text-center leading-relaxed mb-5 bg-slate-900/40 border border-slate-900/80 p-4 rounded-xl">
        Самое первое устройство — главное. Новые устройства получают права на удаление администраторов только через 7 дней.
      </div>

      <div className="flex-grow overflow-y-auto flex flex-col gap-2.5">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : devices.length === 0 ? (
          <p className="text-slate-500 text-center py-10 text-sm">
            Список устройств пуст
          </p>
        ) : (
          devices.map((d, idx) => {
            const isMe = d.device_id === myDeviceId;
            const isTargetMaster = idx === 0;
            const targetAgeDays = (Date.now() - new Date(d.added_at).getTime()) / msInDay;
            const targetIsOlder = new Date(d.added_at) < new Date(myDevice?.added_at || '');

            // Rule calculation
            let canDelete = false;
            if (!isMe) {
              if (amIMaster) {
                // Master can delete anyone immediately
                canDelete = true;
              } else {
                if (targetIsOlder) {
                  // Regular device can delete older devices only if it is >= 7 days old itself
                  if (myAgeDays >= 7) canDelete = true;
                } else {
                  // Can delete younger devices immediately
                  canDelete = true;
                }
              }
            }

            const dateStr = new Date(d.added_at).toLocaleDateString();

            return (
              <div
                key={d.device_id}
                className={`flex items-center justify-between p-4 bg-slate-900/40 border rounded-xl hover:bg-slate-900/60 transition ${
                  isMe ? 'border-primary/50 bg-primary/5' : 'border-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isTargetMaster
                        ? 'bg-primary text-white shadow-md shadow-primary/10'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {isTargetMaster ? <Crown className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 text-base flex items-center gap-1.5">
                      {d.device_name}
                      {isMe && (
                        <span className="text-[11px] font-medium bg-primary-light border border-primary-border text-primary rounded px-1.5 py-0.5">
                          Это устр-во
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Добавлено: {dateStr}
                    </div>
                  </div>
                </div>

                {canDelete ? (
                  <button
                    onClick={() => handleDeleteDevice(d.device_id, d.device_name)}
                    className="p-2.5 text-rose-500 hover:bg-rose-500/10 rounded-lg active:scale-95 transition"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                ) : !isMe ? (
                  <div className="p-2.5 text-slate-600">
                    <Key className="w-5 h-5" />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
