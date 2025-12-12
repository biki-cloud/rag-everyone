import { db } from '@/server/db';
import { threadsTable, messagesTable, documentsTable } from '@/server/db/schema';
import { openai } from '@/lib/openai';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';
import { eq, asc, inArray } from 'drizzle-orm';

export const runtime = 'edge';

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// OpenAIに安全に渡せるThread IDを保証する共通処理
async function ensureThreadIdentifier(threadIdValue: string | null | undefined, recordId: number) {
  // 余計な空白や文字列 "undefined" / "null" を排除してから判定
  const normalized = threadIdValue?.trim();
  const needsNewThread = !normalized || normalized === 'undefined' || normalized === 'null';

  let threadIdentifier = normalized;

  if (needsNewThread) {
    const newThread = await openai.beta.threads.create();
    threadIdentifier = newThread.id;
    await db
      .update(threadsTable)
      .set({ threadId: threadIdentifier, updatedAt: new Date() })
      .where(eq(threadsTable.id, recordId));
  }

  if (!threadIdentifier || threadIdentifier === 'undefined' || threadIdentifier === 'null') {
    // データ不整合を即座に検出して呼び出し元で 500 を返す
    throw new Error(`スレッドIDの取得に失敗しました (recordId=${recordId})`);
  }

  return threadIdentifier;
}

// メッセージ一覧を取得
export async function GET(
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

    // スレッドがユーザーのものか確認
    const [thread] = await db
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.id, parseInt(threadId)));

    if (!thread || thread.userId !== user.id) {
      return NextResponse.json({ error: 'スレッドが見つかりません' }, { status: 404 });
    }

    // threadId が欠損している古いレコードへの対処
    let threadIdentifier: string;
    try {
      threadIdentifier = await ensureThreadIdentifier(thread.threadId, parseInt(threadId));
    } catch (e) {
      console.error('Failed to ensure threadIdentifier in GET messages:', e);
      return NextResponse.json({ error: 'スレッドIDの取得に失敗しました' }, { status: 500 });
    }

    const messages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.threadId, parseInt(threadId)))
      .orderBy(asc(messagesTable.createdAt));

    // アシスタントメッセージから参照タイトルを抽出し、IDを取得
    // まず、ユーザーの全ドキュメントを取得してタイトル→IDのマッピングを作成
    const allDocuments = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
      })
      .from(documentsTable)
      .where(eq(documentsTable.userId, user.id));

    const titleToIdMap = new Map<string, number>();
    for (const doc of allDocuments) {
      titleToIdMap.set(doc.title, doc.id);
    }

    const messagesWithReferences = messages.map((msg) => {
      if (msg.role === 'assistant') {
        // メッセージコンテンツから「参照したドキュメント」セクションを抽出
        // パターン1: "---\n\n**参照したドキュメント**\n\n- タイトル1\n- タイトル2"
        // パターン2: "参照したドキュメント:\n- タイトル1\n- タイトル2"
        const referencePatterns = [
          /(?:---\s*\n)?\*\*参照したドキュメント\*\*\s*\n\n?([\s\S]*?)(?:\n\n---|\n\n\*\*|$)/i,
          /参照したドキュメント[：:\s]*\n\n?([\s\S]*?)(?:\n\n---|\n\n\*\*|$)/i,
        ];

        let titles: string[] = [];
        for (const pattern of referencePatterns) {
          const match = msg.content.match(pattern);
          if (match && match[1]) {
            const referenceSection = match[1];
            // リストアイテム（- または * で始まる行）からタイトルを抽出
            const titlePattern = /^[-*]\s+(.+)$/gm;
            const foundTitles: string[] = [];
            let titleMatch: RegExpExecArray | null;
            while ((titleMatch = titlePattern.exec(referenceSection)) !== null) {
              const title = titleMatch[1];
              if (title) {
                foundTitles.push(title.trim());
              }
            }
            if (foundTitles.length > 0) {
              titles = foundTitles;
              break;
            }
          }
        }

        if (titles.length > 0) {
          const referencedDocuments = titles
            .map((title) => {
              const id = titleToIdMap.get(title);
              return id ? { title, id } : null;
            })
            .filter((doc): doc is { title: string; id: number } => doc !== null);

          return {
            ...msg,
            referencedTitles: titles,
            referencedDocuments: referencedDocuments.length > 0 ? referencedDocuments : undefined,
          };
        }
      }
      return msg;
    });

    return NextResponse.json({ messages: messagesWithReferences });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'メッセージの取得に失敗しました' }, { status: 500 });
  }
}

