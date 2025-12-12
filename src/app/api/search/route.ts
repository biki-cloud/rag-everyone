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

    const body = (await request.json()) as { query?: string; limit?: number };
    const { query, limit = 5 } = body;

    if (!query) {
      return NextResponse.json({ error: 'クエリは必須です' }, { status: 400 });
    }

    // クエリの埋め込みを生成（タイムアウト対策）
    let queryEmbedding: number[];
    try {
      queryEmbedding = await Promise.race([
        generateEmbedding(query),
        new Promise<number[]>((_, reject) =>
          setTimeout(() => reject(new Error('埋め込み生成がタイムアウトしました')), 10000)
        ),
      ]);
    } catch (embeddingError) {
      console.error('Error generating embedding:', embeddingError);
      return NextResponse.json(
        {
          error: '埋め込み生成に失敗しました',
          details: embeddingError instanceof Error ? embeddingError.message : '不明なエラー',
        },
        { status: 500 }
      );
    }

    // ユーザーのドキュメントチャンクを取得
    let allChunks;
    try {
      allChunks = await db
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
    } catch (dbError) {
      console.error('Error fetching chunks:', dbError);
      return NextResponse.json(
        {
          error: 'ドキュメントチャンクの取得に失敗しました',
          details: dbError instanceof Error ? dbError.message : '不明なエラー',
        },
        { status: 500 }
      );
    }

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
      });

    // 異なるドキュメントを優先的に取得するロジック
    // まず上位Nチャンク（limitの3倍）を取得してから、各ドキュメントから最大2チャンクまで選択
    const candidateChunks = chunksWithSimilarity.slice(0, limit * 3);
    const selectedChunks: typeof chunksWithSimilarity = [];
    const documentChunkCount = new Map<number, number>(); // ドキュメントID -> 選択済みチャンク数
    const maxChunksPerDocument = 2; // 各ドキュメントから最大2チャンクまで

    for (const chunk of candidateChunks) {
      const currentCount = documentChunkCount.get(chunk.documentId) || 0;

      // まだ制限に達していない場合、または全体のチャンク数がまだ少ない場合
      if (currentCount < maxChunksPerDocument || selectedChunks.length < limit) {
        selectedChunks.push(chunk);
        documentChunkCount.set(chunk.documentId, currentCount + 1);

        // 必要なチャンク数を取得したら終了
        if (selectedChunks.length >= limit) {
          break;
        }
      }
    }

    // 最終的にlimitに達していない場合は、残りのチャンクを追加（異なるドキュメント優先）
    if (selectedChunks.length < limit) {
      for (const chunk of chunksWithSimilarity) {
        if (selectedChunks.some((c) => c.chunkId === chunk.chunkId)) {
          continue; // 既に選択済み
        }

        const currentCount = documentChunkCount.get(chunk.documentId) || 0;
        if (currentCount < maxChunksPerDocument) {
          selectedChunks.push(chunk);
          documentChunkCount.set(chunk.documentId, currentCount + 1);

          if (selectedChunks.length >= limit) {
            break;
          }
        }
      }
    }

    return NextResponse.json({ chunks: selectedChunks });
  } catch (error) {
    console.error('Error searching documents:', error);
    return NextResponse.json({ error: '検索に失敗しました' }, { status: 500 });
  }
}
