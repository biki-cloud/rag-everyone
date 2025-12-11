import { db } from '@/server/db';
import { documentsTable } from '@/server/db/schema';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// タイトルからドキュメントIDを取得
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
    const { titles } = body;

    if (!titles || !Array.isArray(titles) || titles.length === 0) {
      return NextResponse.json({ error: 'タイトルの配列が必要です' }, { status: 400 });
    }

    // タイトルからドキュメントIDを取得
    const documents = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
      })
      .from(documentsTable)
      .where(eq(documentsTable.userId, user.id));

    // タイトルとIDのマッピングを作成
    const titleToIdMap: Record<string, number> = {};
    for (const doc of documents) {
      if (titles.includes(doc.title)) {
        titleToIdMap[doc.title] = doc.id;
      }
    }

    return NextResponse.json({ titleToIdMap });
  } catch (error) {
    console.error('Error fetching document IDs by titles:', error);
    return NextResponse.json({ error: 'ドキュメントIDの取得に失敗しました' }, { status: 500 });
  }
}

