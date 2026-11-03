// Server-side row types for scaffold tables (snake_case, as stored). Modules define their own row types.
export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'student' | 'landlord' | 'admin';
  trust_level: number;
  locale: 'zh-CN' | 'en';
  campus_id: string | null;
  bio: string | null;
  avatar_upload_id: string | null;
  phone: string | null;
  phone_verified_at: string | null;
  email_verified_at: string | null;
  edu_email: string | null;
  id_verified_at: string | null;
  payment_verified_at: string | null;
  wechat_id: string | null;
  gender: 'female' | 'male' | 'nonbinary' | 'undisclosed' | null;
  grad_year: number | null;
  program: string | null;
  languages_json: string;
  banned: number;
  banned_reason: string | null;
  banned_at: string | null;
  referral_code: string;
  referred_by: string | null;
  verified_only_messaging: number;
  email_digest_opt_in: number;
  pro_until: string | null;
  wallet_balance_cents: number;
  listing_quota: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
/** req.user — users row minus password_hash */
export type AuthUser = Omit<UserRow, 'password_hash'>;

export type CampusRow = {
  id: string;
  name: string;
  name_zh: string | null;
  short_name: string;
  slug: string;
  city: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
  timezone: string;
  edu_domains_json: string;
  has_shuttle: number;
  shuttle_official_url: string | null;
  default_radius_m: number;
  intl_students: number | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type UploadRow = {
  id: string;
  owner_id: string | null;
  kind: 'image' | 'document';
  purpose: string;
  filename: string;
  path: string;
  url: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sha256: string | null;
  is_private: number;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  data_json: string;
  read_at: string | null;
  created_at: string;
};

export type ConversationRow = {
  id: string;
  kind: 'direct' | 'group' | 'support';
  title: string | null;
  campus_id: string | null;
  context_type: string | null;
  context_id: string | null;
  created_by: string | null;
  direct_key: string | null;
  last_message_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  message_count: number;
  is_locked: number;
  created_at: string;
  updated_at: string;
};
export type ConversationMemberRow = {
  conversation_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  left_at: string | null;
  muted_until: string | null;
  archived: number;
  last_read_message_id: string | null;
  last_read_at: string | null;
  unread_count: number;
  scam_banner_dismissed: number;
};
export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: 'text' | 'image' | 'system' | 'context_card';
  body: string | null;
  upload_id: string | null;
  context_json: string | null;
  client_id: string | null;
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

declare global {
  namespace Express {
    interface Request {
      /** set by optionalAuth / requireAuth */
      user?: AuthUser;
      /** anonymous session id (cookie `aid`) */
      sessionId?: string;
      /** request id for logs */
      reqId?: string;
    }
  }
}
export {};
