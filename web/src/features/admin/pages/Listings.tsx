// /admin/listings — 房源: the listings module's own panel when it exports one, otherwise the generic moderation table.
import { ModuleSection } from './ModulePanels';

export default function ListingsModeration() {
  return <ModuleSection moduleKey="listings" navKey="listings" fallback="listing" />;
}
