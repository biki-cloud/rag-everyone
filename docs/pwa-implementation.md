# PWA実装ドキュメント

このドキュメントでは、Next.jsアプリケーションにPWA（Progressive Web
App）機能を実装した方法について説明します。

## 概要

PWAを実装することで、以下の機能が利用可能になります：

- **オフライン対応**: インターネット接続がなくてもアプリケーションの基本機能が動作
- **ホーム画面への追加**: モバイルデバイスやデスクトップのホーム画面にアプリとして追加可能
- **アプリライクな体験**: スタンドアロン表示モードでネイティブアプリのような体験を提供
- **キャッシュ機能**: リソースをキャッシュしてパフォーマンスを向上

## 実装内容

### 1. パッケージのインストール

`next-pwa`パッケージを使用してPWA機能を実装しています。

```bash
pnpm add next-pwa
```

### 2. Next.js設定 (`next.config.mjs`)

`next-pwa`を使用してPWA設定を追加しました。

```javascript
import withPWA from 'next-pwa';

const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'offlineCache',
        expiration: {
          maxEntries: 200,
        },
      },
    },
  ],
});

export default pwaConfig(nextConfig);
```

#### 設定項目の説明

- **`dest: 'public'`**: Service Workerファイルの出力先ディレクトリ
- **`register: true`**: Service Workerの自動登録を有効化
- **`skipWaiting: true`**: 新しいService Workerが利用可能になった際に、すぐに有効化
- **`disable: process.env.NODE_ENV === 'development'`**: 開発環境ではPWAを無効化（本番環境のみ有効）
- **`runtimeCaching`**: ランタイムキャッシュの設定
  - `NetworkFirst`: ネットワークを優先し、失敗時にキャッシュを使用
  - `maxEntries: 200`: キャッシュエントリの最大数

### 3. Web App Manifest (`public/manifest.json`)

PWAのメタデータを定義するマニフェストファイルを作成しました。

```json
{
  "name": "Next.js D1 Drizzle Cloudflare Pages App",
  "short_name": "Next.js App",
  "description": "Next.js application with D1, Drizzle, and Cloudflare Pages",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    },
    {
      "src": "/favicon.ico",
      "sizes": "48x48",
      "type": "image/x-icon"
    }
  ]
}
```

#### マニフェスト項目の説明

- **`name`**: アプリの完全な名前
- **`short_name`**: ホーム画面に表示される短い名前
- **`start_url`**: アプリ起動時の開始URL
- **`display`**: 表示モード（`standalone`でブラウザUIを非表示）
- **`theme_color`**: ブラウザのテーマカラー
- **`background_color`**: スプラッシュスクリーンの背景色
- **`icons`**: アプリのアイコン（複数サイズを推奨）

### 4. レイアウト設定 (`src/app/layout.tsx`)

Next.js 14のApp Routerに対応したメタデータ設定を追加しました。

```typescript
import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export const metadata: Metadata = {
  title: 'Next.js D1 Drizzle Cloudflare Pages App',
  description: 'Next.js application with D1, Drizzle, and Cloudflare Pages',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Next.js App',
  },
};
```

#### メタデータの説明

- **`viewport`**: ビューポート設定とテーマカラー（Next.js 14では別エクスポートが必要）
- **`manifest`**: Web App Manifestへのリンク
- **`icons`**: ファビコンとApple Touch Icon
- **`appleWebApp`**: iOS Safari向けの設定

### 5. ビルド時の生成ファイル

ビルド時に以下のファイルが自動生成されます：

- `/public/sw.js` - Service Workerファイル
- `/public/workbox-*.js` - Workboxライブラリ（キャッシュ管理）

これらのファイルは`.gitignore`に追加して、Gitリポジトリには含めません。

### 6. TypeScript設定 (`tsconfig.json`)

生成されたPWAファイルをTypeScriptの型チェックから除外しました。

```json
{
  "exclude": [
    "node_modules",
    "tsconfig.json",
    "public/sw.js",
    "public/workbox-*.js",
    "public/fallback-*.js"
  ]
}
```

## 使用方法

### 開発環境

開発環境ではPWAは無効化されています（`disable: process.env.NODE_ENV === 'development'`）。

```bash
pnpm dev
```

### 本番環境

本番環境でビルドすると、PWA機能が有効になります。

```bash
pnpm build
pnpm pages:build
pnpm pages:deploy
```

## 動作確認

### 1. HTTPSでのアクセス

PWAはHTTPS環境（またはlocalhost）でのみ動作します。Cloudflare
Pagesは自動的にHTTPSを提供するため、デプロイ後は問題ありません。

### 2. ホーム画面への追加

#### モバイル（iOS Safari）

1. Safariでアプリにアクセス
2. 共有ボタンをタップ
3. 「ホーム画面に追加」を選択

#### モバイル（Android Chrome）

1. Chromeでアプリにアクセス
2. メニュー（3点リーダー）をタップ
3. 「ホーム画面に追加」を選択

#### デスクトップ（Chrome/Edge）

1. アドレスバーの右側にあるインストールアイコンをクリック
2. 「インストール」を確認

### 3. Service Workerの確認

ブラウザの開発者ツールで確認できます：

1. **Chrome DevTools**:

   - `Application`タブ → `Service Workers`セクション
   - `Application`タブ → `Manifest`セクション

2. **確認項目**:
   - Service Workerが登録されているか
   - マニフェストが正しく読み込まれているか
   - キャッシュが動作しているか

### 4. オフライン動作の確認

1. 開発者ツールで「Network」タブを開く
2. 「Offline」を選択
3. ページをリロード
4. キャッシュされたリソースが表示されることを確認

## カスタマイズ

### アイコンの追加

より良いPWA体験のために、複数のサイズのアイコンを用意することを推奨します：

```json
{
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### キャッシュ戦略の変更

`next.config.mjs`の`runtimeCaching`を変更することで、キャッシュ戦略をカスタマイズできます：

- **`NetworkFirst`**: ネットワーク優先（推奨）
- **`CacheFirst`**: キャッシュ優先（静的リソース向け）
- **`StaleWhileRevalidate`**: キャッシュを返しつつバックグラウンドで更新

### オフラインページの追加

オフライン時に表示するカスタムページを追加できます：

```javascript
const pwaConfig = withPWA({
  // ... 他の設定
  fallbacks: {
    document: '/offline',
  },
});
```

## トラブルシューティング

### Service Workerが登録されない

1. HTTPSでアクセスしているか確認
2. ブラウザのコンソールでエラーを確認
3. `next.config.mjs`の`disable`設定を確認

### マニフェストが読み込まれない

1. `manifest.json`が`/public`ディレクトリに存在するか確認
2. `layout.tsx`の`manifest`メタデータが正しいか確認
3. ブラウザの開発者ツールでネットワークリクエストを確認

### ビルドエラー

1. `tsconfig.json`に生成ファイルが除外されているか確認
2. `.gitignore`にPWA生成ファイルが追加されているか確認
3. `next.config.mjs`の構文エラーを確認

## 参考リンク

- [next-pwa公式ドキュメント](https://github.com/shadowwalker/next-pwa)
- [Web App Manifest仕様](https://www.w3.org/TR/appmanifest/)
- [Service Worker API](https://developer.mozilla.org/ja/docs/Web/API/Service_Worker_API)
- [Next.js Metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)

## 更新履歴

- 2024年: 初回実装
  - `next-pwa`パッケージの導入
  - Web App Manifestの作成
  - Service Workerの設定
  - Next.js 14 App Router対応
