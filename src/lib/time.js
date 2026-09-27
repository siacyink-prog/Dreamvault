const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

export function formatShanghai(value, locale, options) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: SHANGHAI_TIME_ZONE,
    ...options,
  }).format(new Date(value));
}

