'use client';

import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Document = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
};

type Thread = {
  id: number;
  threadId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function RAGPage() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeTab, setActiveTab] = useState<'documents' | 'chat'>('documents');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        console.log('[RAG] init: fetching session');
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session) {
          console.log('[RAG] init: session found', session.user?.id);
          setUser(session.user);
          setSession(session.access_token);
          void fetchDocuments(session.access_token);
          void fetchThreads(session.access_token);
        } else {
          console.log('[RAG] init: no session, redirect to /auth');
          setLoading(false);
          router.push('/auth');
        }
      } catch (error) {
        console.error('Failed to get session:', error);
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;

      console.log('[RAG] onAuthStateChange', { hasSession: !!session, userId: session?.user?.id });
      if (session) {
        setUser(session.user);
        setSession(session.access_token);
        void fetchDocuments(session.access_token);
        void fetchThreads(session.access_token);
      } else {
        setLoading(false);
        router.push('/auth');
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const fetchDocuments = async (token?: string) => {
    const accessToken = token ?? session;
    if (!accessToken) return;
    try {
      const response = await fetch('/api/documents', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = (await response.json()) as { documents?: Document[] };
      setDocuments(data.documents ?? []);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchThreads = async (token?: string) => {
    const accessToken = token ?? session;
    if (!accessToken) return;
    try {
      const response = await fetch('/api/threads', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = (await response.json()) as { threads?: Thread[] };
      setThreads(data.threads ?? []);
    } catch (error) {
      console.error('Failed to fetch threads:', error);
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
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-900">RAGシステム</h1>
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-500">{user?.email}</p>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4">
        <div className="mb-6 flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('documents')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'documents'
                ? 'border-b-2 border-gray-900 text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ドキュメント
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'chat'
                ? 'border-b-2 border-gray-900 text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            チャット
          </button>
        </div>

        {activeTab === 'documents' && (
          <DocumentsTab documents={documents} session={session} onRefresh={fetchDocuments} />
        )}

        {activeTab === 'chat' && (
          <ChatTab threads={threads} session={session} onRefresh={fetchThreads} />
        )}
      </div>
    </div>
  );
}

function DocumentsTab({
  documents,
  session,
  onRefresh,
}: {
  documents: Document[];
  session: string | null;
  onRefresh: () => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !session) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session}`,
        },
        body: JSON.stringify({ title, content }),
      });

      if (response.ok) {
        setTitle('');
        setContent('');
        void onRefresh();
      } else {
        const error = (await response.json()) as { error?: string };
        alert(error.error || 'ドキュメントの作成に失敗しました');
      }
    } catch (error) {
      console.error('Failed to create document:', error);
      alert('ドキュメントの作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewDetail = (docId: number) => {
    router.push(`/rag/documents/${docId}`);
  };

  const handleEdit = async (docId: number) => {
    if (!session) return;
    try {
      const response = await fetch(`/api/documents/${docId}`, {
        headers: {
          Authorization: `Bearer ${session}`,
        },
      });

      if (response.ok) {
        const data = (await response.json()) as { document: Document };
        setSelectedDocument(data.document);
        setEditTitle(data.document.title);
        setEditContent(data.document.content);
        setIsEditModalOpen(true);
      } else {
        const error = (await response.json()) as { error?: string };
        alert(error.error || 'ドキュメントの取得に失敗しました');
      }
    } catch (error) {
      console.error('Failed to fetch document:', error);
      alert('ドキュメントの取得に失敗しました');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocument || !editTitle.trim() || !editContent.trim() || !session) return;

    setEditing(true);
    try {
      const response = await fetch(`/api/documents/${selectedDocument.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session}`,
        },
        body: JSON.stringify({ title: editTitle, content: editContent }),
      });

      if (response.ok) {
        setIsEditModalOpen(false);
        setSelectedDocument(null);
        void onRefresh();
      } else {
        const error = (await response.json()) as { error?: string };
        alert(error.error || 'ドキュメントの更新に失敗しました');
      }
    } catch (error) {
      console.error('Failed to update document:', error);
      alert('ドキュメントの更新に失敗しました');
    } finally {
      setEditing(false);
    }
  };

  const handleDelete = async (docId: number) => {
    if (!session) return;
    if (!confirm('本当にこのドキュメントを削除しますか？')) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session}`,
        },
      });

      if (response.ok) {
        void onRefresh();
      } else {
        const error = (await response.json()) as { error?: string };
        alert(error.error || 'ドキュメントの削除に失敗しました');
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert('ドキュメントの削除に失敗しました');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">新しいドキュメントを登録</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">タイトル</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
              placeholder="ドキュメントのタイトル"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">コンテンツ</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
              rows={10}
              placeholder="ドキュメントの内容を入力してください"
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '登録中...' : '登録'}
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">登録済みドキュメント</h2>
        <div className="space-y-3">
          {documents.length === 0 ? (
            <p className="text-sm text-gray-400">ドキュメントがありません</p>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{doc.title}</h3>
                    <p className="mt-1.5 line-clamp-2 text-sm text-gray-600">
                      {doc.content.substring(0, 200)}...
                    </p>
                    <p className="mt-2 text-xs text-gray-400">
                      {new Date(doc.createdAt).toLocaleString('ja-JP')}
                    </p>
                  </div>
                  <div className="ml-4 flex gap-2">
                    <Link
                      href={`/rag/documents/${doc.id}`}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      詳細
                    </Link>
                    <button
                      onClick={() => handleEdit(doc.id)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deleting}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      削除
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 編集モーダル */}
      {isEditModalOpen && selectedDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">ドキュメントを編集</h2>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedDocument(null);
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                閉じる
              </button>
            </div>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">タイトル</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">コンテンツ</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                  rows={15}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setSelectedDocument(null);
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={editing}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {editing ? '更新中...' : '更新'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatTab({
  threads,
  session,
  onRefresh,
}: {
  threads: Thread[];
  session: string | null;
  onRefresh: () => void;
}) {
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<
    Array<{
      role: string;
      content: string;
      createdAt: string;
      referencedTitles?: string[];
      referencedDocuments?: Array<{ title: string; id: number }>;
      selfCheck?: string;
    }>
  >([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [creatingThread, setCreatingThread] = useState(false);
  const [useRegisteredOnly, setUseRegisteredOnly] = useState(true);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [updatingTitle, setUpdatingTitle] = useState(false);

  const createThread = async () => {
    if (!session) return;
    setCreatingThread(true);
    try {
      const response = await fetch('/api/threads', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session}`,
        },
      });

      if (response.ok) {
        const data = (await response.json()) as { thread: { id: number } };
        setSelectedThreadId(data.thread.id);
        setMessages([]);
        void onRefresh();
      }
    } catch (error) {
      console.error('Failed to create thread:', error);
    } finally {
      setCreatingThread(false);
    }
  };

  const loadMessages = async (threadId: number) => {
    if (!session) return;
    try {
      const response = await fetch(`/api/threads/${threadId}/messages`, {
        headers: {
          Authorization: `Bearer ${session}`,
        },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          messages?: Array<{
            role: string;
            content: string;
            createdAt: string;
            referencedTitles?: string[];
            referencedDocuments?: Array<{ title: string; id: number }>;
            selfCheck?: string;
          }>;
        };
        setMessages(data.messages ?? []);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  useEffect(() => {
    if (selectedThreadId) {
      void loadMessages(selectedThreadId);
    }
  }, [selectedThreadId, session]);

  const handleThreadClick = (threadId: number) => {
    if (editingThreadId === threadId) {
      return; // 編集中の場合は選択しない
    }
    setSelectedThreadId(threadId);
  };

  const handleThreadDoubleClick = (thread: Thread) => {
    if (!session) return;
    setEditingThreadId(thread.id);
    setEditingTitle(thread.title || '');
  };

  const handleTitleUpdate = async (threadId: number) => {
    if (!session || updatingTitle) return;

    setUpdatingTitle(true);
    try {
      const response = await fetch(`/api/threads/${threadId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session}`,
        },
        body: JSON.stringify({ title: editingTitle.trim() || null }),
      });

      if (response.ok) {
        setEditingThreadId(null);
        setEditingTitle('');
        void onRefresh();
      } else {
        const error = (await response.json()) as { error?: string };
        alert(error.error || 'タイトルの更新に失敗しました');
      }
    } catch (error) {
      console.error('Failed to update thread title:', error);
      alert('タイトルの更新に失敗しました');
    } finally {
      setUpdatingTitle(false);
    }
  };

  const handleTitleCancel = () => {
    setEditingThreadId(null);
    setEditingTitle('');
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !selectedThreadId || !session) return;

    const userMessage = inputMessage;
    setInputMessage('');
    setSending(true);

    // ユーザーメッセージを一時的に表示（新しいメッセージは末尾に追加）
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: userMessage,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      // RAG検索を実行（登録情報のみモードでない場合、または登録情報のみモードでも検索は実行）
      const searchResponse = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session}`,
        },
        body: JSON.stringify({ query: userMessage, limit: 3 }),
      });

      const searchData = (await searchResponse.json()) as {
        chunks?: Array<{
          content: string;
          documentTitle?: string;
          chunkIndex?: number;
        }>;
      };
      const context = searchData.chunks ?? [];

      // メッセージを送信
      const response = await fetch(`/api/threads/${selectedThreadId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session}`,
        },
        body: JSON.stringify({
          message: userMessage,
          context: context.map((c) => ({
            content: c.content,
            documentTitle: c.documentTitle,
            chunkIndex: c.chunkIndex,
          })),
          useRegisteredOnly: useRegisteredOnly,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          message: string;
          referencedTitles?: string[];
          referencedDocuments?: Array<{ title: string; id: number }>;
          selfCheck?: string;
        };
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.message,
            createdAt: new Date().toISOString(),
            referencedTitles: data.referencedTitles,
            referencedDocuments: data.referencedDocuments,
            selfCheck: data.selfCheck,
          },
        ]);
        // loadMessagesは呼び出さない（APIレスポンスのreferencedDocumentsを保持するため）
      } else {
        const error = (await response.json()) as { error?: string };
        alert(error.error || 'メッセージの送信に失敗しました');
        // ユーザーメッセージを削除
        setMessages((prev) => prev.slice(0, -1));
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('メッセージの送信に失敗しました');
      // ユーザーメッセージを削除
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-200px)] gap-4">
      <div className="w-64 space-y-2">
        <button
          onClick={createThread}
          disabled={creatingThread}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          {creatingThread ? '作成中...' : '新しい会話'}
        </button>
        <div className="space-y-1">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={`w-full rounded-lg transition-colors ${
                selectedThreadId === thread.id
                  ? 'bg-gray-900'
                  : 'border border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              {editingThreadId === thread.id ? (
                <div className="flex items-center gap-1 px-2 py-2">
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleTitleUpdate(thread.id);
                      } else if (e.key === 'Escape') {
                        handleTitleCancel();
                      }
                    }}
                    autoFocus
                    className={`flex-1 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 ${
                      selectedThreadId === thread.id
                        ? 'border-gray-600 bg-gray-800 text-white focus:border-gray-500 focus:ring-gray-500'
                        : 'border-gray-300 bg-white text-gray-900 focus:border-gray-400 focus:ring-gray-400'
                    }`}
                    disabled={updatingTitle}
                  />
                  <button
                    onClick={() => void handleTitleUpdate(thread.id)}
                    disabled={updatingTitle}
                    className={`rounded px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
                      selectedThreadId === thread.id
                        ? 'text-white hover:bg-gray-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    title="保存"
                  >
                    ✓
                  </button>
                  <button
                    onClick={handleTitleCancel}
                    disabled={updatingTitle}
                    className={`rounded px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
                      selectedThreadId === thread.id
                        ? 'text-white hover:bg-gray-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    title="キャンセル"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleThreadClick(thread.id)}
                  onDoubleClick={() => handleThreadDoubleClick(thread)}
                  className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                    selectedThreadId === thread.id ? 'font-medium text-white' : 'text-gray-700'
                  }`}
                  title="ダブルクリックで編集"
                >
                  {thread.title || `会話 ${thread.id}`}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
        {selectedThreadId ? (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-gray-400">メッセージがありません</p>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
                        message.role === 'user'
                          ? 'bg-gray-900 text-white'
                          : 'border border-gray-200 bg-gray-50 text-gray-900'
                      }`}
                    >
                      {message.role === 'assistant' ? (
                        <>
                          <div className="markdown-content">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          </div>
                          {/* 参照ドキュメントタイトルを注釈欄に表示（リンク付き） */}
                          {message.referencedDocuments &&
                            message.referencedDocuments.length > 0 && (
                              <div className="mt-3 border-t border-gray-200 pt-2">
                                <p className="mb-1.5 text-xs font-medium text-gray-500">
                                  参照したドキュメント ({message.referencedDocuments.length})
                                </p>
                                <ul className="space-y-1">
                                  {message.referencedDocuments.map((doc, idx) => (
                                    <li key={doc.id}>
                                      <Link
                                        href={`/rag/documents/${doc.id}`}
                                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        {idx + 1}. {doc.title}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          {/* フォールバック: referencedDocumentsがない場合はreferencedTitlesを表示 */}
                          {(!message.referencedDocuments ||
                            message.referencedDocuments.length === 0) &&
                            message.referencedTitles &&
                            message.referencedTitles.length > 0 && (
                              <div className="mt-3 border-t border-gray-200 pt-2">
                                <div className="markdown-content">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {`---\n\n**参照したドキュメント**\n\n${message.referencedTitles.map((title) => `- ${title}`).join('\n')}`}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            )}
                          {/* Self-check結果を表示（開発モード時のみ） */}
                          {message.selfCheck && (
                            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-100 p-2">
                              <p className="text-xs text-gray-600">
                                <span className="font-medium">品質チェック:</span>{' '}
                                {message.selfCheck}
                              </p>
                            </div>
                          )}
                          <button
                            onClick={async (e) => {
                              try {
                                await navigator.clipboard.writeText(message.content);
                                setCopiedMessageIndex(index);
                                setTimeout(() => {
                                  setCopiedMessageIndex(null);
                                }, 2000);
                              } catch (error) {
                                console.error('コピーに失敗しました:', error);
                                alert('コピーに失敗しました');
                              }
                            }}
                            className={`mt-2 rounded-lg border px-2 py-1 text-xs transition-colors ${
                              copiedMessageIndex === index
                                ? 'border-green-500 bg-green-50 text-green-700'
                                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                            title="コピー"
                          >
                            {copiedMessageIndex === index ? '✓ コピーしました！' : 'コピー'}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap">{message.content}</p>
                          <button
                            onClick={async (e) => {
                              try {
                                await navigator.clipboard.writeText(message.content);
                                setCopiedMessageIndex(index);
                                setTimeout(() => {
                                  setCopiedMessageIndex(null);
                                }, 2000);
                              } catch (error) {
                                console.error('コピーに失敗しました:', error);
                                alert('コピーに失敗しました');
                              }
                            }}
                            className={`mt-2 rounded-lg border px-2 py-1 text-xs transition-colors ${
                              copiedMessageIndex === index
                                ? 'border-green-400 bg-green-500 text-white'
                                : 'border-gray-400 bg-gray-800 text-white hover:bg-gray-700'
                            }`}
                            title="コピー"
                          >
                            {copiedMessageIndex === index ? '✓ コピーしました！' : 'コピー'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-gray-200 bg-gray-50/50 p-4">
              <div className="flex gap-2">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  onPaste={(e) => {
                    // ペースト時の改行を保持
                    const pastedText = e.clipboardData.getData('text');
                    if (pastedText) {
                      e.preventDefault();
                      const currentValue = inputMessage;
                      const cursorPosition = (e.target as HTMLTextAreaElement).selectionStart;
                      const newValue =
                        currentValue.slice(0, cursorPosition) +
                        pastedText +
                        currentValue.slice(cursorPosition);
                      setInputMessage(newValue);
                      // カーソル位置を調整
                      setTimeout(() => {
                        const textarea = e.target as HTMLTextAreaElement;
                        const newPosition = cursorPosition + pastedText.length;
                        textarea.setSelectionRange(newPosition, newPosition);
                      }, 0);
                    }
                  }}
                  className="flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:bg-gray-100"
                  placeholder="メッセージを入力... (Shift+Enterで改行)"
                  disabled={sending}
                  rows={3}
                  style={{ minHeight: '44px', maxHeight: '200px' }}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !inputMessage.trim()}
                  className="self-end rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? '送信中...' : '送信'}
                </button>
              </div>
              <div className="mt-3">
                <label className="group flex cursor-pointer items-center gap-3">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={useRegisteredOnly}
                      onChange={(e) => setUseRegisteredOnly(e.target.checked)}
                      className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-300 bg-white transition-all checked:border-blue-500 checked:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <svg
                      className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 text-white opacity-0 transition-opacity peer-checked:opacity-100"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <span className="text-sm text-gray-700 transition-colors group-hover:text-gray-900">
                      登録情報のみを参照して回答する
                    </span>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {useRegisteredOnly ? '登録情報のみ参照' : '一般知識も使用可能'}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-gray-400">会話を選択するか、新しい会話を作成してください</p>
          </div>
        )}
      </div>
    </div>
  );
}
