import sqlite3
import time
from pathlib import Path
import logging

# Настройка логирования для отслеживания повторных попыток
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Константы для настройки повторных попыток
MAX_RETRIES = 5
RETRY_DELAY_SECONDS = 0.5

# Базовая директория - это папка, где находится database.py (т.е., backend/)
BASE_DIR = Path(__file__).resolve().parent

# PROJECT_ROOT - это папка на один уровень выше (../)
PROJECT_ROOT = BASE_DIR.parent 

# Путь к файлу базы данных: /ROOT/data/profit_pro_hub_v4.db
DB_PATH = PROJECT_ROOT / "data" / "profit_pro_hub_v4.db"


def init_db():
    """Создание таблиц для полноценной системы."""
    # Убедимся, что папка 'data' существует в корне проекта
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # --- Таблица Users ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            is_customer BOOLEAN DEFAULT FALSE,
            balance_simulated REAL DEFAULT 50.0,
            pending_balance REAL DEFAULT 0.0, -- Эскроу/заработанные средства на проверке

            is_agreement_accepted BOOLEAN DEFAULT FALSE,
            is_blocked BOOLEAN DEFAULT FALSE, 

            -- Поля исполнителя
            profile_emoji TEXT DEFAULT '',
            rating REAL DEFAULT 5.0, 
            tasks_completed INTEGER DEFAULT 0, 

            -- Поля анкеты
            profile_age INTEGER DEFAULT 0,
            profile_gender TEXT DEFAULT '',
            profile_country TEXT DEFAULT ''
        );
    """)

    # --- Таблица tasks ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            title TEXT,
            description TEXT DEFAULT '',
            task_type TEXT, -- subscribe, comment, view, reaction
            price_simulated REAL,
            slots_remaining INTEGER,
            target_link TEXT,
            status TEXT DEFAULT 'active' -- active, paused, finished
        );
    """)

    # --- Таблица completed_tasks ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS completed_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            task_type TEXT,
            completion_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, task_id)
        );
    """)

    # --- Таблица task_checks (для 7-дневного Эскроу) ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS task_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            task_type TEXT,
            amount REAL,
            check_time INTEGER, -- timestamp
            status TEXT DEFAULT 'pending' -- pending, completed, failed
        );
    """)

    # --- Таблица transactions ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            type TEXT NOT NULL, -- deposit, withdraw, task_escrow, task_reward, task_refund, task_pending
            related_id INTEGER,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'completed'
        );
    """)

    # --- Таблица moderation_tickets ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS moderation_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reporter_id INTEGER NOT NULL,
            subject_id INTEGER,
            task_id INTEGER,
            type TEXT NOT NULL,
            message TEXT,
            status TEXT DEFAULT 'open',
            creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    conn.commit()
    conn.close()


def setup_initial_data():
    """Добавление тестовых данных, если БД пуста. Используются только 'subscribe', 'comment', 'view'."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM tasks")
    if cursor.fetchone()[0] == 0:
        # 1. Подписка
        cursor.execute("""
            INSERT INTO tasks (customer_id, title, description, task_type, price_simulated, slots_remaining, target_link)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            1001,
            "VIP Канал (TEST)",
            "Подпишитесь на наш VIP канал. Проверка через 7 дней.",
            "subscribe",
            0.55,
            50,
            "https://t.me/telegram_channel_vip"
        ))

        # 2. Комментарий
        cursor.execute("""
            INSERT INTO tasks (customer_id, title, description, task_type, price_simulated, slots_remaining, target_link)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            1001,
            "Комментарий о продукте (TEST)",
            "Оставьте позитивный комментарий под последним постом. Мин. 10 слов.",
            "comment",
            0.30,
            85,
            "https://t.me/telegram_post_1"
        ))

        # 3. Просмотр публикации
        cursor.execute("""
            INSERT INTO tasks (customer_id, title, description, task_type, price_simulated, slots_remaining, target_link)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            1001,
            "Просмотр публикации (TEST)", # Изменение названия для ясности
            "Просмотрите последнюю публикацию в канале. Требуется только просмотр.", # Изменение описания для ясности
            "view",
            0.10,
            500,
            "https://t.me/telegram_post_2"
        ))

        cursor.execute(
            "INSERT INTO transactions (user_id, amount, type) VALUES (?, ?, ?)",
            (1001, 100.0, "deposit")
        )

        conn.commit()
        print(f"Добавлены тестовые задания и депозит в {DB_PATH}.")

    conn.close()


def db_query(query, params=(), fetchone=False, commit=True, fetchall=False):
    """
    Универсальная функция для выполнения запросов к БД с логикой повторных попыток.
    
    Исправляет ошибку 'database is locked', пытаясь выполнить запрос до MAX_RETRIES раз.
    """
    
    # 1. Основной цикл повторных попыток
    for attempt in range(1, MAX_RETRIES + 1):
        conn = None
        try:
            # 2. Подключаемся к базе данных
            conn = sqlite3.connect(DB_PATH, timeout=10) # Увеличим таймаут, хотя основная логика в retry
            cursor = conn.cursor()
            
            # 3. Выполняем запрос
            cursor.execute(query, params)
            
            # 4. Если запрос успешен, обрабатываем результат и завершаем цикл
            upper = query.strip().upper()
            if upper.startswith("SELECT"):
                if fetchone:
                    result = cursor.fetchone()
                elif fetchall:
                    result = cursor.fetchall()
                else:
                    result = cursor.fetchall()
            else:
                if commit:
                    conn.commit()
                result = cursor.lastrowid if upper.startswith("INSERT") else None
            
            # Успешное выполнение, выходим из цикла и возвращаем результат
            return result

        except sqlite3.OperationalError as e:
            # 5. Обрабатываем ошибку блокировки
            if 'database is locked' in str(e) or 'cannot commit' in str(e):
                logging.warning(f"SQLite Error: database is locked. Попытка {attempt}/{MAX_RETRIES}. Запрос: {query[:50]}...")
                
                if attempt == MAX_RETRIES:
                    logging.error(f"Не удалось выполнить запрос после {MAX_RETRIES} попыток. Выброс исключения.")
                    raise e
                
                # Ждем, увеличивая задержку
                time.sleep(RETRY_DELAY_SECONDS * attempt)
            else:
                # Если это другая OperationalError, выбрасываем сразу
                logging.error(f"SQLite Error (Другая OperationalError): {e}\nQuery: {query}\nParams: {params}")
                raise e
        
        except Exception as e:
            # Обработка других непредвиденных ошибок
            logging.error(f"Непредвиденная ошибка при выполнении запроса: {e}\nQuery: {query}\nParams: {params}")
            raise e
        
        finally:
            # 6. Всегда закрываем соединение в конце каждой попытки
            if conn:
                conn.close()
                
    return None # Должно быть недостижимо