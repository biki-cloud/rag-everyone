'use client';

import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

export default function AuthPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 現在のセッションを確認
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 認証状態の変更を監視
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session) {
        router.push('/home');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setMessage(`エラー: ${error.message}`);
        setLoading(false);
      }
      // 成功時は自動的にGoogleの認証ページにリダイレクトされるため、
      // ここでは何もしない
    } catch (error) {
      setMessage('エラーが発生しました。');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleMagicLinkLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingEmail(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setMessage(`エラー: ${error.message}`);
        setSendingEmail(false);
      } else {
        setEmailSent(true);
        setSendingEmail(false);
      }
    } catch (error) {
      setMessage('エラーが発生しました。');
      setSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>読み込み中...</p>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p>ログイン中: {user.email}</p>
        <button
          onClick={handleLogout}
          className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
        >
          ログアウト
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">ログイン</h1>

      {message && (
        <div className="w-full max-w-md rounded bg-red-100 px-4 py-2 text-red-700">{message}</div>
      )}

      {emailSent ? (
        <div className="w-full max-w-md space-y-4 rounded-lg border border-green-200 bg-green-50 p-6">
          <div className="text-center">
            <div className="mb-2 text-lg font-semibold text-green-800">メールを送信しました</div>
            <p className="text-sm text-green-700">
              {email} にログインリンクを送信しました。
              <br />
              メール内のリンクをクリックしてログインしてください。
            </p>
          </div>
          <button
            onClick={() => {
              setEmailSent(false);
              setEmail('');
            }}
            className="w-full rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            別のメールアドレスで試す
          </button>
        </div>
      ) : (
        <>
          {/* Magic Link フォーム */}
          <form onSubmit={handleMagicLinkLogin} className="w-full max-w-md space-y-4">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={sendingEmail}
                className="w-full rounded border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={sendingEmail || !email}
              className="w-full rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendingEmail ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  送信中...
                </span>
              ) : (
                'Magic Linkを送信'
              )}
            </button>
          </form>

          {/* 区切り線 */}
          <div className="flex w-full max-w-md items-center gap-4">
            <div className="flex-1 border-t border-gray-300"></div>
            <span className="text-sm text-gray-500">または</span>
            <div className="flex-1 border-t border-gray-300"></div>
          </div>

          {/* Googleログインボタン */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex w-full max-w-md items-center justify-center gap-3 rounded border border-gray-300 bg-white px-6 py-3 text-gray-700 shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></div>
                <span>認証中...</span>
              </>
            ) : (
              <>
                <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                <span className="font-medium">Googleでログイン</span>
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}
