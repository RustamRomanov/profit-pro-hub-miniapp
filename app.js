// app.js
document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg) {
        tg.ready();
        // Включаем tg.expand() для лучшего UX
        tg.expand(); 
    }

    // === Вспомогательные функции и переменные ===
    const getEl = (id) => document.getElementById(id);
    const getElValue = (id) => getEl(id) ? getEl(id).value : null;
    
    const BOT_USERNAME = '@lookgroup_bot'; // Используем ник админ-бота

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
        // ИЗМЕНЕНИЯ В БАЛАНСЕ: balance - Общий баланс, pending_balance - Эскроу
        balance: 50.75, // Общий баланс (Total)
        pending_balance: 15.0, // Ожидание поступлений (в эскроу)
        tasks_completed: 154,
        isFilled: true,
        isAgreementAccepted: true, 
        isTermsAccepted: false 
    };
    
    // Мок-данные заданий (в реале должны загружаться из БД)
    // Добавлен creatorId для фильтрации и status для модерации
    let mockTasks = [
        { id: 1, type: 'subscribe', creatorId: 99999, title: 'Подписка на ТГ-канал', description: 'Подписаться и не отписываться 3 дня.', reward: 0.50, limit: 100, current_count: 85, proof: 'Скриншот подписки', url: 'https://t.me/example1', status: 'active', min_age: 18, gender: 'any' },
        { id: 2, type: 'comment', creatorId: 99999, title: 'Комментарий под постом', description: 'Оставить 3 осмысленных комментария.', reward: 1.50, limit: 50, current_count: 20, proof: 'Текст комментариев', url: 'https://t.me/example2', status: 'active', min_age: 25, gender: 'F' },
        // Задание созданное текущим пользователем (на модерации)
        { id: 3, type: 'view', creatorId: currentUserData.id, title: 'Просмотр нового видео', description: 'Посмотреть видео до конца.', reward: 0.30, limit: 200, current_count: 0, proof: 'Скриншот просмотра', url: 'https://youtube.com/example3', status: 'moderation', min_age: 18, gender: 'any' },
        // Задание созданное текущим пользователем (активное - попадает в общий список)
        { id: 4, type: 'subscribe', creatorId: currentUserData.id, title: 'Срочная подписка на чат', description: 'Подписаться и написать "Привет".', reward: 0.75, limit: 10, current_count: 5, proof: 'Скриншот подписки и сообщения', url: 'https://t.me/example4', status: 'active', min_age: 18, gender: 'any' },
        { id: 5, type: 'comment', creatorId: 99999, title: 'Отзыв на продукт', description: 'Написать честный отзыв 50+ слов.', reward: 5.00, limit: 10, current_count: 0, proof: 'Скриншот отзыва', url: 'https://mysite.com/product', status: 'active', min_age: 30, gender: 'any' },
    ];

    const FORBIDDEN_WORDS = ['мат', 'агрессия', 'порно', 'наркотики', 'мошенничество'];

    const COUNTRIES = [
        'Россия', 'Украина', 'Беларусь', 'Казахстан', 'Узбекистан', 'Армения', 'Другая'
    ];

    // --- Управление модальными окнами ---
    const showModal = (id) => {
        const modal = getEl(id);
        if (modal) {
            modal.style.display = 'flex';
            // Добавляем класс для анимации появления
            setTimeout(() => modal.classList.remove('hidden'), 10);
        }
    };

    const hideModal = (id) => {
        const modal = getEl(id);
        if (modal) {
            // Добавляем класс для анимации исчезновения
            modal.classList.add('hidden'); 
            // Скрываем после завершения анимации
            setTimeout(() => modal.style.display = 'none', 300);
        }
    };
    
    // --- Управление навигацией ---
    const navigateTo = (pageId) => {
        const pages = document.querySelectorAll('.app-page');
        pages.forEach(page => page.classList.remove('active'));

        const targetPage = getEl(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        // Обновление заголовка
        const titleMap = {
            'page-profile': 'Профиль',
            'page-tasks': 'Задания',
            'page-settings': 'Настройки'
        };
        getEl('header-title').textContent = titleMap[pageId.substring(1)] || 'Profit Pro Hub';

        // Обновление активного состояния вкладок (ИЗМЕНЕНИЕ: Подсветка активной вкладки)
        const navLinks = document.querySelectorAll('.app-nav a');
        navLinks.forEach(link => link.classList.remove('active'));
        const activeLink = document.querySelector(`.app-nav a[href="#${pageId}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }

        // Перерисовка нужной страницы
        if (pageId === 'page-profile') renderProfile();
        if (pageId === 'page-tasks') renderTasksPage();
        if (pageId === 'page-settings') renderSettings();
    };

    // --- РЕНДЕРИНГ СТРАНИЦ ---

    // 1. Рендеринг Профиля/Баланса (Обновлено)
    const renderProfile = () => {
        getEl('profile-name').textContent = currentUserData.name;
        getEl('profile-rating').textContent = currentUserData.rating ? currentUserData.rating.toFixed(1) : '5.0';
        getEl('stat-tasks-completed').textContent = currentUserData.tasks_completed;

        // Расчет и рендеринг Баланса (ИЗМЕНЕНИЕ: Новые поля)
        const readyToWithdraw = (currentUserData.balance - currentUserData.pending_balance).toFixed(2);

        getEl('balance-total').textContent = `${currentUserData.balance.toFixed(2)} ₽`; // Общий баланс
        getEl('balance-pending').textContent = `${currentUserData.pending_balance.toFixed(2)} ₽`; // Ожидание
        getEl('balance-ready-to-withdraw').textContent = `${readyToWithdraw} ₽`; // Готово к выводу (расчет)


        const statusCard = getEl('profile-status-card');
        const statusMessage = getEl('profile-status-message');
        const fillProfileBtn = getEl('fill-profile-button');
        const acceptTermsBtn = getEl('accept-terms-button');

        fillProfileBtn.style.display = 'none';
        acceptTermsBtn.style.display = 'none';
        statusCard.style.display = 'block';

        if (!currentUserData.isTermsAccepted) {
            statusMessage.innerHTML = `<i class="fas fa-exclamation-triangle danger-color"></i> Вы не приняли Пользовательское соглашение.`;
            acceptTermsBtn.style.display = 'block';
            statusCard.classList.remove('card-success');
        } else if (!currentUserData.isFilled) {
            statusMessage.innerHTML = `<i class="fas fa-exclamation-triangle danger-color"></i> Для работы необходимо заполнить анкету.`;
            fillProfileBtn.style.display = 'block';
            statusCard.classList.remove('card-success');
        } else {
            statusMessage.innerHTML = `<i class="fas fa-check-circle success-color"></i> Ваш профиль активен и готов к работе.`;
            statusCard.classList.add('card-success');
            statusCard.style.display = 'block';
        }
    };

    // Вспомогательная функция для рендеринга иконок
    const getTaskIcon = (type) => {
        switch (type) {
            case 'subscribe': return '<i class="fas fa-user-plus"></i>';
            case 'comment': return '<i class="fas fa-comment"></i>';
            case 'view': return '<i class="fas fa-eye"></i>';
            default: return '<i class="fas fa-tasks"></i>';
        }
    };
    
    // 2. Рендеринг страницы Заданий (Обновлено)
    const renderTasksPage = () => {
        const workerList = getEl('worker-tasks-list');
        const creatorList = getEl('creator-tasks-list');
        workerList.innerHTML = '';
        creatorList.innerHTML = '';

        // Фильтрация заданий
        const activeTasks = mockTasks.filter(t => t.status === 'active');
        // ИЗМЕНЕНИЕ: Задания создателя видны только если status: 'moderation'
        const moderationTasks = mockTasks.filter(
            t => t.creatorId === currentUserData.id && t.status === 'moderation'
        );

        // --- Рендеринг Все задания на рынке (Активные) ---
        if (activeTasks.length === 0) {
            workerList.innerHTML = '<div class="empty-state">Пока нет активных заданий.</div>';
        } else {
            activeTasks.forEach(task => {
                const item = document.createElement('div');
                item.className = `task-item ${task.type}`;
                item.setAttribute('data-task-id', task.id);
                // ИЗМЕНЕНИЕ: Структура Логотип -> Название -> Информация
                item.innerHTML = `
                    <div class="task-logo">${getTaskIcon(task.type)}</div>
                    <div class="task-content">
                        <div class="task-title">${task.title}</div>
                        <div class="task-info">
                            <span>Вып.: ${task.current_count}/${task.limit}</span>
                            <span class="task-reward">${task.reward.toFixed(2)} ₽</span>
                        </div>
                    </div>
                `;
                item.onclick = () => showTaskDetails(task.id);
                workerList.appendChild(item);
            });
        }

        // --- Рендеринг Мои задания (На модерации) ---
        if (moderationTasks.length === 0) {
            creatorList.innerHTML = '<div class="empty-state">Нет заданий на модерации.</div>';
        } else {
            moderationTasks.forEach(task => {
                const item = document.createElement('div');
                item.className = `task-item ${task.type}`;
                item.setAttribute('data-task-id', task.id);
                item.innerHTML = `
                    <div class="task-logo">${getTaskIcon(task.type)}</div>
                    <div class="task-content">
                        <div class="task-title">${task.title}</div>
                        <div class="task-info">
                            <span>На модерации...</span>
                            <span class="task-reward">${task.reward.toFixed(2)} ₽</span>
                        </div>
                    </div>
                `;
                item.onclick = () => showTaskDetails(task.id); // Можно просмотреть детали
                creatorList.appendChild(item);
            });
        }
    };

    // 3. Рендеринг Настроек
    const renderSettings = () => {
        // Логика настроек (сейчас только заглушка)
    };


    // --- ДЕТАЛИ ЗАДАНИЯ ---
    let currentTask = null;

    const showTaskDetails = (taskId) => {
        currentTask = mockTasks.find(t => t.id === taskId);
        if (!currentTask) return;

        // Наполняем модальное окно данными
        getEl('detail-task-logo').innerHTML = getTaskIcon(currentTask.type);
        
        const badge = getEl('detail-task-type');
        badge.textContent = currentTask.type;
        badge.className = `task-type-badge ${currentTask.type}-type`;

        // ИЗМЕНЕНИЕ: Убран дублирующийся заголовок задания
        getEl('detail-task-title').textContent = currentTask.title;

        getEl('detail-task-reward').textContent = `${currentTask.reward.toFixed(2)} ₽`;
        getEl('detail-task-limit').textContent = `${currentTask.current_count}/${currentTask.limit}`;
        getEl('detail-task-description').textContent = currentTask.description;
        getEl('detail-task-proof').textContent = currentTask.proof;
        getEl('task-proof-input').value = '';
        getEl('task-status-message').style.display = 'none';
        getEl('accept-task-button').style.display = 'block';

        showModal('task-details-modal');
    };

    // --- СОЗДАНИЕ ЗАДАНИЯ ---
    
    // Функция для заполнения узкого скролла возраста (ИЗМЕНЕНИЕ)
    const fillAgeSelect = (selectId, minAge, maxAge) => {
        const selectEl = getEl(selectId);
        if (!selectEl) return;
        selectEl.innerHTML = '';
        for (let age = minAge; age <= maxAge; age++) {
            const option = document.createElement('option');
            option.value = age;
            option.textContent = age;
            selectEl.appendChild(option);
        }
    };

    // Расчет общей стоимости
    const updateTaskCost = () => {
        const reward = parseFloat(getElValue('task-reward')) || 0;
        const limit = parseInt(getElValue('task-limit')) || 0;
        const totalCost = (reward * limit).toFixed(2);
        getEl('total-task-cost').textContent = `${totalCost} ₽`;
    };

    // Обработчик формы создания задания
    const handleCreateTask = (e) => {
        e.preventDefault();

        const taskData = {
            id: mockTasks.length + 1,
            creatorId: currentUserData.id,
            type: getElValue('task-type'),
            title: getElValue('task-title'),
            description: getElValue('task-description'),
            url: getElValue('task-url'),
            reward: parseFloat(getElValue('task-reward')),
            limit: parseInt(getElValue('task-limit')),
            min_age: parseInt(getElValue('task-min-age')),
            gender: getElValue('task-gender'),
            current_count: 0,
            proof: 'Скриншот выполнения', // Мок-подтверждение
            status: 'moderation' // Все новые задания идут на модерацию
        };

        // Проверка на запрещенные слова
        const titleCheck = FORBIDDEN_WORDS.some(word => taskData.title.toLowerCase().includes(word));
        const descCheck = FORBIDDEN_WORDS.some(word => taskData.description.toLowerCase().includes(word));

        if (titleCheck || descCheck) {
            if (tg.showAlert) tg.showAlert('Ошибка: Название или описание содержат запрещенные слова!');
            return;
        }
        
        // В реальном приложении: Отправить в БД
        mockTasks.push(taskData);

        if (tg.showAlert) tg.showAlert('Задание отправлено на модерацию!');
        
        hideModal('create-task-modal');
        // Перерисовать страницу заданий, чтобы увидеть новое задание на модерации
        renderTasksPage();
    };


    // --- ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ И ИНИЦИАЛИЗАЦИЯ ---

    // Инициализация выпадающих списков
    fillAgeSelect('task-min-age', 18, 65);
    fillAgeSelect('edit-age', 18, 65);
    
    // Заполнение стран для редактирования профиля
    const countrySelect = getEl('edit-country');
    if (countrySelect) {
        countrySelect.innerHTML = COUNTRIES.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // Обработчики навигации
    getEl('nav-profile').onclick = () => navigateTo('page-profile');
    getEl('nav-tasks').onclick = () => navigateTo('page-tasks');
    getEl('nav-settings').onclick = () => navigateTo('page-settings');
    
    // Обработчики модальных окон
    const ratingInfoBtn = getEl('rating-info-button');
    if (ratingInfoBtn) ratingInfoBtn.onclick = () => showModal('rating-modal');

    getEl('modal-close-rating-info').onclick = () => hideModal('rating-modal');
    getEl('modal-close-task-details').onclick = () => hideModal('task-details-modal');
    
    getEl('create-task-btn').onclick = () => {
        // Устанавливаем текущие значения (возраст, пол) пользователя по умолчанию
        getEl('task-min-age').value = currentUserData.age;
        getEl('task-gender').value = currentUserData.gender;
        showModal('create-task-modal');
    };
    getEl('modal-close-create-task').onclick = () => hideModal('create-task-modal');

    // Обновление стоимости при изменении полей (для формы создания)
    getEl('task-reward').oninput = updateTaskCost;
    getEl('task-limit').oninput = updateTaskCost;
    updateTaskCost(); // Первоначальный расчет

    // Обработчик формы создания задания
    getEl('create-task-form').onsubmit = handleCreateTask;


    // --- ЛОГИКА СВАЙПА (ИЗМЕНЕНИЕ: Жест "Назад") ---
    let touchStartX = 0;
    const SWIPE_THRESHOLD = 75; // Минимальное расстояние для срабатывания свайпа

    const checkSwipe = (e) => {
        // Проверяем, что это одинарный свайп
        if (e.changedTouches.length !== 1) return;

        const touchEndX = e.changedTouches[0].clientX;
        const deltaX = touchEndX - touchStartX;
        
        // Проверяем, что свайп направлен слева направо и достаточно длинный
        if (deltaX > SWIPE_THRESHOLD) {
            // Приоритет - закрытие активного модального окна
            if (getEl('task-details-modal').style.display === 'flex') {
                hideModal('task-details-modal');
                return true;
            }
            if (getEl('create-task-modal').style.display === 'flex') {
                hideModal('create-task-modal');
                return true;
            }
            // Добавить другие модальные окна, если нужно
        }
        return false;
    };

    // Начинаем отслеживание касания
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
        }
    }, { passive: true });

    // Обрабатываем завершение касания
    document.addEventListener('touchend', (e) => {
        if (checkSwipe(e)) {
            // Если свайп сработал (закрыл модальное окно), можно предотвратить скролл
            e.preventDefault();
        }
    });

    // --- Остальные обработчики ---

    // Модальное окно соглашения
    const btnTerms = getEl('accept-terms-btn');
    if (btnTerms) {
        btnTerms.onclick = () => {
            // В реальном приложении: Отправить подтверждение в БД
            if (tg && tg.initData) {
                // Имитация записи в БД
                currentUserData.isTermsAccepted = true;
                if (tg.showAlert) tg.showAlert('Условия приняты. Бот подтвердит запись в БД.');
            } else {
                // Режим отладки (вне Telegram)
                currentUserData.isTermsAccepted = true;
                if (tg && tg.showAlert) tg.showAlert('Спасибо! Вы приняли пользовательское соглашение. (Отладка)');
            }
            hideModal('terms-modal');
            renderProfile(); // Перерисовываем, чтобы обновить состояние
        };
    }

    const btnTermsClose = getEl('modal-close-terms');
    if (btnTermsClose) {
        btnTermsClose.onclick = () => hideModal('terms-modal');
    }
    
    // Модальное окно админ-бота
    const btnAdminInfo = getEl('setting-admin-bot-info');
    if (btnAdminInfo) btnAdminInfo.onclick = () => showModal('admin-bot-modal');
    
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
    
    // Модальное окно редактирования профиля
    const btnEditProfile = getEl('setting-edit-profile');
    if (btnEditProfile) btnEditProfile.onclick = () => {
        // Предварительное заполнение формы
        getEl('edit-age').value = currentUserData.age;
        getEl('edit-gender').value = currentUserData.gender;
        getEl('edit-country').value = currentUserData.country;
        showModal('edit-profile-modal');
    };
    getEl('modal-close-edit-profile').onclick = () => hideModal('edit-profile-modal');

    // Обработчик формы редактирования профиля
    getEl('edit-profile-form').onsubmit = (e) => {
        e.preventDefault();
        // В реальном приложении: Отправить в БД
        currentUserData.age = parseInt(getElValue('edit-age'));
        currentUserData.gender = getElValue('edit-gender');
        currentUserData.country = getElValue('edit-country');
        currentUserData.isFilled = true;
        
        if (tg.showAlert) tg.showAlert('Профиль обновлен!');
        hideModal('edit-profile-modal');
        renderProfile(); // Перерисовываем профиль
    };
    
    // Обработчик кнопки "Принять условия"
    const acceptTaskButton = getEl('accept-task-button');
    if (acceptTaskButton) {
        acceptTaskButton.onclick = () => {
            const proofInput = getElValue('task-proof-input');
            const statusMessageEl = getEl('task-status-message');
            
            if (!proofInput || proofInput.length < 5) {
                statusMessageEl.textContent = 'Пожалуйста, введите корректный отчет.';
                statusMessageEl.className = 'task-status-message error';
                statusMessageEl.style.display = 'block';
                return;
            }

            // В реальном приложении: Отправить подтверждение в БД
            if (tg.showAlert) tg.showAlert(`Отчет по заданию "${currentTask.title}" отправлен на проверку.`);
            
            statusMessageEl.textContent = 'Отчет отправлен. Ожидайте проверки.';
            statusMessageEl.className = 'task-status-message success';
            statusMessageEl.style.display = 'block';
            acceptTaskButton.style.display = 'none';

            // Имитация увеличения счетчика выполненных заданий (для демонстрации)
            currentTask.current_count += 1;
            currentUserData.tasks_completed += 1;

            // Обновляем страницу заданий и профиль
            renderTasksPage();
            renderProfile();
        };
    }
    
    // --- Запуск --
    navigateTo('page-profile');
});