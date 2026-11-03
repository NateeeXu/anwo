// Public surface of the "admin" module — owned by the admin module agent; replace freely.
// Other modules may import only what is exported here (cards, hooks); keep it small and stable.
export { default as routes } from './routes';
export { default as AdminPanel } from './admin';