// メッセージを送信してAIからの応答を取得
export async function POST(
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
    const body = (await request.json()) as {
      message?: string;
      context?: Array<{ content: string; documentTitle?: string; chunkIndex?: number }>;
      useRegisteredOnly?: boolean;
    };
    const { message, context, useRegisteredOnly } = body;

    if (!message) {
      return NextResponse.json({ error: 'メッセージは必須です' }, { status: 400 });
    }

    // スレッドがユーザーのものか確認
    const [thread] = await db
      .select()
      .from(threadsTable)
      .where(eq(threadsTable.id, parseInt(threadId)));

    if (!thread || thread.userId !== user.id) {
      return NextResponse.json({ error: 'スレッドが見つかりません' }, { status: 404 });
    }

    // threadId が欠損している古いレコードへの対処（OpenAI呼び出し直前で必ずガード）
    // console.log('Thread record before ensureThreadIdentifier', {
    //   threadIdParam: threadId,
    //   dbThreadId: thread.threadId,
    //   userId: thread.userId,
    // });

    let threadIdentifier: string;
    try {
      threadIdentifier = await ensureThreadIdentifier(thread.threadId, parseInt(threadId));
    } catch (e) {
      console.error('Invalid threadIdentifier before OpenAI call:', {
        threadIdParam: threadId,
        dbThreadId: thread.threadId,
        error: e,
      });
      return NextResponse.json(
        { error: 'スレッドIDが不正なため、OpenAIを呼び出せません' },
        { status: 500 }
      );
    }

    // 念のため undefined/空文字をここで遮断（OpenAI SDKに渡さない）
    if (!threadIdentifier || threadIdentifier === 'undefined' || threadIdentifier === 'null') {
      console.error('Thread identifier is still invalid after ensureThreadIdentifier', {
        threadIdParam: threadId,
        dbThreadId: thread.threadId,
        resolvedThreadIdentifier: threadIdentifier,
      });
      return NextResponse.json({ error: 'スレッドIDの解決に失敗しました' }, { status: 500 });
    }

    // デバッグ: この段階で必ず有効な threadIdentifier を確認
    // console.log('Resolved threadIdentifier before OpenAI calls', {
    //   threadIdParam: threadId,
    //   resolvedThreadIdentifier: threadIdentifier,
    // });

    // コンテキストを含めたメッセージを作成
    let contextText = '';
    let referencedTitles: string[] = [];
    let referencedDocuments: Array<{ title: string; id: number }> = [];

    if (context && context.length > 0) {
      // タイトル情報を収集
      referencedTitles = Array.from(
        new Set(context.map((c) => c.documentTitle).filter((title): title is string => !!title))
      );

      // タイトルからドキュメントIDを取得
      if (referencedTitles.length > 0) {
        const documents = await db
          .select({
            id: documentsTable.id,
            title: documentsTable.title,
          })
          .from(documentsTable)
          .where(eq(documentsTable.userId, user.id));

        // タイトルとIDのマッピングを作成
        const titleToIdMap = new Map<string, number>();
        for (const doc of documents) {
          if (referencedTitles.includes(doc.title)) {
            titleToIdMap.set(doc.title, doc.id);
          }
        }

        // referencedDocumentsを作成
        referencedDocuments = referencedTitles
          .map((title) => {
            const id = titleToIdMap.get(title);
            return id ? { title, id } : null;
          })
          .filter((doc): doc is { title: string; id: number } => doc !== null);
      }

      // チャンクをchunkIndex順にソート（同じドキュメント内で論理順序を保つ）
      const sortedContext = [...context].sort((a, b) => {
        // 同じドキュメント内ではchunkIndex順
        if (a.documentTitle === b.documentTitle) {
          const aIndex = (a as any).chunkIndex ?? 0;
          const bIndex = (b as any).chunkIndex ?? 0;
          return aIndex - bIndex;
        }
        return 0; // 異なるドキュメントは順序を保持
      });

      // 各チャンクにタイトル＋要点サマリを追加
      // チャンク内のMarkdown干渉を防ぐため、特殊文字をエスケープ
      const escapeMarkdown = (text: string): string => {
        // Markdownの特殊文字をエスケープ（チャンク内のMarkdownが干渉しないように）
        // 既にエスケープされているものは二重エスケープを避けるため、バックスラッシュの後に特殊文字がある場合はスキップ
        return text
          .split('')
          .map((char, index, arr) => {
            const prevChar = index > 0 ? arr[index - 1] : '';
            // バックスラッシュの直後はエスケープしない
            if (prevChar === '\\') {
              return char;
            }
            // Markdown特殊文字をエスケープ
            if (['#', '*', '_', '`', '[', ']', '(', ')'].includes(char)) {
              return '\\' + char;
            }
            return char;
          })
          .join('');
      };

      const formattedChunks = sortedContext.map((c) => {
        const title = c.documentTitle || '不明なドキュメント';
        // 要点サマリを生成（最初の2-3文を抽出）
        const sentences = c.content.split(/[。！？\n]+/).filter((s) => s.trim());
        const summary = sentences.slice(0, 3).join('。').substring(0, 150);
        const summaryText = summary
          ? `【要点】${summary}${summary.length >= 150 ? '...' : ''}`
          : '';

        // チャンク内容をエスケープ（タイトルと要点はエスケープしない）
        const escapedContent = escapeMarkdown(c.content);

        return `【タイトル】${title}\n${summaryText ? summaryText + '\n' : ''}${escapedContent}`;
      });

      // 1本の文章として整形（自然な流れを作る）
      const unifiedContext = formattedChunks.join('\n\n---\n\n');

      contextText = `以下の登録された情報を参照して、質問に直接答えてください。情報は1つのまとまった文章として提供されています。

【重要】回答は必ずMarkdown形式で返してください。プレーンテキストではなく、Markdown記法（見出し、太字、リストなど）を使用してください。

${unifiedContext}\n\n`;
    }

    const fullMessage = contextText + message;

    // 会話履歴を取得（ユーザーメッセージ保存前）
    const previousMessages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.threadId, parseInt(threadId)))
      .orderBy(asc(messagesTable.createdAt));

    // データベースにユーザーメッセージを保存
    const userMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await db.insert(messagesTable).values({
      threadId: parseInt(threadId),
      role: 'user',
      content: message,
      messageId: userMessageId,
      createdAt: new Date(),
    });

    // 会話履歴をOpenAI形式に変換（最新20件まで、新しく追加したユーザーメッセージは含めない）
    const conversationHistory = previousMessages.slice(-20).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // アシスタントの指示を構築（質問に最適化されたRAGプロンプト）
    // 注意: これは system-level で定義された文章制御よりも優先される instructions です
    let instructions = `これは system-level で定義された文章制御よりも優先される instructions です。
あなたは記事内容をベースにして質問に答えるヘルパーです。

【最重要ルール - 必須遵守】
・回答は必ずMarkdown形式で返してください（これは絶対に守ってください）
・プレーンテキストではなく、必ずMarkdown記法を使用してください
・前置き文（例：「承知しました」「了解しました」など）は一切書かず、本文から始めてください
・要約ではなく、質問への回答を書く（質問を冒頭で受けている形にする）
・文脈の自然さを優先する
・コンテキストの語り口を軽く反映してよい（記事の雰囲気・温度感を取り入れる）
・要点だけでなく、理由や背景も短く添える
・コンテキスト以外の情報を加えない（一般知識を混ぜない）
・要約っぽさを弱め、自然な流れを意識する（導入→説明→まとめの構成）

【Markdown構造の具体的な指示】
・段落は2〜3文で区切ること
・見出し（##, ###）を適度に使用する（内容を整理する場合）
・箇条書きは必要な場合のみ使う（多用しない）
・太字（**）や強調を適度に使用して読みやすくする
・回答の最後には、短く自然な結論を1文だけ入れること

【自然文スタイルの具体的な指示】
・1文の長さは40〜120文字の範囲を目安にする（文の長さに変化をつける）
・段落は2〜3文で区切る
・接続詞を適度に使用し「人間の文章らしい流れ」を作る
・専門用語は避け、読みやすさを優先する
・硬すぎる説明口調を避ける
・質問への寄り添いを冒頭に入れる

【回答の書き方】
・回答の冒頭で質問を受けている形にする（例：「note初心者がジャンルを決めるときは...」）
・「理由 → 結論」のストーリーを短くでも入れると読みやすくなる
・文章として自然に流れるようにする（Markdownでも自然文として読みやすく）
・渡されたコンテキストの範囲だけで回答する
・記事の結論を中心に、質問に直接答える
・関係ない情報は省く
・本文の単純な要約ではなく「質問への最適回答」にする
・要約しすぎず、質問の意図に合わせて必要な情報を選んで回答する

【回答の構成】
・導入：質問への直接的な回答を冒頭で示す
・説明：理由や背景を含めて自然に説明する
・まとめ：短く自然な結論を1文で入れる

【回答方針】
1. 提供されたコンテキスト情報（登録された情報）がある場合は、それを最優先で参照して回答してください。この場合も自然文スタイルとMarkdown形式のルールを維持してください。
2. コンテキスト情報がない場合、またはコンテキスト情報だけでは回答できない場合は、一般的な知識に基づいて回答してください。この場合も自然文スタイルとMarkdown形式のルールを維持してください。
3. 登録された情報を参照して回答した場合は、回答文とは独立したMarkdown領域として以下の形式で参照したドキュメントのタイトルを明記してください：

---

**参照したドキュメント**

- タイトル1
- タイトル2

（回答文の流れを損なわないように、本文の最後に配置してください）

質問に最適化された、自然で人間味のある、人に読まれるMarkdown形式の文章として回答を提供してください。

【重要】回答は必ずMarkdown形式で返してください。プレーンテキストではなく、Markdown記法（見出し、太字、リストなど）を使用してください。`;

    if (useRegisteredOnly) {
      instructions = `これは system-level で定義された文章制御よりも優先される instructions です。
あなたは記事内容をベースにして質問に答えるヘルパーです。登録されたドキュメントのみを参照してください。

【最重要ルール - 必須遵守】
・回答は必ずMarkdown形式で返してください（これは絶対に守ってください）
・プレーンテキストではなく、必ずMarkdown記法を使用してください
・前置き文（例：「承知しました」「了解しました」など）は一切書かず、本文から始めてください
・要約ではなく、質問への回答を書く（質問を冒頭で受けている形にする）
・文脈の自然さを優先する
・コンテキストの語り口を軽く反映してよい（記事の雰囲気・温度感を取り入れる）
・要点だけでなく、理由や背景も短く添える
・コンテキスト以外の情報を絶対に加えない（一般知識を一切混ぜない）
・要約っぽさを弱め、自然な流れを意識する（導入→説明→まとめの構成）

【Markdown構造の具体的な指示】
・段落は2〜3文で区切ること
・見出し（##, ###）を適度に使用する（内容を整理する場合）
・箇条書きは必要な場合のみ使う（多用しない）
・太字（**）や強調を適度に使用して読みやすくする
・回答の最後には、短く自然な結論を1文だけ入れること

【自然文スタイルの具体的な指示】
・1文の長さは40〜120文字の範囲を目安にする（文の長さに変化をつける）
・段落は2〜3文で区切る
・接続詞を適度に使用し「人間の文章らしい流れ」を作る
・専門用語は避け、読みやすさを優先する
・硬すぎる説明口調を避ける
・質問への寄り添いを冒頭に入れる

【回答の書き方】
・回答の冒頭で質問を受けている形にする（例：「note初心者がジャンルを決めるときは...」）
・「理由 → 結論」のストーリーを短くでも入れると読みやすくなる
・文章として自然に流れるようにする（Markdownでも自然文として読みやすく）
・渡されたコンテキストの範囲だけで回答する
・記事の結論を中心に、質問に直接答える
・関係ない情報は省く
・本文の単純な要約ではなく「質問への最適回答」にする
・要約しすぎず、質問の意図に合わせて必要な情報を選んで回答する

【回答の構成】
・導入：質問への直接的な回答を冒頭で示す
・説明：理由や背景を含めて自然に説明する
・まとめ：短く自然な結論を1文で入れる

【回答方針】
1. 提供されたコンテキスト情報（登録された情報）のみを参照して回答してください。自然文スタイルとMarkdown形式のルールを維持してください。
2. コンテキスト情報がない場合、またはコンテキスト情報だけでは回答できない場合は、「登録された情報からは回答できませんでした」と明確に伝えてください。この場合も自然文スタイルとMarkdown形式で返答してください。
3. 登録された情報を参照して回答した場合は、回答文とは独立したMarkdown領域として以下の形式で参照したドキュメントのタイトルを明記してください：

---

**参照したドキュメント**

- タイトル1
- タイトル2

（回答文の流れを損なわないように、本文の最後に配置してください）

質問に最適化された、自然で人間味のある、人に読まれるMarkdown形式の文章として回答を提供してください。

【重要】回答は必ずMarkdown形式で返してください。プレーンテキストではなく、Markdown記法（見出し、太字、リストなど）を使用してください。`;
    }

    // モデルを最適化（gpt-5 を使用）
    const model = process.env.OPENAI_MODEL || 'gpt-5'; // デフォルトは gpt-5

    // ストリーミングレスポンスを作成
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let assistantContent = '';
          const encoder = new TextEncoder();

          // ストリーミング用のメッセージ配列を作成
          const messagesForAPI: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> =
            [
              { role: 'system', content: instructions },
              ...conversationHistory,
              { role: 'user', content: fullMessage },
            ];

          // ストリーミングでチャット完了を実行
          // gpt-5モデルの場合はtemperatureパラメータを設定しない（デフォルト値1のみサポート）
          const requestOptions: any = {
            model: model as 'gpt-5' | 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo-preview' | 'gpt-4',
            messages: messagesForAPI,
            stream: true,
          };

          // gpt-5以外のモデルの場合のみtemperatureを設定
          if (model !== 'gpt-5') {
            requestOptions.temperature = 0.7;
          }

          const streamResponse = await openai.chat.completions.create(requestOptions);

          // ストリームを処理
          for await (const chunk of streamResponse as unknown as AsyncIterable<{
            choices: Array<{ delta?: { content?: string } }>;
          }>) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              assistantContent += content;
              // ストリーミングデータを送信
              const data = JSON.stringify({ type: 'chunk', content });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }

          // 参照タイトルを回答文から分離（回答文の流れを損なわないように）
          const referencePattern = /\n\n参照したドキュメント[：:]\s*[^\n]+/g;
          assistantContent = assistantContent.replace(referencePattern, '').trim();

          // データベースにアシスタントメッセージを保存
          const assistantMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          await db.insert(messagesTable).values({
            threadId: parseInt(threadId),
            role: 'assistant',
            content: assistantContent,
            messageId: assistantMessageId,
            createdAt: new Date(),
          });

          // スレッドの更新日時を更新
          await db
            .update(threadsTable)
            .set({ updatedAt: new Date() })
            .where(eq(threadsTable.id, parseInt(threadId)));

          // 最終データを送信
          const finalData = JSON.stringify({
            type: 'done',
            message: assistantContent,
            referencedTitles: referencedTitles.length > 0 ? referencedTitles : undefined,
            referencedDocuments: referencedDocuments.length > 0 ? referencedDocuments : undefined,
          });
          controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          const encoder = new TextEncoder();
          const errorData = JSON.stringify({
            type: 'error',
            error: 'メッセージの送信に失敗しました',
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json({ error: 'メッセージの送信に失敗しました' }, { status: 500 });
  }
}
