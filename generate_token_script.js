#!/usr/bin/env node

// .envファイルから環境変数を読み込んで、ブラウザで実行できるスクリプトを生成
// 使用方法: node generate_token_script.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESモジュールで__dirnameを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .envファイルを読み込む
const envPath = path.join(__dirname, '.env');
/** @type {Record<string, string>} */
let envVars = {};

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        envVars[key.trim()] = value.trim();
      }
    }
  });
}

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('エラー: .envファイルから環境変数を取得できませんでした。');
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されているか確認してください。'
  );
  process.exit(1);
}

// ブラウザで実行できるスクリプトを生成
const browserScript = `// ブラウザのコンソールで実行してトークンを取得するスクリプト
// このスクリプトは generate_token_script.js によって自動生成されました
// 使用方法:
//   1. ブラウザで http://localhost:3000/rag にアクセスしてログイン
//   2. 開発者ツールを開く (F12 または Cmd+Option+I)
//   3. Consoleタブを開く
//   4. このファイルの内容をコピー&ペーストして実行

(() => {
  try {
    // 方法1: ローカルストレージから直接取得（最も確実）
    const storageKeys = Object.keys(localStorage);
    const authKey = storageKeys.find(
      (key) => key.includes('auth-token') || key.includes('supabase')
    );

    if (authKey) {
      try {
        const item = localStorage.getItem(authKey);
        if (!item) return;
        const tokenData = JSON.parse(item);
        if (tokenData?.access_token) {
          console.log('✓ トークンを取得しました！');
          console.log('\\nトークン:');
          console.log(tokenData.access_token);
          console.log('\\n以下のコマンドで使用できます:');
          console.log(\`TOKEN="\${tokenData.access_token}" ./register_documents.sh\`);
          console.log('\\nまたは、環境変数に設定:');
          console.log(\`export TOKEN="\${tokenData.access_token}"\`);
          return;
        }
      } catch (e) {
        // JSONパースに失敗した場合、次の方法を試す
      }
    }

    // 方法2: すべてのローカルストレージキーを確認
    console.log('ローカルストレージから直接取得を試みます...');
    for (const key of storageKeys) {
      const value = localStorage.getItem(key);
      if (!value) continue;
      try {
        const parsed = JSON.parse(value);
        if (parsed?.access_token) {
          console.log('✓ トークンを取得しました！');
          console.log('\\nトークン:');
          console.log(parsed.access_token);
          console.log('\\n以下のコマンドで使用できます:');
          console.log(\`TOKEN="\${parsed.access_token}" ./register_documents.sh\`);
          return;
        }
      } catch (e) {
        // JSONパースに失敗した場合はスキップ
      }
    }

    // 方法3: Supabaseクライアントを使用
    console.log('Supabaseクライアントを使用してトークンを取得します...');
    
    // .envから取得した環境変数を使用
    const supabaseUrl = '${supabaseUrl}';
    const supabaseAnonKey = '${supabaseAnonKey}';

    // スクリプトタグでSupabaseを読み込む方法
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    script.onload = () => {
      const { createClient } = window.supabase;
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (error) {
          console.error('エラー:', error);
          showAlternativeMethod();
          return;
        }
        if (session) {
          console.log('✓ トークンを取得しました！');
          console.log('\\nトークン:');
          console.log(session.access_token);
          console.log('\\n以下のコマンドで使用できます:');
          console.log(\`TOKEN="\${session.access_token}" ./register_documents.sh\`);
        } else {
          showAlternativeMethod();
        }
      });
    };
    script.onerror = () => {
      showAlternativeMethod();
    };
    document.head.appendChild(script);
    return;

    function showAlternativeMethod() {
      console.log('❌ 自動取得に失敗しました。');
      console.log('\\n以下の方法で手動でトークンを取得してください:');
      console.log('\\n【方法1: Networkタブから取得】');
      console.log('1. 開発者ツールのNetworkタブを開く');
      console.log('2. ページをリロード (Cmd+R または F5)');
      console.log('3. /api/documents へのリクエストを探す');
      console.log('4. リクエストをクリックして詳細を表示');
      console.log('5. Request Headers の Authorization ヘッダーを確認');
      console.log('6. "Bearer " 以降の文字列をコピー（これがトークンです）');
    }
  } catch (error) {
    console.error('エラー:', error);
  }
})();
`;

// 生成されたスクリプトをファイルに書き込む
const outputPath = path.join(__dirname, 'get_token_browser_generated.js');
fs.writeFileSync(outputPath, browserScript, 'utf-8');

console.log('✓ ブラウザ用スクリプトを生成しました！');
console.log(`  ファイル: ${outputPath}`);
console.log('\n使用方法:');
console.log('  1. 生成されたファイルの内容をコピー');
console.log('  2. ブラウザのコンソールで実行');
console.log('\nまたは、以下のコマンドで直接表示:');
console.log(`  cat ${outputPath}`);
