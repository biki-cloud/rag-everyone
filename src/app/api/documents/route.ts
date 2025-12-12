import { db } from '@/server/db';
import { documentsTable, documentChunksTable } from '@/server/db/schema';
import { chunkText, generateEmbedding } from '@/lib/openai';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';
import { eq, desc } from 'drizzle-orm';

export const runtime = 'edge';

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// ドキュメント一覧を取得
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');

    // トークンの基本検証
    if (!token || token.trim() === '') {
      return NextResponse.json(
        {
          error: '認証に失敗しました',
          details: 'トークンが空です',
        },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        {
          error: '認証に失敗しました',
          details: authError.message || '認証エラーが発生しました',
          code: authError.status || 'unknown',
        },
        { status: 401 }
      );
    }

    if (!user) {
      return NextResponse.json(
        {
          error: '認証に失敗しました',
          details: 'ユーザー情報が取得できませんでした',
        },
        { status: 401 }
      );
    }

    const documents = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.userId, user.id))
      .orderBy(desc(documentsTable.createdAt));

    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json({ error: 'ドキュメントの取得に失敗しました' }, { status: 500 });
  }
}

// ドキュメントを登録
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');

    // トークンの基本検証
    if (!token || token.trim() === '') {
      return NextResponse.json(
        {
          error: '認証に失敗しました',
          details: 'トークンが空です',
        },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        {
          error: '認証に失敗しました',
          details: authError.message || '認証エラーが発生しました',
          code: authError.status || 'unknown',
        },
        { status: 401 }
      );
    }

    if (!user) {
      return NextResponse.json(
        {
          error: '認証に失敗しました',
          details: 'ユーザー情報が取得できませんでした',
        },
        { status: 401 }
      );
    }

    const body = (await request.json()) as { title?: string; content?: string };
    const { title, content } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'タイトルとコンテンツは必須です' }, { status: 400 });
    }

    // ドキュメントを保存
    const [document] = await db
      .insert(documentsTable)
      .values({
        title,
        content,
        userId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!document) {
      return NextResponse.json({ error: 'ドキュメントの作成に失敗しました' }, { status: 500 });
    }

    // テキストをチャンクに分割（600文字、オーバーラップ150文字で最適化）
    const chunks = chunkText(content, 600, 150);

    // 各チャンクの埋め込みを生成して保存
    for (const [i, chunk] of chunks.entries()) {
      const embedding = await generateEmbedding(chunk);

      await db.insert(documentChunksTable).values({
        documentId: document.id,
        content: chunk,
        embedding: JSON.stringify(embedding),
        chunkIndex: i,
        createdAt: new Date(),
      });
    }

    return NextResponse.json({ document });
  } catch (error) {
    console.error('Error creating document:', error);
    return NextResponse.json({ error: 'ドキュメントの作成に失敗しました' }, { status: 500 });
  }
}
