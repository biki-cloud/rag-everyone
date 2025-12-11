'use client';

import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Document = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export default function DocumentDetailPage() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const params = useParams();
  const documentId = params?.id as string;

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session) {
          setUser(session.user);
          setSession(session.access_token);
          if (documentId) {
            void fetchDocument(session.access_token, parseInt(documentId));
          }
        } else {
          setLoading(false);
          router.push('/auth');
        }
      } catch (error) {
        console.error('Failed to get session:', error);
        if (isMounted) {
          setLoading(false);
          setError('セッションの取得に失敗しました');
        }
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;

      if (session) {
        setUser(session.user);
        setSession(session.access_token);
        if (documentId) {
          void fetchDocument(session.access_token, parseInt(documentId));
        }
      } else {
        setLoading(false);
        router.push('/auth');
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router, documentId]);

  const fetchDocument = async (token: string, id: number) => {
    try {
      const response = await fetch(`/api/documents/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = (await response.json()) as { document: Document };
        setDocument(data.document);
      } else {
        const errorData = (await response.json()) as { error?: string };
        setError(errorData.error || 'ドキュメントの取得に失敗しました');
      }
    } catch (error) {
      console.error('Failed to fetch document:', error);
      setError('ドキュメントの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!session || !document) return;
    if (!confirm('本当にこのドキュメントを削除しますか？')) return;

    try {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session}`,
        },
      });

      if (response.ok) {
        router.push('/rag');
      } else {
        const errorData = (await response.json()) as { error?: string };
        alert(errorData.error || 'ドキュメントの削除に失敗しました');
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert('ドキュメントの削除に失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>読み込み中...</p>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="container mx-auto min-h-screen p-4">
        <div className="mb-4">
          <button
            onClick={() => router.push('/rag')}
            className="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
          >
            戻る
          </button>
        </div>
        <div className="rounded-lg border border-red-500 bg-red-50 p-4">
          <p className="text-red-800">{error || 'ドキュメントが見つかりません'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto min-h-screen p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={() => router.push('/rag')}
          className="self-start rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
        >
          戻る
        </button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <p className="text-sm text-gray-600">{user?.email}</p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push('/auth');
            }}
            className="self-start rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600 sm:self-auto"
          >
            ログアウト
          </button>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4 shadow-lg sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="break-words text-2xl font-bold sm:text-3xl">{document.title}</h1>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <button
              onClick={() => router.push(`/rag/documents/${document.id}/edit`)}
              className="flex-1 rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600 sm:flex-none"
            >
              編集
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600 sm:flex-none"
            >
              削除
            </button>
          </div>
        </div>

        <div className="mb-4 text-sm text-gray-500">
          <p>作成日時: {new Date(document.createdAt).toLocaleString('ja-JP')}</p>
          {document.updatedAt && document.updatedAt !== document.createdAt && (
            <p>更新日時: {new Date(document.updatedAt).toLocaleString('ja-JP')}</p>
          )}
        </div>

        <div className="rounded border p-4">
          <div className="markdown-content prose max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{document.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
