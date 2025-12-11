import { db } from '@/server/db';
import { documentChunksTable, documentsTable } from '@/server/db/schema';
import { generateEmbedding, cosineSimilarity } from '@/lib/openai';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// クエリに対して関連するドキュメントチャンクを検索
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

    const body = await request.json();
    const { query, limit = 5 } = body;

    if (!query) {
      return NextResponse.json({ error: 'クエリは必須です' }, { status: 400 });
    }

    // クエリの埋め込みを生成
    const queryEmbedding = await generateEmbedding(query);

    // ユーザーのドキュメントチャンクを取得
    const allChunks = await db
      .select({
        chunkId: documentChunksTable.id,
        documentId: documentChunksTable.documentId,
        content: documentChunksTable.content,
        embedding: documentChunksTable.embedding,
        chunkIndex: documentChunksTable.chunkIndex,
        documentTitle: documentsTable.title,
      })
      .from(documentChunksTable)
      .innerJoin(documentsTable, eq(documentChunksTable.documentId, documentsTable.id))
      .where(eq(documentsTable.userId, user.id));

    // 各チャンクとの類似度を計算
    const chunksWithSimilarity = allChunks
      .map((chunk) => {
        if (!chunk.embedding) {
          return null;
        }

        const chunkEmbedding = JSON.parse(chunk.embedding) as number[];
        const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);

        return {
          ...chunk,
          similarity,
        };
      })
      .filter((chunk): chunk is NonNullable<typeof chunk> => chunk !== null)
      .sort((a, b) => {
        // まず類似度でソート
        if (Math.abs(a.similarity - b.similarity) > 0.01) {
          return b.similarity - a.similarity;
        }
        // 同じドキュメント内ではchunkIndex順
        if (a.documentId === b.documentId) {
          return a.chunkIndex - b.chunkIndex;
        }
        // 異なるドキュメントは類似度順
        return b.similarity - a.similarity;
      })
      .slice(0, limit);

    return NextResponse.json({ chunks: chunksWithSimilarity });
  } catch (error) {
    console.error('Error searching documents:', error);
    return NextResponse.json({ error: '検索に失敗しました' }, { status: 500 });
  }
}
