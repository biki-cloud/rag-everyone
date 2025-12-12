import OpenAI from 'openai';
import { env } from '@/env';

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

// テキストを文単位で分割する関数（句読点や改行で区切る）
function splitIntoSentences(text: string): string[] {
  // 句読点（。、！？）や改行で分割
  const sentenceEndings = /([。！？\n]+)/g;
  const parts = text.split(sentenceEndings);
  const sentences: string[] = [];
  let currentSentence = '';

  for (const part of parts) {
    if (!part) continue;
    if (sentenceEndings.test(part)) {
      currentSentence += part;
      if (currentSentence.trim()) {
        sentences.push(currentSentence.trim());
        currentSentence = '';
      }
    } else {
      currentSentence += part;
    }
  }

  if (currentSentence.trim()) {
    sentences.push(currentSentence.trim());
  }

  return sentences.filter((s) => s.length > 0);
}

// テキストをチャンクに分割する関数（文単位で切る前処理付き）
export function chunkText(text: string, chunkSize: number = 600, overlap: number = 150): string[] {
  // まず文単位に分割
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  let currentChunk = '';
  let currentLength = 0;

  for (const sentence of sentences) {
    const sentenceLength = sentence.length;

    // 現在のチャンクに追加するとサイズを超える場合
    if (currentLength + sentenceLength > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      // オーバーラップ処理：最後の数文を次のチャンクの開始に含める
      const overlapSentences: string[] = [];
      let overlapLength = 0;
      const currentSentences = currentChunk.split(/[。！？\n]+/).filter((s) => s.trim());

      // 後ろから文を追加してオーバーラップサイズに近づける
      for (let i = currentSentences.length - 1; i >= 0 && overlapLength < overlap; i--) {
        const sentence = currentSentences[i];
        if (!sentence) continue;
        const s = sentence.trim();
        if (s) {
          overlapSentences.unshift(s);
          overlapLength += s.length;
        }
      }

      currentChunk = overlapSentences.join('。') + (overlapSentences.length > 0 ? '。' : '');
      currentLength = overlapLength;
    }

    // 文を追加
    if (currentChunk) {
      currentChunk += sentence;
    } else {
      currentChunk = sentence;
    }
    currentLength += sentenceLength;
  }

  // 最後のチャンクを追加
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text]; // 分割できない場合は元のテキストを返す
}

// 埋め込みベクトルを生成する関数
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return response.data[0]?.embedding ?? [];
}

// コサイン類似度を計算する関数
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [i, a] of vecA.entries()) {
    const b = vecB[i];
    if (b === undefined) continue;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
