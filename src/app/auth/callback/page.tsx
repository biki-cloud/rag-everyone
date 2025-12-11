'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void handleCallback();

    // 認証状態の変更を監視（セッションが確立されたらリダイレクト）
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.push('/home');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const handleCallback = async () => {
    try {
      // URLクエリパラメータを取得
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // ハッシュフラグメントを取得（magic link用）
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const errorHash = hashParams.get('error');
      const errorDescriptionHash = hashParams.get('error_description');

      // エラーパラメータがある場合（クエリパラメータまたはハッシュフラグメント）
      if (errorParam !== null || errorHash !== null) {
        setError(`認証エラー: ${errorDescription ?? errorDescriptionHash ?? errorParam ?? errorHash}`);
        setTimeout(() => {
          router.push('/auth');
        }, 3000);
        return;
      }

      if (code) {
        // PKCEフロー（OAuth）: codeをセッションに交換
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          setError(`認証エラー: ${exchangeError.message}`);
          setTimeout(() => {
            router.push('/auth');
          }, 3000);
          return;
        }

        // セッションが正常に設定されたので、ホームにリダイレクト
        router.push('/home');
      } else if (accessToken) {
        // Magic Link: ハッシュフラグメントからセッションを設定
        // Supabaseクライアントが自動的にハッシュフラグメントを処理するため、
        // getSession()を呼び出すだけでセッションが設定されます
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          setError(`認証エラー: ${sessionError.message}`);
          setTimeout(() => {
            router.push('/auth');
          }, 3000);
          return;
        }

        if (session) {
          // セッションが正常に設定されたので、ホームにリダイレクト
          // ハッシュフラグメントをクリーンアップ
          window.history.replaceState(null, '', window.location.pathname);
          router.push('/home');
        } else {
          setError('セッションの設定に失敗しました。');
          setTimeout(() => {
            router.push('/auth');
          }, 3000);
        }
      } else {
        // codeもaccess_tokenもない場合、既存のセッションを確認
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          // セッションが既に存在する場合はホームにリダイレクト
          router.push('/home');
        } else {
          // セッションもcodeもaccess_tokenもない場合はエラー
          setError('セッションが見つかりませんでした。');
          setTimeout(() => {
            router.push('/auth');
          }, 3000);
        }
      }
    } catch (err) {
      console.error('Callback error:', err);
      setError('エラーが発生しました。');
      setTimeout(() => {
        router.push('/auth');
      }, 3000);
    }
  };

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="text-red-600">{error}</div>
        <div>ログインページにリダイレクトします...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <div>認証中...</div>
      <div>ログインを処理しています。少々お待ちください。</div>
    </div>
  );
}

