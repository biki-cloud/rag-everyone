import { db } from '@/server/db';
import { systemPromptsTable } from '@/server/db/schema';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';
import { eq, desc } from 'drizzle-orm';

export const runtime = 'edge';

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// システムプロンプト一覧を取得
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

    const prompts = await db
      .select()
      .from(systemPromptsTable)
      .where(eq(systemPromptsTable.userId, user.id))
      .orderBy(desc(systemPromptsTable.updatedAt));

    return NextResponse.json({ prompts });
  } catch (error) {
    console.error('Error fetching system prompts:', error);
    return NextResponse.json({ error: 'システムプロンプトの取得に失敗しました' }, { status: 500 });
  }
}

// システムプロンプトを登録
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

    const body = (await request.json()) as { title?: string; content?: string };
    const { title, content } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'タイトルとコンテンツは必須です' }, { status: 400 });
    }

    // システムプロンプトを保存
    const [prompt] = await db
      .insert(systemPromptsTable)
      .values({
        title,
        content,
        userId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error('Error creating system prompt:', error);
    return NextResponse.json({ error: 'システムプロンプトの作成に失敗しました' }, { status: 500 });
  }
}
