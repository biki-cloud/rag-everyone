import { db } from '@/server/db';
import { threadsTable, messagesTable } from '@/server/db/schema';
import { openai } from '@/lib/openai';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';
import { eq, desc } from 'drizzle-orm';

export const runtime = 'edge';

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// スレッド一覧を取得
export async function GET(request: NextRequest) {
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

    const threads = await db
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.userId, user.id))
      .orderBy(desc(threadsTable.updatedAt));

    return NextResponse.json({ threads });
  } catch (error) {
    console.error('Error fetching threads:', error);
    return NextResponse.json({ error: 'スレッドの取得に失敗しました' }, { status: 500 });
  }
}

// 新しいスレッドを作成
export async function POST(request: NextRequest) {
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

    // OpenAIで新しいスレッドを作成
    const thread = await openai.beta.threads.create();

    // データベースに保存
    const [savedThread] = await db
      .insert(threadsTable)
      .values({
        threadId: thread.id,
        userId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json({ thread: savedThread });
  } catch (error) {
    console.error('Error creating thread:', error);
    return NextResponse.json({ error: 'スレッドの作成に失敗しました' }, { status: 500 });
  }
}
