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
        'Россия', 'Украина', 'Казахстан', 'Беларусь', 'Узбекистан', 'Армения',
        'Грузия', 'Азербайджан', 'Молдова', 'Кыргызстан', 'Таджикистан',
        'Туркменистан', 'Латвия', 'Литва', 'Эстония'
    ].sort();

    // mock-данные
    const mockTasks = [
        { id: 101, type: 'subscribe', title: 'Подписаться на новостной канал', description: 'Подпишитесь на наш канал о технологиях.', cost: 0.50, reward: '0.50 ⭐️', available: 500, link: 'https://t.me/examplechannel', isNew: true },
        { id: 102, type: 'comment', title: 'Оставить комментарий', description: 'Напишите осмысленный комментарий под постом.', cost: 0.85, reward: '0.85 ⭐️', available: 150, link: 'https://t.me/examplepost', isNew: true },
        { id: 103, type: 'view', title: 'Просмотреть пост', description: 'Просмотр и лайк поста о финансах.', cost: 0.25, reward: '0.25 ⭐️', available: 1200, link: 'https://t.me/exampleview', isNew: false },
        { id: 104, type: 'subscribe', title: 'Подписка на канал с мемами', description: 'Вступить в группу и продержаться 7 дней.', cost: 0.60, reward: '0.60 ⭐️', available: 800, link: 'https://t.me/memechannel', isNew: false },
        { id: 105, type: 'comment', title: 'Отзыв о продукте', description: 'Написать честный отзыв на канале-партнере.', cost: 1.10, reward: '1.10 ⭐️', available: 50, link: 'https://t.me/productreview', isNew: false },
        { id: 106, type: 'view', title: 'Оценить новый клип', description: 'Просмотр видео и реакция.', cost: 0.30, reward: '0.30 ⭐️', available: 2000, link: 'https://t.me/newclip', isNew: false },
    ];
    // Задания создателя - только на модерации
    const mockOwnerTasks = [
        { id: 201, type: 'subscribe', title: 'Моя задача: Подписка (На модерации)', description: 'Тестовая задача, созданная мной, ожидает проверки.', cost: 0.50, reward: '0.50 ⭐️', status: 'moderation', available: 0, link: 'https://t.me/mytestchannel', isNew: false },
    ];
    let currentTask = null;
    let currentScreen = 'worker-tasks-container';
    let availableTasksCount = mockTasks.length + 1250; // Симулируемое общее количество заданий

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
            getEl(id).style.display = 'none';
        });
        // Показываем нужный
        getEl(screenId).style.display = 'block';
        currentScreen = screenId;

        // Обновляем навигацию и хедер
        renderBottomNav();

        // Задаем заголовок в зависимости от экрана
        let headerTitle = 'Profit Pro Hub';
        if (screenId === 'task-details-container') headerTitle = 'Детали задания';
        else if (screenId === 'create-task-container') headerTitle = 'Создание задания';
        else if (screenId === 'balance-menu-container') headerTitle = 'Баланс';
        else if (screenId === 'profile-menu-container') headerTitle = 'Профиль';

        renderGlobalHeader(headerTitle);

        // Устанавливаем BackButton для Telegram WebApp, если он не на главном экране
        if (tg) {
            if (screenId !== 'worker-tasks-container') {
                tg.BackButton.show();
                tg.BackButton.onClick(() => setScreen('worker-tasks-container'));
            } else {
                tg.BackButton.hide();
            }
        }
    };
    const showModal = (id) => getEl(id).style.display = 'flex';
    const hideModal = (id) => getEl(id).style.display = 'none';

    // Функция для усечения имени (до 8 символов)
    const truncateName = (name) => {
        if (name.length > 8) {
            return name.substring(0, 8) + '...';
        }
        return name;
    };

    // --- Рендеринг Компонентов ---

    // 1. Рендеринг Нижней Навигации (Bottom Bar)
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
                <i class="icon-${item.icon}"></i>
                <div class="nav-text-container">
                    <span class="nav-text">${item.text}</span>
                    <span class="nav-badge">${item.badge || ''}</span>
                </div>
            </div>
        `).join('');

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

    // 2. Рендеринг Хедера (Заголовок удален для экранов, кроме главного)
    const renderGlobalHeader = (title) => {
        const header = getEl('global-header-bar');
        const isMainScreen = currentScreen === 'worker-tasks-container';
        
        // Кнопка "Назад" теперь управляется функцией setScreen и tg.BackButton
        // Нам не нужно рисовать ее вручную в HTML для экранов task-details и create-task
        const backButtonHtml = !isMainScreen && !tg ? 
            `<button class="back-button" id="back-to-tasks"><i class="icon-arrow-left"></i></button>` : 
            ''; // Используем только для отладки, в Telegram лучше использовать нативную кнопку

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

        // Для отладочной кнопки "Назад"
        if (!isMainScreen && !tg) {
            getEl('back-to-tasks').onclick = () => setScreen('worker-tasks-container');
        }
    };


    // 3. Рендеринг Карточки Задания
    const renderTaskCard = (task) => {
        let typeClass = task.type === 'subscribe' ? 'subscribe' : task.type === 'comment' ? 'comment' : 'view';

        // Задания создателя на модерации
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
        
        // Формируем большую и привлекательную кнопку "Начать"
        const startButton = `
            <button class="task-start-button ${typeClass}" data-task-id="${task.id}">
                Начать <span class="cost-badge">${task.reward}</span>
            </button>
        `;

        return `
            <div class="task-card ${typeClass} ${task.isNew ? 'new-task' : ''}" data-task-id="${task.id}">
                <div class="task-info">
                    <span class="task-type-badge ${typeClass}">${task.type === 'subscribe' ? 'Подписка' : task.type === 'comment' ? 'Комментарий' : 'Просмотр'}</span>
                    <h4 class="task-title">${task.title}</h4>
                    <p class="task-description">${task.description}</p>
                    <div class="task-meta">
                        <span class="task-meta-item">Доступно: ${task.available}</span>
                        <span class="task-meta-item">Награда: ${task.reward}</span>
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
        
        // Извлекаем числовое значение стоимости
        const costValue = parseFloat(task.reward.replace(' ⭐️', '')) || 0;

        container.innerHTML = `
            <div class="screen-content-padding">
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

                    <button id="btn-complete-task" class="btn-primary" data-task-id="${task.id}" data-task-type="${task.type}" data-price="${costValue}">
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

            // После отправки данных, возвращаемся к списку заданий
            setScreen('worker-tasks-container');
            // Если используем нативную кнопку, нужно это убрать, 
            // так как она вернется сама, но для консистентности:
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
        
        // Блок с количеством заданий на рынке
        const taskMarketInfo = `
            <div class="task-market-info">
                Всего заданий на рынке: <span class="tasks-count">${availableTasksCount}</span>
            </div>
        `;

        // Объединяем задачи пользователя на модерации и общие задачи
        // Показываем задачи создателя, только если они на модерации (т.е. в mockOwnerTasks)
        const allTasks = [...mockOwnerTasks.filter(t => t.status === 'moderation'), ...mockTasks];

        // Задания создателя (На модерации)
        const ownerTasksHtml = mockOwnerTasks.length > 0 ? `
            <div class="owner-tasks-section">
                <h3 class="section-title-highlight">Ваши задания (На модерации)</h3>
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
                <h3 class="section-title-tasks">Задания</h3>
                ${taskMarketInfo}
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
        
        getEl('btn-show-create-task').onclick = () => {
            renderCreateTask();
        };
    };
    
    // 6. Рендеринг Создания Задания (Customer/Owner) (С ИНТЕГРАЦИЕЙ create_task)
    const renderCreateTask = () => {
        // Заголовок в хедере убран согласно запросу (renderGlobalHeader)
        setScreen('create-task-container');

        const container = getEl('create-task-container');
        
        // Функция для динамического отображения поля Описания
        const renderDescriptionField = (type) => {
            return (type === 'comment' || type === 'subscribe') ? `
                <div class="input-group">
                    <label for="task-description">Описание задания</label>
                    <textarea id="task-description" placeholder="Подробно опишите, что нужно сделать (например, 'Написать 5-7 слов про то, как вам понравился канал')."></textarea>
                </div>
            ` : '';
        };
        
        // Массив опций для скролла возраста (имитация)
        const ageOptions = (min, max) => {
            let options = '';
            for (let i = min; i <= max; i++) {
                options += `<option value="${i}">${i}</option>`;
            }
            return options;
        };


        container.innerHTML = `
            <div class="screen-content-padding">
                <div class="form-card">
                    <div class="input-group">
                        <label>Тип задания</label>
                        <select id="task-type">
                            <option value="subscribe">Подписка на канал/чат</option>
                            <option value="view">Просмотр поста/реакция</option>
                            <option value="comment">Комментарий к посту</option>
                        </select>
                    </div>
                    
                    <div id="description-field-container">
                        ${renderDescriptionField('subscribe')}
                    </div>

                    <div class="input-group">
                        <label for="task-link">Ссылка на канал/пост</label>
                        <input type="url" id="task-link" placeholder="https://t.me/" value="https://t.me/" />
                    </div>
                    
                    <hr class="form-divider" />

                    <div class="inline-info">
                        <div class="input-group flex-1">
                            <label for="target-country">Целевая аудитория</label>
                            <select id="target-country">
                                <option value="any">Любая страна</option>
                                ${COUNTRIES.map(c => `<option value="${c}">${c}</option>`).join('')}
                            </select>
                        </div>
                        <div class="input-group flex-1">
                            <label for="target-gender">Пол</label>
                            <select id="target-gender">
                                <option value="any">Любой</option>
                                <option value="M">Мужской</option>
                                <option value="F">Женский</option>
                            </select>
                        </div>
                    </div>

                    <div class="inline-info">
                        <div class="input-group flex-1">
                            <label for="target-age-min">Возраст от</label>
                            <select id="target-age-min" class="small-select">
                                ${ageOptions(16, 99)}
                            </select>
                        </div>
                        <div class="input-group flex-1">
                            <label for="target-age-max">Возраст до</label>
                            <select id="target-age-max" class="small-select">
                                ${ageOptions(16, 99)}
                            </select>
                        </div>
                    </div>

                    <hr class="form-divider" />
                    
                    <div class="inline-info">
                        <div class="input-group flex-1">
                            <label for="task-cost">Стоимость выполнения (⭐️)</label>
                            <input type="number" id="task-cost" min="0.10" step="0.05" value="0.50" />
                        </div>
                        <div class="input-group flex-1">
                            <label for="task-quantity">Количество выполнений</label>
                            <input type="number" id="task-quantity" min="10" value="100" />
                        </div>
                    </div>

                    <div class="total-row">
                        <span>Итого Бюджет:</span>
                        <span id="total-cost" class="total-cost">50.00 ⭐️</span>
                    </div>
                    
                    <hr class="form-divider" />

                    <div class="admin-bot-check-row">
                        <input type="checkbox" id="admin-bot-checked" />
                        <label for="admin-bot-checked">
                            Я установил(а) админ-бота в этот канал. <a href="#" id="show-admin-modal-link">(Инструкция)</a>
                        </label>
                    </div>
                    
                    <div class="admin-bot-info">
                        Для проверки заданий: ${BOT_USERNAME}
                    </div>

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
        const linkInput = getEl('task-link');

        const updateBudget = () => {
            const cost = parseFloat(costInput.value) || 0;
            const quantity = parseInt(quantityInput.value) || 0;
            const total = cost * quantity;
            totalCostEl.textContent = `${total.toFixed(2)} ⭐️`;
        };
        
        taskTypeSelect.onchange = () => {
            descriptionContainer.innerHTML = renderDescriptionField(taskTypeSelect.value);
            updateBudget();
        };
        costInput.oninput = updateBudget;
        quantityInput.oninput = updateBudget;
        updateBudget(); // Инициализация
        
        getEl('show-admin-modal-link').onclick = (e) => {
            e.preventDefault();
            showModal('admin-bot-modal');
        };

        getEl('btn-submit-task').onclick = () => {
            const total = parseFloat(totalCostEl.textContent);
            const taskType = taskTypeSelect.value;
            const link = linkInput.value.trim();
            const description = taskType !== 'view' ? (getEl('task-description')?.value || '').trim() : '';
            const cost = parseFloat(costInput.value);
            const count = parseInt(quantityInput.value);
            const title = `Задание: ${taskTypeSelect.options[taskTypeSelect.selectedIndex].text} (#${Math.floor(Math.random() * 9000) + 1000})`; // Авто-заголовок
            
            if (total <= 0) {
                if (tg && tg.showAlert) tg.showAlert('Общий бюджет должен быть больше нуля.');
                return;
            }
            if (link.length < 10) {
                 if (tg && tg.showAlert) tg.showAlert('Введите корректную ссылку на канал/пост.');
                 return;
            }
            if (total > currentUserData.balance) {
                if (tg && tg.showAlert) tg.showAlert('Недостаточно средств на балансе. Пополните счет.');
                return;
            }
            if ((taskType === 'subscribe' || taskType === 'comment') && !getEl('admin-bot-checked').checked) {
                 if (tg && tg.showAlert) tg.showAlert('Для заданий на подписку и комментарии необходимо установить админ-бота.');
                 return;
            }

            // --- ИНТЕГРАЦИЯ: Отправка данных боту ---
             if (tg && tg.showConfirm) {
                tg.showConfirm(`Вы действительно хотите потратить ${total.toFixed(2)} ⭐️ на создание задания?`, (confirmed) => {
                    if (confirmed) {
                        // Отправляем все данные для создания задания
                        tg.sendData(JSON.stringify({
                            action: 'create_task',
                            title: title,
                            description: description,
                            link: link,
                            price: cost,
                            count: count,
                            total: total,
                            taskType: taskType,
                            status: 'Запущено'
                        }));
                        
                        // Имитация локального обновления баланса
                        currentUserData.balance -= total;
                        
                         if (tg && tg.showAlert) tg.showAlert('Задание отправлено! Бот пришлет подтверждение.');
                         setScreen('worker-tasks-container');
                    }
                });
            } else {
                 if (tg && tg.showAlert) tg.showAlert('[Отладка] Задание отправлено на модерацию!');
                 setScreen('worker-tasks-container');
            }
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
                <div class="transaction-row ${statusClass}">
                    <i class="icon-transaction"></i>
                    <div class="tx-info">
                        <div class="tx-main-row">
                            <span class="tx-description">${tx.description}</span>
                            <span class="tx-amount">${sign}${tx.amount.toFixed(2)} ⭐️</span>
                        </div>
                        <div class="tx-sub-row">
                            <span>${tx.date}</span>
                            <span class="tx-status">${statusText}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');


        container.innerHTML = `
            <div class="screen-content-padding">
                <div class="balance-card">
                    <div class="balance-item total-balance">
                        <span class="balance-label">Общий баланс:</span>
                        <span class="balance-value total-balance-value">${currentUserData.balance.toFixed(2)} ⭐️</span>
                    </div>
                    <div class="balance-item pending-balance">
                        <span class="balance-label">Ожидание поступлений (в Эскроу):</span>
                        <span class="balance-value pending-balance-value">${currentUserData.pending_balance.toFixed(2)} ⭐️</span>
                    </div>
                    <div class="balance-item withdrawable-balance">
                        <span class="balance-label">Готово к выводу:</span>
                        <span class="balance-value withdrawable-balance-value">${withdrawableBalance.toFixed(2) < 0 ? '0.00' : withdrawableBalance.toFixed(2)} ⭐️</span>
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
            if (tg && tg.showAlert) tg.showAlert('Переход к пополнению баланса. (Функция в разработке)');
        };
        getEl('btn-withdraw').onclick = () => {
            if (tg && tg.showAlert) tg.showAlert('Переход к выводу средств. (Функция в разработке)');
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
                        <h2>${currentUserData.name}</h2>
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

                <div class="profile-actions">
                    <button id="btn-logout" class="btn-secondary">Выйти</button>
                </div>
            </div>
        `;
        
        getEl('link-show-terms').onclick = (e) => {
            e.preventDefault();
            showModal('terms-modal');
        };
        getEl('btn-logout').onclick = () => {
            if (tg && tg.showConfirm) {
                tg.showConfirm('Вы уверены, что хотите выйти?', (confirmed) => {
                    if (confirmed) {
                        if (tg && tg.close) tg.close();
                    }
                });
            }
        };
    };

    // --- Инициализация Модальных Окон ---

    // Модальное окно соглашения (С ИНТЕГРАЦИЕЙ accept_agreement)
    const btnTermsOk = getEl('modal-accept-terms');
    if (btnTermsOk) {
        btnTermsOk.onclick = () => {
            hideModal('terms-modal');
            
            // --- ИНТЕГРАЦИЯ: Отправляем данные боту ---
            if (tg && tg.sendData) {
                tg.sendData(JSON.stringify({
                    action: 'accept_agreement', // Используем action из backend/api_routes.py
                    status: true
                }));
                
                // Локально обновляем статус
                currentUserData.isTermsAccepted = true;
                
                if (tg.showAlert) tg.showAlert('Условия приняты. Бот подтвердит запись в БД.');
            } else {
                // Режим отладки (вне Telegram)
                currentUserData.isTermsAccepted = true;
                if (tg && tg.showAlert) tg.showAlert('Спасибо! Вы приняли пользовательское соглашение. (Отладка)');
            }
            // ------------------------------------------

            renderProfile(); // Перерисовываем, чтобы обновить состояние
        };
    }

    const btnTermsClose = getEl('modal-close-terms');
    if (btnTermsClose) {
        btnTermsClose.onclick = () => hideModal('terms-modal');
    }
    
    // Модальное окно админ-бота
    const btnAdminClose = getEl('modal-close-admin-bot');
    if (btnAdminClose) {
        btnAdminClose.onclick = () => hideModal('admin-bot-modal');
    }

    const btnAdminCopy = getEl('modal-copy-botname');
    if (btnAdminCopy) {
        btnAdminCopy.onclick = () => {
            // Используем document.execCommand('copy') для совместимости с iframe
            const el = document.createElement('textarea');
            el.value = BOT_USERNAME;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);

            if (tg && tg.showAlert) tg.showAlert(`Имя бота ${BOT_USERNAME} скопировано.`);
        };
    }

    // --- Запуск ---
    // Начинаем с экрана заданий
    setScreen('worker-tasks-container');
    renderWorkerTasks();
    renderBottomNav();
});