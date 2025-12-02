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
    const getEl = (id) => document.getElementById(id);
    
    // Новая константа для символа валюты (Telegram Star)
    const CURRENCY_STAR = '<i class="fas fa-star" style="color: var(--accent-color);"></i>';

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
    
    // Request 12: Расчет Готово к выводу
    let withdrawableBalance = currentUserData.balance - currentUserData.pending_balance;
    if (withdrawableBalance < 0) withdrawableBalance = 0;

    currentUserData.withdrawable_balance = withdrawableBalance;

    // Мок-данные заданий (имитация)
    const mockTasks = [
        // Задание создателя на модерации (Request 6, 14: видно, выделено рамкой)
        { id: 10, type: 'subscribe', title: 'Мое задание (На модерации)', description: 'Тестовое задание создателя, которое еще не прошло модерацию.', cost: 0.30, available: 5, total: 5, isCreatorTask: true, isModeration: true, creatorId: currentUserData.id },
        // Обычные задания для исполнителей
        { id: 1, type: 'subscribe', title: 'Подписка на канал "Мои Финансы"', description: 'Открытая подписка, просто подпишитесь.', cost: 0.25, available: 50, total: 100, isCreatorTask: false, isModeration: false },
        { id: 2, type: 'comment', title: 'Оставить 5 комментариев под видео', description: 'Комментарии должны быть осмысленными и не короче 5 слов.', cost: 0.50, available: 120, total: 150, isCreatorTask: false, isModeration: false },
        { id: 3, type: 'view', title: 'Просмотр ролика (120 сек)', description: 'Просмотреть видео целиком, до конца.', cost: 0.15, available: 300, total: 500, isCreatorTask: false, isModeration: false },
        { id: 4, type: 'subscribe', title: 'Подписка на канал "Путешествия"', description: 'Подписка + 1 лайк.', cost: 0.20, available: 80, total: 100, isCreatorTask: false, isModeration: false },
        { id: 5, type: 'comment', title: 'Оставить комментарий в Telegram-чате', description: '...', cost: 0.40, available: 150, total: 200, isCreatorTask: false, isModeration: false },
        // Задание создателя, которое прошло модерацию (Request 6: видно, но не выделено)
        { id: 11, type: 'view', title: 'Мое задание (Активное)', description: 'Тестовое задание создателя, прошедшее модерацию.', cost: 0.10, available: 500, total: 500, isCreatorTask: true, isModeration: false, creatorId: currentUserData.id },

    ];

    // История экранов для навигации
    let screenHistory = ['worker-tasks-container'];
    let currentTaskDetails = null; // Для хранения текущего задания

    // === УПРАВЛЕНИЕ ЭКРАНАМИ и ХЕДЕРОМ ===
    const setScreen = (screenId, title = null, showBack = false) => {
        const screens = document.querySelectorAll('.screen-container');
        screens.forEach(screen => {
            screen.style.display = 'none';
            screen.classList.remove('active');
        });

        const activeScreen = getEl(screenId);
        if (activeScreen) {
            activeScreen.style.display = 'block';
            activeScreen.classList.add('active');
        }

        // Обновление истории
        if (screenHistory[screenHistory.length - 1] !== screenId) {
            screenHistory.push(screenId);
        }
        
        // Управление хедером
        const headerBar = getEl('global-header-bar');
        const bottomNav = document.querySelector('.bottom-nav-bar');

        if (showBack) {
            // Скрываем нижнее меню, показываем верхний бар
            bottomNav.style.display = 'none';
            headerBar.style.display = 'flex';
            
            // Render back button and title
            headerBar.innerHTML = `
                <button id="header-back-btn" class="header-button"><i class="fas fa-arrow-left"></i></button>
                <div class="header-title">${title || ''}</div>
                <div style="width: 25px;"></div> <!-- Placeholder for centering -->
            `;
            
            // Request 7: Название задания на экране деталей убрано, title будет пустым в renderTaskDetails
            // Для экрана создания задания title будет "Создать задание"

            getEl('header-back-btn').onclick = goBack;

        } else {
            // Показываем нижнее меню, скрываем верхний бар
            bottomNav.style.display = 'flex';
            headerBar.style.display = 'none';
        }
        
        // Request 2: Управление активным табом
        document.querySelectorAll('.tab-item').forEach(tab => {
            tab.classList.remove('active');
        });
        const activeTab = document.querySelector(`.tab-item[data-screen="${screenId}"]`);
        if (activeTab) {
            tab.classList.add('active');
        }
    };
    
    // Функция для возврата назад (для кнопки и свайпа)
    const goBack = () => {
        if (screenHistory.length > 1) {
            // Удаляем текущий экран из истории
            screenHistory.pop(); 
            // Получаем предыдущий
            const prevScreenId = screenHistory[screenHistory.length - 1]; 
            
            // Специальная обработка для главного экрана
            if (prevScreenId === 'worker-tasks-container') {
                 setScreen(prevScreenId, null, false);
            } else {
                // Если экран деталей или создания, то снова показываем заголовок
                let title = '';
                let showBack = true;
                if (prevScreenId === 'task-details-container') {
                    // Перерендерим детали, если нужно
                    renderTaskDetails(currentTaskDetails);
                } else if (prevScreenId === 'create-task-container') {
                    title = 'Создать задание';
                }
                setScreen(prevScreenId, title, showBack);
            }
        }
    };


    // === ОБРАБОТЧИКИ НАВИГАЦИИ (Request 2) ===
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.onclick = () => {
            const screenId = tab.getAttribute('data-screen');
            setScreen(screenId);
        };
    });
    
    getEl('create-task-btn').onclick = () => {
        setScreen('create-task-container', 'Создать задание', true);
    };

    // === ФУНКЦИИ РЕНДЕРИНГА ===
    
    // Функция для получения иконки типа задания
    const getTaskIcon = (type) => {
        switch (type) {
            case 'subscribe':
                return '<i class="fas fa-user-plus" style="color: var(--subscribe-text);"></i>';
            case 'comment':
                return '<i class="fas fa-comment-dots" style="color: var(--comment-text);"></i>';
            case 'view':
                return '<i class="fas fa-eye" style="color: var(--view-text);"></i>';
            case 'other':
            default:
                return '<i class="fas fa-ellipsis-h" style="color: var(--other-text);"></i>';
        }
    };

    // Рендеринг карточки задания (Request 14, 15, 16)
    const renderTaskItem = (task) => {
        // Request 14 & 6: Выделяем задания создателя, если они на модерации
        const isMyTask = task.creatorId === currentUserData.id;
        const taskClass = isMyTask && task.isModeration ? 'creator-task' : '';
        const taskIcon = getTaskIcon(task.type);
        const availableInfo = `<i class="fas fa-users"></i> ${task.available}/${task.total}`; // Request 16: Информация о доступных заданиях

        return `
            <div class="task-item ${taskClass}" data-task-id="${task.id}">
                <!-- Логотип задания -->
                <div class="task-logo-icon" style="font-size: 20px; margin-right: 15px;">
                    ${taskIcon}
                </div>

                <div class="task-info">
                    <div class="task-title">${task.title}</div>
                    <div class="task-meta">
                        ${task.type === 'subscribe' ? 'Подписка' : task.type === 'comment' ? 'Комментарий' : task.type === 'view' ? 'Просмотр' : 'Другое'} 
                        ${isMyTask && task.isModeration ? ' <span style="color: var(--border-creator-task); font-weight: 600;">(Модерация)</span>' : ''}
                    </div>
                </div>
                
                <div class="task-action">
                    <!-- Заменяем ₽ на звезду -->
                    <span class="task-cost-badge">${CURRENCY_STAR} ${task.cost.toFixed(2)}</span>
                    <!-- Request 16: Вместо нижней стоимости - доступное количество -->
                    <span class="task-available-info">${availableInfo}</span>
                </div>
            </div>
        `;
    };

    // Рендеринг списка заданий
    const renderWorkerTasks = () => {
        const listContainer = getEl('task-list');
        if (!listContainer) return;

        // Фильтрация: Показываем все задания, + задания создателя, если они на модерации
        const filteredTasks = mockTasks.filter(task => {
            const isMyModerationTask = task.isCreatorTask && task.isModeration && task.creatorId === currentUserData.id;
            const isAvailableForWorker = !task.isCreatorTask || (task.isCreatorTask && !task.isModeration);
            
            // Если это мое задание на модерации ИЛИ это обычное задание для исполнителя (включая мои завершившие модерацию)
            return isMyModerationTask || isAvailableForWorker;
        });

        if (filteredTasks.length === 0) {
            listContainer.innerHTML = '<p style="text-align: center; color: var(--hint-color); padding-top: 20px;">Нет доступных заданий.</p>';
        } else {
            listContainer.innerHTML = filteredTasks.map(renderTaskItem).join('');

            // Добавляем обработчики нажатия на карточки
            listContainer.querySelectorAll('.task-item').forEach(item => {
                item.onclick = () => {
                    const taskId = parseInt(item.getAttribute('data-task-id'));
                    const task = mockTasks.find(t => t.id === taskId);
                    if (task) {
                        renderTaskDetails(task);
                    }
                };
            });
        }
        
        // Request 5: Обновление названия "Задания"
        const taskListTitle = document.querySelector('.task-list-title');
        if (taskListTitle) taskListTitle.textContent = 'Все задания на рынке';
        
        // Request 3: Обновление счетчика заданий в табе
        const taskCountDisplay = getEl('tasks-count-display');
        if (taskCountDisplay) taskCountDisplay.textContent = filteredTasks.length;

    };
    
    // Рендеринг деталей задания
    const renderTaskDetails = (task) => {
        currentTaskDetails = task; // Сохраняем для возможности "Назад"

        const detailsContainer = getEl('task-details-content');
        if (!detailsContainer) return;

        // Request 7: Убираем название задания из верхнего хедера.
        // Передаем пустой заголовок, но showBack = true
        setScreen('task-details-container', '', true); 
        
        const typeText = task.type === 'subscribe' ? 'Подписка' : task.type === 'comment' ? 'Комментарий' : task.type === 'view' ? 'Просмотр' : 'Другое';
        
        // Определяем, можно ли выполнять задание (для создателя - нет)
        const isExecutable = task.creatorId !== currentUserData.id; 
        
        detailsContainer.innerHTML = `
            <div class="task-details-card">
                <span class="task-type-badge" style="background-color: var(--${task.type}-bg); border: 1px solid var(--${task.type}-border); color: var(--${task.type}-text);">
                    ${getTaskIcon(task.type)} ${typeText}
                </span>
                
                <h2 class="task-details-title-display">${task.title}</h2>

                <div class="task-detail-section">
                    <h3>Описание задания</h3>
                    <p>${task.description}</p>
                </div>

                <div class="task-detail-section">
                    <h3>Условия и статистика</h3>
                    <ul class="task-detail-list">
                        <!-- Заменяем ₽ на звезду -->
                        <li><span>Цена за выполнение:</span><span>${CURRENCY_STAR} ${task.cost.toFixed(2)}</span></li>
                        <li><span>Доступно/Всего:</span><span>${task.available}/${task.total}</span></li>
                        <li><span>Пол:</span><span>Не важно</span></li>
                        <li><span>Возраст:</span><span>18-99</span></li>
                    </ul>
                </div>
            </div>
            
            <div class="task-details-card" style="padding-top: 0; padding-bottom: 0;">
                <button id="execute-task-btn" class="btn-primary" ${isExecutable ? '' : 'disabled'} style="margin-top: 20px;">
                    <!-- Заменяем ₽ на звезду -->
                    ${isExecutable ? `Начать выполнение (${task.cost.toFixed(2)} ${CURRENCY_STAR})` : 'Это Ваше задание'}
                </button>
            </div>
        `;
        
        // Обработчик для кнопки "Начать выполнение"
        const executeBtn = getEl('execute-task-btn');
        if (executeBtn && isExecutable) {
            executeBtn.onclick = () => {
                if (tg && tg.showAlert) tg.showAlert(`Вы начали выполнение задания №${task.id}.`);
                // В реальном приложении здесь будет переход на экран выполнения/таймер
            };
        }
    };
    
    // Рендеринг меню баланса (Request 12)
    const renderBalanceMenu = () => {
        const balanceList = getEl('balance-info-list');
        if (!balanceList) return;

        balanceList.innerHTML = `
            <div class="balance-item total">
                <span class="balance-item-title">Общий баланс</span>
                <!-- Заменяем ₽ на звезду -->
                <span class="balance-item-value">${CURRENCY_STAR} ${currentUserData.balance.toFixed(2)}</span>
            </div>
            <hr style="border: none; border-top: 1px solid var(--border-subtle); margin: 10px 0;">
            <div class="balance-item pending">
                <span class="balance-item-title">Ожидание поступлений (в эскроу)</span>
                <!-- Заменяем ₽ на звезду -->
                <span class="balance-item-value">${CURRENCY_STAR} ${currentUserData.pending_balance.toFixed(2)}</span>
            </div>
            <div class="balance-item">
                <span class="balance-item-title">Готово к выводу</span>
                <!-- Заменяем ₽ на звезду -->
                <span class="balance-item-value">${CURRENCY_STAR} ${currentUserData.withdrawable_balance.toFixed(2)}</span>
            </div>
        `;
        
        // Request 3: Обновление счетчика баланса в табе
        const balanceValueDisplay = getEl('balance-value-display');
        // Используем innerHTML для вставки иконки звезды рядом с числом
        if (balanceValueDisplay) balanceValueDisplay.innerHTML = `${currentUserData.balance.toFixed(2)} ${CURRENCY_STAR}`;
    };

    // Рендеринг профиля (почти без изменений)
    const renderProfile = () => {
        const container = getEl('profile-menu-container');
        if (!container) return;
        
        container.innerHTML = `
            <div class="profile-card">
                <div class="profile-header">
                    <div class="avatar">
                        <i class="fas fa-robot"></i>
                    </div>
                    <div>
                        <p class="profile-name">${currentUserData.name}</p>
                        <p class="profile-rating"><i class="fas fa-star"></i> Рейтинг: 4.8</p>
                    </div>
                </div>
                <ul class="profile-info-list">
                    <li><span>ID пользователя:</span><span>${currentUserData.id}</span></li>
                    <li><span>Пол:</span><span>${currentUserData.gender === 'M' ? 'Мужской' : 'Женский'}</span></li>
                    <li><span>Возраст:</span><span>${currentUserData.age}</span></li>
                    <li><span>Страна:</span><span>${currentUserData.country}</span></li>
                    <li><span>Выполнено заданий:</span><span>${currentUserData.tasks_completed}</span></li>
                </ul>
                <div id="terms-link" class="profile-link">
                    Пользовательское соглашение
                </div>
                ${currentUserData.isTermsAccepted ? '' : `<button id="accept-terms-btn" class="btn-primary" style="margin-top: 15px;">Принять условия</button>`}
            </div>
            
            <div class="profile-card">
                <p class="profile-name">Для Создателей Заданий</p>
                <div id="admin-bot-link" class="profile-link">
                    Добавить админ-бота для проверки
                </div>
            </div>
        `;
        
        // Обработчик для ссылки на условия
        getEl('terms-link').onclick = () => showModal('terms-modal');
        getEl('admin-bot-link').onclick = () => showModal('admin-bot-modal');
        
        // Обработчик для кнопки принятия условий
        const btnAccept = getEl('accept-terms-btn');
        if (btnAccept) {
            btnAccept.onclick = () => {
                // Имитация отправки данных (в реале - API-вызов к боту)
                if (tg && tg.sendData) {
                    tg.sendData('accept_agreement'); 
                    if (tg && tg.showAlert) tg.showAlert('Условия приняты. Бот подтвердит запись в БД.');
                } else {
                    currentUserData.isTermsAccepted = true;
                    if (tg && tg.showAlert) tg.showAlert('Спасибо! Вы приняли пользовательское соглашение. (Отладка)');
                }
                renderProfile();
            };
        }
    };


    // === УПРАВЛЕНИЕ МОДАЛЬНЫМИ ОКНАМИ ===
    const showModal = (modalId) => {
        const modal = getEl(modalId);
        if (modal) modal.style.display = 'flex';
    };

    const hideModal = (modalId) => {
        const modal = getEl(modalId);
        if (modal) modal.style.display = 'none';
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
    
    // === ЛОГИКА ФОРМЫ СОЗДАНИЯ ЗАДАНИЯ ===
    
    // Request 10: Логика кнопок увеличения/уменьшения
    const setupInputControls = (id, step, min, max) => {
        const input = getEl(id);
        const parent = input.closest('.input-with-controls');
        if (!parent) return;

        const decreaseBtn = parent.querySelector('.decrease-cost') || parent.querySelector('.decrease-quantity');
        const increaseBtn = parent.querySelector('.increase-cost') || parent.querySelector('.increase-quantity');

        const updateValue = (delta) => {
            let currentValue = parseFloat(input.value) || 0;
            let newValue = currentValue + delta;
            
            // Округляем до двух знаков после запятой для стоимости
            if (id === 'task-cost-input') {
                newValue = Math.round(newValue * 100) / 100;
            } else {
                 // Для количества - целое число
                 newValue = Math.round(newValue);
            }
            
            newValue = Math.max(min, Math.min(max, newValue));
            
            input.value = newValue.toFixed(id === 'task-cost-input' ? 2 : 0);
            updateTotalCost();
        };

        if (decreaseBtn) decreaseBtn.onclick = () => updateValue(-step);
        if (increaseBtn) increaseBtn.onclick = () => updateValue(step);
    };

    // Расчет итоговой стоимости
    const updateTotalCost = () => {
        const costInput = getEl('task-cost-input');
        const quantityInput = getEl('task-quantity-input');
        const totalDisplay = getEl('total-cost-display');
        
        if (costInput && quantityInput && totalDisplay) {
            const cost = parseFloat(costInput.value) || 0;
            const quantity = parseInt(quantityInput.value) || 0;
            const commissionRate = 0.15; // Пример: 15% комиссия
            
            const total = cost * quantity;
            const totalWithCommission = total * (1 + commissionRate);
            
            // Заменяем ₽ на звезду
            totalDisplay.innerHTML = `${totalWithCommission.toFixed(2)} ${CURRENCY_STAR}`;
        }
    };
    
    // Request 9: ЛОГИКА КАСТОМНОГО СКРОЛЛА ВОЗРАСТА
    let activeAgeInput = null; // Хранит активный инпут ('min' или 'max')
    const agePickerModal = getEl('age-picker-modal');
    const ageWheel = getEl('age-picker-wheel');
    const agePickerDoneBtn = getEl('age-picker-done');
    const agePickerTitle = getEl('age-picker-title');
    
    // Заполняем скролл цифрами
    const MIN_AGE = 18;
    const MAX_AGE = 99;
    for (let i = MIN_AGE; i <= MAX_AGE; i++) {
        const item = document.createElement('div');
        item.className = 'age-picker-item';
        item.textContent = i;
        item.setAttribute('data-age', i);
        ageWheel.appendChild(item);
    }

    // Функция для центрирования элемента в скролле
    const centerAgeItem = (age) => {
        const itemHeight = 30;
        const index = age - MIN_AGE;
        ageWheel.scrollTo({
            top: index * itemHeight,
            behavior: 'smooth'
        });
        updateAgeSelection();
    };
    
    // Обновление выделенного элемента при скролле
    const updateAgeSelection = () => {
        const itemHeight = 30;
        // Текущий индекс в центре колеса
        const centerIndex = Math.round(ageWheel.scrollTop / itemHeight);
        const selectedAge = centerIndex + MIN_AGE;
        
        // Снимаем выделение со всех
        ageWheel.querySelectorAll('.age-picker-item').forEach(item => item.classList.remove('selected'));
        
        // Выделяем центральный
        const selectedItem = ageWheel.querySelector(`.age-picker-item[data-age="${selectedAge}"]`);
        if (selectedItem) selectedItem.classList.add('selected');
        
        return selectedAge;
    };

    // Обработчик события скролла
    ageWheel.onscroll = () => {
        // Делаем небольшой таймаут, чтобы обновить после остановки скролла
        clearTimeout(ageWheel.scrollTimeout);
        ageWheel.scrollTimeout = setTimeout(() => {
            const selectedAge = updateAgeSelection();
            // Дополнительно привязываем к центру после остановки скролла
            centerAgeItem(selectedAge); 
        }, 150); 
    };
    
    // Открытие скролла
    document.querySelectorAll('.age-input').forEach(input => {
        input.onclick = () => {
            activeAgeInput = input;
            const currentAge = parseInt(input.value) || MIN_AGE;
            const target = input.getAttribute('data-target');
            
            agePickerTitle.textContent = target === 'min' ? 'Выберите минимальный возраст' : 'Выберите максимальный возраст';
            
            showModal('age-picker-modal');
            
            // Убедимся, что modal-backdrop не мешает (используем класс .age-picker-container)
            // Добавляем класс visible для CSS-анимации
            agePickerModal.classList.add('visible');
            
            // Устанавливаем колесо на текущее значение
            setTimeout(() => centerAgeItem(currentAge), 0);
        };
    });
    
    // Закрытие и сохранение значения
    agePickerDoneBtn.onclick = () => {
        const selectedAge = updateAgeSelection();
        if (activeAgeInput) {
            activeAgeInput.value = selectedAge;
        }
        
        // Проверка корректности min/max
        const minAgeInput = getEl('task-age-min-input');
        const maxAgeInput = getEl('task-age-max-input');
        
        if (minAgeInput && maxAgeInput) {
            const minVal = parseInt(minAgeInput.value);
            const maxVal = parseInt(maxAgeInput.value);
            
            if (minVal > maxVal) {
                // Если мин > макс, меняем их местами
                if (activeAgeInput.getAttribute('data-target') === 'min') {
                    maxAgeInput.value = minVal;
                } else {
                    minAgeInput.value = maxVal;
                }
            }
        }
        
        agePickerModal.classList.remove('visible');
        // hideModal('age-picker-modal'); // В данном случае, modal-backdrop не используется, скрываем через класс
    };

    // --- ЛОГИКА СВАЙПА ДЛЯ НАЗАД (Request 13) ---
    const mainContent = document.querySelector('.main-content');
    let startX = 0;
    let isSwiping = false;

    mainContent.addEventListener('touchstart', (e) => {
        if (screenHistory.length > 1) { // Свайп работает только на внутренних экранах
            startX = e.touches[0].clientX;
            isSwiping = true;
        }
    });

    mainContent.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;

        const currentX = e.touches[0].clientX;
        const diffX = currentX - startX;
        
        // Предотвращаем стандартный скролл, если движение достаточно горизонтальное и вправо
        if (diffX > 20 && Math.abs(e.touches[0].clientY - e.touches[0].clientY) < 50) {
            e.preventDefault(); 
        }
        
    }, { passive: false }); // { passive: false } для возможности preventDefault

    mainContent.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        isSwiping = false;

        // Определяем конечную точку
        const endX = e.changedTouches[0].clientX;
        const diffX = endX - startX;
        
        // Минимальное расстояние свайпа для "Назад" (например, 100px)
        const swipeThreshold = 100;

        if (diffX > swipeThreshold) {
            // Свайп слева направо - выполняем действие "Назад"
            goBack();
        }
    });

    // --- Запуск ---
    // Инициализация формы создания задания (Request 10)
    setupInputControls('task-cost-input', 0.05, 0.10, 100.00);
    setupInputControls('task-quantity-input', 10, 10, 10000);
    updateTotalCost(); // Первичный расчет
    getEl('task-cost-input').oninput = updateTotalCost;
    getEl('task-quantity-input').oninput = updateTotalCost;
    
    getEl('create-task-form').onsubmit = (e) => {
        e.preventDefault();
        if (tg && tg.showAlert) tg.showAlert('Задание отправлено на модерацию!');
        goBack(); // Возвращаемся к списку заданий
    };


    // Начинаем с экрана заданий
    renderWorkerTasks();
    renderBalanceMenu();
    renderProfile();
    setScreen('worker-tasks-container');
});