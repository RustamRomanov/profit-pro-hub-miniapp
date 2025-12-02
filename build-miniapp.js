// build-miniapp.js
// Автоматическая сборка мини-аппа: копирует файлы из frontend-dev → miniapp-build

const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, 'frontend-dev');
const TARGET = path.join(__dirname, 'miniapp-build');

const FILES = ['index.html', 'app.js', 'styles.css'];

console.log('==============================');
console.log('🚀 Building Telegram Mini App...');
console.log('==============================\n');

FILES.forEach(file => {
    const from = path.join(SOURCE, file);
    const to = path.join(TARGET, file);

    if (!fs.existsSync(from)) {
        console.error(`❌ Ошибка: файл не найден → ${from}`);
        process.exit(1);
    }

    fs.copyFileSync(from, to);
    console.log(`✔ ${file} скопирован`);
});

console.log('\n✨ Готово! MiniApp обновлён в папке miniapp-build/');
console.log('==============================');
