// Public surface of the "wanted" module — owned by the wanted module agent; replace freely.
// Other modules may import only what is exported here (cards, hooks); keep it small and stable.
export { default as routes } from './routes';
export { default as AdminPanel } from './admin';
