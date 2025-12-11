# Supabase Authを使用したGoogle認証の実装ガイド

このドキュメントでは、Supabase Authを使用してGoogle認証を実装する方法を説明します。

## 目次

1. [概要](#概要)
2. [前提条件](#前提条件)
3. [実装の流れ](#実装の流れ)
4. [Supabaseダッシュボードでの設定](#supabaseダッシュボードでの設定)
5. [Google Cloud Consoleでの設定](#google-cloud-consoleでの設定)
6. [コード実装](#コード実装)
7. [認証フローの説明](#認証フローの説明)
8. [トラブルシューティング](#トラブルシューティング)

---

## 概要

Supabase Authを使用すると、Google
OAuth認証を簡単に実装できます。SupabaseがOAuthフローを管理するため、複雑な実装は不要です。

### メリット

- **セキュリティ**: SupabaseがPKCE（Proof Key for Code Exchange）フローを自動的に処理
- **シンプル**: 数行のコードで実装可能
- **セッション管理**: 自動的にセッションを管理
- **トークンリフレッシュ**: 自動的にトークンをリフレッシュ

---

## 前提条件

- Supabaseプロジェクトが作成済みであること
- Next.jsプロジェクトがセットアップ済みであること
- `@supabase/supabase-js`パッケージがインストール済みであること

---

## 実装の流れ

Google認証の実装は以下の3ステップで完了します：

1. **SupabaseダッシュボードでGoogleプロバイダーを有効化**
2. **Google Cloud ConsoleでOAuth認証情報を作成**
3. **アプリケーションにコードを実装**

---

## Supabaseダッシュボードでの設定

### ステップ1: Supabaseダッシュボードにアクセス

1. https://app.supabase.com にログイン
2. プロジェクトを選択

### ステップ2: Authentication設定に移動

1. 左サイドバーから **Authentication** をクリック
2. **Providers** タブを選択

### ステップ3: Googleプロバイダーを有効化

1. **Google** プロバイダーを見つける
2. **Enable Google provider** をオンにする
3. 後で設定するため、一旦ここでは保存せずに次へ進む

---

## Google Cloud Consoleでの設定

### ステップ1: Google Cloud Consoleにアクセス

1. https://console.cloud.google.com にアクセス
2. Googleアカウントでログイン

### ステップ2: プロジェクトを作成（または既存のプロジェクトを選択）

1. プロジェクト選択ドロップダウンをクリック
2. **新しいプロジェクト** をクリック
3. プロジェクト名を入力して作成

### ステップ3: OAuth同意画面を設定

1. 左サイドバーから **APIとサービス** > **OAuth同意画面** を選択
2. **外部** を選択して **作成** をクリック
3. アプリ情報を入力：
   - **アプリ名**: あなたのアプリ名（例: "LearnCurve"）
   - **ユーザーサポートメール**: あなたのメールアドレス
   - **デベロッパーの連絡先情報**: あなたのメールアドレス
4. **保存して次へ** をクリック
5. スコープはデフォルトのままで **保存して次へ**
6. テストユーザーは必要に応じて追加（後で変更可能）
7. **ダッシュボードに戻る** をクリック

### ステップ4: OAuth 2.0認証情報を作成

1. **APIとサービス** > **認証情報** を選択
2. **+ 認証情報を作成** > **OAuth 2.0 クライアント ID** を選択
3. **アプリケーションの種類**: **ウェブアプリケーション** を選択
4. **名前**: 任意の名前（例: "LearnCurve Web Client"）
5. **承認済みのリダイレクト URI** に以下を追加：
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   - `<your-project-ref>` はSupabaseプロジェクトの参照ID（SupabaseダッシュボードのURLから確認可能）
   - 例: `https://abcdefghijklmnop.supabase.co/auth/v1/callback`
6. **作成** をクリック
7. **クライアントID** と **クライアントシークレット** をコピー（後で使用）

### ステップ5: Supabaseに認証情報を設定

1. Supabaseダッシュボードに戻る
2. **Authentication** > **Providers** > **Google** に移動
3. 以下の情報を入力：
   - **Client ID (for OAuth)**: Google Cloud ConsoleでコピーしたクライアントID
   - **Client Secret (for OAuth)**: Google Cloud Consoleでコピーしたクライアントシークレット
4. **Save** をクリック

---

## コード実装

### 1. Supabaseクライアントの設定

既にSupabaseクライアントが設定されていることを確認します：

```typescript:src/lib/supabase/client.ts
// Supabase クライアント（ブラウザ用）
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';

export const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
```

### 2. ログインページにGoogle認証ボタンを追加

ログインページにGoogle認証のハンドラーを追加します：

```typescript:src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Google認証のハンドラー
  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setMessage(`エラー: ${error.message}`);
        setLoading(false);
      }
      // 成功時は自動的にGoogleの認証ページにリダイレクトされるため、
      // ここでは何もしない
    } catch (error) {
      setMessage('エラーが発生しました。');
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Google認証ボタン */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={loading}
      >
        {loading ? '認証中...' : 'Googleでログイン'}
      </button>
    </div>
  );
}
```

### 3. 認証コールバックページの実装

Google認証後、Supabaseは指定したリダイレクトURIにリダイレクトします。コールバックページでセッションを処理します：

```typescript:src/app/auth/callback/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void handleCallback();
  }, [router]);

  const handleCallback = async () => {
    try {
      // URLクエリパラメータからcodeを取得（PKCEフローの場合）
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get('code');

      if (code) {
        // PKCEフロー: codeをセッションに交換
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          setError(`認証エラー: ${exchangeError.message}`);
          setTimeout(() => {
            router.push('/login');
          }, 3000);
          return;
        }

        // セッションが正常に設定されたので、ホームにリダイレクト
        router.push('/home');
      } else {
        // セッションが見つからない場合
        setError('セッションが見つかりませんでした。');
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      }
    } catch (err) {
      console.error('Callback error:', err);
      setError('エラーが発生しました。');
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    }
  };

  if (error) {
    return (
      <div>
        <div className="text-red-600">{error}</div>
        <div>ログインページにリダイレクトします...</div>
      </div>
    );
  }

  return (
    <div>
      <div>認証中...</div>
      <div>ログインを処理しています。少々お待ちください。</div>
    </div>
  );
}
```

---

## 認証フローの説明

Google認証のフローは以下のように動作します：

### 1. ユーザーが「Googleでログイン」ボタンをクリック

```typescript
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
  },
});
```

この関数を呼び出すと、SupabaseがGoogleの認証ページにリダイレクトします。

### 2. ユーザーがGoogleで認証

Googleのログインページが表示され、ユーザーがGoogleアカウントでログインします。

### 3. GoogleがSupabaseにリダイレクト

認証が成功すると、GoogleはSupabaseのコールバックURLにリダイレクトします：

```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

### 4. Supabaseがアプリにリダイレクト

Supabaseが認証を処理し、指定した`redirectTo`にリダイレクトします：

```
https://your-app.com/auth/callback?code=xxx
```

### 5. コールバックページでセッションを設定

コールバックページで`exchangeCodeForSession`を呼び出し、codeをセッションに交換します：

```typescript
await supabase.auth.exchangeCodeForSession(code);
```

これにより、ユーザーのセッションが確立され、以降のAPIリクエストで認証情報を使用できます。

### 6. ホームページにリダイレクト

セッションが確立されたら、アプリのホームページにリダイレクトします。

---

## 2つのコールバックURLの違い

Google認証を実装する際、2つの異なるコールバックURLが登場します。それぞれの役割を理解することが重要です。

### `/auth/v1/callback` - Supabaseの内部エンドポイント

**役割**: Googleが直接リダイレクトする先（Supabaseが管理するエンドポイント）

**特徴**:

- **URL形式**: `https://<your-project-ref>.supabase.co/auth/v1/callback`
- **設定場所**: Google Cloud Consoleの「承認済みのリダイレクト URI」
- **処理内容**: SupabaseがGoogleからの認証コードを受け取り、内部で処理
- **開発者の操作**: 設定のみ（コードは書かない）

**設定例**:

Google Cloud Consoleで以下のように設定します：

```
https://abcdefghijklmnop.supabase.co/auth/v1/callback
```

### `/auth/callback` - アプリケーションのコールバックページ

**役割**: Supabaseが認証処理後にアプリにリダイレクトする先

**特徴**:

- **URL形式**: `https://your-app.com/auth/callback`
- **設定場所**: アプリのコード内（`redirectTo`オプション）
- **処理内容**: アプリがセッションを設定し、ユーザーを適切なページにリダイレクト
- **開発者の操作**: 実装が必要（コールバックページを作成）

**実装例**:

```typescript
// ログインページでの設定
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
  },
});
```

### フローの全体像

以下の図で2つのコールバックURLの関係を理解できます：

```
┌─────────────────┐
│  ユーザー       │
│  「Googleで     │
│   ログイン」    │
│  をクリック     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Google認証     │
│  ページ         │
└────────┬────────┘
         │
         │ 認証成功
         ▼
┌─────────────────────────────────┐
│  Google → /auth/v1/callback      │
│  (Supabaseのエンドポイント)      │
│  ※ Google Cloud Consoleで設定    │
└────────┬─────────────────────────┘
         │
         │ Supabaseが認証コードを処理
         ▼
┌─────────────────────────────────┐
│  Supabase → /auth/callback       │
│  (アプリのコールバックページ)    │
│  ※ アプリのコードで設定          │
└────────┬─────────────────────────┘
         │
         │ セッションを設定
         ▼
┌─────────────────┐
│  /home          │
│  (ホームページ) │
└─────────────────┘
```

### 重要なポイント

1. **両方が必要**: 2つのコールバックURLは異なる役割を持ち、どちらも必要です
2. **設定場所が異なる**:
   - `/auth/v1/callback` → Google Cloud Console
   - `/auth/callback` → アプリのコード
3. **処理主体が異なる**:
   - `/auth/v1/callback` → Supabaseが処理（開発者は設定のみ）
   - `/auth/callback` → アプリが処理（開発者が実装）

### よくある間違い

❌ **間違い**: Google Cloud Consoleに `/auth/callback` を設定する

✅ **正しい**: Google Cloud Consoleには `/auth/v1/callback` を設定する

❌ **間違い**: アプリのコードで `/auth/v1/callback` を指定する

✅ **正しい**: アプリのコードでは `/auth/callback` を指定する

---

## PKCEフローについて

SupabaseはデフォルトでPKCE（Proof Key for Code Exchange）フローを使用します。これはOAuth
2.0のセキュリティを強化する仕組みです。

### PKCEフローの利点

- **セキュリティ**: 認証コードの傍受を防ぐ
- **モバイル対応**: ネイティブアプリでも安全に使用可能
- **ベストプラクティス**: OAuth 2.1で推奨される方式

### PKCEフローの動作

1. アプリがランダムな`code_verifier`を生成
2. `code_verifier`から`code_challenge`を生成
3. Google認証時に`code_challenge`を送信
4. Googleから`code`を受け取る
5. `code`と`code_verifier`をSupabaseに送信してセッションを取得

Supabaseクライアントが自動的にこの処理を行うため、開発者は`exchangeCodeForSession`を呼び出すだけでOKです。

---

## ユーザー情報の取得

認証後、ユーザー情報を取得する方法：

```typescript
// 現在のセッションを取得
const {
  data: { session },
} = await supabase.auth.getSession();

if (session) {
  console.log('ユーザーID:', session.user.id);
  console.log('メールアドレス:', session.user.email);
  console.log('ユーザー名:', session.user.user_metadata?.full_name);
  console.log('アバター:', session.user.user_metadata?.avatar_url);
}
```

### Googleから取得できる情報

- `email`: メールアドレス
- `full_name`: フルネーム
- `avatar_url`: プロフィール画像のURL
- `email_verified`: メールアドレスの確認状態

---

## ログアウトの実装

ログアウトは以下のように実装します：

```typescript
const handleLogout = async () => {
  await supabase.auth.signOut();
  router.push('/login');
};
```

---

## トラブルシューティング

### エラー: "redirect_uri_mismatch"

**原因**: Google Cloud Consoleで設定したリダイレクトURIが一致していない

**解決方法**:

1. Supabaseプロジェクトの参照IDを確認
2. Google Cloud Consoleの **認証情報** > **OAuth 2.0 クライアント ID** を開く
3. **承認済みのリダイレクト URI** に以下が正確に設定されているか確認：
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

### エラー: "invalid_client"

**原因**: Supabaseダッシュボードに設定したClient IDまたはClient Secretが間違っている

**解決方法**:

1. Google Cloud ConsoleでClient IDとClient Secretを再確認
2. Supabaseダッシュボードの **Authentication** > **Providers** > **Google**
   で正しく設定されているか確認
3. コピー&ペースト時に余分なスペースが入っていないか確認

### エラー: "access_denied"

**原因**: ユーザーがGoogle認証をキャンセルした、またはOAuth同意画面の設定が不完全

**解決方法**:

1. Google Cloud Consoleの **OAuth同意画面** を確認
2. 必要な情報（アプリ名、メールアドレスなど）がすべて入力されているか確認
3. テストユーザーを追加している場合、そのユーザーでログインしているか確認

### コールバックページでセッションが取得できない

**原因**: `exchangeCodeForSession`が正しく呼ばれていない、またはcodeが無効

**解決方法**:

1. ブラウザのコンソールでエラーメッセージを確認
2. URLに`code`パラメータが含まれているか確認
3. `exchangeCodeForSession`が呼ばれているか確認（console.logでデバッグ）

### 開発環境と本番環境で動作が異なる

**原因**: リダイレクトURIが環境ごとに異なる

**解決方法**:

1. 開発環境と本番環境の両方のリダイレクトURIをGoogle Cloud Consoleに追加
2. または、環境変数を使用して動的にリダイレクトURIを設定：
   ```typescript
   redirectTo: process.env.NEXT_PUBLIC_APP_URL + '/auth/callback';
   ```

---

## セキュリティのベストプラクティス

1. **HTTPSを使用**: 本番環境では必ずHTTPSを使用
2. **環境変数**: SupabaseのURLとキーは環境変数で管理
3. **リダイレクトURIの検証**: 許可されたリダイレクトURIのみを受け入れる
4. **セッションの有効期限**: 適切なセッション有効期限を設定
5. **エラーハンドリング**: エラーメッセージから機密情報が漏れないように注意

---

## まとめ

Supabase Authを使用したGoogle認証の実装は、以下の3ステップで完了します：

1. ✅ SupabaseダッシュボードでGoogleプロバイダーを有効化
2. ✅ Google Cloud ConsoleでOAuth認証情報を作成
3. ✅ アプリケーションにコードを実装

SupabaseがOAuthフローの複雑な部分を処理してくれるため、開発者は`signInWithOAuth`と`exchangeCodeForSession`を呼び出すだけで実装できます。

---

## 参考リンク

- [Supabase Auth ドキュメント](https://supabase.com/docs/guides/auth)
- [Supabase Google認証ガイド](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google OAuth 2.0 ドキュメント](https://developers.google.com/identity/protocols/oauth2)
- [PKCE仕様](https://datatracker.ietf.org/doc/html/rfc7636)
