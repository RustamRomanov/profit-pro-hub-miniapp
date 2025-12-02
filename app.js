// app.js
document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg) {
        tg.ready();
        tg.expand();
    }

    // === Вспомогательные ===
    const BOT_USERNAME = '@lookgroup_bot';

    const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user
        ? tg.initDataUnsafe.user
        : { id: 12345, username: 'User' };

    const currentUserData = {
        id: user.id,
        name: user.username || user.first_name || 'Пользователь',
        age: 25,
        gender: 'M',
        country: 'Россия',
        balance: 50.75,
        pending_balance: 15.0,
        tasks_completed: 154,
        isFilled: true,
        isAgreementAccepted: true,
        isTermsAccepted: false
    };

    const FORBIDDEN_WORDS = ['мат', 'агрессия', 'порно', 'наркотики', 'мошенничество'];

    const COUNTRIES = [
        'Россия', 'Украина', 'Казахстан', 'Беларусь', 'Узбекистан', 'Армения',
        'Грузия', 'Азербайджан', 'Молдова', 'Кыргызстан', 'Таджикистан',
        'Туркменистан', 'Латвия', 'Литва', 'Эстония'
    ].sort();

    // mock-данные
    let workerAvailableTasks = [
        {
            id: 1,
            title: 'Подписка на VIP-канал',
            price: 1.5,
            slots: 100,
            type: 'subscribe',
            link: 'https://t.me/example_channel_vip',
            description: 'Подписаться на канал и не отписываться минимум 7 дней.',
            customer_id: 54321
        },
        {
            id: 2,
            title: 'Комментарий под постом',
            price: 0.8,
            slots: 50,
            type: 'comment',
            link: 'https://t.me/example_chat_review',
            description: 'Оставить осмысленный комментарий (минимум 15 слов) под постом.',
            customer_id: 88888
        },
        {
            id: 3,
            title: 'Просмотр публикации',
            price: 0.3,
            slots: 300,
            type: 'view',
            link: 'https://t.me/example_post_view',
            description: 'Открыть и просмотреть публикацию до конца.',
            customer_id: 99999
        }
    ];

    workerAvailableTasks.sort((a, b) => b.price - a.price);

    const transactionsHistory = [
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
        }
    ];

    let performedTaskIds = [];
    let selectedTask = null;

    // контейнеры экранов
    const containers = {
        workerTasks: document.getElementById('worker-tasks-container'),
        taskDetails: document.getElementById('task-details-container'),
        createTask: document.getElementById('create-task-container'),
        balanceMenu: document.getElementById('balance-menu-container'),
        profile: document.getElementById('profile-container')
    };

    const tabItems = document.querySelectorAll('.tab-item');

    function getEl(id) {
        return document.getElementById(id);
    }

    // === Вспомогательные функции ===

    function getTaskColor(type, isOwn) {
        if (isOwn) {
            return {
                background: 'var(--own-task-bg)',
                border: '1px solid var(--own-task-border)'
            };
        }
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

    function generateOptions(start, end, selected) {
        let html = '';
        for (let i = start; i <= end; i++) {
            html += `<option value="${i}"${i === selected ? ' selected' : ''}>${i}</option>`;
        }
        return html;
    }

    function generateCountryOptions(list, selected) {
        let html = '';
        list.forEach((c) => {
            html += `<option value="${c}"${c === selected ? ' selected' : ''}>${c}</option>`;
        });
        return html;
    }

    function updateTabActive(name) {
        tabItems.forEach((item) => {
            const target = item.getAttribute('data-target');
            if (target === name) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    function updateTabBadges() {
        const tasksSub = getEl('tab-tasks-subtitle');
        if (tasksSub) {
            tasksSub.textContent = `Доступно: ${workerAvailableTasks.length}`;
        }

        const balSub = getEl('tab-balance-subtitle');
        if (balSub) {
            balSub.textContent =
                `${currentUserData.balance.toFixed(2)} ⭐️ ` +
                `(${currentUserData.pending_balance.toFixed(2)})`;
        }

        const profSub = getEl('tab-profile-subtitle');
        if (profSub) {
            const n = currentUserData.name || 'Пользователь';
            profSub.textContent = n.length > 8 ? n.slice(0, 8) + '…' : n;
        }
    }

    function hideAllContainers() {
        Object.values(containers).forEach((c) => {
            if (c) c.style.display = 'none';
        });
    }

    function showContainer(name) {
        hideAllContainers();
        const c = containers[name];
        if (c) c.style.display = 'block';
        updateTabActive(name);
        updateTabBadges();

        if (tg && tg.MainButton) {
            tg.MainButton.hide();
            tg.MainButton.offClick && tg.MainButton.offClick();
        }

        if (name === 'workerTasks') renderWorkerTasks();
        if (name === 'taskDetails') renderTaskDetails();
        if (name === 'createTask') renderCreateTask();
        if (name === 'balanceMenu') renderBalanceMenu();
        if (name === 'profile') renderProfile();
    }

    tabItems.forEach((item) => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            showContainer(target);
        });
    });

    // === ЗАДАНИЯ ===

    function renderWorkerTasks() {
        const container = containers.workerTasks;
        if (!container) return;

        const totalTasks = workerAvailableTasks.length;

        // свои задания сверху
        const ownTasks = workerAvailableTasks.filter(
            (t) => t.customer_id === currentUserData.id || t.isOwn
        );
        const marketTasks = workerAvailableTasks.filter(
            (t) => !(t.customer_id === currentUserData.id || t.isOwn)
        );

        let html = `
            <div class="tasks-header-block">
                <h2 class="screen-title">Задания</h2>
                <div class="tasks-counter">
                    Доступно заданий на рынке: <strong>${totalTasks}</strong>
                </div>
                <div class="create-task-top-wrapper">
                    <button id="btn-create-from-tasks" class="btn-primary btn-create-main">
                        ➕ Создать задание
                    </button>
                </div>
            </div>
        `;

        function renderItem(task, isOwn) {
            const color = getTaskColor(task.type, isOwn);
            const typeLabel =
                task.type === 'subscribe'
                    ? 'Подписка на канал'
                    : task.type === 'comment'
                        ? 'Комментарий под постом'
                        : 'Просмотр публикации';

            const ownBadge = isOwn
                ? '<span class="task-badge-own">Моё задание</span>'
                : '';

            return `
                <div class="task-item ${isOwn ? 'task-item-own' : ''}"
                     data-task-id="${task.id}"
                     data-task-type="${task.type}"
                     style="background:${color.background}; border:${color.border};">
                    <div class="task-main">
                        <div class="task-line-top">
                            <span class="task-type-label">${typeLabel}</span>
                            ${ownBadge}
                        </div>
                        <div class="task-line-bottom">
                            <span class="task-slots">Осталось: ${task.slots} шт.</span>
                        </div>
                    </div>
                    <div class="task-action">
                        <button class="task-start-btn">
                            <span class="task-start-price">⭐️ ${task.price.toFixed(2)}</span>
                            <span class="task-start-label">Начать</span>
                        </button>
                    </div>
                </div>
            `;
        }

        if (!workerAvailableTasks.length) {
            html += `
                <div class="card">
                    <p>Новых заданий пока нет. Загляните позже.</p>
                </div>
            `;
        } else {
            if (ownTasks.length) {
                html += `
                    <div class="tasks-subsection">
                        ${ownTasks.map((t) => renderItem(t, true)).join('')}
                    </div>
                `;
            }
            if (marketTasks.length) {
                html += `
                    <div class="tasks-subsection">
                        ${marketTasks.map((t) => renderItem(t, false)).join('')}
                    </div>
                `;
            }
        }

        container.innerHTML = html;

        const createBtn = getEl('btn-create-from-tasks');
        if (createBtn) {
            createBtn.addEventListener('click', () => showContainer('createTask'));
        }

        container.querySelectorAll('.task-item').forEach((item) => {
            item.addEventListener('click', onTaskClick);
        });

        updateTabBadges();
    }

    function onTaskClick(e) {
        const el = e.currentTarget;
        const id = Number(el.getAttribute('data-task-id'));
        const type = el.getAttribute('data-task-type');

        selectedTask = workerAvailableTasks.find((t) => t.id === id) || null;
        if (!selectedTask) return;

        if (!currentUserData.isFilled) {
            showModal('profile-form-modal');
            return;
        }

        if (type === 'comment') {
            renderCommentModal();
            showModal('comment-modal');
            return;
        }

        // subscribe / view — сразу спрашиваем подтверждение
        if (type === 'subscribe' || type === 'view') {
            if (tg && tg.showConfirm) {
                tg.showConfirm('Начать выполнение этого задания?', (ok) => {
                    if (ok) executeTask(selectedTask.id);
                });
            } else {
                executeTask(selectedTask.id);
            }
            return;
        }

        showContainer('taskDetails');
    }

    function renderTaskDetails() {
        const container = containers.taskDetails;
        if (!container || !selectedTask) {
            showContainer('workerTasks');
            return;
        }

        const color = getTaskColor(
            selectedTask.type,
            selectedTask.customer_id === currentUserData.id || selectedTask.isOwn
        );

        const typeLabel =
            selectedTask.type === 'subscribe'
                ? 'Подписка на канал'
                : selectedTask.type === 'comment'
                    ? 'Комментарий под постом'
                    : 'Просмотр публикации';

        container.innerHTML = `
            <h2 class="screen-title">${typeLabel}</h2>
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
            <button id="btn-execute-task" class="btn-primary btn-big">
                Начать выполнение за ⭐️ ${selectedTask.price.toFixed(2)}
            </button>
            <button id="btn-back-tasks" class="btn-secondary">Назад к списку</button>
            <button id="btn-report-task" class="btn-secondary btn-danger-outline">
                🚨 Пожаловаться на задание
            </button>
        `;

        const btnExec = getEl('btn-execute-task');
        const btnBack = getEl('btn-back-tasks');
        const btnReport = getEl('btn-report-task');

        if (btnExec) btnExec.onclick = () => executeTask(selectedTask.id);
        if (btnBack) btnBack.onclick = () => showContainer('workerTasks');
        if (btnReport) btnReport.onclick = () => showModal('report-modal');

        if (tg && tg.MainButton) {
            tg.MainButton.setText(`Начать за ${selectedTask.price.toFixed(2)} ⭐️`);
            tg.MainButton.show();
            tg.MainButton.onClick(() => executeTask(selectedTask.id));
        }
    }

    function executeTask(taskId) {
        const task = workerAvailableTasks.find((t) => t.id === taskId);
        if (!task) return;

        if (tg && tg.sendData) {
            tg.sendData(JSON.stringify({
                action: 'start_perform_task',
                taskId: task.id,
                taskLink: task.link,
                price: task.price,
                taskType: task.type
            }));
        }

        if (tg && tg.showAlert) {
            tg.showAlert('Вы будете перенаправлены к заданию. Нажмите ОК и выполните действие.');
        }

        if (tg && tg.openTelegramLink) {
            tg.openTelegramLink(task.link);
        }

        selectedTask = null;
        performedTaskIds.push(task.id);
        workerAvailableTasks = workerAvailableTasks.filter((t) => t.id !== task.id);

        if (tg && tg.MainButton) tg.MainButton.hide();
        showContainer('workerTasks');
    }

    // === Жалоба на задание ===

    function renderReportModal() {
        const wrap = getEl('report-modal-content');
        if (!wrap || !selectedTask) return;

        wrap.innerHTML = `
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
            <button id="modal-cancel-report" class="btn-secondary">
                Отмена
            </button>
        `;

        const btnSend = getEl('modal-send-report');
        const btnCancel = getEl('modal-cancel-report');

        if (btnSend) btnSend.onclick = sendReport;
        if (btnCancel) btnCancel.onclick = () => hideModal('report-modal');
    }

    function sendReport() {
        const msgEl = getEl('report-message');
        const typeEl = getEl('report-type');

        if (!msgEl || !typeEl || !selectedTask) return;

        const message = msgEl.value.trim();
        const type = typeEl.value;

        if (!message) {
            if (tg && tg.showAlert) tg.showAlert('Напишите, в чём проблема.');
            return;
        }

        if (tg && tg.sendData) {
            tg.sendData(JSON.stringify({
                action: 'create_ticket',
                type,
                taskId: selectedTask.id,
                subjectId: selectedTask.customer_id,
                message
            }));
        }

        hideModal('report-modal');
        if (tg && tg.showAlert) {
            tg.showAlert(`Жалоба на задание #${selectedTask.id} отправлена модератору.`);
        }
    }

    // === Комментарий-задание (модалка) ===

    function renderCommentModal() {
        if (!selectedTask || selectedTask.type !== 'comment') return;
        const wrap = getEl('comment-modal-content');
        if (!wrap) return;

        wrap.innerHTML = `
            <h3>Инструкция по комментарию</h3>
            <div class="card card-soft">
                <p><strong>Задание:</strong> ${selectedTask.title}</p>
                <p><strong>Награда:</strong> ⭐️ ${selectedTask.price.toFixed(2)}</p>
                <p>${selectedTask.description}</p>
            </div>
            <p class="muted-text">
                Нажмите «Перейти», оставьте комментарий по условиям задания,
                затем вернитесь в мини-приложение — система автоматически зарегистрирует выполнение.
            </p>
            <button id="modal-start-comment" class="btn-primary btn-big">
                Перейти к публикации
            </button>
            <button id="modal-cancel-comment" class="btn-secondary">
                Отмена
            </button>
        `;

        const btnStart = getEl('modal-start-comment');
        const btnCancel = getEl('modal-cancel-comment');

        if (btnStart) btnStart.onclick = () => {
            hideModal('comment-modal');
            executeTask(selectedTask.id);
        };
        if (btnCancel) btnCancel.onclick = () => hideModal('comment-modal');
    }

    // === СОЗДАНИЕ ЗАДАНИЯ ===

    function renderCreateTask() {
        const container = containers.createTask;
        if (!container) return;

        const ageOptionsMin = generateOptions(16, 99, 18);
        const ageOptionsMax = generateOptions(16, 99, 60);
        const countryOptions = generateCountryOptions(COUNTRIES, 'ALL');

        container.innerHTML = `
            <h2 class="screen-title">Создать задание</h2>
            <div class="card">
                <label for="task-type">Тип задания:</label>
                <select id="task-type">
                    <option value="subscribe" selected>Подписка на канал</option>
                    <option value="view">Просмотр публикации</option>
                    <option value="comment">Комментарий под публикацией</option>
                </select>

                <label for="task-link">Ссылка на канал/пост:</label>
                <input type="text" id="task-link" placeholder="" />

                <div id="task-description-block" class="task-description-block" style="display:none;">
                    <label for="task-description">Описание задания (для комментария):</label>
                    <textarea id="task-description"
                        placeholder="Подробно объясните, какой комментарий должен оставить исполнитель."></textarea>
                </div>

                <div class="form-row-two-cols">
                    <div class="form-col">
                        <div class="form-section-title">Целевая аудитория</div>
                        <label>Возраст:</label>
                        <div class="scroll-input-group scroll-input-age">
                            <div>
                                <small class="muted-text">От</small>
                                <select id="age-min">${ageOptionsMin}</select>
                            </div>
                            <div>
                                <small class="muted-text">До</small>
                                <select id="age-max">${ageOptionsMax}</select>
                            </div>
                        </div>

                        <label for="country-select">Страна:</label>
                        <select id="country-select">
                            <option value="ALL" selected>Все страны</option>
                            ${countryOptions}
                        </select>
                    </div>
                    <div class="form-col">
                        <div class="form-section-title">Пол</div>
                        <div class="inline-checkboxes">
                            <label><input type="checkbox" id="gender-m" checked /> Мужской</label>
                            <label><input type="checkbox" id="gender-f" checked /> Женский</label>
                        </div>
                    </div>
                </div>

                <div class="scroll-input-group scroll-input-payment">
                    <div class="input-block">
                        <label for="task-price">Стоимость выполнения (в ⭐️):</label>
                        <input type="number" id="task-price" placeholder="0.50" min="0.05" step="0.01" />
                    </div>
                    <div class="input-block">
                        <label for="task-count">Количество выполнений:</label>
                        <input type="number" id="task-count" placeholder="100" min="10" step="1" />
                    </div>
                </div>

                <div class="total-row">
                    <span class="total-label"><strong>Итого бюджет:</strong></span>
                    <span id="total-cost" class="total-cost">0.00 ⭐️</span>
                </div>

                <div class="admin-bot-check-row">
                    <input type="checkbox" id="is-admin-check" />
                    <label for="is-admin-check">
                        Я установил(а) <span class="link-inline" id="admin-bot-inline-2">@lookgroup_bot</span> в этот канал
                    </label>
                </div>

                <p class="muted-text">
                    При размещении задания система автоматически проверит наличие
                    бота @lookgroup_bot в администраторах. При отсутствии бота задание
                    не будет запущено.
                </p>
                <button id="btn-show-admin-bot" class="btn-secondary btn-block">
                    Как установить @lookgroup_bot
                </button>
            </div>
        `;

        const typeSelect = getEl('task-type');
        const descBlock = getEl('task-description-block');

        function updateDescVisibility() {
            if (!typeSelect || !descBlock) return;
            descBlock.style.display = typeSelect.value === 'comment' ? 'block' : 'none';
        }

        if (typeSelect) typeSelect.addEventListener('change', updateDescVisibility);
        updateDescVisibility();

        const priceInput = getEl('task-price');
        const countInput = getEl('task-count');
        const totalEl = getEl('total-cost');

        function recalcTotal() {
            const price = parseFloat(priceInput && priceInput.value) || 0;
            const count = parseInt(countInput && countInput.value, 10) || 0;
            const total = price * count;
            if (totalEl) totalEl.textContent = `${total.toFixed(2)} ⭐️`;
        }

        if (priceInput) priceInput.addEventListener('input', recalcTotal);
        if (countInput) countInput.addEventListener('input', recalcTotal);
        recalcTotal();

        const adminSpan = getEl('admin-bot-inline-2');
        if (adminSpan) adminSpan.onclick = () => showModal('admin-bot-modal');

        const btnAdmin = getEl('btn-show-admin-bot');
        if (btnAdmin) btnAdmin.onclick = () => showModal('admin-bot-modal');

        if (tg && tg.MainButton) {
            tg.MainButton.setText('Разместить задание и списать бюджет');
            tg.MainButton.show();
            tg.MainButton.onClick(sendTaskData);
        }
    }

    function sendTaskData() {
        const type = (getEl('task-type') && getEl('task-type').value) || 'subscribe';
        const link = (getEl('task-link') && getEl('task-link').value.trim()) || '';
        const descEl = getEl('task-description');
        const description = descEl ? descEl.value.trim() : '';
        const price = parseFloat(getEl('task-price') && getEl('task-price').value) || 0;
        const count = parseInt(getEl('task-count') && getEl('task-count').value, 10) || 0;
        const isAdmin = !!(getEl('is-admin-check') && getEl('is-admin-check').checked);

        const totalCost = price * count;

        if (!link || !price || !count) {
            if (tg && tg.showAlert) tg.showAlert('Пожалуйста, заполните ссылку и параметры стоимости.');
            return;
        }

        if (type === 'comment' && !description) {
            if (tg && tg.showAlert) tg.showAlert('Для задания-комментария необходимо описание.');
            return;
        }

        if (price < 0.05 || count < 10) {
            if (tg && tg.showAlert) {
                tg.showAlert('Минимальная цена — 0.05 ⭐️, минимум 10 выполнений.');
            }
            return;
        }

        if (totalCost > currentUserData.balance) {
            if (tg && tg.showAlert) {
                tg.showAlert(
                    `Недостаточно средств. Требуется ${totalCost.toFixed(
                        2
                    )} ⭐️, у вас ${currentUserData.balance.toFixed(2)} ⭐️.`
                );
            }
            return;
        }

        const textToCheck = `${description} ${link}`.toLowerCase();
        const forbidden = FORBIDDEN_WORDS.some((w) => textToCheck.includes(w));
        if (forbidden) {
            if (tg && tg.showAlert) {
                tg.showAlert(
                    'Задание содержит запрещённые слова. Оно отправлено на модерацию и не будет запущено автоматически.'
                );
            }
            if (tg && tg.sendData) {
                tg.sendData(JSON.stringify({
                    action: 'create_ticket',
                    type: 'admin_flag',
                    taskId: -1,
                    subjectId: currentUserData.id,
                    message: `Попытка создать задание с запрещённым контентом: "${link}"`
                }));
            }
            showContainer('workerTasks');
            return;
        }

        if (!isAdmin) {
            if (tg && tg.showAlert) {
                tg.showAlert('Подтвердите, что админ-бот @lookgroup_bot установлен в канал/чат.');
            }
            return;
        }

        const typeLabel =
            type === 'subscribe'
                ? 'Подписка на канал'
                : type === 'comment'
                    ? 'Комментарий под постом'
                    : 'Просмотр публикации';

        const title = typeLabel;

        if (tg && tg.sendData) {
            tg.sendData(JSON.stringify({
                action: 'create_task',
                taskType: type,
                title,
                description,
                link,
                price,
                count,
                total: totalCost,
                status: 'Запущено'
            }));
        }

        currentUserData.balance -= totalCost;
        currentUserData.pending_balance += totalCost;

        workerAvailableTasks.unshift({
            id: Date.now(),
            title,
            price,
            slots: count,
            type,
            description,
            link,
            customer_id: currentUserData.id,
            isOwn: true
        });
        workerAvailableTasks.sort((a, b) => b.price - a.price);

        updateTabBadges();

        if (tg && tg.showAlert) {
            tg.showAlert('Задание создано и запущено. Бюджет переведён в Эскроу.');
        }
        if (tg && tg.MainButton) tg.MainButton.hide();
        showContainer('workerTasks');
    }

    // === ПРОФИЛЬ ===

    function renderProfile() {
        const container = containers.profile;
        if (!container) return;

        container.innerHTML = `
            <h2 class="screen-title">Профиль</h2>
            <div class="card">
                <p>Ваш ID: <strong>${currentUserData.id}</strong></p>
                <p>Выполнено заданий: <strong>${currentUserData.tasks_completed}</strong></p>
                ${
                    currentUserData.isTermsAccepted
                        ? '<p class="muted-text success-text">Вы приняли пользовательское соглашение.</p>'
                        : '<p class="muted-text warning-text">Вы ещё не приняли пользовательское соглашение.</p>'
                }
                <p class="muted-text" style="margin-top:10px;">
                    <span id="terms-link" class="link-inline">
                        Пользовательское соглашение
                    </span>
                    — правила для исполнителей и заказчиков.
                </p>
            </div>

            <h3>О боте</h3>
            <div class="card">
                <p>Этот бот помогает:</p>
                <ul>
                    <li>Зарабатывать на простых заданиях (подписка, просмотр, комментарий).</li>
                    <li>Продвигать свои каналы и публикации через живую аудиторию.</li>
                    <li>Автоматически контролировать качество через админ-бота @lookgroup_bot.</li>
                </ul>
            </div>
        `;

        const termsLink = getEl('terms-link');
        if (termsLink) termsLink.onclick = () => showModal('terms-modal');
    }

    // === БАЛАНС ===

    function renderBalanceMenu() {
        const container = containers.balanceMenu;
        if (!container) return;

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
                    ${transactionsHistory.map((tx) => {
                        const sign = tx.amount > 0 ? '+' : '';
                        const cls = tx.status === 'failed' ? 'tx-item tx-failed' : 'tx-item';
                        const typeLabel =
                            tx.type === 'earn' ? 'Заработок' :
                            tx.type === 'withdraw' ? 'Вывод' : 'Операция';
                        return `
                            <div class="${cls}">
                                <div class="tx-main-row">
                                    <span class="tx-label">${tx.label}</span>
                                    <span class="tx-amount">${sign}${tx.amount.toFixed(2)} ⭐️</span>
                                </div>
                                <div class="tx-sub-row">
                                    <span class="tx-type">${typeLabel}</span>
                                    <span class="tx-date">${tx.date}</span>
                                </div>
                                ${tx.status === 'failed' ? '<div class="tx-status">Не засчитано</div>' : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        container.innerHTML = `
            <h2 class="screen-title">Баланс</h2>
            <div class="card">
                <p>Основной баланс: <strong>${currentUserData.balance.toFixed(2)} ⭐️</strong></p>
                <p class="muted-text">
                    В Эскроу: ${currentUserData.pending_balance.toFixed(2)} ⭐️ (ожидают проверки и начисления).
                </p>

                <div class="balance-actions-row">
                    <button id="btn-balance-deposit" class="btn-primary btn-block">Пополнить</button>
                    <button id="btn-balance-withdraw" class="btn-secondary btn-block">Вывести</button>
                </div>
            </div>

            <h3>Операции</h3>
            ${historyHtml}
        `;

        const btnDep = getEl('btn-balance-deposit');
        const btnWit = getEl('btn-balance-withdraw');

        if (btnDep) btnDep.onclick = () => {
            if (tg && tg.showAlert) tg.showAlert('Функция пополнения будет подключена позже.');
        };
        if (btnWit) btnWit.onclick = () => {
            if (tg && tg.showAlert) tg.showAlert('Функция вывода будет подключена позже.');
        };
    }

    // === Модалки / профиль-форма / соглашения ===

    function showProfileFormModal() {
        const wrap = getEl('profile-form-modal-content');
        if (!wrap) return;

        const ageOpt = generateOptions(16, 99, currentUserData.age || 25);
        const countryOpt = generateCountryOptions(COUNTRIES, currentUserData.country || 'Россия');

        wrap.innerHTML = `
            <h3>Анкета исполнителя</h3>
            <p class="muted-text">
                Укажите базовые данные, чтобы получать более точные задания.
            </p>
            <label for="modal-age">Возраст:</label>
            <select id="modal-age">${ageOpt}</select>

            <label for="modal-gender">Пол:</label>
            <select id="modal-gender">
                <option value="M"${currentUserData.gender === 'M' ? ' selected' : ''}>Мужской</option>
                <option value="F"${currentUserData.gender === 'F' ? ' selected' : ''}>Женский</option>
            </select>

            <label for="modal-country">Страна:</label>
            <select id="modal-country">${countryOpt}</select>

            <button id="modal-save-profile" class="btn-primary btn-big">
                Сохранить и продолжить
            </button>
        `;

        const btnSave = getEl('modal-save-profile');
        if (btnSave) btnSave.onclick = saveProfileFromModal;
    }

    function saveProfileFromModal() {
        const age = parseInt(getEl('modal-age') && getEl('modal-age').value, 10);
        const gender = getEl('modal-gender') && getEl('modal-gender').value;
        const country = getEl('modal-country') && getEl('modal-country').value;

        if (!age || !gender || !country) {
            if (tg && tg.showAlert) tg.showAlert('Пожалуйста, заполните все поля.');
            return;
        }

        currentUserData.age = age;
        currentUserData.gender = gender;
        currentUserData.country = country;
        currentUserData.isFilled = true;

        if (tg && tg.sendData) {
            tg.sendData(JSON.stringify({
                action: 'save_profile',
                age,
                gender,
                country
            }));
        }

        hideModal('profile-form-modal');
        if (tg && tg.showAlert) {
            tg.showAlert('Профиль сохранён. Теперь вы можете выполнять задания.');
        }
        showContainer('workerTasks');
    }

    // глобальные функции для HTML (чтобы не было ошибок)
    window.showModal = function (id) {
        const el = getEl(id);
        if (!el) return;
        el.style.display = 'flex';

        if (id === 'profile-form-modal') showProfileFormModal();
        if (id === 'report-modal') renderReportModal();
    };

    window.hideModal = function (id) {
        const el = getEl(id);
        if (!el) return;
        el.style.display = 'none';
    };

    window.handleBalanceClick = function () {
        showContainer('balanceMenu');
    };

    // кнопки в модалках, которые уже есть в HTML
    const btnAgreementOk = getEl('modal-accept-agreement');
    if (btnAgreementOk) {
        btnAgreementOk.onclick = () => {
            currentUserData.isAgreementAccepted = true;
            if (tg && tg.sendData) tg.sendData(JSON.stringify({ action: 'accept_agreement' }));
            hideModal('agreement-modal');
            showContainer('createTask');
        };
    }

    const btnAgreementCancel = getEl('modal-cancel-agreement');
    if (btnAgreementCancel) {
        btnAgreementCancel.onclick = () => {
            hideModal('agreement-modal');
            showContainer('workerTasks');
        };
    }

    const btnTermsOk = getEl('modal-accept-terms');
    if (btnTermsOk) {
        btnTermsOk.onclick = () => {
            currentUserData.isTermsAccepted = true;
            hideModal('terms-modal');
            if (tg && tg.showAlert) tg.showAlert('Спасибо! Вы приняли пользовательское соглашение.');
            renderProfile();
        };
    }

    const btnTermsClose = getEl('modal-close-terms');
    if (btnTermsClose) {
        btnTermsClose.onclick = () => hideModal('terms-modal');
    }

    const btnRatingClose = getEl('modal-close-rating');
    if (btnRatingClose) {
        btnRatingClose.onclick = () => hideModal('rating-rules-modal');
    }

    const btnAdminClose = getEl('modal-close-admin-bot');
    if (btnAdminClose) {
        btnAdminClose.onclick = () => hideModal('admin-bot-modal');
    }

    const btnAdminCopy = getEl('modal-copy-botname');
    if (btnAdminCopy) {
        btnAdminCopy.onclick = () => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(BOT_USERNAME)
                    .then(() => tg && tg.showAlert && tg.showAlert(`Имя бота ${BOT_USERNAME} скопировано.`))
                    .catch(() => tg && tg.showAlert && tg.showAlert('Не удалось скопировать, сделайте это вручную.'));
            } else {
                tg && tg.showAlert && tg.showAlert('Скопируйте имя бота вручную: ' + BOT_USERNAME);
            }
        };
    }

    // старт
    updateTabBadges();
    showContainer('workerTasks');
});
