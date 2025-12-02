import json
import sqlite3
import telegram
from telegram import Update, WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    CallbackQueryHandler,
    MessageHandler,
    filters,
)
import random
import time

# --- ИМПОРТЫ МОДУЛЕЙ ИЗ ТЕКУЩЕГО ПАКЕТА (backend) ---
# Для запуска через `python3 -m backend.main_bot` используем относительный импорт (`.module_name`)
from .database import db_query, init_db
from .config import BOT_TOKEN, MINI_APP_URL, PROJECT_NAME
from .api_routes import handle_web_app_data


CHECK_INTERVAL_SECONDS = 3600  # Проверка подписок раз в час (1 час)


# --- JobQueue: проверка 7-дневного Эскроу ---
# (Оставлен для полноты, но требует доработки логики проверки подписки через API)

async def check_subscriptions_job(context: ContextTypes.DEFAULT_TYPE):
    """
    Проверяет, какие задания на подписку прошли 7-дневный период Эскроу,
    и начисляет средства исполнителю.
    """
    now = int(time.time())

    # Выбираем записи, у которых время проверки уже наступило
    pending_checks = db_query("""
        SELECT 
            tc.id, tc.user_id, tc.task_id, tc.amount, t.target_link
        FROM task_checks tc
        JOIN tasks t ON tc.task_id = t.id
        WHERE tc.status = 'pending' AND tc.check_time <= ?
    """, (now,), fetchall=True)

    if not pending_checks:
        return

    for check_id, user_id, task_id, amount, target_link in pending_checks:
        # 1. TODO: Реализовать здесь фактическую проверку подписки через Telegram API
        is_subscribed = True 
        
        # 2. Обработка результата
        if is_subscribed:
            # Начисление исполнителю и списание из Эскроу заказчика
            db_query("UPDATE users SET pending_balance = pending_balance - ?, balance_simulated = balance_simulated + ? WHERE user_id = ?", (amount, amount, user_id))
            db_query("UPDATE task_checks SET status = 'completed', completed_at = ? WHERE id = ?", (now, check_id))
            db_query("INSERT INTO transactions (user_id, amount, type, related_id) VALUES (?, ?, ?, ?)", (user_id, amount, 'task_reward', task_id))
            db_query("UPDATE users SET tasks_completed = tasks_completed + 1 WHERE user_id = ?", (user_id,))
            
            # Отправка уведомления пользователю
            await context.bot.send_message(
                chat_id=user_id,
                text=f"**🎉 Проверка пройдена!**\n\nЗадание #{task_id} успешно прошло 7-дневный Эскроу. На ваш основной баланс зачислено **{amount:.2f} ⭐️**.",
                parse_mode='Markdown'
            )
        else:
            # Если проверка не пройдена (пользователь отписался)
            # 1. Отменить Эскроу у исполнителя (вернуть средства заказчику)
            db_query("UPDATE users SET pending_balance = pending_balance - ? WHERE user_id = ?", (amount, user_id))
            # 2. TODO: Вернуть средства заказчику 
            db_query("UPDATE task_checks SET status = 'failed', completed_at = ? WHERE id = ?", (now, check_id))
            
            await context.bot.send_message(
                chat_id=user_id,
                text=f"**🚫 Проверка не пройдена.**\n\nВы отписались от канала до завершения 7-дневного периода для задания #{task_id}.",
                parse_mode='Markdown'
            )
            
    print("JobQueue: Завершено выполнение плановой проверки подписок.")


# --- Основные команды бота ---

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    
    # 1. Регистрируем пользователя
    try:
        db_query("INSERT INTO users (user_id) VALUES (?)", (user_id,), commit=True)
    except sqlite3.IntegrityError:
        pass

    # 2. Проверяем, принял ли пользователь соглашение
    user_data = db_query("SELECT is_agreement_accepted FROM users WHERE user_id = ?", (user_id,), fetchone=True)
    is_accepted = user_data[0] if user_data else False
    
    # 3. Формируем текст
    welcome_text = (
        f"**👋 Добро пожаловать, {update.effective_user.first_name}!**\n\n"
        f"Я бот {PROJECT_NAME}. Здесь вы можете **зарабатывать ⭐️** и **заказывать** продвижение.\n\n"
    )
    
    if not is_accepted:
        welcome_text += (
            "**⚠️ ВНИМАНИЕ:** Перед началом работы необходимо принять **Пользовательское соглашение** "
            "в Mini App в разделе 'Профиль'."
        )
    else:
        welcome_text += "Нажмите кнопку **'Открыть Mini App'** ниже, чтобы приступить к заданиям."

    # 4. Формируем кнопку Mini App
    keyboard = [
        [
            InlineKeyboardButton(
                "🚀 Открыть Mini App",
                web_app=WebAppInfo(url=MINI_APP_URL)
            )
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        welcome_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer("Для работы с заданиями, пожалуйста, откройте Mini App.")


async def web_app_data_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Обработчик данных, отправленных из Mini App (tg.sendData).
    """
    user_id = update.effective_user.id
    data_json = update.effective_message.web_app_data.data
    
    # Обрабатываем данные, используя логику из api_routes.py
    response_text = handle_web_app_data(user_id, data_json)

    # Отправляем ответ пользователю в чат бота
    await update.effective_message.reply_text(
        response_text,
        parse_mode='Markdown'
    )


def main():
    """
    Основная функция запуска бота.
    """
    application = Application.builder().token(BOT_TOKEN).build()

    # --- JobQueue (Плановые задачи) ---
    job_queue = application.job_queue
    if job_queue is not None:
        job_queue.run_repeating(
            check_subscriptions_job,
            interval=CHECK_INTERVAL_SECONDS,
            first=10, 
        )
    
    # --- Обработчики команд и событий ---
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CallbackQueryHandler(button_callback))
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, web_app_data_handler))

    print(f"Бот {PROJECT_NAME} запущен и ожидает команд...")
    try:
        application.run_polling()
    except telegram.error.InvalidToken as e:
        print(f"Критическая ошибка: Неверный токен основного бота. Проверь config.")
    except Exception as e:
        print(f"Неизвестная ошибка при запуске: {e}")

if __name__ == '__main__':
    # 1. Инициализация базы данных (используем относительный импорт)
    init_db()
    
    # 2. Запуск бота
    main()