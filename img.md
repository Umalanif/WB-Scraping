ТЗ: Интеграция генератора изображений Wildberries
Цель: Реализовать алгоритм автоматической генерации URL-адресов изображений на основе артикула (ID) товара и интегрировать его в существующий цикл обработки данных.

1. Создание вспомогательного модуля utils/wb-image.js
   Логика распределения по серверам (баскетам) основана на диапазонах ID.

JavaScript
/\*\*

- Генерирует прямую ссылку на основное изображение товара Wildberries.
- Использует математическое распределение по хостам (баскетам) на основе ID.
- - @param {number} id - Артикул товара.
- @returns {string} - Полный URL к изображению в формате .webp.
  \*/
  export function generateWbImageUrl(id) {
  const vol = Math.floor(id / 100000);
  const part = Math.floor(id / 1000);
  let basket = '01';

      if (id >= 0 && id <= 143999) basket = '01';
      else if (id >= 144000 && id <= 287999) basket = '02';
      else if (id >= 288000 && id <= 431999) basket = '03';
      else if (id >= 432000 && id <= 719999) basket = '04';
      else if (id >= 720000 && id <= 1007999) basket = '05';
      else if (id >= 1008000 && id <= 1061999) basket = '06';
      else if (id >= 1062000 && id <= 1115999) basket = '07';
      else if (id >= 1116000 && id <= 1169999) basket = '08';
      else if (id >= 1170000 && id <= 1313999) basket = '09';
      else if (id >= 1314000 && id <= 1601999) basket = '10';
      else if (id >= 1602000 && id <= 1655999) basket = '11';
      else if (id >= 1656000 && id <= 1919999) basket = '12';
      else if (id >= 1920000 && id <= 2045999) basket = '13';
      else if (id >= 2046000 && id <= 2189999) basket = '14';
      else if (id >= 2190000 && id <= 2405999) basket = '15';
      else if (id >= 2406000 && id <= 2621999) basket = '16';
      else if (id >= 2622000 && id <= 2837999) basket = '17';
      else basket = '18';

      return `https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${id}/images/big/1.webp`;

  }

2. Обновление parser.js
   Необходимо импортировать утилиту и обновить функцию извлечения данных, чтобы она автоматически заполняла поле image.

JavaScript
import { generateWbImageUrl } from './utils/wb-image.js';
// ... остальные импорты

/\*\*

- Извлекает данные о товаре и генерирует URL изображения.
- - @param {Object} item - Сырой объект товара из API.
- @param {string} sourceUrl - URL источника.
- @returns {Object} - Валидированный объект товара.
  \*/
  function extractProduct(item, sourceUrl) {
  // Логика извлечения цен из массива sizes
  let priceData = 0;
  let salePriceData = 0;

      if (item.sizes && item.sizes.length > 0) {
          const size = item.sizes[0].price;
          if (size) {
              priceData = size.basic / 100;
              salePriceData = size.total / 100;
          }
      }

      const product = {
          id: item.id,
          name: item.name.trim(),
          price: priceData,
          salePrice: salePriceData,
          brand: item.brand?.trim() || 'N/A',
          rating: item.reviewRating || 0,
          reviews: item.feedbacks || 0,
          // Использование генератора вместо попыток найти ссылку в JSON
          image: generateWbImageUrl(item.id),
          sourceUrl
      };

      const validation = ProductSchema.safeParse(product);
      if (!validation.success) {
          logger.error({ errors: validation.error.format(), id: item.id }, 'Validation failed');
          return null;
      }
      return validation.data;

  }

3. Обновление Prisma Schema (prisma/schema.prisma)
   Убедитесь, что поле image может принимать длинные строки URL.

Фрагмент кода
model Product {
id Int @id
name String
price Float?
salePrice Float?
brand String?
rating Float?
reviews Int?
image String? // Будет хранить сгенерированный URL
sourceUrl String
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
} 4. Синхронизация базы данных
После внесения изменений в схему необходимо обновить клиент Prisma.

Bash
npx prisma db push
npx prisma generate 5. Примечания к реализации
Формат: Ссылка ведет на основное изображение (1.webp) в максимальном разрешении (big).

CDN: Использование wbbasket.ru является актуальным стандартом Wildberries для обхода блокировок старых доменов.

Масштабируемость: Функция generateWbImageUrl легко дополняется новыми диапазонами корзин (19, 20 и т.д.) по мере роста артикулов на маркетплейсе.
