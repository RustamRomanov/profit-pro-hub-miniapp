// app.js
document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg) {
        tg.ready();
        tg.expand();
    }

    // === Вспомогательные ===
    const BOT_USERNAME = '@lookgroup_bot'; 
    const getEl = (id) => document.getElementById(id);
    const CURRENCY_STAR = '<i class="fas fa-star" style="color: var(--accent-color);"></i>';

    const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user
        ? tg.initDataUnsafe.user
        : { id: 12345, username: 'User', first_name: 'Пользователь' };

    let currentUserData = {
        id: user.id,
        name: user.username || user.first_name || 'Пользователь',
        age: 25,
        gender: 'M',
        country: 'Россия',
        balance: 50.75,
        pending_balance: 15.0,
        tasks_completed: 154,
        isTermsAccepted: false 
    };
    
    currentUserData.withdrawable_balance = Math.max(0, currentUserData.balance - currentUserData.pending_balance);

    // Мок-данные заданий
    // available - это то, что будет обновляться ежесекундно
    let mockTasks = [
        { id: 10, type: 'subscribe', title: 'Мое задание (На модерации)', description: 'Тест.', cost: 0.30, available: 5, total: 5, isCreatorTask: true, isModeration: true, creatorId: currentUserData.id },
        { id: 1, type: 'subscribe', title: 'Подписка на канал "Мои Финансы"', description: 'Подписка.', cost: 0.25, available: 42, total: 100, isCreatorTask: false, isModeration: false },
        { id: 2, type: 'comment', title: 'Оставить 5 комментариев', description: 'Комментарии.', cost: 0.50, available: 12, total: 150, isCreatorTask: false, isModeration: false },
        { id: 3, type: 'view', title: 'Просмотр ролика (120 сек)', description: 'Видео.', cost: 0.15, available: 300, total: 500, isCreatorTask: false, isModeration: false },
        { id: 4, type: 'subscribe', title: 'Подписка на "Путешествия"', description: 'Подписка.', cost: 0.20, available: 80, total: 100, isCreatorTask: false, isModeration: false },
        { id: 5, type: 'comment', title: 'Коммент в чате', description: '...', cost: 0.40, available: 150, total: 200, isCreatorTask: false, isModeration: false },
        { id: 11, type: 'view', title: 'Мое задание (Активное)', description: 'Тест.', cost: 0.10, available: 490, total: 500, isCreatorTask: true, isModeration: false, creatorId: currentUserData.id },
    ];

    // Состояние фильтра
    let currentFilter = {
        sort: 'default', // default, price_desc, price_asc, count_asc
        type: 'all'      // all, subscribe, comment, view
    };

    let screenHistory = ['worker-tasks-container'];
    let currentTaskDetails = null;

    // === УПРАВЛЕНИЕ ЭКРАНАМИ ===
    const setScreen = (screenId, title = null, showBack = false) => {
        document.querySelectorAll('.screen-container').forEach(s => {
            s.style.display = 'none';
            s.classList.remove('active');
        });

        const activeScreen = getEl(screenId);
        if (activeScreen) {
            activeScreen.style.display = 'block';
            activeScreen.classList.add('active');
        }

        if (screenHistory[screenHistory.length - 1] !== screenId) screenHistory.push(screenId);
        
        const headerBar = getEl('global-header-bar');
        const bottomNav = document.querySelector('.bottom-nav-bar');

        if (showBack) {
            bottomNav.style.display = 'none';
            headerBar.style.display = 'flex';
            headerBar.innerHTML = `
                <button id="header-back-btn" class="header-button"><i class="fas fa-arrow-left"></i></button>
                <div class="header-title">${title || ''}</div>
                <div style="width: 25px;"></div>
            `;
            getEl('header-back-btn').onclick = goBack;
        } else {
            bottomNav.style.display = 'flex';
            headerBar.style.display = 'none';
        }
        
        // Обновление табов (цвета и стили)
        document.querySelectorAll('.tab-item').forEach(tab => tab.classList.remove('active'));
        const activeTab = document.querySelector(`.tab-item[data-screen="${screenId}"]`);
        if (activeTab) activeTab.classList.add('active');
    };
    
    const goBack = () => {
        if (screenHistory.length > 1) {
            screenHistory.pop(); 
            const prevScreenId = screenHistory[screenHistory.length - 1]; 
            if (prevScreenId === 'worker-tasks-container') {
                 setScreen(prevScreenId, null, false);
            } else {
                let title = prevScreenId === 'create-task-container' ? 'Создать задание' : '';
                setScreen(prevScreenId, title, true);
            }
        }
    };

    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.onclick = () => setScreen(tab.getAttribute('data-screen'));
    });
    
    getEl('create-task-btn').onclick = () => setScreen('create-task-container', 'Создать задание', true);

    // === ФУНКЦИИ РЕНДЕРИНГА ===
    
    const getTaskIcon = (type) => {
        switch (type) {
            case 'subscribe': return '<i class="fas fa-user-plus"></i>';
            case 'comment': return '<i class="fas fa-comment-dots"></i>';
            case 'view': return '<i class="fas fa-eye"></i>';
            default: return '<i class="fas fa-star"></i>';
        }
    };

    const getTaskTypeLabel = (type) => {
        switch (type) {
            case 'subscribe': return 'Подписка';
            case 'comment': return 'Комментарий';
            case 'view': return 'Просмотр';
            default: return 'Задание';
        }
    };

    // Рендеринг карточки (Обновленный дизайн)
    const renderTaskItem = (task) => {
        const isMyTask = task.creatorId === currentUserData.id;
        const taskClass = isMyTask && task.isModeration ? 'creator-task' : '';
        const iconColor = `var(--${task.type}-text)`;
        const bgIcon = `var(--${task.type}-bg)`;

        // Класс для малого количества заданий
        const stockClass = task.available < 20 ? 'low-stock' : '';

        return `
            <div class="task-item ${taskClass}" data-task-id="${task.id}">
                <!-- Иконка -->
                <div style="width: 40px; height: 40px; border-radius: 8px; background: ${bgIcon}; display: flex; align-items: center; justify-content: center; margin-right: 12px; color: ${iconColor}; font-size: 18px;">
                    ${getTaskIcon(task.type)}
                </div>

                <div class="task-info">
                    <div class="task-title">${task.title}</div>
                    
                    <!-- Обновлено: Осталось заданий под названием -->
                    <div class="task-remaining-line ${stockClass}">
                        Осталось <span id="task-remaining-counter-${task.id}">${task.available}</span> заданий
                    </div>

                    <div class="task-meta">
                        <span class="task-meta-badge" style="color: ${iconColor}">${getTaskTypeLabel(task.type)}</span>
                        ${isMyTask && task.isModeration ? '<span style="color:var(--border-creator-task);">(Модерация)</span>' : ''}
                    </div>
                </div>
                
                <div class="task-action">
                    <!-- Только цена, количество перенесено влево -->
                    <span class="task-cost-badge">${CURRENCY_STAR} ${task.cost.toFixed(2)}</span>
                </div>
            </div>
        `;
    };

    const renderWorkerTasks = () => {
        const listContainer = getEl('task-list');
        
        // 1. Фильтрация
        let filtered = mockTasks.filter(task => {
            const isMyModeration = task.isCreatorTask && task.isModeration && task.creatorId === currentUserData.id;
            const isNormal = !task.isCreatorTask || (task.isCreatorTask && !task.isModeration);
            
            // Фильтр по типу
            const typeMatch = currentFilter.type === 'all' || task.type === currentFilter.type;

            return (isMyModeration || isNormal) && typeMatch;
        });

        // 2. Сортировка
        filtered.sort((a, b) => {
            if (currentFilter.sort === 'price_desc') return b.cost - a.cost;
            if (currentFilter.sort === 'price_asc') return a.cost - b.cost;
            if (currentFilter.sort === 'count_asc') return a.available - b.available;
            return 0; // default
        });

        if (filtered.length === 0) {
            listContainer.innerHTML = '<p style="text-align: center; color: var(--hint-color); padding-top: 20px;">Нет заданий по выбранным фильтрам.</p>';
        } else {
            listContainer.innerHTML = filtered.map(renderTaskItem).join('');
            listContainer.querySelectorAll('.task-item').forEach(item => {
                item.onclick = () => {
                    const taskId = parseInt(item.getAttribute('data-task-id'));
                    const task = mockTasks.find(t => t.id === taskId);
                    if (task) renderTaskDetails(task);
                };
            });
        }
    };

    // --- СИМУЛЯЦИЯ АКТИВНОСТИ (Ежесекундное обновление) ---
    setInterval(() => {
        // 1. Выбираем случайное задание
        const randomTaskIndex = Math.floor(Math.random() * mockTasks.length);
        const task = mockTasks[randomTaskIndex];

        // 2. Уменьшаем количество с некоторой вероятностью (не каждый тик, чтобы не слишком быстро)
        if (task.available > 0 && Math.random() > 0.3) {
            task.available--;
            
            // 3. Обновляем DOM точечно (без перерисовки всего списка)
            const counterEl = getEl(`task-remaining-counter-${task.id}`);
            if (counterEl) {
                counterEl.textContent = task.available;
                
                // Если стало мало, добавим класс красного цвета
                if (task.available < 20) {
                    counterEl.parentElement.classList.add('low-stock');
                }
            }
        }
    }, 1000); // Раз в секунду


    // --- ЛОГИКА ФИЛЬТРА ---
    getEl('tasks-filter-btn').onclick = () => {
        getEl('filter-modal').style.display = 'flex';
    };

    getEl('apply-filter-btn').onclick = () => {
        const sortVal = getEl('filter-sort-select').value;
        const typeVal = getEl('filter-type-select').value;
        
        currentFilter.sort = sortVal;
        currentFilter.type = typeVal;
        
        renderWorkerTasks(); // Перерисовываем список
        getEl('filter-modal').style.display = 'none';
        
        // Меняем иконку фильтра, если активен
        const filterBtn = getEl('tasks-filter-btn');
        if (sortVal !== 'default' || typeVal !== 'all') {
            filterBtn.style.color = 'var(--accent-color)';
            filterBtn.innerHTML = '<i class="fas fa-filter"></i> Активен';
        } else {
            filterBtn.style.color = 'var(--link-color)';
            filterBtn.innerHTML = '<i class="fas fa-filter"></i> Фильтр';
        }
    };
    
    
    // Рендеринг деталей (упрощенно для экономии места)
    const renderTaskDetails = (task) => {
        currentTaskDetails = task;
        setScreen('task-details-container', '', true); 
        const isExecutable = task.creatorId !== currentUserData.id; 
        const detailsContainer = getEl('task-details-content');
        
        detailsContainer.innerHTML = `
            <div class="task-details-card">
                 <div style="display: flex; align-items: center; margin-bottom: 15px;">
                    <span class="task-type-badge" style="margin: 0; background-color: var(--${task.type}-bg); color: var(--${task.type}-text);">
                        ${getTaskIcon(task.type)} ${getTaskTypeLabel(task.type)}
                    </span>
                 </div>
                <h2 class="task-details-title-display">${task.title}</h2>
                <div class="task-detail-section">
                    <h3>Описание</h3>
                    <p>${task.description}</p>
                </div>
                <div class="task-detail-section">
                    <ul class="task-detail-list">
                        <li><span>Цена:</span><span>${CURRENCY_STAR} ${task.cost.toFixed(2)}</span></li>
                        <li><span>Осталось мест:</span><span>${task.available} из ${task.total}</span></li>
                    </ul>
                </div>
            </div>
            <div class="task-details-card" style="padding: 0;">
                <button id="execute-task-btn" class="btn-primary" ${isExecutable ? '' : 'disabled'} style="margin-top: 20px;">
                    ${isExecutable ? `Выполнить (+${task.cost} ⭐️)` : 'Это Ваше задание'}
                </button>
            </div>
        `;
    };

    const renderBalanceMenu = () => {
        getEl('balance-info-list').innerHTML = `
            <div class="balance-item total">
                <span class="balance-item-title">Общий баланс</span>
                <span class="balance-item-value" style="color: var(--success-color); font-size: 20px;">${CURRENCY_STAR} ${currentUserData.balance.toFixed(2)}</span>
            </div>
            <div class="balance-item">
                <span class="balance-item-title">На проверке</span>
                <span class="balance-item-value">${CURRENCY_STAR} ${currentUserData.pending_balance.toFixed(2)}</span>
            </div>
        `;
        getEl('balance-value-display').innerHTML = `${currentUserData.balance.toFixed(2)} ${CURRENCY_STAR}`;
    };

    const renderProfile = () => {
        // Упрощенная версия для примера
        getEl('profile-menu-container').innerHTML = `
            <div class="profile-card">
                <div class="profile-header">
                    <div class="avatar"><i class="fas fa-robot"></i></div>
                    <div><p class="profile-name">${currentUserData.name}</p></div>
                </div>
                <button id="admin-bot-link" class="btn-secondary">Бот для проверки</button>
                <div id="terms-link" class="profile-link">Соглашение</div>
            </div>
        `;
        getEl('terms-link').onclick = () => getEl('terms-modal').style.display = 'flex';
        getEl('admin-bot-link').onclick = () => getEl('admin-bot-modal').style.display = 'flex';
    };

    // === ПРЕДЛОЖЕНИЕ ПО УЛУЧШЕНИЮ КОДА ===
    // Вместо того чтобы писать для каждого модального окна свой onclick,
    // сделаем универсальную функцию закрытия.
    const setupModalClose = (btnId, modalId) => {
        const btn = getEl(btnId);
        if (btn) btn.onclick = () => getEl(modalId).style.display = 'none';
    };

    setupModalClose('modal-close-terms', 'terms-modal');
    setupModalClose('modal-close-rating', 'rating-modal');
    setupModalClose('modal-close-admin-bot', 'admin-bot-modal');
    setupModalClose('modal-close-filter', 'filter-modal'); // Для нового фильтра

    // Логика создания задания (сокращено, аналогично прошлому разу)
    const setupInputControls = (id, step) => {
        const input = getEl(id);
        const parent = input.closest('.input-with-controls');
        parent.querySelector('.decrease-cost, .decrease-quantity').onclick = () => { input.value = Math.max(0, parseFloat(input.value) - step).toFixed(2); updateTotalCost(); };
        parent.querySelector('.increase-cost, .increase-quantity').onclick = () => { input.value = (parseFloat(input.value) + step).toFixed(2); updateTotalCost(); };
    };
    
    const updateTotalCost = () => {
        const cost = parseFloat(getEl('task-cost-input').value) || 0;
        const qty = parseInt(getEl('task-quantity-input').value) || 0;
        getEl('total-cost-display').innerHTML = `${(cost * qty * 1.15).toFixed(2)} ${CURRENCY_STAR}`;
    };

    setupInputControls('task-cost-input', 0.05);
    setupInputControls('task-quantity-input', 10);
    getEl('create-task-form').onsubmit = (e) => { e.preventDefault(); goBack(); };

    // Старт
    renderWorkerTasks();
    renderBalanceMenu();
    renderProfile();
    setScreen('worker-tasks-container');
});