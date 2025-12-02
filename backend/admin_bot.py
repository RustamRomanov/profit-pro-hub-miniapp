# admin_bot.py 

import telegram
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    CallbackQueryHandler,
)

from .database import db_query
from .config import ADMIN_BOT_TOKEN, ADMIN_CHAT_ID, PROJECT_NAME
import logging



# Настройка логирования
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Вспомогательные Функции Баланса и Блокировки ---

def update_user_balance(user_id, amount, ticket_id, tx_type, is_refund=False):
    """Обновляет баланс пользователя и регистрирует транзакцию."""
    if is_refund:
        # При возврате средств, они возвращаются из pending_balance заказчика в balance_simulated.
        # В этой MVP-модели мы просто добавляем к основному балансу, т.к. pending_balance
        # в реале должен быть балансом Эскроу.
        db_query("UPDATE users SET balance_simulated = balance_simulated + ? WHERE user_id = ?", 
                 (amount, user_id))
        
    else: # Зачисление исполнителю (reward)
        db_query("UPDATE users SET balance_simulated = balance_simulated + ? WHERE user_id = ?", 
                 (amount, user_id))

    # Регистрация транзакции модератора
    db_query("INSERT INTO transactions (user_id, amount, type, related_id) VALUES (?, ?, ?, ?)",
             (user_id, amount, tx_type, ticket_id))
    
    return f"Баланс пользователя {user_id} обновлен на {amount:.2f} ⭐️."


def block_user(user_id):
    """Блокирует пользователя в системе."""
    db_query("UPDATE users SET is_blocked = TRUE WHERE user_id = ?", (user_id,))
    return f"Пользователь {user_id} **заблокирован** в системе."

