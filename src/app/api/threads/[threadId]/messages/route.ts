import { db } from '@/server/db';
import { threadsTable, messagesTable } from '@/server/db/schema';
import { openai } from '@/lib/openai';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';
import { eq, asc } from 'drizzle-orm';

export const runtime = 'edge';

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// OpenAIに安全に渡せるThread IDを保証する共通処理
async function ensureThreadIdentifier(threadIdValue: string | null | undefined, recordId: number) {
  // 余計な空白や文字列 "undefined" / "null" を排除してから判定
  const normalized = threadIdValue?.trim();
  const needsNewThread = !normalized || normalized === 'undefined' || normalized === 'null';

  let threadIdentifier = normalized;

  if (needsNewThread) {
    const newThread = await openai.beta.threads.create();
    threadIdentifier = newThread.id;
    await db
      .update(threadsTable)
      .set({ threadId: threadIdentifier, updatedAt: new Date() })
      .where(eq(threadsTable.id, recordId));
  }

  if (!threadIdentifier || threadIdentifier === 'undefined' || threadIdentifier === 'null') {
    // データ不整合を即座に検出して呼び出し元で 500 を返す
    throw new Error(`スレッドIDの取得に失敗しました (recordId=${recordId})`);
  }

  return threadIdentifier;
}

// メッセージ一覧を取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 });
    }

    const { threadId } = await params;

    // スレッドがユーザーのものか確認
    const [thread] = await db
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.id, parseInt(threadId)));

    if (!thread || thread.userId !== user.id) {
      return NextResponse.json({ error: 'スレッドが見つかりません' }, { status: 404 });
    }

    // threadId が欠損している古いレコードへの対処
    let threadIdentifier: string;
    try {
      threadIdentifier = await ensureThreadIdentifier(thread.threadId, parseInt(threadId));
    } catch (e) {
      console.error('Failed to ensure threadIdentifier in GET messages:', e);
      return NextResponse.json({ error: 'スレッドIDの取得に失敗しました' }, { status: 500 });
    }

    const messages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.threadId, parseInt(threadId)))
      .orderBy(asc(messagesTable.createdAt));

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'メッセージの取得に失敗しました' }, { status: 500 });
  }
}

