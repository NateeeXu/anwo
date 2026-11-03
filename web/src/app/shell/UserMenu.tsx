// Avatar with trust ring + menu (我的档案 / 我的发布 / 收藏 / 钱包 / 设置 / 退出); anon → 登录 / 注册.
import { FileText, Heart, LogOut, Settings, User, Wallet } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Avatar, Button, DropdownMenu } from '../../components';
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

  const items = [
    { label: t('menu.profile'), icon: <User />, onSelect: () => navigate(`/u/${user.id}`) },
    { label: t('menu.myPosts'), icon: <FileText />, onSelect: () => navigate('/listings/mine') },
    { label: t('menu.saved'), icon: <Heart />, onSelect: () => navigate('/listings/saved') },
    { label: t('menu.wallet'), icon: <Wallet />, onSelect: () => navigate('/wallet') },
    { label: t('menu.settings'), icon: <Settings />, onSelect: () => navigate('/settings') },
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
