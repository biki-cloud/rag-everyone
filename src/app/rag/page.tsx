'use client';

import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
    <div className="container mx-auto min-h-screen p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">RAGシステム</h1>
        <div className="flex items-center gap-4">
          <p className="text-sm text-gray-600">{user?.email}</p>
          <button
            onClick={handleLogout}
            className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
          >
            ログアウト
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-4 py-2 ${
            activeTab === 'documents' ? 'border-b-2 border-blue-500 font-bold' : 'text-gray-600'
          }`}
        >
          ドキュメント
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-4 py-2 ${
            activeTab === 'chat' ? 'border-b-2 border-blue-500 font-bold' : 'text-gray-600'
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
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleViewDetail = async (docId: number) => {
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
        setIsDetailModalOpen(true);
      } else {
        const error = (await response.json()) as { error?: string };
        alert(error.error || 'ドキュメントの取得に失敗しました');
      }
    } catch (error) {
      console.error('Failed to fetch document:', error);
      alert('ドキュメントの取得に失敗しました');
    }
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
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <h2 className="mb-4 text-xl font-bold">新しいドキュメントを登録</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">タイトル</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
              placeholder="ドキュメントのタイトル"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">コンテンツ</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
              rows={10}
              placeholder="ドキュメントの内容を入力してください"
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {submitting ? '登録中...' : '登録'}
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-bold">登録済みドキュメント</h2>
        <div className="space-y-2">
          {documents.length === 0 ? (
            <p className="text-gray-500">ドキュメントがありません</p>
          ) : (
            documents.map((doc) => (
              <div key={doc.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-bold">{doc.title}</h3>
                    <p className="mt-2 text-sm text-gray-600">{doc.content.substring(0, 200)}...</p>
                    <p className="mt-2 text-xs text-gray-400">
                      {new Date(doc.createdAt).toLocaleString('ja-JP')}
                    </p>
                  </div>
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={() => handleViewDetail(doc.id)}
                      className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
                    >
                      詳細
                    </button>
                    <button
                      onClick={() => handleEdit(doc.id)}
                      className="rounded bg-green-500 px-3 py-1 text-sm text-white hover:bg-green-600"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deleting}
                      className="rounded bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600 disabled:opacity-50"
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

      {/* 詳細表示モーダル */}
      {isDetailModalOpen && selectedDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-4xl rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">{selectedDocument.title}</h2>
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedDocument(null);
                }}
                className="rounded bg-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-400"
              >
                閉じる
              </button>
            </div>
            <div className="mb-4 text-sm text-gray-500">
              作成日時: {new Date(selectedDocument.createdAt).toLocaleString('ja-JP')}
            </div>
            <div className="max-h-[60vh] overflow-y-auto rounded border p-4">
              <div className="markdown-content prose max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedDocument.content}
                </ReactMarkdown>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  handleEdit(selectedDocument.id);
                }}
                className="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
              >
                編集
              </button>
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  handleDelete(selectedDocument.id);
                }}
                className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {isEditModalOpen && selectedDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-4xl rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">ドキュメントを編集</h2>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedDocument(null);
                }}
                className="rounded bg-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-400"
              >
                閉じる
              </button>
            </div>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium">タイトル</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium">コンテンツ</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2"
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
                  className="rounded bg-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-400"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={editing}
                  className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
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
      selfCheck?: string;
    }>
  >([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [creatingThread, setCreatingThread] = useState(false);
  const [useRegisteredOnly, setUseRegisteredOnly] = useState(false);

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
          messages?: Array<{ role: string; content: string; createdAt: string }>;
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
          selfCheck?: string;
        };
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.message,
            createdAt: new Date().toISOString(),
            referencedTitles: data.referencedTitles,
            selfCheck: data.selfCheck,
          },
        ]);
        void loadMessages(selectedThreadId);
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
          className="w-full rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {creatingThread ? '作成中...' : '新しい会話'}
        </button>
        <div className="space-y-1">
          {threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => setSelectedThreadId(thread.id)}
              className={`w-full rounded px-4 py-2 text-left ${
                selectedThreadId === thread.id
                  ? 'bg-blue-100 font-bold'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {thread.title || `会話 ${thread.id}`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col rounded-lg border">
        {selectedThreadId ? (
          <>
            <div className="border-b p-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useRegisteredOnly}
                  onChange={(e) => setUseRegisteredOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium">登録情報のみを参照して回答する</span>
              </label>
              <p className="mt-1 text-xs text-gray-500">
                {useRegisteredOnly
                  ? '登録された情報のみを参照します。情報がない場合は回答できません。'
                  : '登録された情報を優先し、ない場合は一般的な知識で回答します。'}
              </p>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <p className="text-center text-gray-500">メッセージがありません</p>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        message.role === 'user'
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 text-gray-800'
                      }`}
                    >
                      {message.role === 'assistant' ? (
                        <>
                          <div className="markdown-content">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          </div>
                          {/* 参照ドキュメントタイトルを注釈欄に表示（Markdown形式） */}
                          {message.referencedTitles && message.referencedTitles.length > 0 && (
                            <div className="mt-3 border-t border-gray-300 pt-2">
                              <div className="markdown-content">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {`---\n\n**参照したドキュメント**\n\n${message.referencedTitles.map((title) => `- ${title}`).join('\n')}`}
                                </ReactMarkdown>
                              </div>
                            </div>
                          )}
                          {/* Self-check結果を表示（開発モード時のみ） */}
                          {message.selfCheck && (
                            <div className="mt-2 rounded bg-blue-50 p-2">
                              <p className="text-xs text-blue-800">
                                <span className="font-semibold">品質チェック:</span>{' '}
                                {message.selfCheck}
                              </p>
                            </div>
                          )}
                          <button
                            onClick={async (e) => {
                              try {
                                await navigator.clipboard.writeText(message.content);
                                // 簡単なフィードバック（オプション：トーストなどに変更可能）
                                const button = e.currentTarget;
                                if (!button) {
                                  return;
                                }
                                const originalText = button.textContent || 'コピー';
                                button.textContent = 'コピーしました！';
                                setTimeout(() => {
                                  // ボタンがまだDOMに存在するかチェック
                                  if (button && button.isConnected) {
                                    button.textContent = originalText;
                                  }
                                }, 2000);
                              } catch (error) {
                                console.error('コピーに失敗しました:', error);
                                alert('コピーに失敗しました');
                              }
                            }}
                            className="mt-2 rounded bg-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-400"
                            title="コピー"
                          >
                            コピー
                          </button>
                        </>
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  className="flex-1 rounded border px-3 py-2"
                  placeholder="メッセージを入力..."
                  disabled={sending}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !inputMessage.trim()}
                  className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  {sending ? '送信中...' : '送信'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-gray-500">会話を選択するか、新しい会話を作成してください</p>
          </div>
        )}
      </div>
    </div>
  );
}
