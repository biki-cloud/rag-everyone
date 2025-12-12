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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-xl font-semibold text-gray-900">RAGシステム</h1>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
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
        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
          <button
            onClick={() => setActiveTab('documents')}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'documents'
                ? 'border-b-2 border-gray-900 text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ドキュメント
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-medium text-gray-900">{doc.title}</h3>
                    <p className="mt-1.5 line-clamp-2 text-sm text-gray-600">
                      {doc.content.substring(0, 200)}...
                    </p>
                    <p className="mt-2 text-xs text-gray-400">
                      {new Date(doc.createdAt).toLocaleString('ja-JP')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:ml-4 sm:flex-nowrap">
                    <Link
                      href={`/rag/documents/${doc.id}`}
                      className="whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      詳細
                    </Link>
                    <button
                      onClick={() => handleEdit(doc.id)}
                      className="whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deleting}
                      className="whitespace-nowrap rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-xl sm:p-6">
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

type SystemPrompt = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [promptTitle, setPromptTitle] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [editingPromptId, setEditingPromptId] = useState<number | null>(null);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [deletingPromptId, setDeletingPromptId] = useState<number | null>(null);
  const [showPromptsList, setShowPromptsList] = useState(false);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);

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

  const fetchSystemPrompts = async () => {
    if (!session) return;
    try {
      const response = await fetch('/api/system-prompts', {
        headers: {
          Authorization: `Bearer ${session}`,
        },
      });

      if (response.ok) {
        const data = (await response.json()) as { prompts?: SystemPrompt[] };
        setSystemPrompts(data.prompts ?? []);
      }
    } catch (error) {
      console.error('Failed to fetch system prompts:', error);
    }
  };

  useEffect(() => {
    void fetchSystemPrompts();
  }, [session]);

  const handleSavePrompt = async () => {
    if (!session || !promptTitle.trim() || !promptContent.trim()) return;

    setSavingPrompt(true);
    try {
      if (editingPromptId) {
        // 更新
        const response = await fetch(`/api/system-prompts/${editingPromptId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session}`,
          },
          body: JSON.stringify({ title: promptTitle, content: promptContent }),
        });

        if (response.ok) {
          setIsPromptModalOpen(false);
          setPromptTitle('');
          setPromptContent('');
          setEditingPromptId(null);
          void fetchSystemPrompts();
        } else {
          const error = (await response.json()) as { error?: string };
          alert(error.error || 'システムプロンプトの更新に失敗しました');
        }
      } else {
        // 新規作成
        const response = await fetch('/api/system-prompts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session}`,
          },
          body: JSON.stringify({ title: promptTitle, content: promptContent }),
        });

        if (response.ok) {
          setIsPromptModalOpen(false);
          setPromptTitle('');
          setPromptContent('');
          void fetchSystemPrompts();
        } else {
          const error = (await response.json()) as { error?: string };
          alert(error.error || 'システムプロンプトの作成に失敗しました');
        }
      }
    } catch (error) {
      console.error('Failed to save system prompt:', error);
      alert('システムプロンプトの保存に失敗しました');
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleEditPrompt = (prompt: SystemPrompt) => {
    setEditingPromptId(prompt.id);
    setPromptTitle(prompt.title);
    setPromptContent(prompt.content);
    setIsPromptModalOpen(true);
  };

  const handleDeletePrompt = async (promptId: number) => {
    if (!session) return;
    if (!confirm('本当にこのシステムプロンプトを削除しますか？')) return;

    setDeletingPromptId(promptId);
    try {
      const response = await fetch(`/api/system-prompts/${promptId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session}`,
        },
      });

      if (response.ok) {
        void fetchSystemPrompts();
      } else {
        const error = (await response.json()) as { error?: string };
        alert(error.error || 'システムプロンプトの削除に失敗しました');
      }
    } catch (error) {
      console.error('Failed to delete system prompt:', error);
      alert('システムプロンプトの削除に失敗しました');
    } finally {
      setDeletingPromptId(null);
    }
  };

  const handleInsertPrompt = (content: string) => {
    setInputMessage((prev) => {
      if (prev.trim()) {
        return prev + '\n\n' + content;
      }
      return content;
    });
  };

  const handleThreadClick = (threadId: number) => {
    if (editingThreadId === threadId) {
      return; // 編集中の場合は選択しない
    }
    setSelectedThreadId(threadId);
    setIsSidebarOpen(false); // モバイルで会話を選択したらサイドバーを閉じる
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
      let context: Array<{
        content: string;
        documentTitle?: string;
        chunkIndex?: number;
      }> = [];

      try {
        const searchResponse = await fetch('/api/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session}`,
          },
          body: JSON.stringify({ query: userMessage, limit: 3 }),
        });

        if (searchResponse.ok) {
          const searchData = (await searchResponse.json()) as {
            chunks?: Array<{
              content: string;
              documentTitle?: string;
              chunkIndex?: number;
            }>;
          };
          context = searchData.chunks ?? [];
        } else {
          console.warn('検索APIが失敗しましたが、続行します:', searchResponse.status);
          // 検索が失敗しても空のコンテキストで続行
        }
      } catch (searchError) {
        console.error('検索エラー:', searchError);
        // 検索エラーが発生しても空のコンテキストで続行
      }

      // アシスタントメッセージのプレースホルダーを追加
      const assistantMessageIndex = messages.length + 1; // ユーザーメッセージの後に追加される
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
        },
      ]);

      // メッセージを送信（ストリーミング）
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

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        alert(error.error || 'メッセージの送信に失敗しました');
        // ユーザーメッセージとアシスタントメッセージを削除
        setMessages((prev) => prev.slice(0, -2));
        return;
      }

      // ストリーミングレスポンスを処理
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      if (!reader) {
        throw new Error('ストリームの読み取りに失敗しました');
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (!value) continue;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 最後の不完全な行を保持

          for (const line of lines) {
            if (line.trim() === '') continue;
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'chunk') {
                  accumulatedContent += data.content;
                  // アシスタントメッセージをリアルタイムで更新
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const assistantMsg = newMessages[assistantMessageIndex];
                    if (assistantMsg) {
                      assistantMsg.content = accumulatedContent;
                    }
                    return newMessages;
                  });
                } else if (data.type === 'done') {
                  // 最終メッセージを更新
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const assistantMsg = newMessages[assistantMessageIndex];
                    if (assistantMsg) {
                      assistantMsg.content = data.message;
                      assistantMsg.referencedTitles = data.referencedTitles;
                      assistantMsg.referencedDocuments = data.referencedDocuments;
                    }
                    return newMessages;
                  });
                  // ストリーミング完了
                  break;
                } else if (data.type === 'error') {
                  throw new Error(data.error || 'エラーが発生しました');
                }
              } catch (e) {
                // JSONパースエラーは無視して続行（不完全なデータの可能性）
                if (e instanceof SyntaxError) {
                  continue;
                }
                console.error('Failed to parse stream data:', e);
                throw e;
              }
            }
          }
        }

        // ストリームが正常に終了したが、doneイベントが来なかった場合の処理
        if (accumulatedContent && buffer.trim()) {
          // バッファに残っているデータを処理
          const remainingLines = buffer.split('\n').filter((line) => line.trim());
          for (const line of remainingLines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'done') {
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const assistantMsg = newMessages[assistantMessageIndex];
                    if (assistantMsg) {
                      assistantMsg.content = data.message || accumulatedContent;
                      assistantMsg.referencedTitles = data.referencedTitles;
                      assistantMsg.referencedDocuments = data.referencedDocuments;
                    }
                    return newMessages;
                  });
                }
              } catch (e) {
                // パースエラーは無視
              }
            }
          }
        }
      } catch (streamError) {
        console.error('Streaming error:', streamError);
        // ストリーミングが中断された場合でも、既に取得したコンテンツがあれば保持
        if (accumulatedContent) {
          setMessages((prev) => {
            const newMessages = [...prev];
            const assistantMsg = newMessages[assistantMessageIndex];
            if (assistantMsg && !assistantMsg.content) {
              assistantMsg.content = accumulatedContent;
            }
            return newMessages;
          });
          alert('ストリーミングが中断されましたが、取得できた内容を表示しています。');
        } else {
          alert(
            streamError instanceof Error ? streamError.message : 'メッセージの送信に失敗しました'
          );
          // ユーザーメッセージとアシスタントメッセージを削除
          setMessages((prev) => prev.slice(0, -2));
        }
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
    <div className="flex h-[calc(100vh-80px)] gap-4">
      {/* モバイル用サイドバートグルボタン */}
      <div className="fixed bottom-4 right-4 z-30 sm:hidden">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="rounded-full bg-gray-900 p-3 text-white shadow-lg transition-colors hover:bg-gray-800"
          title="会話一覧"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </div>

      {/* サイドバー */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 transform space-y-2 bg-white p-4 shadow-xl transition-transform duration-300 ease-in-out sm:relative sm:z-auto sm:transform-none sm:shadow-none ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'
        }`}
      >
        {/* モバイル用閉じるボタン */}
        <div className="mb-4 flex items-center justify-between sm:hidden">
          <h2 className="text-sm font-semibold text-gray-900">会話一覧</h2>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="rounded-lg p-1 text-gray-600 hover:bg-gray-100"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
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
                <div className="flex items-center gap-2 px-4 py-2">
                  <button
                    onClick={() => handleThreadClick(thread.id)}
                    onDoubleClick={() => handleThreadDoubleClick(thread)}
                    className={`flex-1 text-left text-sm transition-colors ${
                      selectedThreadId === thread.id ? 'font-medium text-white' : 'text-gray-700'
                    }`}
                    title="ダブルクリックで編集"
                  >
                    {thread.title || `会話 ${thread.id}`}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleThreadDoubleClick(thread);
                    }}
                    className={`rounded p-1 transition-colors ${
                      selectedThreadId === thread.id
                        ? 'text-white hover:bg-gray-700'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                    title="編集"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* サイドバーオーバーレイ（モバイル用） */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 sm:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
        {selectedThreadId ? (
          <>
            <div className="flex-1 space-y-5 overflow-y-auto p-8">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-gray-400">メッセージがありません</p>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[95%] rounded-lg px-5 py-3 sm:max-w-[90%] sm:px-6 sm:py-4 ${
                        message.role === 'user'
                          ? 'bg-gray-900 text-white'
                          : 'border border-gray-200 bg-gray-50 text-gray-900'
                      }`}
                    >
                      {message.role === 'assistant' ? (
                        <>
                          {message.content ? (
                            <div className="markdown-content">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.content}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-gray-500">
                              <div className="flex gap-1">
                                <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]"></div>
                                <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]"></div>
                                <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400"></div>
                              </div>
                              <span className="text-sm">回答を生成しています...</span>
                            </div>
                          )}
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
                          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
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
              {/* 設定セクション（折りたたみ可能） */}
              {isSettingsExpanded && (
                <div className="mb-3 space-y-3 rounded-lg border border-gray-200 bg-white p-3">
                  {/* システムプロンプト選択 */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            const prompt = systemPrompts.find(
                              (p) => p.id === parseInt(e.target.value)
                            );
                            if (prompt) {
                              handleInsertPrompt(prompt.content);
                            }
                          }
                          e.target.value = ''; // リセット
                        }}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                      >
                        <option value="">システムプロンプトを選択...</option>
                        {systemPrompts.map((prompt) => (
                          <option key={prompt.id} value={prompt.id}>
                            {prompt.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingPromptId(null);
                          setPromptTitle('');
                          setPromptContent('');
                          setIsPromptModalOpen(true);
                        }}
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:flex-none"
                      >
                        新規登録
                      </button>
                      {systemPrompts.length > 0 && (
                        <button
                          onClick={() => setShowPromptsList(!showPromptsList)}
                          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:flex-none"
                          title="一覧を表示"
                        >
                          {showPromptsList ? '一覧を閉じる' : '一覧'}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* 登録情報のみを参照して回答する */}
                  <div>
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
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
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
                <div className="flex gap-2 sm:self-end">
                  <button
                    onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
                    className="flex items-center justify-center rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-gray-700 transition-colors hover:bg-gray-50"
                    title={isSettingsExpanded ? '設定を閉じる' : '設定を開く'}
                  >
                    <svg
                      className={`h-4 w-4 transition-transform ${isSettingsExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={sending || !inputMessage.trim()}
                    className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {sending ? '送信中...' : '送信'}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-gray-400">会話を選択するか、新しい会話を作成してください</p>
          </div>
        )}
      </div>

      {/* システムプロンプト管理モーダル */}
      {isPromptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-xl sm:p-6">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingPromptId ? 'システムプロンプトを編集' : 'システムプロンプトを登録'}
              </h2>
              <button
                onClick={() => {
                  setIsPromptModalOpen(false);
                  setPromptTitle('');
                  setPromptContent('');
                  setEditingPromptId(null);
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                閉じる
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">タイトル</label>
                <input
                  type="text"
                  value={promptTitle}
                  onChange={(e) => setPromptTitle(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                  placeholder="システムプロンプトのタイトル"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">内容</label>
                <textarea
                  value={promptContent}
                  onChange={(e) => setPromptContent(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                  rows={10}
                  placeholder="システムプロンプトの内容を入力してください"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPromptModalOpen(false);
                    setPromptTitle('');
                    setPromptContent('');
                    setEditingPromptId(null);
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSavePrompt}
                  disabled={savingPrompt || !promptTitle.trim() || !promptContent.trim()}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingPrompt ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* システムプロンプト一覧 */}
      {showPromptsList && systemPrompts.length > 0 && (
        <div className="fixed right-2 top-20 z-40 w-[calc(100%-1rem)] max-w-64 rounded-lg border border-gray-200 bg-white p-4 shadow-lg sm:right-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">システムプロンプト</h3>
            <button
              onClick={() => setShowPromptsList(false)}
              className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
              title="閉じる"
            >
              ×
            </button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {systemPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className="group rounded-lg border border-gray-200 bg-gray-50 p-2 transition-colors hover:bg-gray-100"
              >
                <div className="mb-1 flex items-start justify-between">
                  <h4 className="text-xs font-medium text-gray-900">{prompt.title}</h4>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => handleEditPrompt(prompt)}
                      className="rounded px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
                      title="編集"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => void handleDeletePrompt(prompt.id)}
                      disabled={deletingPromptId === prompt.id}
                      className="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      title="削除"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <p className="mb-2 line-clamp-2 text-xs text-gray-600">{prompt.content}</p>
                <button
                  onClick={() => handleInsertPrompt(prompt.content)}
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-50"
                >
                  貼り付け
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
