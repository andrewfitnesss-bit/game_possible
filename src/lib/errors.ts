import type { T, TKey } from '../i18n/prefs';

// Сервер отдаёт ошибки кодами 'E_КОД|арг1|арг2'; переводим их на язык игрока.
export function errText(err: unknown, t?: T): string {
  const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  if (!message) return t ? t('common.unknownError') : 'Unknown error';
  const m = /^(E_[A-Z0-9_]+)((?:\|[^|]*)*)$/.exec(message);
  if (!m || !t) return message;
  const args = m[2] ? m[2].slice(1).split('|') : [];
  const vars = Object.fromEntries(args.map((a, i) => [String(i), a]));
  const key = `err.${m[1]}` as TKey;
  const text = t(key, vars);
  return text === key ? message : text;
}
