import { db } from '@/server/db';
import { threadsTable } from '@/server/db/schema';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// スレッドのタイトルを更新
export async function PATCH(
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
    const threadIdNum = parseInt(threadId);

    if (isNaN(threadIdNum)) {
      return NextResponse.json({ error: '無効なスレッドIDです' }, { status: 400 });
    }

    const body = (await request.json()) as { title?: string };
    const { title } = body;

    if (title === undefined) {
      return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 });
    }

    // スレッドが存在し、ユーザーが所有しているか確認
    const [existingThread] = await db
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.id, threadIdNum));

    if (!existingThread) {
      return NextResponse.json({ error: 'スレッドが見つかりません' }, { status: 404 });
    }

    if (existingThread.userId !== user.id) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    // スレッドのタイトルを更新
    const [updatedThread] = await db
      .update(threadsTable)
      .set({
        title: title || null,
        updatedAt: new Date(),
      })
      .where(eq(threadsTable.id, threadIdNum))
      .returning();

    return NextResponse.json({ thread: updatedThread });
  } catch (error) {
    console.error('Error updating thread title:', error);
    return NextResponse.json({ error: 'スレッドの更新に失敗しました' }, { status: 500 });
  }
}
