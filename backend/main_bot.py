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

from .database import db_query
from .config import BOT_TOKEN, MINI_APP_URL, PROJECT_NAME
from .api_routes import handle_web_app_data


CHECK_INTERVAL_SECONDS = 3600  # Проверка подписок раз в час


# --- JobQueue: проверка 7-дневного Эскроу ---

async def check_subscriptions_job(context: ContextTypes.DEFAULT_TYPE):
    now = int(time.time())

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
        # Имитация проверки подписки (90% успеха)
        is_still_subscribed = random.random() < 0.90

        if is_still_subscribed:
            db_query("""
                UPDATE users
                SET pending_balance = pending_balance - ?,
                    balance_simulated = balance_simulated + ?,
                    tasks_completed = tasks_completed + 1
                WHERE user_id = ?
            """, (amount, amount, user_id))

            db_query("UPDATE task_checks SET status = 'completed' WHERE id = ?", (check_id,))

            db_query("""
                UPDATE transactions
                SET status = 'completed'
                WHERE related_id = ? AND user_id = ? AND type = 'task_pending'
            """, (task_id, user_id))

            await context.bot.send_message(
                user_id,
                f"🎉 *Проверка подписки успешно пройдена!*\n"
                f"Задание #{task_id}: *{amount:.2f} ⭐️* переведены из Эскроу на основной баланс.",
                parse_mode='Markdown'
            )
        else:
            db_query("""
                UPDATE users
                SET pending_balance = pending_balance - ?
                WHERE user_id = ?
            """, (amount, user_id))

            db_query("UPDATE task_checks SET status = 'failed' WHERE id = ?", (check_id,))

            db_query("""
                UPDATE transactions
                SET status = 'failed'
                WHERE related_id = ? AND user_id = ? AND type = 'task_pending'
            """, (task_id, user_id))

            await context.bot.send_message(
                user_id,
                f"❌ *Проверка подписки не пройдена.*\n"
                f"Вы были отписаны от канала задания #{task_id}. "
                f"Сумма *{amount:.2f} ⭐️* снята с Эскроу.",
                parse_mode='Markdown'
            )

    print(f"Завершена проверка {len(pending_checks)} подписок.")


# --- /start ---

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    username = update.effective_user.username or update.effective_user.first_name

    user_data = db_query("""
        SELECT user_id, balance_simulated, pending_balance, profile_emoji
        FROM users
        WHERE user_id = ?
    """, (user_id,), fetchone=True)

    if not user_data:
        random_emoji = random.choice(EMOJI_AVATARS)
        db_query("""
            INSERT INTO users 
            (user_id, balance_simulated, pending_balance, is_agreement_accepted,
             profile_emoji, rating, tasks_completed, profile_age, profile_gender, profile_country)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, 50.0, 0.0, False, random_emoji, 5.0, 0, 0, '', ''))

    app_button = InlineKeyboardButton(
        text=f"▶️ Открыть {PROJECT_NAME}",
        web_app=WebAppInfo(url=MINI_APP_URL)
    )

    keyboard = InlineKeyboardMarkup([[app_button]])

    await update.message.reply_text(
        f"👋 Добро пожаловать, *{username}*!\nОткройте Mini App, чтобы начать работу.",
        reply_markup=keyboard,
        parse_mode='Markdown'
    )


async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer("Для работы с заданиями, пожалуйста, откройте Mini App.")


async def web_app_data_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    data_json = update.effective_message.web_app_data.data

    response_text = handle_web_app_data(user_id, data_json)

    await update.effective_message.reply_text(
        response_text,
        parse_mode='Markdown'
    )


def main():
    application = Application.builder().token(BOT_TOKEN).build()

    # ⚠ ВРЕМЕННО отключаем JobQueue, чтобы бот просто запустился
    # Если потом захочешь включить проверки эскроу:
    # 1) установи:  pip install "python-telegram-bot[job-queue]"
    # 2) раскомментируй строки ниже.

    # job_queue = application.job_queue
    # if job_queue is not None:
    #     job_queue.run_repeating(
    #         check_subscriptions_job,
    #         interval=CHECK_INTERVAL_SECONDS,
    #         first=10,
    #     )

    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CallbackQueryHandler(button_callback))
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, web_app_data_handler))

    print(f"Бот {PROJECT_NAME} запущен и ожидает команд...")
    try:
        application.run_polling()
    except telegram.error.InvalidToken as e:
        print(f"Критическая ошибка: Неверный токен основного бота. Проверь config.py. Детали: {e}")


if __name__ == "__main__":
    main()
