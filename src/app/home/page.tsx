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
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ホーム</h1>
          {user ? (
            <p className="text-sm text-gray-600">ログイン中: {user.email}</p>
          ) : (
            <p className="text-sm text-gray-600">ログインしていません</p>
          )}
        </div>
        <div className="flex gap-2">
          {user && (
            <button
              onClick={() => router.push('/rag')}
              className="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
            >
              RAGシステム
            </button>
          )}
          {user ? (
            <button
              onClick={handleLogout}
              className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
            >
              ログアウト
            </button>
          ) : (
            <button
              onClick={() => router.push('/auth')}
              className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
            >
              ログイン
            </button>
          )}
        </div>
      </div>

      <div>
        <p>Your customer IDs</p>
        <ul>
          {customers.map((customer) => (
            <li key={customer.customerId}>{customer.customerId}</li>
          ))}
          {user && (
            <li>
              <form onSubmit={handleSubmit}>
                <input
                  type="text"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  placeholder="add a new customer ID"
                />
                <button type="submit" className="border-2 border-red-500 p-1">
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
