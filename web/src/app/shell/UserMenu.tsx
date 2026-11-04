// Avatar with trust ring + menu (我的档案 / 我的发布 / 收藏 / 钱包 / 设置 / 退出); anon → 登录 / 注册.
import { FileText, Gift, Heart, LayoutDashboard, LogOut, MessageCircle, Package, Rocket, Search, Settings, ShieldCheck, User, Users, Wallet } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Avatar, Button, DropdownMenu, type MenuEntry } from '../../components';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { loginPath } from '../guards';

export function UserMenu() {
  const t = useT();
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();

  if (status === 'loading') return <div className="size-8 rounded-pill skeleton" aria-hidden />;

  if (status === 'anon' || !user) {
    return (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" asChild>
          <Link to={loginPath(loc.pathname + loc.search)}>{t('auth.login')}</Link>
        </Button>
        <Button variant="secondary" size="sm" asChild>
          <Link to="/register">{t('auth.register')}</Link>
        </Button>
      </div>
    );
  }

  const items: MenuEntry[] = [
    { label: t('menu.profile'), icon: <User />, onSelect: () => navigate(`/u/${user.id}`) },
    { label: t('menu.messages'), icon: <MessageCircle />, onSelect: () => navigate('/chat') },
    'separator',
    { label: t('menu.myListings'), icon: <FileText />, onSelect: () => navigate('/listings/mine') },
    { label: t('menu.myWanted'), icon: <Search />, onSelect: () => navigate('/wanted/mine') },
    { label: t('menu.myItems'), icon: <Package />, onSelect: () => navigate('/market/mine') },
    { label: t('menu.myGroups'), icon: <Users />, onSelect: () => navigate('/buddy/mine') },
    { label: t('menu.saved'), icon: <Heart />, onSelect: () => navigate('/listings/saved') },
    'separator',
    { label: t('menu.wallet'), icon: <Wallet />, onSelect: () => navigate('/wallet') },
    { label: t('menu.pricing'), icon: <Rocket />, onSelect: () => navigate('/pricing') },
    { label: t('menu.kit'), icon: <Gift />, onSelect: () => navigate('/kit') },
    { label: t('menu.verify'), icon: <ShieldCheck />, onSelect: () => navigate('/verify') },
    ...(user.role === 'admin' ? [{ label: t('menu.admin'), icon: <LayoutDashboard />, onSelect: () => navigate('/admin') } as MenuEntry] : []),
    { label: t('menu.settings'), icon: <Settings />, onSelect: () => navigate('/settings') },
    'separator',
    {
      label: t('auth.logout'),
      icon: <LogOut />,
      danger: true,
      onSelect: async () => {
        await logout();
        toast.info(t('auth.loggedOut'));
        navigate('/');
      },
    },
  ];

  return (
    <DropdownMenu
      align="end"
      items={items}
      trigger={
        <button type="button" aria-label={t('nav.account')} className="rounded-pill">
          <Avatar src={user.avatarUrl ?? undefined} name={user.name} size="sm" trustLevel={user.trustLevel as 0 | 1 | 2 | 3} />
        </button>
      }
    />
  );
}

export default UserMenu;
