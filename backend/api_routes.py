# api_routes.py 

import json
import sqlite3
import random
import time

from .database import db_query
from .config import BOT_TOKEN, ADMIN_BOT_TOKEN  # если ADMIN_BOT_TOKEN не нужен, всё равно можно оставить


# --- Вспомогательные Функции для Управления Средствами ---

def register_pending_reward(user_id, task_id, task_type, price):
    """Регистрирует награду в pending_balance и устанавливает 7-дневную проверку."""
    
    # 1. Зачисление на pending_balance исполнителя
    db_query("UPDATE users SET pending_balance = pending_balance + ? WHERE user_id = ?", 
             (price, user_id))
             
    # 2. Установка времени проверки (7 дней = 7 * 24 * 3600 секунд)
    check_time = int(time.time()) + (7 * 24 * 3600)
    
    # 3. Регистрация проверки в task_checks
    db_query("INSERT INTO task_checks (user_id, task_id, task_type, amount, check_time, status) VALUES (?, ?, ?, ?, ?, ?)",
             (user_id, task_id, task_type, price, check_time, 'pending'))
             
    # 4. Регистрация транзакции (pending reward)
    db_query("INSERT INTO transactions (user_id, amount, type, related_id, status) VALUES (?, ?, ?, ?, ?)", 
             (user_id, price, 'task_pending', task_id, 'pending'))

def register_instant_reward(user_id, task_id, task_type, price):
    """Мгновенное зачисление награды (для Comment/View)."""
    
    # 1. Зачисление на основной balance_simulated исполнителя
    db_query("UPDATE users SET balance_simulated = balance_simulated + ?, tasks_completed = tasks_completed + 1 WHERE user_id = ?", 
             (price, user_id))
             
    # 2. Регистрация транзакции (reward)
    db_query("INSERT INTO transactions (user_id, amount, type, related_id) VALUES (?, ?, ?, ?)", 
             (user_id, price, 'task_reward', task_id))
    
    # 3. Добавление в завершенные
    db_query("INSERT INTO completed_tasks (user_id, task_id, task_type) VALUES (?, ?, ?)", (user_id, task_id, task_type))


# --- ОСНОВНАЯ ФУНКЦИЯ ОБРАБОТКИ ВСЕХ API-ЗАПРОСОВ ---

