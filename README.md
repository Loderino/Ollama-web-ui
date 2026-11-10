# Ollama Web UI

Веб-интерфейс для Ollama с поддержкой чатов, истории переписок, стриминга ответов и управления подключениями.

## Возможности

- Чаты и история переписок (хранение в PostgreSQL).
- Асинхронная обработка запросов через Celery + RabbitMQ.
- Потоковый вывод ответа (streaming) с возможностью отмены генерации.
- Подключение к локальным и удаленным инстансам Ollama (с поддержкой API-ключей).
- Управление параметрами генерации (temperature, top_k, top_p) и выбор модели прямо в UI.
- Рендеринг Markdown и подсветка синтаксиса кода в ответах.

## Стек

- **Бэкенд**: FastAPI, Celery, RabbitMQ, Redis
- **БД**: PostgreSQL + SQLAlchemy + Alembic
- **Фронтенд**: React + Next.js (App Router), Tailwind CSS

## Запуск

### 1. Подготовка

Скопируйте файл с переменными окружения:

```bash
cp .env.example .env
```

При необходимости отредактируйте `.env` (пароли к БД, порты).

### 2. Инфраструктура

Запустите базы данных, брокер сообщений и кэш:

```bash
docker compose up -d
```

### 3. Бэкенд

Соберите и запустите FastAPI и Celery-воркер:

```bash
docker compose up -d --build backend worker
```

Примените миграции базы данных:

```bash
docker compose exec backend alembic upgrade head
```

По умолчанию бэкенд будет доступен по адресу `http://localhost:8000`.

### 4. Фронтенд

Перейдите в папку фронтенда, установите зависимости и запустите dev-сервер:

```bash
cd frontend
npm install
npm run dev
```

Интерфейс будет доступен по адресу `http://localhost:3000`.

### 5. Ollama

Убедитесь, что у вас запущен инстанс Ollama (локально или на удаленном сервере). Если Ollama запущена на том же хосте, что и Docker, она должна слушать `0.0.0.0`, чтобы контейнеры могли до нее достучаться.

## Разработка

```bash
# линтер
uv run ruff check .

# форматтер
uv run ruff format .

# тесты
uv run pytest

# pre-commit
uv run pre-commit install
uv run pre-commit run --all-files
```
