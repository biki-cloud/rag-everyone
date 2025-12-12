import { db } from '@/server/db';
import { systemPromptsTable } from '@/server/db/schema';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// システムプロンプトを更新
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;
    const promptId = parseInt(id);

    if (isNaN(promptId)) {
      return NextResponse.json({ error: '無効なプロンプトIDです' }, { status: 400 });
    }

    const body = (await request.json()) as { title?: string; content?: string };
    const { title, content } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'タイトルとコンテンツは必須です' }, { status: 400 });
    }

    // プロンプトがユーザーのものか確認
    const [existingPrompt] = await db
      .select()
      .from(systemPromptsTable)
      .where(eq(systemPromptsTable.id, promptId));

    if (!existingPrompt) {
      return NextResponse.json({ error: 'システムプロンプトが見つかりません' }, { status: 404 });
    }

    if (existingPrompt.userId !== user.id) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    // プロンプトを更新
    const [updatedPrompt] = await db
      .update(systemPromptsTable)
      .set({
        title,
        content,
        updatedAt: new Date(),
      })
      .where(eq(systemPromptsTable.id, promptId))
      .returning();

    return NextResponse.json({ prompt: updatedPrompt });
  } catch (error) {
    console.error('Error updating system prompt:', error);
    return NextResponse.json({ error: 'システムプロンプトの更新に失敗しました' }, { status: 500 });
  }
}

// システムプロンプトを削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    const promptId = parseInt(id);

    if (isNaN(promptId)) {
      return NextResponse.json({ error: '無効なプロンプトIDです' }, { status: 400 });
    }

    // プロンプトがユーザーのものか確認
    const [existingPrompt] = await db
      .select()
      .from(systemPromptsTable)
      .where(eq(systemPromptsTable.id, promptId));

    if (!existingPrompt) {
      return NextResponse.json({ error: 'システムプロンプトが見つかりません' }, { status: 404 });
    }

    if (existingPrompt.userId !== user.id) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    // プロンプトを削除
    await db.delete(systemPromptsTable).where(eq(systemPromptsTable.id, promptId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting system prompt:', error);
    return NextResponse.json({ error: 'システムプロンプトの削除に失敗しました' }, { status: 500 });
  }
}
