// Brand constants — DESIGN.md §1. Renaming the product is a one-file change here (+ web/src/brand.ts re-export).
export const NAME_ZH = '安窝';
export const NAME_EN = 'Anwo';
export const NAME_DISPLAY = '安窝 Anwo';
export const TAGLINE_ZH = '安心落脚，从校园开始。';
export const TAGLINE_EN = 'Settle in safely, starting at campus.';
export const TAGLINE_SHORT_ZH = '安心落脚';
export const TAGLINE_SHORT_EN = 'Settle in safely';

export const BRAND = {
  nameZh: NAME_ZH,
  nameEn: NAME_EN,
  nameDisplay: NAME_DISPLAY,
  taglineZh: TAGLINE_ZH,
  taglineEn: TAGLINE_EN,
  taglineShortZh: TAGLINE_SHORT_ZH,
  taglineShortEn: TAGLINE_SHORT_EN,
} as const;
