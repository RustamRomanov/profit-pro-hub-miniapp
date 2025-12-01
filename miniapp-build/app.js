// app.js
document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();

    // --- ДАННЫЕ ПОЛЬЗОВАТЕЛЯ (MVP, потом заменим на реальные из бэка) ---
    const username =
        tg.initDataUnsafe.user?.username ||
        tg.initDataUnsafe.user?.first_name ||
        'Пользователь';
    const userId = tg.initDataUnsafe.user?.id || 12345;

    const BOT_USERNAME = '@ProfitProHub_bot';

    let currentUserData = {
        id: userId,
        name: username,
        age: 25,
        gender: 'M',
        country: 'Россия',
        balance: 50.75,          // основной баланс
        pending_balance: 15.0,   // в Эскроу
        rating: 4.85,
        tasks_completed: 154,
        isFilled: true,
        isAgreementAccepted: true,   // соглашение заказчика
        isTermsAccepted: false,      // пользовательское соглашение (вкладка Профиль)
        language: 'ru'               // ru / en
    };

    const FORBIDDEN_WORDS = ['мат', 'агрессия', 'порно', 'наркотики', 'мошенничество'];

    // --- MOCK: Список доступных заданий ---
    let workerAvailableTasks = [
        {
            id: 1,
            title: 'Подписка: VIP-канал о финансах',
            price: 1.5,
            slots: 100,
            type: 'subscribe',
            link: 'https://t.me/example_channel_vip',
            description: 'Подписаться на VIP-канал. Не отписываться минимум 7 дней.',
            customer_id: 54321
        },
        {
            id: 2,
            title: 'Комментарий: отзыв о продукте',
            price: 0.8,
            slots: 50,
            type: 'comment',
            link: 'https://t.me/example_chat_review',
            description: 'Оставить осмысленный комментарий (минимум 15 слов) под постом.',
            customer_id: 88888
        },
        {
            id: 3,
            title: 'Просмотр: новая публикация',
            price: 0.3,
            slots: 300,
            type: 'view',
            link: 'https://t.me/example_post_view',
            description: 'Открыть и просмотреть публикацию до конца.',
            customer_id: 99999
        }
    ];

    // сортируем по цене (дорогие сверху)
    workerAvailableTasks.sort((a, b) => b.price - a.price);

    // --- MOCK: Активные задания Заказчика (для блока "Размещение рекламы" позже) ---
    let customerActiveTasks = [
        { id: 101, title: 'Подписка на канал', spent: 15.0, total: 50.0, percent: 30, status: 'Запущено' }
    ];

    // --- MOCK: История операций по балансу ---
    let transactionsHistory = [
        {
            id: 1,
            type: 'earn',
            label: 'Подписка на канал @finansy_pro',
            amount: 1.5,
            status: 'success',
            date: '01.12.2025 12:30'
        },
        {
            id: 2,
            type: 'earn',
            label: 'Просмотр публикации @news_daily',
            amount: 0.3,
            status: 'success',
            date: '01.12.2025 13:10'
        },
        {
            id: 3,
            type: 'fail',
            label: 'Отписка раньше 7 дней от @crypto_signals',
            amount: -1.2,
            status: 'failed',
            date: '30.11.2025 09:15'
        },
        {
            id: 4,
            type: 'withdraw',
            label: 'Вывод средств на кошелек',
            amount: -10.0,
            status: 'success',
            date: '29.11.2025 18:40'
        }
    ];

    let performedTaskIds = [];
    let selectedTask = null;

    // --- КОНТЕЙНЕРЫ ЭКРАНОВ ---
    const containers = {
        workerTasks: document.getElementById('worker-tasks-container'),
        taskDetails: document.getElementById('task-details-container'),
        createTask: document.getElementById('create-task-container'),
        balanceMenu: document.getElementById('balance-menu-container'),
        profile: document.getElementById('profile-container')
    };

    const tabItems = document.querySelectorAll('.tab-item');

    const COUNTRIES = [
        'Россия', 'Украина', 'Казахстан', 'Беларусь', 'Узбекистан', 'Армения',
        'Грузия', 'Азербайджан', 'Молдова', 'Кыргызстан', 'Таджикистан',
        'Туркменистан', 'Латвия', 'Литва', 'Эстония'
    ].sort();

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

    function getTaskColor(type) {
        switch (type) {
            case 'subscribe':
                return {
                    background: 'var(--subscribe-bg)',
                    border: '1px solid var(--subscribe-border)'
                };
            case 'comment':
                return {
                    background: 'var(--comment-bg)',
                    border: '1px solid var(--comment-border)'
                };
            case 'view':
                return {
                    background: 'var(--view-bg)',
                    border: '1px solid var(--view-border)'
                };
            default:
                return {
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-subtle)'
                };
        }
    }

    function loadUserData() {
        currentUserData.isFilled =
            !!(currentUserData.age > 0 && currentUserData.gender && currentUserData.country);
        workerAvailableTasks = workerAvailableTasks.filter(
            (task) => !performedTaskIds.includes(task.id)
        );
    }

    function renderGlobalHeader() {
        const headerBar = document.getElementById('global-header-bar');

        headerBar.innerHTML = `
            <div class="header-top-row">
                <div class="balance-info" onclick="handleBalanceClick()" style="cursor: pointer;">
                    Баланс:
                    <strong>${currentUserData.balance.toFixed(2)} ⭐️</strong>
                    <small>(Эскроу: ${currentUserData.pending_balance.toFixed(2)} ⭐️)</small>
                </div>
            </div>
            <div class="user-rating-row">
                <span>Вы: ${currentUserData.name}</span>
                <span class="rating-link" id="rating-link-header">
                    Рейтинг: ⭐️ ${currentUserData.rating.toFixed(2)}
                </span>
            </div>
        `;

        const ratingLink = document.getElementById('rating-link-header');
        if (ratingLink) {
            ratingLink.onclick = () => showRatingRules();
        }
    }

    function updateTabBarActive(targetName) {
        tabItems.forEach((item) => {
            const target = item.getAttribute('data-target');
            if (target === targetName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    function showContainer(name) {
        loadUserData();

        Object.values(containers).forEach((c) => (c.style.display = 'none'));
        if (containers[name]) containers[name].style.display = 'block';

        renderGlobalHeader();
        updateTabBarActive(name);
        tg.MainButton.hide();

        if (name === 'workerTasks') renderWorkerTasks();
        if (name === 'taskDetails') renderTaskDetails();
        if (name === 'createTask') renderCreateTask();
        if (name === 'balanceMenu') renderBalanceMenu();
        if (name === 'profile') renderProfile();
    }

    // Навешиваем табы (один раз)
    tabItems.forEach((item) => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            showContainer(target);
        });
    });

    // --- 1. СПИСОК ЗАДАНИЙ ---

    function renderWorkerTasks() {
        let html = `
            <div class="tasks-header-row">
                <h2>Задания</h2>
                <button id="btn-create-from-tasks" class="btn-primary btn-sm">
                    ➕ Создать задание
                </button>
            </div>
        `;

        if (workerAvailableTasks.length === 0) {
            html += `
                <div class="card">
                    <p>Новых заданий пока нет. Загляните позже.</p>
                </div>
            `;
        } else {
            workerAvailableTasks.forEach((task) => {
                const color = getTaskColor(task.type);

                const typeLabel =
                    task.type === 'subscribe'
                        ? 'Подписка на канал'
                        : task.type === 'comment'
                        ? 'Комментарий под постом'
                        : 'Просмотр публикации';

                html += `
                    <div class="task-item"
                         data-task-id="${task.id}"
                         data-task-type="${task.type}"
                         style="background:${color.background}; border:${color.border};">
                        <div class="task-main">
                            <div class="task-line-top">
                                <span class="task-price-pill">
                                    ⭐️ ${task.price.toFixed(2)}
                                </span>
                                <span class="task-type-label">
                                    ${typeLabel}
                                </span>
                            </div>
                            <div class="task-line-bottom">
                                <span class="task-slots">
                                    Осталось: ${task.slots} шт.
                                </span>
                            </div>
                        </div>
                        <div class="task-action">
                            <span class="task-action-text">Начать</span>
                        </div>
                    </div>
                `;
            });
        }

        containers.workerTasks.innerHTML = html;

        document
            .getElementById('btn-create-from-tasks')
            .addEventListener('click', () => showContainer('createTask'));

        document.querySelectorAll('.task-item').forEach((item) => {
            item.onclick = handleTaskClick;
        });
    }

    function handleTaskClick(e) {
        const itemId = parseInt(e.currentTarget.dataset.taskId, 10);
        const itemType = e.currentTarget.dataset.taskType;
        selectedTask = workerAvailableTasks.find((t) => t.id === itemId);

        if (!currentUserData.isFilled) {
            showModal('profile-form-modal');
            return;
        }

        if (!selectedTask) return;

        if (itemType === 'subscribe' || itemType === 'view') {
            tg.showConfirm('Начать выполнение этого задания?', (ok) => {
                if (ok) handleTaskExecute(selectedTask.id);
            });
            return;
        }

        if (itemType === 'comment') {
            renderCommentModal();
            showModal('comment-modal');
            return;
        }

        showContainer('taskDetails');
    }

    function renderTaskDetails() {
        if (!selectedTask) {
            showContainer('workerTasks');
            return;
        }

        const color = getTaskColor(selectedTask.type);

        const typeLabel =
            selectedTask.type === 'subscribe'
                ? 'Подписка на канал'
                : selectedTask.type === 'comment'
                ? 'Комментарий под постом'
                : 'Просмотр публикации';

        containers.taskDetails.innerHTML = `
            <h2>${typeLabel}</h2>
            <div class="card" style="background:${color.background}; border:${color.border};">
                <p><strong>Цена:</strong> ⭐️ ${selectedTask.price.toFixed(2)}</p>
                <p><strong>Осталось слотов:</strong> ${selectedTask.slots}</p>
            </div>
            <div class="card">
                <h3>Описание</h3>
                <p>${selectedTask.description || 'Описание отсутствует.'}</p>
            </div>
            <div class="card">
                <h3>Условия</h3>
                <ul>
                    <li>Выполните действие строго по инструкции.</li>
                    <li>Не удаляйте подписку/комментарий минимум 7 дней.</li>
                    <li>Проверка выполняется автоматически админ-ботом.</li>
                </ul>
            </div>
            <button id="btn-execute-task" class="btn-primary">Начать выполнение</button>
            <button id="btn-back-tasks" class="btn-secondary">Назад к заданиям</button>
            <button id="btn-report-task"
                class="btn-secondary btn-danger-outline">
                🚨 Пожаловаться на задание
            </button>
        `;

        document.getElementById('btn-execute-task').onclick = () =>
            handleTaskExecute(selectedTask.id);
        document.getElementById('btn-back-tasks').onclick = () =>
            showContainer('workerTasks');
        document.getElementById('btn-report-task').onclick = () =>
            showModal('report-modal');

        tg.MainButton.setText(`Начать за ${selectedTask.price.toFixed(2)} ⭐️`);
        tg.MainButton.show();
        tg.MainButton.onClick(() => handleTaskExecute(selectedTask.id));
        tg.MainButton.enable();
    }

    function handleTaskExecute(taskId) {
        const task = workerAvailableTasks.find((t) => t.id === taskId);
        if (!task) return;

        tg.sendData(
            JSON.stringify({
                action: 'start_perform_task',
                taskId: task.id,
                taskLink: task.link,
                price: task.price,
                taskType: task.type
            })
        );

        tg.showAlert('Вы будете перенаправлены к заданию. Нажмите ОК и выполните действие.');
        tg.openTelegramLink(task.link);

        selectedTask = null;
        tg.MainButton.hide();
        performedTaskIds.push(task.id);
        workerAvailableTasks = workerAvailableTasks.filter((t) => t.id !== task.id);
        showContainer('workerTasks');
    }

    // --- ЖАЛОБА НА ЗАДАНИЕ ---

    function handleReportUser() {
        const message = document.getElementById('report-message').value;
        const type = document.getElementById('report-type').value;

        if (!selectedTask || !message) {
            tg.showAlert('Ошибка: нет выбранного задания или текста жалобы.');
            return;
        }

        tg.sendData(
            JSON.stringify({
                action: 'create_ticket',
                type,
                taskId: selectedTask.id,
                subjectId: selectedTask.customer_id,
                message
            })
        );

        hideModal('report-modal');
        tg.showAlert(
            `Жалоба на задание #${selectedTask.id} отправлена модератору. Спасибо за помощь!`
        );
    }

    function renderReportModal() {
        if (!selectedTask) return hideModal('report-modal');

        document.getElementById('report-modal-content').innerHTML = `
            <h3>Жалоба на задание #${selectedTask.id}</h3>
            <p class="muted-text">
                Опишите проблему, чтобы модератор смог быстро разобраться.
            </p>
            <label for="report-type">Тип проблемы:</label>
            <select id="report-type">
                <option value="task_dispute">Спор по выполнению</option>
                <option value="ad_violation">Запрещённый контент</option>
                <option value="broken_link">Неработающая ссылка</option>
            </select>
            <label for="report-message">Комментарий модератору:</label>
            <textarea id="report-message"
                placeholder="Например: ссылка ведёт не туда или задание нарушает правила."></textarea>
            <button id="modal-send-report" class="btn-primary btn-danger">
                Отправить жалобу
            </button>
            <button onclick="hideModal('report-modal')" class="btn-secondary">
                Отмена
            </button>
        `;

        document.getElementById('modal-send-report').onclick = handleReportUser;
    }

    // --- МОДАЛКА ДЛЯ КОММЕНТАРИЕВ ---

    function renderCommentModal() {
        if (!selectedTask || selectedTask.type !== 'comment')
            return hideModal('comment-modal');

        const task = selectedTask;

        document.getElementById('comment-modal-content').innerHTML = `
            <h3>Инструкция по комментарию</h3>
            <div class="card card-soft">
                <p><strong>Задание:</strong> ${task.title}</p>
                <p><strong>Награда:</strong> ⭐️ ${task.price.toFixed(2)}</p>
                <p>${task.description}</p>
            </div>
            <p class="muted-text">
                Нажмите «Перейти», оставьте комментарий по условиям задания,
                затем вернитесь в мини-приложение — система автоматически зарегистрирует выполнение.
            </p>
            <button id="modal-start-comment" class="btn-primary">
                Перейти к публикации
            </button>
            <button onclick="hideModal('comment-modal')" class="btn-secondary">
                Отмена
            </button>
        `;

        document.getElementById('modal-start-comment').onclick = () => {
            hideModal('comment-modal');
            handleTaskExecute(task.id);
        };
    }

    // --- 2. СОЗДАНИЕ ЗАДАНИЯ ---

    function renderCreateTask() {
        tg.MainButton.hide();

        const ageOptionsMin = generateOptions(16, 99, 18);
        const ageOptionsMax = generateOptions(16, 99, 60);
        const countryOptions = generateCountryOptions(COUNTRIES, 'ALL');

        containers.createTask.innerHTML = `
            <h2>Создать задание</h2>
            <div class="card">
                <div class="inline-info">
                    <div>
                        <div class="form-section-title">Админ-бот</div>
                        <p class="muted-text">
                            Для проверки выполнения задания бот
                            <span class="link-inline" id="admin-bot-inline">${BOT_USERNAME}</span>
                            должен быть администратором в продвигаемом канале/чате.
                        </p>
                    </div>
                </div>

                <label for="task-type">Тип задания:</label>
                <select id="task-type">
                    <option value="subscribe" selected>Подписка на канал</option>
                    <option value="view">Просмотр публикации</option>
                    <option value="comment">Комментарий под публикацией</option>
                </select>

                <label for="task-link">Ссылка на канал/чат/пост:</label>
                <input type="text" id="task-link"
                    placeholder="Например: @mychannel или https://t.me/..." />

                <label for="task-title">Название задания:</label>
                <input type="text" id="task-title" placeholder="Короткое описание задания" />

                <label for="task-description">Описание задания:</label>
                <textarea id="task-description"
                    placeholder="Подробно объясните, что должен сделать исполнитель."></textarea>

                <div class="form-section-title">Целевая аудитория</div>

                <label>Возраст:</label>
                <div class="scroll-input-group">
                    <div>
                        <small class="muted-text">От</small>
                        <select id="age-min">${ageOptionsMin}</select>
                    </div>
                    <div>
                        <small class="muted-text">До</small>
                        <select id="age-max">${ageOptionsMax}</select>
                    </div>
                </div>

                <label>Пол:</label>
                <div class="inline-checkboxes">
                    <label><input type="checkbox" id="gender-m" checked /> Мужской</label>
                    <label><input type="checkbox" id="gender-f" checked /> Женский</label>
                </div>

                <label for="country-select">Страна:</label>
                <select id="country-select">
                    <option value="ALL" selected>Все страны</option>
                    ${countryOptions}
                </select>

                <div class="form-section-title">Оплата</div>
                <div class="scroll-input-group">
                    <div>
                        <label for="task-price">Стоимость (за 1 выполнение, в ⭐️):</label>
                        <input type="number" id="task-price" placeholder="0.50" min="0.05" step="0.01" />
                    </div>
                    <div>
                        <label for="task-count">Количество выполнений:</label>
                        <input type="number" id="task-count" placeholder="100" min="10" step="1" />
                    </div>
                </div>

                <div class="total-row">
                    <span class="muted-text">Итого бюджет:</span>
                    <span id="total-cost" class="total-cost">0.00 ⭐️</span>
                </div>

                <div class="admin-bot-check-row">
                    <input type="checkbox" id="is-admin-check" />
                    <label for="is-admin-check">
                        Я установил(а)
                        <span class="link-inline" id="admin-bot-inline-2">админ-бота</span>
                        в этот канал/чат
                    </label>
                </div>

                <p class="muted-text">
                    При размещении задания система автоматически проверит наличие админ-бота.
                    При отсутствии бота задание не будет запущено.
                </p>
            </div>
        `;

        document.getElementById('admin-bot-inline').onclick = () =>
            showModal('admin-bot-modal');
        document.getElementById('admin-bot-inline-2').onclick = () =>
            showModal('admin-bot-modal');

        const priceInput = document.getElementById('task-price');
        const countInput = document.getElementById('task-count');
        const totalCostElement = document.getElementById('total-cost');

        function calculateTotal() {
            const price = parseFloat(priceInput.value) || 0;
            const count = parseInt(countInput.value, 10) || 0;
            const total = price * count;
            totalCostElement.textContent = `${total.toFixed(2)} ⭐️`;
        }

        priceInput.addEventListener('input', calculateTotal);
        countInput.addEventListener('input', calculateTotal);

        calculateTotal();

        tg.MainButton.setText('Разместить задание и списать бюджет');
        tg.MainButton.show();
        tg.MainButton.onClick(sendTaskData);
        tg.MainButton.enable();
    }

    function sendTaskData() {
        const type = document.getElementById('task-type').value;
        const title = document.getElementById('task-title').value.trim();
        const description = document.getElementById('task-description').value.trim();
        const link = document.getElementById('task-link').value.trim();
        const price = parseFloat(document.getElementById('task-price').value);
        const count = parseInt(document.getElementById('task-count').value, 10);
        const isAdminChecked = document.getElementById('is-admin-check').checked;

        const totalCost = (price || 0) * (count || 0);

        if (!type || !title || !description || !link || !price || !count) {
            tg.showAlert('Пожалуйста, заполните все поля задания.');
            return;
        }

        if (price < 0.05 || count < 10) {
            tg.showAlert('Минимальная цена — 0.05 ⭐️, минимум 10 выполнений.');
            return;
        }

        if (totalCost > currentUserData.balance) {
            tg.showAlert(
                `Недостаточно средств. Требуется ${totalCost.toFixed(
                    2
                )} ⭐️, у вас ${currentUserData.balance.toFixed(2)} ⭐️.`
            );
            return;
        }

        const isForbidden = FORBIDDEN_WORDS.some((w) =>
            (title + ' ' + description).toLowerCase().includes(w)
        );
        if (isForbidden) {
            tg.showAlert(
                'Задание содержит запрещённые слова. Оно отправлено на модерацию и не будет запущено автоматически.'
            );
            tg.sendData(
                JSON.stringify({
                    action: 'create_ticket',
                    type: 'admin_flag',
                    taskId: -1,
                    subjectId: currentUserData.id,
                    message: `Попытка создать задание с запрещённым контентом: "${title}"`
                })
            );
            showContainer('workerTasks');
            return;
        }

        if (!isAdminChecked) {
            tg.showAlert('Подтвердите, что админ-бот установлен в продвигаемый канал/чат.');
            return;
        }

        tg.sendData(
            JSON.stringify({
                action: 'create_task',
                taskType: type,
                title,
                description,
                link,
                price,
                count,
                total: totalCost,
                status: 'Запущено'
            })
        );

        currentUserData.balance -= totalCost;
        currentUserData.pending_balance += totalCost;

        customerActiveTasks.unshift({
            id: Date.now(),
            title,
            spent: 0.0,
            total: totalCost,
            percent: 0,
            status: 'Запущено'
        });

        workerAvailableTasks.unshift({
            id: Date.now(),
            title,
            price,
            slots: count,
            type,
            description,
            link,
            customer_id: currentUserData.id
        });
        workerAvailableTasks.sort((a, b) => b.price - a.price);

        tg.showAlert('Задание создано и запущено. Бюджет переведён в Эскроу.');
        tg.MainButton.hide();
        showContainer('workerTasks');
    }

    // --- 3. ПРОФИЛЬ ---

    function renderProfile() {
        tg.MainButton.hide();

        const profile = currentUserData;

        containers.profile.innerHTML = `
            <h2>Профиль</h2>
            <div class="card">
                <p>Ваш ID: <strong>${profile.id}</strong></p>
                <p>Выполнено заданий: <strong>${profile.tasks_completed}</strong></p>
                <p>Рейтинг: ⭐️ ${profile.rating.toFixed(2)}</p>

                <label for="language-select">Язык интерфейса:</label>
                <select id="language-select">
                    <option value="ru" ${profile.language === 'ru' ? 'selected' : ''}>Русский</option>
                    <option value="en" ${profile.language === 'en' ? 'selected' : ''}>English</option>
                </select>

                <p class="muted-text" style="margin-top:10px;">
                    <span id="terms-link" class="link-inline">
                        Пользовательское соглашение
                    </span>
                    — правила для исполнителей и заказчиков.
                </p>
                ${
                    profile.isTermsAccepted
                        ? '<p class="muted-text success-text">Вы приняли пользовательское соглашение.</p>'
                        : '<p class="muted-text warning-text">Вы ещё не приняли пользовательское соглашение.</p>'
                }
            </div>

            <h3>О боте</h3>
            <div class="card">
                ${
                    profile.isTermsAccepted
                        ? `
                        <p>
                            Profit Pro Hub — мини-приложение в Telegram, которое помогает исполнителям
                            зарабатывать на выполнении заданий, а заказчикам продвигать свои каналы и чаты за счёт живой аудитории.
                        </p>
                        <ul>
                            <li>Исполнители получают ⭐️ за подписки, просмотры и комментарии.</li>
                            <li>Заказчики настраивают задания и контролируют бюджет через Эскроу.</li>
                            <li>Админ-бот автоматически проверяет выполнение и защищает от накрутки.</li>
                        </ul>
                    `
                        : `
                        <p class="muted-text">
                            Примите пользовательское соглашение, чтобы увидеть подробную информацию
                            о возможностях бота и начать полноценно пользоваться сервисом.
                        </p>
                    `
                }
            </div>
        `;

        document.getElementById('terms-link').onclick = () =>
            showModal('terms-modal');

        document.getElementById('language-select').onchange = (e) => {
            currentUserData.language = e.target.value;
            tg.showAlert(
                currentUserData.language === 'ru'
                    ? 'Язык переключен на русский (MVP — основной язык).'
                    : 'Language switched to English (UI texts will be expanded later).'
            );
        };
    }

    // --- 4. БАЛАНС ---

    function renderBalanceMenu() {
        tg.MainButton.hide();

        let historyHtml = '';

        if (!transactionsHistory.length) {
            historyHtml = `
                <div class="card">
                    <p>История операций пока пуста.</p>
                </div>
            `;
        } else {
            historyHtml = `
                <div class="transactions-list">
                    ${transactionsHistory
                        .map((tx) => {
                            const sign = tx.amount > 0 ? '+' : '';
                            const cls =
                                tx.status === 'failed'
                                    ? 'tx-item tx-failed'
                                    : 'tx-item';
                            const typeLabel =
                                tx.type === 'earn'
                                    ? 'Заработок'
                                    : tx.type === 'withdraw'
                                    ? 'Вывод'
                                    : 'Операция';
                            return `
                                <div class="${cls}">
                                    <div class="tx-main-row">
                                        <span class="tx-label">${tx.label}</span>
                                        <span class="tx-amount">
                                            ${sign}${tx.amount.toFixed(2)} ⭐️
                                        </span>
                                    </div>
                                    <div class="tx-sub-row">
                                        <span class="tx-type">${typeLabel}</span>
                                        <span class="tx-date">${tx.date}</span>
                                    </div>
                                    ${
                                        tx.status === 'failed'
                                            ? '<div class="tx-status">Не засчитано</div>'
                                            : ''
                                    }
                                </div>
                            `;
                        })
                        .join('')}
                </div>
            `;
        }

        containers.balanceMenu.innerHTML = `
            <h2>Баланс</h2>
            <div class="card">
                <p>Основной баланс: <strong>${currentUserData.balance.toFixed(
                    2
                )} ⭐️</strong></p>
                <p class="muted-text">
                    В Эскроу: ${currentUserData.pending_balance.toFixed(
                        2
                    )} ⭐️ (ожидают проверки и начисления).
                </p>
            </div>

            <h3>Операции</h3>
            ${historyHtml}
        `;
    }

    // --- 5. МОДАЛКИ, ПРОФИЛЬ И СОГЛАШЕНИЯ ---

    function generateOptions(start, end, selected = null) {
        let options = '';
        for (let i = start; i <= end; i++) {
            options += `<option value="${i}" ${
                i === selected ? 'selected' : ''
            }>${i}</option>`;
        }
        return options;
    }

    function generateCountryOptions(countries, selected = null) {
        let options = '';
        countries.forEach((c) => {
            options += `<option value="${c}" ${
                selected === c ? 'selected' : ''
            }>${c}</option>`;
        });
        return options;
    }

    function showModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = 'flex';

        if (id === 'profile-form-modal') renderProfileFormModal();
        if (id === 'report-modal') renderReportModal();
    }

    function hideModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = 'none';
    }

    function renderProfileFormModal() {
        const ageOptions = generateOptions(16, 99, currentUserData.age || 25);
        const countryOptions = generateCountryOptions(
            COUNTRIES,
            currentUserData.country || 'Россия'
        );

        document.getElementById('profile-form-modal-content').innerHTML = `
            <h3>Анкета исполнителя</h3>
            <p class="muted-text">
                Укажите базовые данные, чтобы получать более точные задания.
            </p>
            <label for="modal-age">Возраст:</label>
            <select id="modal-age">${ageOptions}</select>

            <label for="modal-gender">Пол:</label>
            <select id="modal-gender">
                <option value="M" ${
                    currentUserData.gender === 'M' ? 'selected' : ''
                }>Мужской</option>
                <option value="F" ${
                    currentUserData.gender === 'F' ? 'selected' : ''
                }>Женский</option>
            </select>

            <label for="modal-country">Страна:</label>
            <select id="modal-country">
                ${countryOptions}
            </select>

            <button id="modal-save-profile" class="btn-primary">
                Сохранить и продолжить
            </button>
        `;

        document.getElementById('modal-save-profile').onclick =
            saveProfileFromModal;
    }

    function saveProfileFromModal() {
        const age = parseInt(document.getElementById('modal-age').value, 10);
        const gender = document.getElementById('modal-gender').value;
        const country = document.getElementById('modal-country').value;

        if (!age || !gender || !country) {
            tg.showAlert('Пожалуйста, заполните все поля.');
            return;
        }

        currentUserData.age = age;
        currentUserData.gender = gender;
        currentUserData.country = country;
        currentUserData.isFilled = true;

        tg.sendData(
            JSON.stringify({
                action: 'save_profile',
                age,
                gender,
                country
            })
        );

        hideModal('profile-form-modal');
        tg.showAlert('Профиль сохранён. Теперь вы можете выполнять задания.');
        showContainer('workerTasks');
    }

    // соглашение заказчика (как раньше)
    document.getElementById('modal-accept-agreement').onclick = () => {
        currentUserData.isAgreementAccepted = true;
        tg.sendData(JSON.stringify({ action: 'accept_agreement' }));
        hideModal('agreement-modal');
        showContainer('createTask');
    };
    document.getElementById('modal-cancel-agreement').onclick = () => {
        hideModal('agreement-modal');
        showContainer('workerTasks');
    };

    // пользовательское соглашение (Профиль)
    document.getElementById('modal-accept-terms').onclick = () => {
        currentUserData.isTermsAccepted = true;
        hideModal('terms-modal');
        tg.showAlert('Спасибо! Вы приняли пользовательское соглашение.');
        renderProfile();
    };
    document.getElementById('modal-close-terms').onclick = () =>
        hideModal('terms-modal');

    // модалка "правила рейтинга"
    document.getElementById('modal-close-rating').onclick = () =>
        hideModal('rating-rules-modal');

    function showRatingRules() {
        showModal('rating-rules-modal');
    }

    // модалка "админ-бот"
    document.getElementById('modal-close-admin-bot').onclick = () =>
        hideModal('admin-bot-modal');
    document.getElementById('modal-copy-botname').onclick = () => {
        navigator.clipboard
            .writeText(BOT_USERNAME)
            .then(() => {
                tg.showAlert(`Имя бота ${BOT_USERNAME} скопировано в буфер обмена.`);
            })
            .catch(() => {
                tg.showAlert('Не удалось скопировать. Скопируйте имя вручную.');
            });
    };

    // --- ГЛОБАЛЬНАЯ ФУНКЦИЯ ДЛЯ КЛИКА ПО БАЛАНСУ В ХЕДЕРЕ ---
    window.handleBalanceClick = function () {
        showContainer('balanceMenu');
    };

    // --- СТАРТ ---
    loadUserData();
    showContainer('workerTasks');
});
