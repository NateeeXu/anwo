// Module routes for "chat" — owned by the chat module agent.
//   /chat            inbox (desktop: inbox + empty thread placeholder)
//   /chat/blocks     block list
//   /chat/:id        thread (desktop: split with the inbox; mobile: thread page with back, tabs hidden)
import { lazy } from 'react';
import type { RouteObject } from 'react-router';

const ChatPage = lazy(() => import('./pages/ChatPage'));
const BlocksPage = lazy(() => import('./pages/BlocksPage'));

const routes: RouteObject[] = [
  { path: 'chat', element: <ChatPage />, handle: { layout: 'full' } },
  { path: 'chat/blocks', element: <BlocksPage />, handle: { layout: 'default' } },
  { path: 'chat/:id', element: <ChatPage />, handle: { layout: 'full' } },
];

export default routes;
