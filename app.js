// app.js
document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg) {
        tg.ready();
        // РЕКОМЕНДАЦИЯ: Включаем tg.expand() для лучшего UX
        tg.expand();
    }

    // === Вспомогательные ===
    const BOT_USERNAME = '@lookgroup_bot'; 

    const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user
        ? tg.initDataUnsafe.user
        : { id: 12345, username: 'User', first_name: 'Пользователь' };

    // Мок-данные пользователя (в реале должны загружаться из БД)
    let currentUserData = {
        id: user.id,
        name: user.username || user.first_name || 'Пользователь',
        age: 25,
        gender: 'M',
        country: 'Россия',
        balance: 50.75, // Общий баланс
        pending_balance: 15.0, // Ожидание поступлений (в эскроу)
        tasks_completed: 154,
        isFilled: true,
        isAgreementAccepted: true, 
        isTermsAccepted: false 
    };
    
    // Request 11: Расчет Готово к выводу
    const withdrawableBalance = currentUserData.balance - currentUserData.pending_balance;
    if (withdrawableBalance < 0) currentUserData.withdrawable_balance = 0;
    else currentUserData.withdrawable_balance = withdrawableBalance;


    const FORBIDDEN_WORDS = ['мат', 'агрессия', 'порно', 'наркотики', 'мошенничество'];

    const COUNTRIES = [
        'Россия', 'Украина', 'Казахстан', 'Беларусь', 'Узбекистан', 'Армения',
        'Грузия', 'Азербайджан', 'Молдова', 'Кыргызстан', 'Таджикистан',
        'Туркменистан', 'Латвия', 'Литва', 'Эстония'
    ].sort();

    // mock-данные
    const mockTasks = [
        { id: 101, type: 'subscribe', title: 'Подписаться на новостной канал', description: 'Подпишитесь на наш канал о технологиях.', cost: 0.50, reward: '0.50 ⭐️', available: 500, link: 'https://t.me/examplechannel', isNew: true },
        { id: 102, type: 'comment', title: 'Оставить осмысленный комментарий', description: 'Напишите осмысленный комментарий под постом.', cost: 0.85, reward: '0.85 ⭐️', available: 150, link: 'https://t.me/examplepost', isNew: true },
        { id: 103, type: 'view', title: 'Просмотреть пост и поставить реакцию', description: 'Просмотр и лайк поста о финансах.', cost: 0.25, reward: '0.25 ⭐️', available: 1200, link: 'https://t.me/exampleview', isNew: false },
        { id: 104, type: 'subscribe', title: 'Подписка на канал с мемами', description: 'Вступить в группу и продержаться 7 дней.', cost: 0.60, reward: '0.60 ⭐️', available: 800, link: 'https://t.me/memechannel', isNew: false },
        { id: 105, type: 'comment', title: 'Написать честный отзыв о продукте', description: 'Написать честный отзыв на канале-партнере.', cost: 1.10, reward: '1.10 ⭐️', available: 50, link: 'https://t.me/productreview', isNew: false },
    ];
    // Request 5: Задания создателя - только на модерации
    const mockOwnerTasks = [
        { id: 201, type: 'subscribe', title: 'Моя задача: Подписка (На модерации)', description: 'Тестовая задача, созданная мной, ожидает проверки.', cost: 0.50, reward: '0.50 ⭐️', status: 'moderation', available: 0, link: 'https://t.me/mytestchannel', isNew: false },
    ];
    let currentTask = null;
    let currentScreen = 'worker-tasks-container';
    let availableTasksCount = mockTasks.length + 1250; 

    const mockTransactions = [
        { id: 1, type: 'task_pending', amount: -10.0, date: '2025-10-20', status: 'pending', description: 'Задание #123 (7-дней Эскроу)', relatedId: 123 },
        { id: 2, type: 'task_completed', amount: 0.50, date: '2025-10-18', status: 'completed', description: 'Задание #456: Подписка', relatedId: 456 },
        { id: 3, type: 'deposit', amount: 100.0, date: '2025-10-15', status: 'completed', description: 'Пополнение через Payeer', relatedId: 0 },
        { id: 4, type: 'withdrawal', amount: -25.0, date: '2025-10-12', status: 'completed', description: 'Вывод на Qiwi', relatedId: 0 },
    ];

    // --- Утилиты ---
    const getEl = (id) => document.getElementById(id);
    const setScreen = (screenId) => {
        // Скрываем все контейнеры
        ['worker-tasks-container', 'task-details-container', 'create-task-container', 'balance-menu-container', 'profile-menu-container'].forEach(id => {
            const el = getEl(id);
            if (el) el.style.display = 'none';
        });
        // Показываем нужный
        const newScreen = getEl(screenId);
        if (newScreen) newScreen.style.display = 'block';
        currentScreen = screenId;

        // Обновляем навигацию и хедер
        renderBottomNav();

        // Задаем заголовок в зависимости от экрана
        let headerTitle = ''; 
        if (screenId === 'task-details-container') headerTitle = 'Детали задания';
        else if (screenId === 'create-task-container') headerTitle = 'Создание задания';
        else if (screenId === 'balance-menu-container') headerTitle = 'Баланс';
        else if (screenId === 'profile-menu-container') headerTitle = 'Профиль';

        renderGlobalHeader(headerTitle);

        // Request 12: Устанавливаем BackButton для Telegram WebApp (для нативного свайпа)
        if (tg) {
            if (screenId !== 'worker-tasks-container') {
                tg.BackButton.show();
                tg.BackButton.onClick(() => {
                    // Возвращаемся на главный экран заданий
                    setScreen('worker-tasks-container');
                });
            } else {
                tg.BackButton.hide();
            }
        }
    };
    const showModal = (id) => {
        const modal = getEl(id);
        if (modal) modal.style.display = 'flex';
    };
    const hideModal = (id) => {
        const modal = getEl(id);
        if (modal) modal.style.display = 'none';
    };

    // Функция для усечения имени (до 8 символов)
    const truncateName = (name) => {
        if (name.length > 8) {
            return name.substring(0, 8) + '...';
        }
        return name;
    };

    // --- Рендеринг Компонентов ---

    // 1. Рендеринг Нижней Навигации (Bottom Bar) (Request 1, 2)
    const renderBottomNav = () => {
        const nav = getEl('bottom-nav-bar');
        if (!nav) return;

        const navItems = [
            { id: 'worker-tasks-container', icon: 'tasks', text: 'Задания', screen: 'worker-tasks-container' },
            { id: 'balance-menu-container', icon: 'wallet', text: 'Баланс', screen: 'balance-menu-container', badge: `${currentUserData.balance.toFixed(2)}` },
            { id: 'profile-menu-container', icon: 'user', text: 'Профиль', screen: 'profile-menu-container', badge: truncateName(currentUserData.name) },
        ];

        nav.innerHTML = navItems.map(item => `
            <div
                class="nav-item ${currentScreen === item.id ? 'active' : ''}"
                data-screen="${item.screen}"
            >
                <div class="nav-icon-wrapper">
                    <i class="fas fa-${item.icon}"></i> 
                    ${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ''}
                </div>
                <span class="nav-text">${item.text}</span>
            </div>
        `).join('');

        nav.querySelectorAll('.nav-item').forEach(item => {
            item.onclick = () => {
                const screenId = item.getAttribute('data-screen');
                setScreen(screenId);
                if (screenId === 'balance-menu-container') renderBalanceMenu();
                if (screenId === 'profile-menu-container') renderProfile();
                if (screenId === 'worker-tasks-container') renderWorkerTasks();
            };
        });
    };

    // 2. Рендеринг Хедера (Request 6)
    const renderGlobalHeader = (title) => {
        const header = getEl('global-header-bar');
        const isMainScreen = currentScreen === 'worker-tasks-container';
        
        // На экранах task-details и create-task заголовок должен быть убран (Request 6)
        let headerTitleHtml = '';
        if (currentScreen === 'balance-menu-container' || currentScreen === 'profile-menu-container') {
             headerTitleHtml = `<h1 class="header-title">${title}</h1>`;
        } else if (currentScreen === 'worker-tasks-container') {
             headerTitleHtml = ''; // Главный экран пустой
        } else {
             // Пустой заголовок, чтобы не мешал в верхнем правом углу
             headerTitleHtml = `<h1 class="header-title" style="display: none;">${title}</h1>`;
        }

        header.innerHTML = `
            ${headerTitleHtml}
        `;
    };


    // 3. Рендеринг Карточки Задания (Request 13, 14, 15)
    const renderTaskCard = (task) => {
        let typeClass = task.type === 'subscribe' ? 'subscribe' : task.type === 'comment' ? 'comment' : 'view';
        let typeIcon = task.type === 'subscribe' ? 'rss' : task.type === 'comment' ? 'comment-dots' : 'eye';

        // Request 13: Задания создателя на модерации
        if (task.status === 'moderation') {
            return `
                 <div class="task-card moderation-card" data-task-id="${task.id}">
                    <div class="task-logo">
                        <i class="fas fa-${typeIcon}"></i> 
                    </div>
                    <div class="task-info">
                        <h4 class="task-title">${task.title}</h4>
                        <p class="task-description">${task.description}</p>
                    </div>
                    <div class="task-action">
                        <span class="available-info-action" style="color: var(--accent-color);">Ваше задание</span>
                        <button class="task-start-button ${typeClass}" style="background-color: var(--card-bg); color: var(--accent-color); border: 1px solid var(--accent-color);" disabled>
                            На модерации
                        </button>
                    </div>
                </div>
            `;
        }
        
        // Request 15: Формируем блок действия (доступность над кнопкой, стоимость внутри)
        const taskActionBlock = `
            <div class="available-info-action">Доступно: ${task.available}</div>
            <button class="task-start-button ${typeClass}" data-task-id="${task.id}">
                Начать <span class="cost-badge">${task.reward}</span>
            </button>
        `;

        // Request 14: Использованы новые стили для уменьшения толщины
        return `
            <div class="task-card ${typeClass}" data-task-id="${task.id}">
                <div class="task-logo">
                    <i class="fas fa-${typeIcon}"></i>
                </div>
                <div class="task-info">
                    <h4 class="task-title">${task.title}</h4>
                    <p class="task-description">${task.description}</p>
                </div>
                <div class="task-action">
                    ${taskActionBlock}
                </div>
            </div>
        `;
    };

    // 4. Рендеринг Деталей Задания (Request 6)
    const renderTaskDetails = (task) => {
        setScreen('task-details-container');
        const container = getEl('task-details-container');
        const typeText = task.type === 'subscribe' ? 'Подписка' : task.type === 'comment' ? 'Комментарий' : 'Просмотр';
        const typeClass = task.type === 'subscribe' ? 'subscribe' : task.type === 'comment' ? 'comment' : 'view';

        container.innerHTML = `
            <div class="screen-content-padding">
                <div class="task-details-card ${typeClass}">
                    <div class="task-header">
                        <span class="task-type-badge ${typeClass}">${typeText}</span>
                    </div>
                    <h3 class="task-details-title-display">${task.title}</h3> 

                    <div class="detail-row reward-row">
                        <span>Вознаграждение:</span>
                        <span class="reward-amount">${task.reward}</span>
                    </div>
                    <p class="task-details-description">${task.description}</p>
                    <a href="${task.link}" target="_blank" class="btn-secondary link-button"> 
                        Перейти по ссылке <i class="fas fa-external-link-alt"></i> 
                    </a>
                    <p class="verification-info hint-text"> 
                        Для проверки выполнения нажмите "Готово". Результат будет проверен автоматически. 
                        Для заданий на подписку, оплата поступит на Эскроу и будет доступна через 7 дней. 
                    </p>
                    <button id="btn-complete-task" class="btn-primary" data-task-id="${task.id}"> 
                        Готово, проверить задание
                    </button>
                </div>
            </div>
        `;

        getEl('btn-complete-task').onclick = () => {
            if (tg && tg.showAlert) tg.showAlert(`Задание ${task.id} отправлено на проверку!`);
            setScreen('worker-tasks-container');
        };
    };

    // 5. Рендеринг Заданий (Request 3, 4)
    const renderWorkerTasks = () => {
        setScreen('worker-tasks-container');
        const container = getEl('worker-tasks-container');

        // Кнопка создания задания
        const createTaskButton = `
            <div class="create-task-block screen-content-padding" style="padding-bottom: 5px;">
                <button id="btn-show-create-task" class="btn-primary create-task-button">Создать задание</button>
            </div>
        `;

        // Информация о рынке
        const taskMarketInfo = availableTasksCount > 0 ? `
            <div class="task-market-info" style="margin-bottom: 10px; font-size: 12px; color: var(--hint-color);">
                <i class="fas fa-info-circle"></i>
                <span class="info-text">На рынке доступно: ${availableTasksCount.toLocaleString()} заданий</span>
            </div>
        ` : '';

        // Request 4: Задания создателя - только на модерации
        const ownerTasksOnModeration = mockOwnerTasks.filter(t => t.status === 'moderation');
        const ownerTasksHtml = ownerTasksOnModeration.length > 0 ? `
            <div class="owner-tasks-section">
                <h3 class="section-title-highlight">Ваши задания (На модерации)</h3>
                <div class="tasks-list">
                    ${ownerTasksOnModeration.map(task => renderTaskCard(task)).join('')}
                </div>
            </div>
        ` : '';

        // Основные задания
        const mainTasksHtml = mockTasks.map(task => renderTaskCard(task)).join('');
        
        // Request 3: Изменен порядок и заголовок
        container.innerHTML = `
            ${createTaskButton}
            <div class="screen-content-padding" style="padding-top: 5px;">
                <h3 class="section-title-tasks-market">Все задания на рынке</h3>
                ${taskMarketInfo}
                ${ownerTasksHtml}
                <div class="tasks-list">
                    ${mainTasksHtml}
                </div>
            </div>
        `;

        // Устанавливаем обработчики
        container.querySelectorAll('.task-card').forEach(card => {
            const taskId = parseInt(card.getAttribute('data-task-id'));
            const isModeration = card.classList.contains('moderation-card');
            
            // Задания на модерации не открываются
            if (!isModeration) {
                 card.onclick = (e) => {
                    // Проверяем, что клик не был по кнопке (хотя кнопка все равно ловит клик)
                    if (e.target.closest('.task-start-button')) return;
                    currentTask = mockTasks.find(t => t.id === taskId);
                    renderTaskDetails(currentTask);
                };
                // Обработчик для кнопки внутри карточки
                const startButton = card.querySelector('.task-start-button');
                if(startButton) {
                    startButton.onclick = (e) => {
                        e.stopPropagation(); 
                        currentTask = mockTasks.find(t => t.id === taskId);
                        renderTaskDetails(currentTask);
                    }
                }
            }
        });
        
        getEl('btn-show-create-task').onclick = () => {
            renderCreateTask();
        };
    };

    // 6. Рендеринг Создания Задания (Request 9)
    const renderCreateTask = () => {
        setScreen('create-task-container');
        const container = getEl('create-task-container');
        
        const renderDescriptionField = (type) => { 
            return (type === 'comment' || type === 'subscribe') ? `
                 <div class="input-group">
                    <label for="task-description">Описание задания</label>
                    <textarea id="task-description" placeholder="Подробно опишите, что нужно сделать (например, 'Написать 5-7 слов про...')" rows="3" required></textarea>
                </div>
            ` : '';
        };

        container.innerHTML = `
            <div class="screen-content-padding">
                <div class="form-card">
                    <h3 class="section-title">Создание нового задания</h3>
                    
                    <div class="input-group">
                        <label for="task-title">Название задания</label>
                        <input type="text" id="task-title" placeholder="Краткий заголовок" value="" required>
                    </div>

                    <div class="input-group">
                        <label for="task-type">Тип задания</label>
                        <select id="task-type" required>
                            <option value="subscribe">Подписка</option>
                            <option value="comment">Комментарий</option>
                            <option value="view">Просмотр / Реакция</option>
                        </select>
                    </div>

                    <div id="description-field-container">
                        ${renderDescriptionField(getEl('task-type')?.value || 'subscribe')}
                    </div>

                    <div class="input-group">
                        <label for="task-link">Ссылка на канал/пост</label>
                        <input type="url" id="task-link" placeholder="https://t.me/yourchannel" required>
                    </div>

                    <div class="form-inline-group">
                        <div class="input-group">
                            <label for="task-cost">Стоимость за выполнение (⭐️)</label>
                            <input type="number" id="task-cost" placeholder="0.50" min="0.01" step="0.01" value="0.50" required>
                        </div>
                        <div class="input-group">
                            <label for="task-quantity">Количество выполнений</label>
                            <input type="number" id="task-quantity" placeholder="100" min="1" step="1" value="100" required>
                        </div>
                    </div>

                    <div class="total-row" style="display: flex; justify-content: space-between; margin-top: 15px;">
                        <span style="font-weight: 500;">Общий бюджет:</span>
                        <span id="total-cost" class="total-cost" style="font-weight: 700; color: var(--accent-color);">50.00 ⭐️</span>
                    </div>

                    <div class="admin-bot-check-row" style="margin-top: 20px;">
                        <input type="checkbox" id="admin-bot-check" checked disabled>
                        <label for="admin-bot-check" style="display: inline; font-size: 13px; color: var(--hint-color);">Я добавил админ-бота в свой канал. <a href="#" id="show-admin-modal-link" style="font-size: 13px;">(Инструкция)</a> </label>
                    </div>
                    
                    <div class="admin-bot-info hint-text" style="font-size: 12px; margin-top: 5px;"> Для проверки заданий: ${BOT_USERNAME} </div>

                    <button id="btn-submit-task" class="btn-primary" style="margin-top: 20px;"> 
                        Оплатить и запустить задание 
                    </button>

                </div>
            </div>
        `;
        // Обработчики динамического рендеринга
        const taskTypeSelect = getEl('task-type');
        const descriptionContainer = getEl('description-field-container');
        const totalCostEl = getEl('total-cost');
        const costInput = getEl('task-cost');
        const quantityInput = getEl('task-quantity');
        
        const updateBudget = () => {
            const cost = parseFloat(costInput.value) || 0;
            const quantity = parseInt(quantityInput.value) || 0;
            const total = cost * quantity;
            totalCostEl.textContent = `${total.toFixed(2)} ⭐️`;
        };
        
        if (taskTypeSelect) taskTypeSelect.onchange = () => {
            descriptionContainer.innerHTML = renderDescriptionField(taskTypeSelect.value);
            updateBudget();
        };
        if (costInput) costInput.oninput = updateBudget;
        if (quantityInput) quantityInput.oninput = updateBudget;
        updateBudget(); // Инициализация

        const showAdminModalLink = getEl('show-admin-modal-link');
        if (showAdminModalLink) {
            showAdminModalLink.onclick = (e) => {
                e.preventDefault();
                showModal('admin-bot-modal');
            };
        }
        
        getEl('btn-submit-task').onclick = () => {
            if (tg && tg.showAlert) tg.showAlert('Задание отправлено на модерацию!');
            // Имитируем добавление в мок-данные для демонстрации Request 4/13
            mockOwnerTasks.push({ 
                id: Math.floor(Math.random() * 1000) + 300, 
                type: getEl('task-type').value, 
                title: getEl('task-title').value, 
                description: getEl('task-description')?.value || 'Без описания', 
                cost: parseFloat(getEl('task-cost').value), 
                reward: `${parseFloat(getEl('task-cost').value).toFixed(2)} ⭐️`, 
                status: 'moderation', 
                available: parseInt(getEl('task-quantity').value), 
                link: getEl('task-link').value, 
                isNew: false 
            });
            setScreen('worker-tasks-container');
            renderWorkerTasks();
        };
    };

    // 7. Рендеринг Меню Баланса (Request 11)
    const renderBalanceMenu = () => {
        setScreen('balance-menu-container');
        const container = getEl('balance-menu-container');

        // Request 11: Обновленные заголовки баланса
        const balanceHtml = `
            <div class="balance-card">
                <div class="balance-item total-balance">
                    <span class="balance-label">Общий баланс:</span> 
                    <span class="balance-value total-balance-value">${currentUserData.balance.toFixed(2)} ⭐️</span>
                </div>
                <div class="balance-item pending-balance">
                    <span class="balance-label">Ожидание поступлений (в эскроу):</span> 
                    <span class="balance-value pending-balance-value">${currentUserData.pending_balance.toFixed(2)} ⭐️</span>
                </div>
                <div class="balance-item withdrawable-balance"> 
                    <span class="balance-label">Готово к выводу:</span> 
                    <span class="balance-value withdrawable-balance-value">${currentUserData.withdrawable_balance.toFixed(2)} ⭐️</span>
                </div>
            </div>
        `;
        
        const transactionsHtml = mockTransactions.map(tx => {
            const isCompleted = tx.status === 'completed';
            const isFailed = tx.status === 'failed';
            const sign = tx.amount > 0 ? '+' : '';
            const statusText = isCompleted ? 'Завершено' : isFailed ? 'Отменено' : 'В Эскроу';
            const statusClass = isCompleted ? 'tx-completed' : isFailed ? 'tx-failed' : 'tx-pending';
            return `
                 <div class="transaction-row ${statusClass}" style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px dashed var(--border-subtle);">
                    <i class="fas fa-history" style="font-size: 16px; color: var(--hint-color); margin-right: 10px;"></i>
                    <div class="tx-info" style="flex-grow: 1;">
                        <div class="tx-main-row" style="display: flex; justify-content: space-between; font-size: 14px;">
                            <span class="tx-description">${tx.description}</span>
                            <span class="tx-amount" style="font-weight: 600; color: ${tx.amount > 0 ? 'var(--success-color)' : 'var(--danger-color)'};">${sign}${tx.amount.toFixed(2)} ⭐️</span>
                        </div>
                        <div class="tx-sub-row" style="display: flex; justify-content: space-between; font-size: 11px; color: var(--hint-color); margin-top: 2px;">
                            <span>${tx.date}</span>
                            <span class="tx-status">${statusText}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="screen-content-padding">
                ${balanceHtml}
                <div class="balance-actions" style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="btn-primary balance-action-btn">Пополнить</button>
                    <button class="btn-secondary balance-action-btn">Вывести</button>
                </div>
                <h3 class="section-title">История операций</h3>
                <div class="transactions-list">
                    ${transactionsHtml}
                </div>
            </div>
        `;
    };

    // 8. Утилита для рендеринга узкого скролла возраста (Request 8)
    const renderAgeSelect = (currentAge) => {
        let options = '';
        for (let i = 18; i <= 99; i++) {
            options += `<option value="${i}" ${i === currentAge ? 'selected' : ''}>${i}</option>`;
        }
        return `
            <div class="input-group narrow-input-group">
                <label for="profile-age">Возраст</label>
                <select id="profile-age" required>
                    ${options}
                </select>
            </div>
        `;
    };

    // 9. Рендеринг Профиля (обновление для Request 8)
    const renderProfile = () => {
        setScreen('profile-menu-container');
        const container = getEl('profile-menu-container');

        const profileForm = `
            <div class="form-card profile-details-card">
                <h3 class="section-title">Ваши данные</h3>
                <div class="inline-info" style="display: flex; gap: 10px;">
                    <div class="input-group" style="flex-grow: 1;">
                        <label>Имя пользователя</label>
                        <input type="text" value="${currentUserData.name}" disabled>
                    </div>
                    ${renderAgeSelect(currentUserData.age)} </div>
                
                <div class="input-group">
                    <label for="profile-country">Страна</label>
                    <select id="profile-country" required>
                        ${COUNTRIES.map(c => `<option value="${c}" ${c === currentUserData.country ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
                
                <div class="input-group">
                    <label>Пол</label>
                    <div class="gender-options" style="display: flex; gap: 15px; font-size: 14px;">
                        <label><input type="radio" name="gender" value="M" ${currentUserData.gender === 'M' ? 'checked' : ''} disabled> Мужской</label>
                        <label><input type="radio" name="gender" value="F" ${currentUserData.gender === 'F' ? 'checked' : ''} disabled> Женский</label>
                    </div>
                </div>

                <p class="hint-text" style="font-size: 11px; color: var(--hint-color); margin-top: 15px;">Возраст и Пол нельзя изменить после регистрации.</p>

                <div class="total-row" style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid var(--border-subtle); margin-top: 15px;">
                    <span>Выполнено заданий:</span>
                    <span class="total-cost" style="font-weight: 600;">${currentUserData.tasks_completed}</span>
                </div>
            </div>
        `;
        
        container.innerHTML = `
            <div class="screen-content-padding">
                <div class="profile-header-card">
                    <h2 style="margin: 0; font-size: 18px;">${currentUserData.name}</h2>
                    <p class="rating-display" style="font-size: 12px; color: var(--accent-color); margin: 5px 0 0 0;">
                        Ваш рейтинг: ⭐️ 4.8 
                        <a href="#" id="show-rating-modal-link" style="font-size: 12px;">(Что это?)</a>
                    </p>
                </div>
                ${profileForm}

                <div class="profile-actions" style="margin-top: 20px;">
                    <button id="btn-show-terms" class="btn-secondary">Пользовательское соглашение</button>
                    ${!currentUserData.isTermsAccepted ? 
                        `<button id="btn-accept-terms" class="btn-primary" style="margin-top: 10px;">Принять условия</button>` :
                        `<p class="hint-text accepted-terms-text" style="font-size: 13px; color: var(--success-color); text-align: center; margin-top: 10px;">Условия приняты</p>`
                    }
                </div>
            </div>
        `;

        // Обработчики для модальных окон
        const btnShowTerms = getEl('btn-show-terms');
        if (btnShowTerms) {
            btnShowTerms.onclick = () => showModal('terms-modal');
        }
        const btnShowRating = getEl('show-rating-modal-link');
        if (btnShowRating) {
            btnShowRating.onclick = (e) => {
                e.preventDefault();
                showModal('rating-modal');
            }
        }
        const btnAcceptTerms = getEl('btn-accept-terms');
        if (btnAcceptTerms) {
            btnAcceptTerms.onclick = () => {
                if (tg && tg.sendData) {
                    // Имитация отправки данных в бэкенд
                    tg.sendData('accept_agreement'); 
                } else {
                    currentUserData.isTermsAccepted = true;
                    if (tg && tg.showAlert) tg.showAlert('Спасибо! Вы приняли пользовательское соглашение.');
                }
                renderProfile();
            };
        }
    };
    
    // --- Обработчики модальных окон (Полный набор) ---
    const btnTermsClose = getEl('modal-close-terms');
    if (btnTermsClose) {
        btnTermsClose.onclick = () => hideModal('terms-modal');
    }
    const btnRatingClose = getEl('modal-close-rating');
    if (btnRatingClose) {
        btnRatingClose.onclick = () => hideModal('rating-modal');
    }
    
    const btnAdminClose = getEl('modal-close-admin-bot');
    if (btnAdminClose) {
        btnAdminClose.onclick = () => hideModal('admin-bot-modal');
    }

    const btnAdminCopy = getEl('modal-copy-botname');
    if (btnAdminCopy) {
        btnAdminCopy.onclick = () => {
            const el = document.createElement('textarea');
            el.value = BOT_USERNAME;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);

            if (tg && tg.showAlert) tg.showAlert(`Имя бота ${BOT_USERNAME} скопировано.`);
        };
    }

    // --- Запуск --
    setScreen('worker-tasks-container');
    renderWorkerTasks();
});