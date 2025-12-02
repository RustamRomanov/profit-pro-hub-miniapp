// app.js
document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg) {
        tg.ready();
        // РЕКОМЕНДАЦИЯ: Включаем tg.expand() для лучшего UX
        tg.expand();
    }

    // === Вспомогательные ===
    const BOT_USERNAME = '@lookgroup_bot'; // Используем новый ник админ-бота

    const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user
        ? tg.initDataUnsafe.user
        : { id: 12345, username: 'User' };

    // Мок-данные пользователя (в реале должны загружаться из БД)
    let currentUserData = {
        id: user.id,
        name: user.username || user.first_name || 'Пользователь',
        age: 25,
        gender: 'M',
        country: 'Россия',
        balance: 50.75,
        pending_balance: 15.0,
        tasks_completed: 154,
        isFilled: true,
        isAgreementAccepted: true, // Это поле будет управляться логикой accept_agreement
        isTermsAccepted: false // Это поле в БД не используется, но мы используем его для логики фронтенда
    };
    
    // Новое поле для "Готово к выводу"
    const withdrawableBalance = currentUserData.balance - currentUserData.pending_balance;
    if (withdrawableBalance < 0) currentUserData.withdrawable_balance = 0;
    else currentUserData.withdrawable_balance = withdrawableBalance;


    const FORBIDDEN_WORDS = ['мат', 'агрессия', 'порно', 'наркотики', 'мошенничество'];

    const COUNTRIES = [
        'Россия', 'Беларусь', 'Казахстан', 'Украина', 'Узбекистан', 'Киргизия',
        'Таджикистан', 'Грузия', 'Армения', 'Азербайджан', 'Молдова'
    ];

    // Моки задач исполнителя
    let mockTasks = [
        {
            id: 1,
            type: 'subscribe', // подписка
            title: 'Подписаться на новостной канал',
            description: 'Подпишитесь на наш канал о технологиях.',
            reward: 0.5,
            available: 500,
            status: 'available',
            link: 'https://t.me/example_channel_1',
            isNew: true
        },
        {
            id: 2,
            type: 'comment',
            title: 'Оставить осмысленный комментарий',
            description: 'Напишите осмысленный комментарий под постом.',
            reward: 0.85,
            available: 150,
            status: 'available',
            link: 'https://t.me/example_post_1',
            isNew: false
        },
        {
            id: 3,
            type: 'view',
            title: 'Посмотреть ролик до конца',
            description: 'Посмотрите видео до конца, не перематывая.',
            reward: 0.3,
            available: 300,
            status: 'available',
            link: 'https://t.me/example_video_1',
            isNew: false
        }
    ];

    // Моки задач создателя (на модерации)
    let mockOwnerTasks = [
        {
            id: 101,
            type: 'subscribe',
            title: 'Моя задача: Подписка (На модерации)',
            description: 'Тестовая задача, созданная мной, ожидает проверки.',
            reward: 0.75,
            available: 100,
            status: 'moderation',
            link: 'https://t.me/my_channel'
        }
    ];

    // Моки транзакций
    let mockTransactions = [
        {
            id: 1,
            type: 'task',
            description: 'Задание #123 (7-дней Эскроу)',
            date: '2025-10-20',
            amount: -10.00,
            status: 'pending'
        },
        {
            id: 2,
            type: 'task',
            description: 'Задание #456: Подписка',
            date: '2025-10-18',
            amount: 0.50,
            status: 'completed'
        },
        {
            id: 3,
            type: 'deposit',
            description: 'Пополнение через Payeer',
            date: '2025-10-15',
            amount: 100.00,
            status: 'completed'
        },
        {
            id: 4,
            type: 'withdraw',
            description: 'Вывод на Qiwi',
            date: '2025-10-12',
            amount: -25.00,
            status: 'completed'
        }
    ];

    // Подсчет количества доступных задач
    const availableTasksCount = mockTasks.reduce((acc, task) => acc + (task.available || 0), 0);

    // Текущий экран
    let currentScreen = 'worker-tasks-container';
    let currentTask = null;

    // === Утилиты DOM ===
    const getEl = (id) => document.getElementById(id);
    const qs = (selector) => document.querySelector(selector);

    // Удобная функция для переключения экранов
    const setScreen = (screenId) => {
        currentScreen = screenId;
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.toggle('active', screen.id === screenId);
        });

        // Скрываем/показываем нижнее меню в зависимости от экрана
        const bottomNav = getEl('bottom-nav-bar');
        if (!bottomNav) return;

        // Нижнее меню прячем только для экранов подробностей и создания задачи
        if (screenId === 'task-details-container' || screenId === 'create-task-container') {
            bottomNav.style.display = 'none';
        } else {
            bottomNav.style.display = 'flex';
        }

        // Обновляем навигацию (активное состояние)
        renderBottomNav();
    };

    // Усекаем длинные имена
    const truncateName = (name) => {
        if (!name) return '';
        if (name.length > 10) {
            return name.substring(0, 8) + '...';
        }
        return name;
    };

    // 1. Рендеринг Нижней Навигации (Bottom Bar)
    const renderBottomNav = () => {
        const nav = getEl('bottom-nav-bar');
        if (!nav) return;

        const navItems = [
            { id: 'worker-tasks-container', icon: 'tasks', text: 'Задания', screen: 'worker-tasks-container' },
            {
                id: 'balance-menu-container',
                icon: 'wallet',
                text: 'Баланс',
                screen: 'balance-menu-container',
                // Если баланс больше нуля — показываем сумму вместо иконки
                showBalanceInsteadOfIcon: currentUserData.balance > 0,
                balanceText: currentUserData.balance.toFixed(2)
            },
            {
                id: 'profile-menu-container',
                icon: 'user',
                text: 'Профиль',
                screen: 'profile-menu-container',
                // Имя пользователя внизу не показываем
                badge: null
            },
        ];

        nav.innerHTML = navItems.map((item) => {
            const isBalanceAmount = item.id === 'balance-menu-container' && item.showBalanceInsteadOfIcon;

            const iconHtml = isBalanceAmount
                ? `<div class="nav-balance-amount">${item.balanceText}</div>`
                : `<i class="icon-${item.icon}"></i>`;

            const badgeHtml = item.badge
                ? `<span class="nav-badge">${item.badge}</span>`
                : '';

            return `
                <div
                    class="nav-item ${currentScreen === item.id ? 'active' : ''}"
                    data-screen="${item.screen}"
                >
                    ${iconHtml}
                    <div class="nav-text-container">
                        <span class="nav-text">${item.text}</span>
                        ${badgeHtml}
                    </div>
                </div>
            `;
        }).join('');

        nav.querySelectorAll('.nav-item').forEach(item => {
            item.onclick = () => {
                const screenId = item.getAttribute('data-screen');
                setScreen(screenId);
                // Отдельный рендеринг для экранов, требующих обновления контента
                if (screenId === 'balance-menu-container') renderBalanceMenu();
                if (screenId === 'profile-menu-container') renderProfile();
                if (screenId === 'worker-tasks-container') renderWorkerTasks();
            };
        });
    };

    // 2. Рендеринг Хедера
    const renderGlobalHeader = (title = '') => {
        const header = getEl('global-header');
        if (!header) return;

        let backButtonHtml = '';
        const isMainScreen = currentScreen === 'worker-tasks-container';

        if (!isMainScreen) {
            backButtonHtml = `
                <button id="back-to-tasks" class="back-button">
                    <i class="icon-arrow-left"></i>
                </button>
            `;
        }

        // На главном экране (worker-tasks-container) заголовок должен быть убран.
        // На экранах task-details и create-task заголовок должен быть убран.
        // Оставим заголовок только для Баланса и Профиля, и только если не на главном экране.
        let headerTitleHtml = '';
        if (currentScreen === 'balance-menu-container' || currentScreen === 'profile-menu-container') {
             headerTitleHtml = `<h1 class="header-title">${title}</h1>`;
        } else if (currentScreen === 'worker-tasks-container') {
             headerTitleHtml = ''; // Главный экран пустой
        } else {
             headerTitleHtml = `<h1 class="header-title" style="display: none;">${title}</h1>`; // Скрываем, как просили
        }

        header.innerHTML = `
            ${headerTitleHtml}
            ${backButtonHtml}
        `;

        if (!isMainScreen) {
            const backButton = getEl('back-to-tasks');
            if (backButton) {
                backButton.onclick = () => {
                    setScreen('worker-tasks-container');
                    renderGlobalHeader('');
                    if (tg && tg.BackButton) tg.BackButton.hide();
                };
            }

            if (tg && tg.BackButton) {
                tg.BackButton.show();
                tg.BackButton.onClick(() => {
                    setScreen('worker-tasks-container');
                    renderGlobalHeader('');
                    tg.BackButton.hide();
                });
            }
        } else {
            if (tg && tg.BackButton) tg.BackButton.hide();
        }
    };

    // 3. Рендеринг Карточки Задания
    const renderTaskCard = (task) => {
        const typeClass = task.type === 'subscribe' ? 'subscribe' : task.type === 'comment' ? 'comment' : 'view';

        // Для заданий создателя на модерации оставляем текущий вид
        if (task.status === 'moderation') {
            return `
                 <div class="task-card moderation-card" data-task-id="${task.id}">
                    <div class="task-info">
                        <span class="task-type-badge moderation-badge">На модерации</span>
                        <h4 class="task-title">${task.title}</h4>
                        <p class="task-description">${task.description}</p>
                    </div>
                    <div class="task-action">
                        <span class="status-badge">Ожидает запуска</span>
                    </div>
                </div>
            `;
        }

        // Текст и иконка типа задания
        let typeText = '';
        let typeIcon = '';

        if (task.type === 'subscribe') {
            typeText = 'Подписка';
            typeIcon = '🔔';
        } else if (task.type === 'comment') {
            typeText = 'Комментарий';
            typeIcon = '💬';
        } else {
            typeText = 'Просмотр';
            typeIcon = '👁';
        }

        // Кнопка с наградой
        const startButton = `
            <button class="task-start-button ${typeClass}" data-task-id="${task.id}">
                Награда <span class="cost-badge">${task.reward} ⭐</span>
            </button>
        `;

        return `
            <div class="task-card ${typeClass} ${task.isNew ? 'new-task' : ''}" data-task-id="${task.id}">
                <div class="task-info">
                    <span class="task-type-badge ${typeClass}">${typeIcon} ${typeText}</span>
                    <h4 class="task-title">${task.title}</h4>
                    <div class="task-meta">
                        <span class="task-meta-item">Осталось: ${task.available}</span>
                    </div>
                </div>
                <div class="task-action">
                    ${startButton}
                </div>
            </div>
        `;
    };

    // 4. Рендеринг Деталей Задания (С ИНТЕГРАЦИЕЙ start_perform_task)
    const renderTaskDetails = (task) => {
        // Заголовок в хедере убран согласно запросу (renderGlobalHeader)
        setScreen('task-details-container');
        
        const container = getEl('task-details-container');
        const typeText = task.type === 'subscribe' ? 'Подписка' : task.type === 'comment' ? 'Комментарий' : 'Просмотр';
        const typeClass = task.type === 'subscribe' ? 'subscribe' : task.type === 'comment' ? 'comment' : 'view';
        
        const costValue = task.reward;

        container.innerHTML = `
            <div class="screen-content-padding task-details-wrapper">
                <div class="task-details-card ${typeClass}">
                    <div class="task-header">
                        <h2 class="task-details-title-centered">${task.title}</h2>
                        <span class="task-type-badge ${typeClass}">${typeText}</span>
                    </div>
                    <div class="detail-row reward-row">
                        <span>Вознаграждение:</span>
                        <span class="reward-amount">${task.reward}</span>
                    </div>
                    <p class="task-details-description">${task.description}</p>

                    <a href="${task.link}" target="_blank" class="btn-secondary link-button">
                        Перейти по ссылке <i class="icon-external-link"></i>
                    </a>

                    <p class="verification-info">
                        Для проверки выполнения нажмите "Готово". Результат будет проверен автоматически.
                        Для заданий на подписку, оплата поступит на Эскроу и будет доступна через 7 дней.
                    </p>

                    <button id="btn-complete-task" class="btn-primary"
                        data-task-id="${task.id}" data-task-type="${task.type}" data-price="${costValue}">
                        Готово (Проверить выполнение)
                    </button>
                </div>
            </div>
        `;

        getEl('btn-complete-task').onclick = (e) => {
            const taskId = parseInt(e.currentTarget.getAttribute('data-task-id'));
            const taskType = e.currentTarget.getAttribute('data-task-type');
            const price = parseFloat(e.currentTarget.getAttribute('data-price'));
            
            // --- ИНТЕГРАЦИЯ: Отправка данных боту ---
            if (tg && tg.sendData) {
                tg.sendData(JSON.stringify({
                    action: 'start_perform_task',
                    taskId: taskId,
                    taskType: taskType,
                    price: price
                }));
                if (tg.showAlert) tg.showAlert('Задание отправлено на проверку! Бот пришлет ответ.');
            } else {
                if (tg.showAlert) tg.showAlert(`[Отладка] Задание #${taskId} отправлено на проверку!`);
            }
            // ------------------------------------------

            // Возврат на список заданий
            setScreen('worker-tasks-container');
            renderWorkerTasks();
            renderGlobalHeader('');
            if (tg && tg.BackButton) tg.BackButton.hide();
        };
    };

    // 5. Рендеринг Заданий
    const renderWorkerTasks = () => {
        // Заголовок 'Задания' убран с хедера
        setScreen('worker-tasks-container');
        
        const container = getEl('worker-tasks-container');
        
        // Блок "Создать задание"
        const createTaskButton = `
            <div class="create-task-block">
                <button id="btn-show-create-task" class="btn-primary create-task-button">
                    Создать задание
                </button>
            </div>
        `;
        
        // Блок с количеством заданий на рынке убран по ТЗ
        const taskMarketInfo = '';

        // Объединяем задачи пользователя на модерации и общие задачи
        // Показываем задачи создателя, только если они на модерации (т.е. в mockOwnerTasks)
        const allTasks = [...mockOwnerTasks.filter(t => t.status === 'moderation'), ...mockTasks];

        // Задания создателя (На модерации)
        const ownerTasksHtml = mockOwnerTasks.length > 0 ? `
            <div class="owner-tasks-section">
                <div class="tasks-list">
                    ${mockOwnerTasks.filter(t => t.status === 'moderation').map(task => renderTaskCard(task)).join('')}
                </div>
            </div>
        ` : '';

        // Основные задания
        const mainTasksHtml = mockTasks.map(task => renderTaskCard(task)).join('');
        
        container.innerHTML = `
            <div class="screen-content-padding">
                ${createTaskButton}
                <h3 class="section-title-tasks">Биржа заданий</h3>
                ${ownerTasksHtml}
                <div class="tasks-list">
                    ${mainTasksHtml}
                </div>
            </div>
        `;
        
        // Устанавливаем обработчики
        container.querySelectorAll('.task-start-button').forEach(button => {
            button.onclick = (e) => {
                const taskId = parseInt(e.currentTarget.getAttribute('data-task-id'));
                currentTask = mockTasks.find(t => t.id === taskId);
                renderTaskDetails(currentTask);
            };
        });

        // Обработчик для кнопки "Создать задание"
        const createTaskBtn = getEl('btn-show-create-task');
        if (createTaskBtn) {
            createTaskBtn.onclick = () => {
                setScreen('create-task-container');
                renderCreateTaskForm();
                renderGlobalHeader('Создать задание');
            };
        }
    };

    // 6. Рендеринг экрана создания задания
    const renderCreateTaskForm = () => {
        const container = getEl('create-task-container');
        if (!container) return;

        container.innerHTML = `
            <div class="screen-content-padding">
                <h2 class="section-title">Создать задание</h2>
                <form id="create-task-form" class="create-task-form">
                    <label class="form-label">
                        Тип задания
                        <select id="task-type" class="form-input">
                            <option value="subscribe">Подписка на канал</option>
                            <option value="comment">Комментарий к посту</option>
                            <option value="view">Просмотр контента</option>
                        </select>
                    </label>

                    <label class="form-label">
                        Название задания
                        <input id="task-title" type="text" class="form-input" placeholder="Например: Подписаться на канал о крипте" />
                    </label>

                    <label class="form-label">
                        Описание задания
                        <textarea id="task-description" class="form-input" placeholder="Опишите, что нужно сделать"></textarea>
                    </label>

                    <label class="form-label">
                        Ссылка
                        <input id="task-link" type="url" class="form-input" placeholder="https://t.me/..." />
                    </label>

                    <label class="form-label">
                        Награда за выполнение (звезд)
                        <input id="task-reward" type="number" min="0.01" step="0.01" class="form-input" placeholder="0.50" />
                    </label>

                    <label class="form-label">
                        Количество доступных выполнений
                        <input id="task-available" type="number" min="1" step="1" class="form-input" placeholder="100" />
                    </label>

                    <button type="submit" class="btn-primary">
                        Отправить на модерацию
                    </button>
                </form>
            </div>
        `;

        const form = getEl('create-task-form');
        form.onsubmit = (e) => {
            e.preventDefault();

            const type = getEl('task-type').value;
            const title = getEl('task-title').value.trim();
            const description = getEl('task-description').value.trim();
            const link = getEl('task-link').value.trim();
            const reward = parseFloat(getEl('task-reward').value);
            const available = parseInt(getEl('task-available').value);

            if (!title || !description || !link || !reward || !available) {
                if (tg && tg.showAlert) tg.showAlert('Пожалуйста, заполните все поля.');
                return;
            }

            // Отправляем данные в админ-бота
            if (tg && tg.sendData) {
                tg.sendData(JSON.stringify({
                    action: 'create_task',
                    type,
                    title,
                    description,
                    link,
                    reward,
                    available
                }));
                if (tg.showAlert) tg.showAlert('Задание отправлено на модерацию администратору.');
            } else {
                if (tg && tg.showAlert) tg.showAlert('[Отладка] Задание создано локально.');
            }

            // Добавляем задачу в mockOwnerTasks (локально, для наглядности)
            const newTaskId = mockOwnerTasks.length ? mockOwnerTasks[mockOwnerTasks.length - 1].id + 1 : 100;
            mockOwnerTasks.push({
                id: newTaskId,
                type,
                title,
                description,
                reward,
                available,
                status: 'moderation',
                link
            });

            setScreen('worker-tasks-container');
            renderWorkerTasks();
            renderGlobalHeader('');
        };
    };

    // 7. Рендеринг Баланса
    const renderBalanceMenu = () => {
        setScreen('balance-menu-container');

        const container = getEl('balance-menu-container');
        
        // Пересчитываем баланс для вывода
        const withdrawableBalance = currentUserData.balance - currentUserData.pending_balance;
        
        const transactionsHtml = mockTransactions.map(tx => {
            const isCompleted = tx.status === 'completed';
            const isFailed = tx.status === 'failed';
            const sign = tx.amount > 0 ? '+' : '';
            const statusText = isCompleted ? 'Завершено' : isFailed ? 'Отменено' : 'В Эскроу';
            const statusClass = isCompleted ? 'tx-completed' : isFailed ? 'tx-failed' : 'tx-pending';

            return `
                <div class="transaction-item ${statusClass}">
                    <div class="transaction-main">
                        <div class="transaction-icon">
                            <i class="icon-transaction"></i>
                        </div>
                        <div class="transaction-info">
                            <div class="transaction-description">${tx.description}</div>
                            <div class="transaction-meta">
                                <span class="transaction-status">${statusText}</span>
                                <span class="transaction-date">${tx.date}</span>
                            </div>
                        </div>
                    </div>
                    <div class="transaction-amount">
                        ${sign}${Math.abs(tx.amount).toFixed(2)} ⭐
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="screen-content-padding">
                <div class="balance-summary-card">
                    <div class="balance-row">
                        <span>Общий баланс:</span>
                        <span>${currentUserData.balance.toFixed(2)} ⭐</span>
                    </div>
                    <div class="balance-row">
                        <span>Ожидание поступлений (в Эскроу):</span>
                        <span>${currentUserData.pending_balance.toFixed(2)} ⭐</span>
                    </div>
                    <div class="balance-row ready">
                        <span>Готово к выводу:</span>
                        <span>${withdrawableBalance.toFixed(2)} ⭐</span>
                    </div>
                </div>

                <div class="balance-actions">
                    <button id="btn-deposit" class="btn-primary balance-action-btn">
                        Пополнить
                    </button>
                    <button id="btn-withdraw" class="btn-secondary balance-action-btn">
                        Вывести
                    </button>
                </div>

                <h3 class="section-title" style="margin-top: 20px;">История операций</h3>
                <div class="transactions-list">
                    ${transactionsHtml || '<p class="muted-text">История операций пуста.</p>'}
                </div>
            </div>
        `;
        
        getEl('btn-deposit').onclick = () => {
            if (tg && tg.showAlert) tg.showAlert('Функция пополнения будет доступна позже.');
        };
        getEl('btn-withdraw').onclick = () => {
            if (tg && tg.showAlert) tg.showAlert('Функция вывода будет доступна позже.');
        };
    };

    // 8. Рендеринг Профиля
    const renderProfile = () => {
        setScreen('profile-menu-container');

        const container = getEl('profile-menu-container');
        
        // Усекаем имя для отображения
        const shortName = truncateName(currentUserData.name);
        
        container.innerHTML = `
            <div class="screen-content-padding">
                <div class="profile-header-card">
                    <div class="profile-avatar">${currentUserData.name[0]}</div>
                    <div class="profile-info-main">
                        <span class="user-id">ID: ${currentUserData.id}</span>
                    </div>
                </div>

                <h3 class="section-title">Основная информация</h3>
                <div class="profile-details-card">
                    <div class="detail-row">
                        <span>Выполнено заданий:</span>
                        <span>${currentUserData.tasks_completed}</span>
                    </div>
                    <div class="detail-row">
                        <span>Возраст:</span>
                        <span>${currentUserData.age}</span>
                    </div>
                    <div class="detail-row">
                        <span>Пол:</span>
                        <span>${currentUserData.gender === 'M' ? 'Мужской' : 'Женский'}</span>
                    </div>
                    <div class="detail-row">
                        <span>Страна:</span>
                        <span>${currentUserData.country}</span>
                    </div>
                    <div class="detail-row link-row">
                        <span>Пользовательское соглашение:</span>
                        <a href="#" id="link-show-terms">Посмотреть</a>
                    </div>
                </div>

                <button id="btn-logout" class="btn-secondary logout-btn">
                    Выйти
                </button>
            </div>
        `;

        getEl('link-show-terms').onclick = (e) => {
            e.preventDefault();
            showTermsModal();
        };

        getEl('btn-logout').onclick = () => {
            if (tg && tg.close) tg.close();
        };
    };

    // 9. Модалка пользовательского соглашения
    const showTermsModal = () => {
        const modal = getEl('terms-modal');
        const overlay = getEl('modal-overlay');
        if (!modal || !overlay) return;

        modal.classList.add('active');
        overlay.classList.add('active');

        getEl('terms-text').innerHTML = `
            <h2>Пользовательское соглашение</h2>
            <p>Здесь будет текст пользовательского соглашения для исполнителей и заказчиков.</p>
            <p>Исполнители обязуются выполнять задания качественно и в установленные сроки.</p>
            <p>Заказчики обязуются предоставлять корректные задания и оплачивать их выполнение.</p>
        `;

        getEl('terms-accept').onclick = () => {
            currentUserData.isAgreementAccepted = true;
            modal.classList.remove('active');
            overlay.classList.remove('active');
        };

        getEl('terms-close').onclick = () => {
            modal.classList.remove('active');
            overlay.classList.remove('active');
        };
    };

    // 10. Инициализация
    const initAppUI = () => {
        renderBottomNav();
        renderWorkerTasks();
        renderGlobalHeader('');

        // Слушатель для изменения размера веб-аппа
        window.addEventListener('resize', () => {
            // Можно адаптировать интерфейс под изменение размеров
        });
    };

    initAppUI();
});
