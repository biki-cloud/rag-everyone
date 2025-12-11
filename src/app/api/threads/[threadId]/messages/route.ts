import { db } from '@/server/db';
import { threadsTable, messagesTable } from '@/server/db/schema';
import { openai } from '@/lib/openai';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';
import { eq, desc } from 'drizzle-orm';

export const runtime = 'edge';

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

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
    let threadIdentifier = thread.threadId;
    if (!threadIdentifier) {
      const newThread = await openai.beta.threads.create();
      threadIdentifier = newThread.id;
      await db
        .update(threadsTable)
        .set({ threadId: threadIdentifier, updatedAt: new Date() })
        .where(eq(threadsTable.id, parseInt(threadId)));
    }
    if (!threadIdentifier) {
      return NextResponse.json({ error: 'スレッドIDの取得に失敗しました' }, { status: 500 });
    }

    const messages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.threadId, parseInt(threadId)))
      .orderBy(desc(messagesTable.createdAt));

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
    const body = await request.json();
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

    // threadId が欠損している古いレコードへの対処
    let threadIdentifier = thread.threadId;
    if (!threadIdentifier) {
      const newThread = await openai.beta.threads.create();
      threadIdentifier = newThread.id;
      await db
        .update(threadsTable)
        .set({ threadId: threadIdentifier, updatedAt: new Date() })
        .where(eq(threadsTable.id, parseInt(threadId)));
    }

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
    const run = await openai.beta.threads.runs.create(threadIdentifier, {
      assistant_id: assistantId,
    });

    // 実行が完了するまで待機
    let runStatus = await openai.beta.threads.runs.retrieve(threadIdentifier, run.id);
    while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(threadIdentifier, run.id);
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
