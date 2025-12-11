import { openai } from '@/lib/openai';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';

export const runtime = 'edge';

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// アシスタントを作成または取得
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

    // アシスタントを作成
    const assistant = await openai.beta.assistants.create({
      name: 'RAG Assistant',
      instructions:
        'あなたは登録されたドキュメントを参照して質問に答えるアシスタントです。提供されたコンテキスト情報を基に、正確で有用な回答を提供してください。',
      model: 'gpt-5',
    });

    return NextResponse.json({ assistantId: assistant.id });
  } catch (error) {
    console.error('Error creating assistant:', error);
    return NextResponse.json({ error: 'アシスタントの作成に失敗しました' }, { status: 500 });
  }
}
