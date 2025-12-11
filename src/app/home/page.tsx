'use client';

import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

type Customer = { customerId: string };

type CustomersResponse = {
  customers?: Customer[];
  error?: string;
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState('');
  const router = useRouter();

  useEffect(() => {
    // 認証状態を確認（ログインしていなくても表示）
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      // 顧客データを取得
      void fetchCustomers();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers');
      const data: CustomersResponse = await response.json();
      setCustomers(data.customers ?? []);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId.trim()) return;

    try {
      const formData = new FormData();
      formData.append('customerId', customerId);
      const response = await fetch('/api/customers', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setCustomerId('');
        await fetchCustomers();
      }
    } catch (error) {
      console.error('Failed to create customer:', error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">ホーム</h1>
          {user ? (
            <p className="break-words text-sm text-gray-600">ログイン中: {user.email}</p>
          ) : (
            <p className="text-sm text-gray-600">ログインしていません</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          {user && (
            <button
              onClick={() => router.push('/rag')}
              className="flex-1 rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600 sm:flex-none"
            >
              RAGシステム
            </button>
          )}
          {user ? (
            <button
              onClick={handleLogout}
              className="flex-1 rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600 sm:flex-none"
            >
              ログアウト
            </button>
          ) : (
            <button
              onClick={() => router.push('/auth')}
              className="flex-1 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 sm:flex-none"
            >
              ログイン
            </button>
          )}
        </div>
      </div>

      <div>
        <p>Your customer IDs</p>
        <ul className="space-y-2">
          {customers.map((customer) => (
            <li key={customer.customerId} className="break-words">
              {customer.customerId}
            </li>
          ))}
          {user && (
            <li>
              <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  placeholder="add a new customer ID"
                  className="flex-1 rounded border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
                <button
                  type="submit"
                  className="rounded border-2 border-red-500 bg-white px-4 py-2 text-red-500 transition-colors hover:bg-red-50 sm:flex-none"
                >
                  submit
                </button>
              </form>
            </li>
          )}
        </ul>
        <p>end</p>
      </div>
    </div>
  );
}