# --- 1. Основные команды Модератора ---

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Проверяет права и приветствует модератора."""
    if update.effective_user.id not in ADMIN_CHAT_ID:
        await update.message.reply_text("🛑 Доступ запрещен. Вы не являетесь модератором.")
        return
    
    await update.message.reply_text(
        f"👋 Добро пожаловать, Модератор **{PROJECT_NAME}**!\n"
        f"Используйте команду /tickets для просмотра открытых жалоб."
    )

async def view_tickets(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Выводит список открытых тикетов модерации."""
    if update.effective_user.id not in ADMIN_CHAT_ID: return

    tickets = db_query("""
        SELECT 
            id, reporter_id, subject_id, task_id, type, message, creation_date
        FROM moderation_tickets
        WHERE status = 'open'
        ORDER BY creation_date ASC
        LIMIT 10
    """, fetchall=True)

    if not tickets:
        await update.message.reply_text("✅ Открытых тикетов нет. Все чисто!")
        return

    response_text = "🚨 **Открытые Тикеты (10 последних):**\n\n"
    for t in tickets:
        ticket_id, reporter_id, subject_id, task_id, ticket_type, message, date = t
        
        subject_info = f"На пользователя ID: {subject_id}" if subject_id else ""
        task_info = f"По заданию ID: {task_id}" if task_id else ""
        
        response_text += (
            f"**Тикет #{ticket_id}** (Тип: {ticket_type.upper()})\n"
            f"Жалоба от ID: {reporter_id}. {subject_info} {task_info}\n"
            f"Сообщение: *{message[:50]}...*\n"
        )
        
        # Кнопки для решения спора
        keyboard = [
            [
                InlineKeyboardButton(f"Зачислить (Исполнителю)", callback_data=f"mod_reward_{ticket_id}"),
                InlineKeyboardButton(f"Вернуть (Заказчику)", callback_data=f"mod_refund_{ticket_id}")
            ],
            [
                InlineKeyboardButton(f"Заблокировать {subject_id}", callback_data=f"mod_block_{ticket_id}_{subject_id}"),
                InlineKeyboardButton(f"Закрыть без действий", callback_data=f"mod_close_{ticket_id}")
            ]
        ]
        
        await update.message.reply_text(response_text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        response_text = "" # Сброс для следующего тикета

# --- 2. Обработчик нажатий кнопок модерации ---

async def moderation_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработка действий модератора."""
    query = update.callback_query
    await query.answer()
    
    data = query.data.split('_') # Пример: ['mod', 'reward', '123']
    action = data[1]
    ticket_id = int(data[2])
    
    # Получаем детали тикета для принятия решения
    ticket_details = db_query("SELECT subject_id, task_id FROM moderation_tickets WHERE id = ?", (ticket_id,), fetchone=True)
    
    if not ticket_details:
        await query.edit_message_text(f"🛑 Тикет #{ticket_id} не найден или уже закрыт.")
        return

    subject_id, task_id = ticket_details
    
    # 1. Зачисление Средств (Исполнителю)
    if action == 'reward':
        if not task_id:
            await query.edit_message_text(f"🛑 Нельзя зачислить награду: Тикет #{ticket_id} не привязан к заданию.")
            return

        # Имитация получения цены задания
        task_price = db_query("SELECT price_simulated FROM tasks WHERE id = ?", (task_id,), fetchone=True)
        
        if not task_price:
             await query.edit_message_text(f"🛑 Задание #{task_id} не найдено.")
             return

        # Награждаем репортера (или того, кто выполнил, если это спор)
        reporter_id = db_query("SELECT reporter_id FROM moderation_tickets WHERE id = ?", (ticket_id,), fetchone=True)[0]
        
        log_message = update_user_balance(reporter_id, task_price[0], ticket_id, 'mod_reward')
        
        db_query("UPDATE moderation_tickets SET status = 'resolved' WHERE id = ?", (ticket_id,))
        await query.edit_message_text(f"✅ **Тикет #{ticket_id} РЕШЕН!**\n{log_message}")

    # 2. Возврат Средств (Заказчику)
    elif action == 'refund':
        if not task_id:
            await query.edit_message_text(f"🛑 Нельзя вернуть средства: Тикет #{ticket_id} не привязан к заданию.")
            return

        # Имитация получения общей стоимости задания (для возврата заказчику)
        # В реале: нужно вернуть сумму, которую исполнитель должен был получить.
        task_price = db_query("SELECT price_simulated FROM tasks WHERE id = ?", (task_id,), fetchone=True)
        customer_id = db_query("SELECT customer_id FROM tasks WHERE id = ?", (task_id,), fetchone=True)[0]
        
        if not task_price:
             await query.edit_message_text(f"🛑 Задание #{task_id} не найдено.")
             return

        # Возвращаем средства заказчику
        log_message = update_user_balance(customer_id, task_price[0], ticket_id, 'mod_refund', is_refund=True)

        db_query("UPDATE moderation_tickets SET status = 'resolved' WHERE id = ?", (ticket_id,))
        await query.edit_message_text(f"✅ **Тикет #{ticket_id} РЕШЕН!**\n{log_message}")

    # 3. Блокировка Пользователя
    elif action == 'block':
        target_user_id = int(data[3])
        
        log_message = block_user(target_user_id)
        
        # Отправляем сообщение заблокированному пользователю
        await context.bot.send_message(target_user_id, "🛑 Ваш аккаунт в Profit Pro Hub был заблокирован модератором за нарушение правил.")
        
        db_query("UPDATE moderation_tickets SET status = 'closed' WHERE id = ?", (ticket_id,))
        await query.edit_message_text(f"❌ **Тикет #{ticket_id} ЗАКРЫТ!**\n{log_message}")

    # 4. Закрытие без действий
    elif action == 'close':
        db_query("UPDATE moderation_tickets SET status = 'closed' WHERE id = ?", (ticket_id,))
        await query.edit_message_text(f"Тикет #{ticket_id} закрыт без изменений.")


# --- 3. Запуск Административного Бота ---

def main_admin():
    """Запуск административного бота."""
    application = Application.builder().token(ADMIN_BOT_TOKEN).build()
    
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("tickets", view_tickets))
    application.add_handler(CallbackQueryHandler(moderation_callback, pattern='^mod_'))

    print(f"Административный бот {PROJECT_NAME} запущен и готов к модерации...")
    try:
        application.run_polling(allowed_updates=Update.ALL_TYPES)
    except telegram.error.InvalidToken as e:
        print(f"Критическая ошибка: Неверный токен административного бота. Пожалуйста, проверьте config.py. Детали: {e}")

if __name__ == '__main__':
    # Эта часть будет выполнена только если запустить admin_bot.py напрямую
    # Если вы запускаете main.py, то этот код не выполняется.
    main_admin()