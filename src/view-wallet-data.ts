import { WalletDatabase } from './modules/database';

/**
 * Просмотр данных кошельков из базы данных
 */
async function viewWalletData() {
  try {
    const database = new WalletDatabase();
    
    // Получаем статистику базы данных
    const stats = database.getDatabaseStats();
    
    if (stats.totalWallets === 0) {
      return;
    }
    
    // Получаем все кошельки
    const wallets = await database.getAllWallets();
    

    
    // Вычисляем общую статистику
    const totalBalance = wallets.reduce((sum, wallet) => {
      const balance = parseFloat(wallet.balance?.replace(' ETH', '') || '0');
      return sum + balance;
    }, 0);
    
    const totalWETHBalance = wallets.reduce((sum, wallet) => {
      const wethBalance = parseFloat(wallet.wethBalance?.replace(' WETH', '') || '0');
      return sum + wethBalance;
    }, 0);
    
    const totalSpinsAvailable = wallets.reduce((sum, wallet) => sum + (wallet.spinsAvailable || 0), 0);
    const totalPrizesWon = wallets.reduce((sum, wallet) => sum + (wallet.prizesWon || 0), 0);
    const totalGamesPlayed = wallets.reduce((sum, wallet) => sum + (wallet.gamesPlayed || 0), 0);
    const totalDailyTransfers = wallets.reduce((sum, wallet) => sum + (wallet.todayTransfer ? 1 : 0), 0);
    
    // Выводим общую статистику
    console.log('\n🎰 LINEA REWARDS - СТАТИСТИКА КОШЕЛЬКОВ');
    console.log('═'.repeat(80));
    console.log(`📊 Всего кошельков: ${wallets.length}`);
    console.log(`💰 Общий баланс ETH: ${totalBalance.toFixed(4)} ETH`);
    console.log(`🔗 Общий баланс WETH: ${totalWETHBalance.toFixed(9)} WETH`);
    console.log(`🎰 Доступных спинов: ${totalSpinsAvailable}`);
    console.log(`🏆 Выигранных призов: ${totalPrizesWon}`);
    console.log(`🎮 Сыгранных игр: ${totalGamesPlayed}`);
    console.log(`🔄 Ежедневных транзакций: ${totalDailyTransfers}/${wallets.length}`);
    console.log(`🕐 Последнее обновление: ${new Date(stats.lastUpdate).toLocaleString('ru-RU')}`);
    console.log('═'.repeat(80));
    
    // Выводим данные каждого кошелька
    console.log('\n👛 ДЕТАЛЬНАЯ СТАТИСТИКА КОШЕЛЬКОВ:');
    console.log('─'.repeat(120));
    
    wallets.forEach((wallet, index) => {
      console.log(`${index + 1}. Адрес: ${wallet.address}`);
      console.log(`   💰 ETH: ${wallet.balance || 'N/A'}`);
      console.log(`   🔗 WETH: ${wallet.wethBalance || 'N/A'}`);
      console.log(`   🎰 Спины: ${wallet.spinsAvailable || 0}`);
      console.log(`   🏆 Призы: ${wallet.prizesWon || 0}`);
      console.log(`   🎮 Игры: ${wallet.gamesPlayed || 0}`);
      console.log(`   📅 Стрик: ${wallet.dayStreak || 0} дней`);
      if (wallet.todayTransfer) {
        console.log(`   🔄 Ежедневная транзакция: ✅ Выполнена (${wallet.transferAmount || 'N/A'})`);
      } else {
        console.log(`   🔄 Ежедневная транзакция: ❌ Не выполнена`);
      }
      if (wallet.nextSpinTime) {
        console.log(`   ⏰ Следующий спин: ${wallet.nextSpinTime}`);
      }
      console.log(`   🔗 Подключен: ${wallet.connectedAt}`);
      if (wallet.lastActivity) {
        console.log(`   📝 Последняя активность: ${wallet.lastActivity}`);
      }
      console.log('─'.repeat(120));
    });
    
  } catch (error) {
    console.error('❌ Ошибка при просмотре данных:', error);
  }
}



// Запуск функции при выполнении файла напрямую
if (require.main === module) {
  viewWalletData();
}

export { viewWalletData };
