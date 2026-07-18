import { hapticImpact } from "../lib/haptics";
import React, { useState, useEffect, FormEvent } from 'react';
import { supabaseClient } from '../lib/supabase';
import { Currency } from '../types';
import { ChevronLeft, Plus, Trash2, Coins, Loader2 } from 'lucide-react';

interface CurrenciesScreenProps {
  userId: number;
  onBack: () => void;
}

export default function CurrenciesScreen({ userId, onBack }: CurrenciesScreenProps) {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchCurrencies = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('currencies')
        .select('*')
        .eq('owner_id', userId);

      if (error) throw error;
      setCurrencies(data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrencies();
  }, [userId]);

  const handleAddCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price || parseFloat(price) <= 0) {
      alert('Заполните все поля корректно!');
      return;
    }

    setSubmitLoading(true);
    try {
      const { error } = await supabaseClient.from('currencies').insert({
        owner_id: userId,
        name: name.trim(),
        rub_value: parseFloat(price),
      });

      if (error) throw error;

      setName('');
      setPrice('');
      fetchCurrencies();

hapticImpact("success");
    } catch (err: any) {
      alert('Ошибка добавления: ' + err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteCurrency = async (id: string) => {
    if (!confirm('Сжечь эту валюту?')) return;

    try {
      const { error } = await supabaseClient
        .from('currencies')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setCurrencies((prev) => prev.filter((c) => c.id !== id));

hapticImpact("success");
    } catch (err: any) {
      alert('Ошибка удаления: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 select-none animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-5 px-1">
        <button
          onClick={onBack}
          className="text-blue-500 hover:text-blue-400 font-medium flex items-center gap-1 focus:outline-none"
        >
          <ChevronLeft className="w-5 h-5" /> Назад
        </button>
        <span className="font-semibold text-slate-200">Эмиссия валют</span>
        <div className="w-16" />
      </div>

      {/* Form Card */}
      <form
        onSubmit={handleAddCurrency}
        className="bg-slate-900/60 border border-slate-900 p-5 rounded-2xl mb-6 flex flex-col gap-4"
      >
        <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-2">
          <Coins className="w-4.5 h-4.5 text-blue-500" /> Создать новую валюту
        </h3>

        <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Название (напр. Адреналин)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-900 text-slate-200 rounded-xl px-4 py-3 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Цена в рублях (напр. 150)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full bg-slate-950 border border-slate-900 text-slate-200 rounded-xl px-4 py-3 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitLoading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl w-full flex items-center justify-center gap-2 transition active:scale-98"
        >
          {submitLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Plus className="w-5 h-5" /> Добавить в активы
            </>
          )}
        </button>
      </form>

      {/* List section */}
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
        Мои активы
      </h3>

      <div className="flex-grow overflow-y-auto flex flex-col gap-2.5">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : currencies.length === 0 ? (
          <p className="text-slate-500 text-center py-10 text-sm">
            У вас пока нет созданных валют
          </p>
        ) : (
          currencies.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between p-4 bg-slate-900/40 border border-slate-900/60 rounded-xl hover:bg-slate-900/60 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-light text-primary flex items-center justify-center">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-slate-100 text-base">{c.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">Курс: {c.rub_value} ₽</div>
                </div>
              </div>

              <button
                onClick={() => handleDeleteCurrency(c.id)}
                className="p-2.5 text-rose-500 hover:bg-rose-500/10 rounded-lg active:scale-95 transition"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
