// app.js
document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg) {
        tg.ready();
        // РЕКОМЕНДАЦИЯ: Включаем tg.expand() для лучшего UX
        tg.expand();
    }

    // === Вспомогательные ===
    const getEl = id => document.getElementById(id);
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
        balance: 50.75, // Общий баланс
        pending_balance: 15.0, // Ожидание поступлений (эскроу)
        tasks_completed: 154,
        isFilled: true,
        isAgreementAccepted: true, 
        isTermsAccepted: false 
    };
    
    // Новое поле для "Готово к выводу"
    currentUserData.withdrawableBalance = Math.max(0, currentUserData.balance - currentUserData.pending_balance);

    // Мок-данные заданий
    const tasks = [
        { id: 1, type: 'subscribe', title: 'Подписка на канал "Crypto News"', description: 'Подписаться на канал и сделать скриншот.', price: 0.15, total: 1000, completed: 850, status: 'active', creatorId: 999 },
        { id: 2, type: 'comment', title: 'Оставить 5 комментариев под постом', description: 'Комментарии должны быть осмысленными, не менее 5 слов.', price: 0.50, total: 200, completed: 195, status: 'active', creatorId: 12345 }, // Это задание создателя
        { id: 3, type: 'view', title: 'Просмотр видео и лайк', description: 'Просмотреть видео до конца и поставить лайк.', price: 0.05, total: 5000, completed: 4980, status: 'active', creatorId: 999 },
        { id: 4, type: 'repost', title: 'Репост в 3 чата', description: 'Сделать репост рекламного поста в 3 активных чата.', price: 0.30, total: 300, completed: 10, status: 'active', creatorId: 999 },
        { id: 5, type: 'subscribe', title: 'Тестовое задание на модерации', description: 'Это задание, которое создал текущий пользователь и оно на модерации.', price: 0.10, total: 50, completed: 0, status: 'on_moderation', creatorId: 12345 }, // Задание на модерации
        { id: 6, type: 'comment', title: 'Выполненное задание создателя', description: 'Это задание создателя, которое прошло модерацию и активно.', price: 0.25, total: 100, completed: 50, status: 'active', creatorId: 12345 },
    ];

    // === Управление экранами (роутинг и история) ===
    let screenHistory = []; // Стек истории экранов

    const updateHeader = (containerId) => {
        const headerBar = getEl('global-header-bar');
        if (!headerBar) return;
        headerBar.innerHTML = '';
        
        let headerContent = '';
        const isWorkerTasks = containerId === 'worker-tasks-container';

        if (isWorkerTasks) {
            // Для экрана Заданий: только кнопка "Создать задание"
            // Надпись "Задания" убрана из шапки, как запрошено.
            headerContent = `
                <span class="header-title"></span>
                <button class="create-task-btn" id="btn-open-creator-form">
                    Создать задание
                </button>
            `;
        } else if (containerId === 'creator-menu-container') {
            headerContent = `<span class="header-title">Мои задания</span>`;
        } else if (containerId === 'balance-menu-container') {
            headerContent = `<span class="header-title">Баланс</span>`;
        } else if (containerId === 'profile-menu-container') {
            headerContent = `<span class="header-title">Профиль</span>`;
        } else if (containerId === 'creator-task-form-container') {
            // Заголовок формы создания задания уже есть внутри контейнера
            headerContent = `<span class="header-title"></span>`;
        }
        
        headerBar.innerHTML = headerContent;

        // Привязываем обработчик к кнопке "Создать задание" (если она есть)
        const btnOpenCreatorForm = getEl('btn-open-creator-form');
        if (btnOpenCreatorForm) {
            btnOpenCreatorForm.onclick = () => setScreen('creator-task-form-container');
        }
    };

    const setScreen = (containerId, skipHistory = false) => {
        // 1. Управление историей
        if (!skipHistory && screenHistory[screenHistory.length - 1] !== containerId) {
            screenHistory.push(containerId);
        }
        
        // 2. Отображение контейнеров
        const containers = document.querySelectorAll('.screen-container');
        containers.forEach(container => {
            container.style.display = container.id === containerId ? 'block' : 'none';
        });

        // 3. Обновление активной вкладки
        const tabButtons = document.querySelectorAll('.tab-button');
        const isWorkerTaskDetail = containerId.startsWith('worker-task-detail-');
        const isCreatorTaskDetail = containerId.startsWith('creator-task-detail-');
        const activeContainerId = isWorkerTaskDetail ? 'worker-tasks-container' : containerId;

        tabButtons.forEach(button => {
            button.classList.remove('active');
            if (button.dataset.target === activeContainerId) {
                button.classList.add('active');
            }
        });
        
        // 4. Обновление заголовка
        updateHeader(containerId);

        // 5. Управление кнопкой Назад в Telegram (показываем, если не на главном экране)
        if (tg && tg.BackButton) {
            if (screenHistory.length > 1) {
                tg.BackButton.show();
            } else {
                tg.BackButton.hide();
            }
        }
    };

    const goBack = () => {
        // Удаляем текущий экран
        if (screenHistory.length > 1) {
            screenHistory.pop(); 
            const previousScreenId = screenHistory[screenHistory.length - 1];
            
            // Если предыдущий экран - это detail, нужно его пересоздать/найти.
            // В нашем мок-примере, мы просто возвращаемся к родительскому контейнеру.
            const targetScreen = previousScreenId.includes('-detail-') ? screenHistory[screenHistory.length - 2] : previousScreenId;
            
            setScreen(targetScreen || 'worker-tasks-container', true); 

        } else if (tg && tg.close) {
            // Если истории нет, закрываем Mini App
            tg.close();
        }
    };

    // Привязываем кнопку "Назад" Telegram к нашей функции goBack
    if (tg && tg.BackButton) {
        tg.BackButton.onClick(goBack);
    }
    
    // === Инициализация жестов (Swipe Back) ===
    const initSwipeBack = () => {
        const appRoot = getEl('app-root');
        let startX = 0;
        let isSwiping = false;

        appRoot.addEventListener('touchstart', (e) => {
            // Игнорируем, если это скролл внутри элементов с прокруткой (scrollable-content)
            if (e.target.closest('.scrollable-content')) return;
            
            startX = e.touches[0].clientX;
            isSwiping = true;
        }, { passive: true }); 

        appRoot.addEventListener('touchmove', (e) => {
            if (!isSwiping) return;

            const currentX = e.touches[0].clientX;
            const deltaX = currentX - startX;

            // Если движение в основном вниз или влево, это не жест "назад", отменяем свайп
            if (deltaX < -10 || Math.abs(e.touches[0].clientY - e.changedTouches[0].clientY) > 10) { 
                isSwiping = false;
            }
        }, { passive: true });

        appRoot.addEventListener('touchend', (e) => {
            if (!isSwiping) return;
            isSwiping = false;

            const endX = e.changedTouches[0].clientX;
            const deltaX = endX - startX;

            // Условие для жеста назад: движение вправо более 50px
            const threshold = 50; 
            if (deltaX > threshold) {
                goBack();
            }
        });
    };

    // === Рендеринг элементов UI ===

    const taskTypeMap = {
        'subscribe': { label: 'Подписка', icon: 'fa-user-plus' },
        'comment': { label: 'Комментарий', icon: 'fa-comment-dots' },
        'view': { label: 'Просмотр', icon: 'fa-eye' },
        'repost': { label: 'Репост', icon: 'fa-share' },
    };

    const renderTaskCard = (task) => {
        const typeInfo = taskTypeMap[task.type] || { label: 'Другое', icon: 'fa-star' };
        const progress = task.total > 0 ? (task.completed / task.total) * 100 : 0;
        
        return `
            <div class="task-card" data-task-id="${task.id}">
                <div class="task-header">
                    <h3 class="task-title">${task.title}</h3>
                    <div class="task-price">+${task.price.toFixed(2)} ₽</div>
                </div>
                <div class="task-meta">
                    <span class="task-type-badge type-${task.type}">
                        <i class="fas ${typeInfo.icon}"></i> ${typeInfo.label}
                    </span>
                    <span>Осталось: ${task.total - task.completed}</span>
                </div>
                <div class="task-progress">
                    <span>Выполнено: ${progress.toFixed(0)}%</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${progress}%;"></div>
                </div>
            </div>
        `;
    };

    const renderTaskDetail = (task) => {
        const typeInfo = taskTypeMap[task.type] || { label: 'Другое', icon: 'fa-star' };
        
        // Удаляем старый контейнер, если он существует
        let detailContainer = getEl('task-detail-container');
        if (detailContainer) detailContainer.remove();
        
        // Создаем новый контейнер, чтобы он отображался поверх основного
        detailContainer = document.createElement('div');
        detailContainer.id = 'task-detail-container';
        detailContainer.classList.add('screen-container');
        detailContainer.classList.add('scrollable-content');
        detailContainer.style.display = 'block'; // Показываем сразу
        
        detailContainer.innerHTML = `
            <div class="detail-header">
                <!-- Логотип задания -->
                <i class="fas ${typeInfo.icon} task-logo"></i>
                <!-- Название задания -->
                <h2 class="detail-title">${task.title}</h2>
                <!-- Информации -->
                <span class="task-type-badge type-${task.type}">
                    ${typeInfo.label}
                </span>
                <div class="detail-price">
                    Вознаграждение: ${task.price.toFixed(2)} ₽
                </div>
            </div>

            <div class="detail-section">
                <h4>Описание задания</h4>
                <p>${task.description}</p>
            </div>

            <div class="detail-section">
                <h4>Требования к исполнителю</h4>
                <ul>
                    <li>Возраст: ${currentUserData.age}</li>
                    <li>Пол: ${currentUserData.gender === 'M' ? 'Мужской' : 'Женский'}</li>
                    <li>Страна: ${currentUserData.country}</li>
                </ul>
            </div>
            
            <div class="detail-section">
                <h4>Подтверждение</h4>
                <p>Необходимо предоставить скриншот выполненного действия.</p>
                <div class="form-group">
                    <label for="proof-input">Ссылка на скриншот / Файл</label>
                    <input type="text" id="proof-input" placeholder="Введите ссылку или нажмите на кнопку ниже">
                </div>
                <!-- Кнопка для загрузки файла (в Mini App это часто делается через бота) -->
                <button class="btn-secondary" id="btn-upload-proof">
                    <i class="fas fa-upload"></i> Загрузить файл через бота
                </button>
            </div>

            <button class="btn-primary" id="btn-complete-task">
                Подтвердить выполнение
            </button>
            <button class="btn-secondary" id="btn-cancel-task">
                Отменить
            </button>
        `;

        getEl('app-body').appendChild(detailContainer);
        setScreen('task-detail-container', false); // Устанавливаем экран в историю

        // Логика кнопок
        getEl('btn-complete-task').onclick = () => {
            if (tg && tg.showAlert) tg.showAlert('Задание отправлено на проверку! Вам будет начислено ' + task.price.toFixed(2) + ' ₽.');
            goBack();
        };

        getEl('btn-cancel-task').onclick = () => {
            if (tg && tg.showAlert) tg.showAlert('Задание отменено.');
            goBack();
        };
    };
    
    // --- Рендеринг Заданий Исполнителя ---
    const renderWorkerTasks = () => {
        const container = getEl('worker-tasks-list');
        if (!container) return;

        // Фильтруем активные задания, которые не принадлежат текущему пользователю
        const activeTasks = tasks.filter(t => t.status === 'active' && t.creatorId !== currentUserData.id);

        container.innerHTML = `
            <h2 class="section-title">Все задания на рынке</h2>
            ${activeTasks.map(renderTaskCard).join('') || '<p class="hint-color">Нет доступных заданий.</p>'}
        `;

        // Добавляем обработчики кликов на карточки
        container.querySelectorAll('.task-card').forEach(card => {
            card.onclick = () => {
                const taskId = parseInt(card.dataset.taskId);
                const task = tasks.find(t => t.id === taskId);
                if (task) renderTaskDetail(task);
            };
        });
    };

    // --- Рендеринг Заданий Создателя (Новая логика: только на модерации) ---
    const renderCreatorTasks = () => {
        const container = getEl('creator-tasks-list');
        if (!container) return;

        // Фильтруем задания, созданные пользователем, которые находятся "на модерации"
        const creatorTasksOnModeration = tasks.filter(t => t.creatorId === currentUserData.id && t.status === 'on_moderation');

        container.innerHTML = `
            <div class="info-card">
                <h4>Управление заданиями</h4>
                <p>Здесь отображаются Ваши задания, находящиеся на модерации.</p>
            </div>
            <h2 class="section-title">На модерации (${creatorTasksOnModeration.length})</h2>
            ${creatorTasksOnModeration.map(task => `
                <div class="task-card">
                    <div class="task-header">
                        <h3 class="task-title">${task.title}</h3>
                        <div class="task-price status-moderation">
                            ${task.status === 'on_moderation' ? 'На модерации' : ''}
                        </div>
                    </div>
                    <p class="task-description-short">${task.description}</p>
                </div>
            `).join('') || '<p class="hint-color">Нет заданий, ожидающих модерации.</p>'}
            
            <button class="btn-primary" id="btn-open-creator-form-2">
                Создать новое задание
            </button>
            <button class="btn-secondary" id="btn-admin-bot">
                Настроить админ-бота
            </button>
        `;
        
        // Привязываем обработчик к кнопке "Создать новое задание"
        getEl('btn-open-creator-form-2').onclick = () => setScreen('creator-task-form-container');
        
        // Привязываем кнопку модального окна админ-бота
        getEl('btn-admin-bot').onclick = () => showModal('admin-bot-modal');
    };

    // --- Рендеринг Формы Создания Задания ---
    const renderCreatorTaskForm = () => {
        const container = getEl('creator-task-form');
        if (!container) return;

        // Функция для генерации узкого скролла для возраста (Новое требование)
        const renderAgeSelect = (id, currentAge) => {
            let options = '';
            for (let i = 18; i <= 99; i++) {
                options += `<option value="${i}" ${i === currentAge ? 'selected' : ''}>${i}</option>`;
            }
            return `
                <select id="${id}" class="age-select">
                    ${options}
                </select>
            `;
        };

        container.innerHTML = `
            <div class="form-group">
                <label for="task-type">Тип задания</label>
                <select id="task-type">
                    <option value="subscribe">Подписка</option>
                    <option value="comment">Комментарий</option>
                    <option value="view">Просмотр</option>
                    <option value="repost">Репост</option>
                </select>
            </div>

            <div class="form-group">
                <label for="task-title-input">Название задания</label>
                <input type="text" id="task-title-input" placeholder="Краткое и понятное название" />
            </div>

            <div class="form-group">
                <label for="task-description-input">Подробное описание и условия</label>
                <textarea id="task-description-input" rows="4" placeholder="Что нужно сделать, какие требования к исполнителю, что предоставить в качестве отчета"></textarea>
            </div>

            <!-- Стоимость и Количество на одной строке (Новое требование) -->
            <div class="form-row">
                <div class="form-group">
                    <label for="task-price-input">Стоимость (₽ за 1)</label>
                    <input type="number" id="task-price-input" min="0.01" step="0.01" value="0.10" />
                </div>
                <div class="form-group">
                    <label for="task-quantity-input">Количество выполнений</label>
                    <input type="number" id="task-quantity-input" min="1" step="1" value="100" />
                </div>
            </div>
            
            <h3 class="section-title" style="margin-top: 25px;">Требования к аудитории</h3>
            
            <div class="form-group">
                <label>Минимальный возраст (используется скролл)</label>
                ${renderAgeSelect('audience-min-age', 18)}
            </div>

            <div class="form-group">
                <label for="audience-gender">Пол</label>
                <select id="audience-gender">
                    <option value="any">Любой</option>
                    <option value="M">Мужской</option>
                    <option value="F">Женский</option>
                </select>
            </div>
            
            <button class="btn-primary" id="btn-publish-task">
                Опубликовать (Депозит: 10.00 ₽)
            </button>
        `;
        
        getEl('btn-publish-task').onclick = () => {
            // Мок-логика создания задания
            const title = getEl('task-title-input').value || 'Новое задание';
            tasks.push({
                id: tasks.length + 1,
                type: getEl('task-type').value,
                title: title,
                description: getEl('task-description-input').value || 'Описание...',
                price: parseFloat(getEl('task-price-input').value),
                total: parseInt(getEl('task-quantity-input').value),
                completed: 0,
                status: 'on_moderation', // Все новые задания сразу на модерации
                creatorId: currentUserData.id
            });
            if (tg && tg.showAlert) tg.showAlert(`Задание "${title}" отправлено на модерацию.`);
            goBack(); // Возврат назад после создания
            renderCreatorTasks();
        };
    };


    // --- Рендеринг Баланса (Обновленная терминология) ---
    const renderBalanceMenu = () => {
        const container = getEl('balance-info');
        if (!container) return;

        container.innerHTML = `
            <div class="info-card">
                <h4>Общий баланс</h4>
                <p class="balance-amount">${currentUserData.balance.toFixed(2)} ₽</p>
            </div>
            
            <div class="info-card">
                <h4>Ожидание поступлений (в эскроу)</h4>
                <p>${currentUserData.pending_balance.toFixed(2)} ₽</p>
                <span class="hint-color" style="font-size: 12px; margin-top: 5px;">
                    Средства, зарезервированные до подтверждения выполнения заданий.
                </span>
            </div>

            <div class="info-card">
                <h4>Готово к выводу</h4>
                <p>${currentUserData.withdrawableBalance.toFixed(2)} ₽</p>
                <span class="hint-color" style="font-size: 12px; margin-top: 5px;">
                    Доступно для моментального вывода.
                </span>
            </div>

            <button class="btn-primary" style="margin-top: 15px;">
                Вывести средства
            </button>
        `;
    };

    // --- Рендеринг Профиля и Формы Профиля ---
    const renderProfileFill = () => {
        const formContainer = getEl('profile-fill-form');
        if (!formContainer) return;

        // Функция для генерации узкого скролла для возраста (Новое требование)
        const renderAgeSelect = (id, currentAge) => {
            let options = '';
            for (let i = 18; i <= 99; i++) {
                options += `<option value="${i}" ${i === currentAge ? 'selected' : ''}>${i}</option>`;
            }
            return `
                <select id="${id}" class="age-select">
                    ${options}
                </select>
            `;
        };

        formContainer.innerHTML = `
            <h3 class="section-title">Заполните ваш профиль</h3>
            <p class="hint-color">
                Чтобы получить доступ к заданиям, необходимо заполнить базовую информацию.
            </p>
            <div class="form-group">
                <label for="profile-age">Возраст</label>
                ${renderAgeSelect('profile-age', currentUserData.age)}
            </div>
            <div class="form-group">
                <label for="profile-gender">Пол</label>
                <select id="profile-gender">
                    <option value="M" ${currentUserData.gender === 'M' ? 'selected' : ''}>Мужской</option>
                    <option value="F" ${currentUserData.gender === 'F' ? 'selected' : ''}>Женский</option>
                </select>
            </div>
            <div class="form-group">
                <label for="profile-country">Страна</label>
                <input type="text" id="profile-country" value="${currentUserData.country}" placeholder="Например, Россия" />
            </div>
            <button class="btn-primary" id="btn-save-profile">Сохранить данные</button>
        `;

        getEl('btn-save-profile').onclick = () => {
            currentUserData.age = parseInt(getEl('profile-age').value);
            currentUserData.gender = getEl('profile-gender').value;
            currentUserData.country = getEl('profile-country').value;
            currentUserData.isFilled = true;

            if (tg && tg.showAlert) tg.showAlert('Профиль обновлен!');
            renderProfile(); // Перерисовываем основной профиль
        };
    };

    const renderProfile = () => {
        const container = getEl('profile-info');
        const fillFormContainer = getEl('profile-fill-form');

        if (!currentUserData.isFilled) {
            container.innerHTML = '';
            renderProfileFill();
            return;
        }

        fillFormContainer.innerHTML = ''; // Скрываем форму заполнения
        
        container.innerHTML = `
            <div class="info-card" style="align-items: center;">
                <i class="fas fa-user-circle" style="font-size: 40px; color: var(--text-color); margin-bottom: 10px;"></i>
                <p style="font-size: 20px; font-weight: 700;">${currentUserData.name}</p>
                <span class="hint-color">Ваш ID: ${currentUserData.id}</span>
            </div>
            
            <div class="detail-section">
                <h4>Статистика</h4>
                <p>Выполнено заданий: <strong>${currentUserData.tasks_completed}</strong></p>
                <p>Рейтинг: 
                    <span style="color: var(--accent-color);">
                        <i class="fas fa-star"></i> 4.8 
                        <span class="header-link" id="btn-open-rating-modal">(Подробнее)</span>
                    </span>
                </p>
            </div>

            <div class="detail-section">
                <h4>Личные данные</h4>
                <p>Возраст: <strong>${currentUserData.age}</strong></p>
                <p>Пол: <strong>${currentUserData.gender === 'M' ? 'Мужской' : 'Женский'}</strong></p>
                <p>Страна: <strong>${currentUserData.country}</strong></p>
            </div>
            
            <button class="btn-secondary" id="btn-edit-profile">
                Редактировать профиль
            </button>
            
            <button class="btn-secondary" id="btn-terms-modal" style="margin-top: 10px;">
                Пользовательское соглашение
            </button>
            
            <!-- Добавляем обработчик для модального окна рейтинга -->
            <button class="btn-secondary" id="btn-admin-bot-2" style="margin-top: 10px;">
                Настроить админ-бота (Для создателей)
            </button>
        `;

        getEl('btn-edit-profile').onclick = renderProfileFill;
        getEl('btn-terms-modal').onclick = () => showModal('terms-modal');
        getEl('btn-open-rating-modal').onclick = () => showModal('rating-modal');
        getEl('btn-admin-bot-2').onclick = () => showModal('admin-bot-modal');
    };


    // === Управление модальными окнами ===
    const showModal = (id) => {
        const modal = getEl(id);
        if (modal) modal.style.display = 'flex';
    };

    const hideModal = (id) => {
        const modal = getEl(id);
        if (modal) modal.style.display = 'none';
    };

    // --- Инициализация и обработчики модалок ---
    // Модальное окно соглашения
    const termsCheckbox = getEl('accept-terms-checkbox');
    const btnAcceptTerms = getEl('modal-accept-terms');

    if (termsCheckbox) {
        termsCheckbox.onchange = () => {
            btnAcceptTerms.disabled = !termsCheckbox.checked;
        };
    }
    
    if (btnAcceptTerms) {
        btnAcceptTerms.onclick = () => {
            currentUserData.isTermsAccepted = true;
            hideModal('terms-modal');
            
            // Здесь должна быть логика отправки данных в БД через бота
            if (tg && tg.sendData) {
                // Мок-отправка данных о принятии
                // В реальном приложении: tg.sendData(JSON.stringify({ action: 'accept_terms', status: true }));
                if (tg && tg.showAlert) tg.showAlert('Условия приняты. Бот подтвердит запись в БД.');
            } else {
                currentUserData.isTermsAccepted = true;
                if (tg && tg.showAlert) tg.showAlert('Спасибо! Вы приняли пользовательское соглашение. (Отладка)');
            }

            renderProfile(); 
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
    
    // Модальное окно рейтинга
    const btnRatingClose = getEl('modal-close-rating');
    if (btnRatingClose) {
        btnRatingClose.onclick = () => hideModal('rating-modal');
    }

    // --- Навигация по вкладкам ---
    document.querySelectorAll('.tab-button').forEach(button => {
        button.onclick = () => {
            const targetId = button.dataset.target;
            setScreen(targetId);
            // Перерисовываем содержимое при смене вкладок
            if (targetId === 'worker-tasks-container') renderWorkerTasks();
            if (targetId === 'creator-menu-container') renderCreatorTasks();
            if (targetId === 'balance-menu-container') renderBalanceMenu();
            if (targetId === 'profile-menu-container') renderProfile();
        };
    });

    // --- Запуск ---\n
    initSwipeBack(); // Инициализируем жест свайпа
    renderWorkerTasks();
    renderCreatorTasks(); // Выполняем рендеринг, чтобы обновить содержимое
    renderBalanceMenu(); 
    renderProfile(); 
    
    // Начинаем с экрана заданий
    setScreen('worker-tasks-container');
});