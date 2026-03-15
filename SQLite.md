ТЗ: Интеграция Prisma + SQLite (Модуль Storage)
Цель: Заменить временное хранение в Crawlee Dataset на персистентную базу данных SQLite с использованием Prisma ORM. Реализовать паттерн Idempotency (Upsert) и Audit Trail.

Шаг 1: Инициализация и настройка ORM
Установи зависимости: npm install @prisma/client и npm install prisma --save-dev.

Инициализируй Prisma: npx prisma init --datasource-provider sqlite.

В файле .env убедись, что переменная DATABASE_URL указывает на локальный файл, например: DATABASE_URL="file:./storage/dev.db".

Шаг 2: Проектирование схемы (schema.prisma)
Схема должна строго соответствовать твоей Zod-схеме ProductSchema и обязательно включать поля аудита.

Задача: Создай модель Product.

Уникальный ключ: Используй id товара (артикул WB) как @id или @unique, чтобы избежать дубликатов.

Audit Trail (Требование storage.md): Обязательно добавь поля sourceUrl, createdAt и updatedAt.

Пример схемы для реализации:

Фрагмент кода
model Product {
id Int @id // Артикул WB будет уникальным ключом
name String
price Float?
salePrice Float?
brand String?
rating Float?
reviews Int?
image String?

// Audit Trail
sourceUrl String
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
}
Шаг 3: Генерация и миграция (Критическое правило)
Прежде чем писать код интеграции, обязательно выполни две команды для создания локальной базы и генерации типов клиента:

Bash
npx prisma db push
npx prisma generate
Шаг 4: Модификация parser.js (Gatekeeper + Upsert)
Тебе нужно внедрить PrismaClient в процесс сохранения данных, оставив Zod в качестве «привратника».

Инициализация: В начале файла parser.js создай инстанс: const prisma = new PrismaClient();.

Логика сохранения: Внутри цикла, где у тебя отрабатывает ProductSchema.safeParse(), замени пуш в массив/Dataset на операцию к БД.

Требование Idempotency: Категорически запрещено использовать prisma.product.create. Используй только prisma.product.upsert.

Шаг 5: Graceful Shutdown
База данных не должна оставаться «висеть» в памяти при завершении скрипта или при его падении.

В конце функции main() добавь await prisma.$disconnect().

Желательно обернуть основной блок парсера в try...finally, чтобы $disconnect() вызывался гарантированно.