// メッセージを送信してAIからの応答を取得
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 });
    }

    const { threadId } = await params;
    const body = (await request.json()) as {
      message?: string;
      context?: Array<{ content: string }>;
    };
    const { message, context } = body;

    if (!message) {
      return NextResponse.json({ error: 'メッセージは必須です' }, { status: 400 });
    }

    // スレッドがユーザーのものか確認
    const [thread] = await db
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.id, parseInt(threadId)));

    if (!thread || thread.userId !== user.id) {
      return NextResponse.json({ error: 'スレッドが見つかりません' }, { status: 404 });
    }

    // threadId が欠損している古いレコードへの対処（OpenAI呼び出し直前で必ずガード）
    // console.log('Thread record before ensureThreadIdentifier', {
    //   threadIdParam: threadId,
    //   dbThreadId: thread.threadId,
    //   userId: thread.userId,
    // });

    let threadIdentifier: string;
    try {
      threadIdentifier = await ensureThreadIdentifier(thread.threadId, parseInt(threadId));
    } catch (e) {
      console.error('Invalid threadIdentifier before OpenAI call:', {
        threadIdParam: threadId,
        dbThreadId: thread.threadId,
        error: e,
      });
      return NextResponse.json(
        { error: 'スレッドIDが不正なため、OpenAIを呼び出せません' },
        { status: 500 }
      );
    }

    // 念のため undefined/空文字をここで遮断（OpenAI SDKに渡さない）
    if (!threadIdentifier || threadIdentifier === 'undefined' || threadIdentifier === 'null') {
      console.error('Thread identifier is still invalid after ensureThreadIdentifier', {
        threadIdParam: threadId,
        dbThreadId: thread.threadId,
        resolvedThreadIdentifier: threadIdentifier,
      });
      return NextResponse.json({ error: 'スレッドIDの解決に失敗しました' }, { status: 500 });
    }

    // デバッグ: この段階で必ず有効な threadIdentifier を確認
    // console.log('Resolved threadIdentifier before OpenAI calls', {
    //   threadIdParam: threadId,
    //   resolvedThreadIdentifier: threadIdentifier,
    // });

    // コンテキストを含めたメッセージを作成
    const contextText = context
      ? `以下の情報を参照してください:\n\n${context.map((c: { content: string }) => c.content).join('\n\n')}\n\n`
      : '';

    const fullMessage = contextText + message;

    // OpenAIのスレッドにメッセージを追加
    const threadMessage = await openai.beta.threads.messages.create(threadIdentifier, {
      role: 'user',
      content: fullMessage,
    });

    // データベースにユーザーメッセージを保存
    await db.insert(messagesTable).values({
      threadId: parseInt(threadId),
      role: 'user',
      content: message,
      messageId: threadMessage.id,
      createdAt: new Date(),
    });

    // アシスタントIDを取得（環境変数から、またはデフォルトのアシスタントを作成）
    let assistantId = process.env.OPENAI_ASSISTANT_ID;
    if (!assistantId) {
      // アシスタントが存在しない場合は作成
      const assistant = await openai.beta.assistants.create({
        name: 'RAG Assistant',
        instructions:
          'あなたは登録されたドキュメントを参照して質問に答えるアシスタントです。提供されたコンテキスト情報を基に、正確で有用な回答を提供してください。',
        model: 'gpt-4-turbo-preview',
      });
      assistantId = assistant.id;
    }

    // アシスタントを実行
    // console.log('Creating run with', { threadIdentifier, assistantId });
    const run = await openai.beta.threads.runs.create(threadIdentifier, {
      assistant_id: assistantId,
    });
    // console.log('Created run result', run);

    // run 側に thread_id が無い場合は異常とみなす
    const runThreadId = (run as any)?.thread_id ?? threadIdentifier;
    if (!runThreadId || runThreadId === 'undefined' || runThreadId === 'null') {
      console.error('Run thread_id is invalid', { run, threadIdentifier });
      return NextResponse.json({ error: 'スレッドIDの解決に失敗しました (run)' }, { status: 500 });
    }

    // 実行が完了するまで待機
    // NOTE: SDKの引数順は (runId, { thread_id }) であるため run.id を第一引数にする
    let runStatus = await openai.beta.threads.runs.retrieve(run.id as any, {
      thread_id: runThreadId as any,
    });
    while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(run.id as any, {
        thread_id: runThreadId as any,
      });
    }

    if (runStatus.status !== 'completed') {
      return NextResponse.json(
        { error: `実行に失敗しました: ${runStatus.status}` },
        { status: 500 }
      );
    }

    // メッセージを取得
    const messages = await openai.beta.threads.messages.list(threadIdentifier, {
      limit: 1,
    });

    const assistantMessage = messages.data[0];
    if (!assistantMessage) {
      return NextResponse.json({ error: 'アシスタントの応答取得に失敗しました' }, { status: 500 });
    }
    const assistantContent =
      assistantMessage.content[0]?.type === 'text' ? assistantMessage.content[0].text.value : '';

    // データベースにアシスタントメッセージを保存
    await db.insert(messagesTable).values({
      threadId: parseInt(threadId),
      role: 'assistant',
      content: assistantContent,
      messageId: assistantMessage.id,
      createdAt: new Date(),
    });

    // スレッドの更新日時を更新
    await db
      .update(threadsTable)
      .set({ updatedAt: new Date() })
      .where(eq(threadsTable.id, parseInt(threadId)));

    return NextResponse.json({ message: assistantContent });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json({ error: 'メッセージの送信に失敗しました' }, { status: 500 });
  }
}