def handle_web_app_data(user_id: int, data_json: str):
    """
    Центральная функция для обработки данных, пришедших из Telegram Mini App.
    Возвращает сообщение для отправки пользователю.
    """
    try:
        data = json.loads(data_json)
    except json.JSONDecodeError:
        return "Ошибка: Неверный формат данных от Mini App."
        
    action = data.get('action')
    
    # Проверка на блокировку (исключаем повтор кода)
    is_blocked = db_query("SELECT is_blocked FROM users WHERE user_id = ?", (user_id,), fetchone=True)
    if is_blocked and is_blocked[0]:
        return "🛑 Ваш аккаунт заблокирован модератором."
        
    # --- A. Сохранение профиля Исполнителя (без изменений) ---
    if action == 'save_profile':
        age = data.get('age')
        gender = data.get('gender')
        country = data.get('country')
        
        db_query("UPDATE users SET profile_age = ?, profile_gender = ?, profile_country = ? WHERE user_id = ?", 
                 (age, gender, country, user_id))
                 
        return "✅ **Анкета Исполнителя сохранена!** Вы можете выполнять задания."
        
    # --- B. Сохранение факта принятия соглашения Заказчика (без изменений) ---
    elif action == 'accept_agreement':
        db_query("UPDATE users SET is_agreement_accepted = TRUE WHERE user_id = ?", (user_id,))
        return "✅ **Пользовательское соглашение принято!** Теперь вы можете создавать задания."

    # --- C. Начало выполнения задания (ЛОГИКА ЭСКРОУ) ---
    elif action == 'start_perform_task':
        task_id = data.get('taskId')
        task_price = data.get('price')
        task_type = data.get('taskType')
        
        # 1. Проверка на дублирование
        performed = db_query("SELECT id FROM completed_tasks WHERE user_id = ? AND task_id = ?", 
                             (user_id, task_id), fetchone=True)
        if performed:
            return f"🛑 **Ошибка:** Вы уже выполнили задание #{task_id}."
            
        # 2. Уменьшение слотов задания (для всех типов)
        db_query("UPDATE tasks SET slots_remaining = slots_remaining - 1 WHERE id = ?", (task_id,))
            
        # 3. Логика начисления средств в зависимости от типа
        if task_type == 'subscribe':
            register_pending_reward(user_id, task_id, task_type, task_price)
            return f"⏳ **Подписка зарегистрирована!**\n" \
                   f"**{task_price:.2f} ⭐️** переведены в Эскроу. Проверка будет через 7 дней."
        
        elif task_type == 'comment':
            # В реале: здесь будет проверка комментария (чтение через API)
            # Имитируем успешную проверку
            if random.random() < 0.98: 
                register_instant_reward(user_id, task_id, task_type, task_price)
                return f"🎉 **Комментарий подтвержден!**\n" \
                       f"На ваш баланс зачислено **{task_price:.2f} ⭐️**."
            else:
                return f"❌ **Комментарий не прошел модерацию.**\n" \
                       f"Возможно, найдены запрещенные слова. Средства не зачислены."
                       
        elif task_type == 'view':
            # Просмотр всегда мгновенный
            register_instant_reward(user_id, task_id, task_type, task_price)
            return f"🎉 **Просмотр засчитан!**\n" \
                   f"На ваш баланс зачислено **{task_price:.2f} ⭐️**."
        
        return "Неизвестный тип задания."


    # --- D. Создание задания (ТРАНЗАКЦИЯ ЭСКРОУ) ---
    elif action == 'create_task':
        title = data.get('title')
        description = data.get('description')
        link = data.get('link') 
        price = data.get('price')
        count = data.get('count')
        total = data.get('total')
        status = data.get('status')
        task_type = data.get('taskType') # НОВЫЙ

        current_balance, current_pending = db_query("SELECT balance_simulated, pending_balance FROM users WHERE user_id = ?", 
                                                    (user_id,), fetchone=True)

        if status == 'Запущено':
            new_balance = current_balance - total
            new_pending = current_pending + total 
            
            # 1. Обновление балансов заказчика (Основной -> Эскроу)
            db_query("UPDATE users SET balance_simulated = ?, pending_balance = ? WHERE user_id = ?", 
                     (new_balance, new_pending, user_id))
            
            # 2. Добавление задания
            task_id = db_query("INSERT INTO tasks (customer_id, title, description, task_type, price_simulated, slots_remaining, target_link, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
                       (user_id, title, description, task_type, price, count, link, 'active'))

            # 3. Регистрация транзакции (Списание в Эскроу)
            db_query("INSERT INTO transactions (user_id, amount, type, related_id) VALUES (?, ?, ?, ?)", 
                     (user_id, -total, 'task_escrow', task_id)) 
                       
            return f"✅ **Задание запущено!**\n" \
                   f"Сумма **{total:.2f} ⭐️** переведена в Эскроу. Старт работы исполнителей!"
        
        else:
            return f"⚠️ Задание не запущено. Статус: **{status}**."
            
    # --- E. Создание Тикета Модерации (ЖАЛОБА) ---
    elif action == 'create_ticket':
        # ... (логика без изменений)
        ticket_type = data.get('type') 
        subject_id = data.get('subjectId')
        task_id = data.get('taskId')
        message = data.get('message')
        
        ticket_id = db_query("INSERT INTO moderation_tickets (reporter_id, subject_id, task_id, type, message) VALUES (?, ?, ?, ?, ?)",
                             (user_id, subject_id, task_id, ticket_type, message))
        
        return f"✅ **Ваше обращение #{ticket_id} зарегистрировано!**\n" \
               f"Модератор рассмотрит его в ближайшее время."

    return "Неизвестное действие Mini App."