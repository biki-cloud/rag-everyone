import { db } from '@/server/db';
import { documentsTable, documentChunksTable } from '@/server/db/schema';
import { chunkText, generateEmbedding } from '@/lib/openai';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// ドキュメント詳細を取得
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const documentId = parseInt(id);

    if (isNaN(documentId)) {
      return NextResponse.json({ error: '無効なドキュメントIDです' }, { status: 400 });
    }

    // ドキュメントを取得
    const [document] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId));

    if (!document) {
      return NextResponse.json({ error: 'ドキュメントが見つかりません' }, { status: 404 });
    }

    // ユーザーが所有しているか確認
    if (document.userId !== user.id) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    return NextResponse.json({ document });
  } catch (error) {
    console.error('Error fetching document:', error);
    return NextResponse.json({ error: 'ドキュメントの取得に失敗しました' }, { status: 500 });
  }
}

// ドキュメントを更新
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
    const documentId = parseInt(id);

    if (isNaN(documentId)) {
      return NextResponse.json({ error: '無効なドキュメントIDです' }, { status: 400 });
    }

    const body = await request.json();
    const { title, content } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'タイトルとコンテンツは必須です' }, { status: 400 });
    }

    // ドキュメントが存在し、ユーザーが所有しているか確認
    const [existingDocument] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId));

    if (!existingDocument) {
      return NextResponse.json({ error: 'ドキュメントが見つかりません' }, { status: 404 });
    }

    if (existingDocument.userId !== user.id) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    // ドキュメントを更新
    const [updatedDocument] = await db
      .update(documentsTable)
      .set({
        title,
        content,
        updatedAt: new Date(),
      })
      .where(eq(documentsTable.id, documentId))
      .returning();

    // 既存のチャンクを削除
    await db.delete(documentChunksTable).where(eq(documentChunksTable.documentId, documentId));

    // テキストをチャンクに分割
    const chunks = chunkText(content, 1000, 200);

    // 各チャンクの埋め込みを生成して保存
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await generateEmbedding(chunk);

      await db.insert(documentChunksTable).values({
        documentId: documentId,
        content: chunk,
        embedding: JSON.stringify(embedding),
        chunkIndex: i,
        createdAt: new Date(),
      });
    }

    return NextResponse.json({ document: updatedDocument });
  } catch (error) {
    console.error('Error updating document:', error);
    return NextResponse.json({ error: 'ドキュメントの更新に失敗しました' }, { status: 500 });
  }
}

// ドキュメントを削除
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
    const documentId = parseInt(id);

    if (isNaN(documentId)) {
      return NextResponse.json({ error: '無効なドキュメントIDです' }, { status: 400 });
    }

    // ドキュメントが存在し、ユーザーが所有しているか確認
    const [document] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId));

    if (!document) {
      return NextResponse.json({ error: 'ドキュメントが見つかりません' }, { status: 404 });
    }

    if (document.userId !== user.id) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    // ドキュメントを削除（チャンクはCASCADEで自動削除される）
    await db.delete(documentsTable).where(eq(documentsTable.id, documentId));

    return NextResponse.json({ message: 'ドキュメントを削除しました' });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json({ error: 'ドキュメントの削除に失敗しました' }, { status: 500 });
  }
}
