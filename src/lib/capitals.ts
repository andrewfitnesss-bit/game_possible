import type { Lang } from '../i18n/prefs';

// Сто столиц для автоматических названий столов: [английский, русский].
const CAPITALS: [string, string][] = [
  ['Amsterdam', 'Амстердам'], ['Athens', 'Афины'], ['Berlin', 'Берлин'], ['Bern', 'Берн'], ['Bratislava', 'Братислава'],
  ['Brussels', 'Брюссель'], ['Bucharest', 'Бухарест'], ['Budapest', 'Будапешт'], ['Copenhagen', 'Копенгаген'], ['Dublin', 'Дублин'],
  ['Helsinki', 'Хельсинки'], ['Lisbon', 'Лиссабон'], ['Ljubljana', 'Любляна'], ['London', 'Лондон'], ['Luxembourg', 'Люксембург'],
  ['Madrid', 'Мадрид'], ['Minsk', 'Минск'], ['Monaco', 'Монако'], ['Moscow', 'Москва'], ['Oslo', 'Осло'],
  ['Paris', 'Париж'], ['Prague', 'Прага'], ['Reykjavik', 'Рейкьявик'], ['Riga', 'Рига'], ['Rome', 'Рим'],
  ['Sofia', 'София'], ['Stockholm', 'Стокгольм'], ['Tallinn', 'Таллин'], ['Valletta', 'Валлетта'], ['Vienna', 'Вена'],
  ['Vilnius', 'Вильнюс'], ['Warsaw', 'Варшава'], ['Zagreb', 'Загреб'], ['Belgrade', 'Белград'], ['Sarajevo', 'Сараево'],
  ['Skopje', 'Скопье'], ['Tirana', 'Тирана'], ['Podgorica', 'Подгорица'], ['Chisinau', 'Кишинёв'], ['Yerevan', 'Ереван'],
  ['Baku', 'Баку'], ['Tbilisi', 'Тбилиси'], ['Astana', 'Астана'], ['Tashkent', 'Ташкент'], ['Bishkek', 'Бишкек'],
  ['Dushanbe', 'Душанбе'], ['Ashgabat', 'Ашхабад'], ['Ulaanbaatar', 'Улан-Батор'], ['Beijing', 'Пекин'], ['Tokyo', 'Токио'],
  ['Seoul', 'Сеул'], ['Hanoi', 'Ханой'], ['Bangkok', 'Бангкок'], ['Kuala Lumpur', 'Куала-Лумпур'], ['Singapore', 'Сингапур'],
  ['Jakarta', 'Джакарта'], ['Manila', 'Манила'], ['New Delhi', 'Нью-Дели'], ['Kathmandu', 'Катманду'], ['Colombo', 'Коломбо'],
  ['Dhaka', 'Дакка'], ['Islamabad', 'Исламабад'], ['Kabul', 'Кабул'], ['Tehran', 'Тегеран'], ['Baghdad', 'Багдад'],
  ['Riyadh', 'Эр-Рияд'], ['Abu Dhabi', 'Абу-Даби'], ['Doha', 'Доха'], ['Muscat', 'Маскат'], ['Amman', 'Амман'],
  ['Beirut', 'Бейрут'], ['Ankara', 'Анкара'], ['Cairo', 'Каир'], ['Rabat', 'Рабат'], ['Tunis', 'Тунис'],
  ['Algiers', 'Алжир'], ['Nairobi', 'Найроби'], ['Addis Ababa', 'Аддис-Абеба'], ['Accra', 'Аккра'], ['Dakar', 'Дакар'],
  ['Pretoria', 'Претория'], ['Luanda', 'Луанда'], ['Kigali', 'Кигали'], ['Canberra', 'Канберра'], ['Wellington', 'Веллингтон'],
  ['Ottawa', 'Оттава'], ['Washington', 'Вашингтон'], ['Mexico City', 'Мехико'], ['Havana', 'Гавана'], ['Panama', 'Панама'],
  ['Bogota', 'Богота'], ['Caracas', 'Каракас'], ['Quito', 'Кито'], ['Lima', 'Лима'], ['Santiago', 'Сантьяго'],
  ['Buenos Aires', 'Буэнос-Айрес'], ['Montevideo', 'Монтевидео'], ['Asuncion', 'Асунсьон'], ['La Paz', 'Ла-Пас'], ['Brasilia', 'Бразилиа'],
];

/** count случайных столиц, которых ещё нет среди названий столов (сравнение без учёта регистра). */
export function pickCapitals(count: number, lang: Lang, taken: string[]): string[] {
  const used = new Set(taken.map((n) => n.trim().toLowerCase()));
  const pool = CAPITALS.map(([en, ru]) => (lang === 'ru' ? ru : en)).filter((n) => !used.has(n.toLowerCase()));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export const CAPITALS_COUNT = CAPITALS.length;
