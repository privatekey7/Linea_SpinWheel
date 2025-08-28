import { LineaSpinWheelBot, WalletConfig } from './browser-automation';
import { createWalletClient, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as fs from 'fs';
import * as path from 'path';
import { viewWalletData } from './view-wallet-data';
import { WalletDatabase, WalletData } from './modules/database';
import { delayAfterSuccessfulTransaction, shouldSkipWalletDelay, smartDelayBetweenWallets } from './utils/delays';
import { KeyEncryption } from './utils/encryption';

/**
 * Загрузка всех приватных ключей из файла (поддержка шифрования)
 */
async function loadAllPrivateKeys(): Promise<string[]> {
  // Сначала проверяем зашифрованные ключи
  if (KeyEncryption.hasEncryptedKeys()) {
    console.log('🔐 Обнаружены зашифрованные ключи');
    
    let password: string;
    let privateKeys: string[];
    
    // Пытаемся расшифровать ключи
    while (true) {
      try {
        password = await KeyEncryption.promptPassword();
        privateKeys = KeyEncryption.decryptKeys(password);
        
        if (privateKeys.length === 0) {
          throw new Error('Не найдено валидных приватных ключей');
        }
        
        console.log(`✅ Успешно загружено ${privateKeys.length} приватных ключей`);
        break;
      } catch (error) {
        console.error('❌ Неверный пароль');
      }
    }
    
    return privateKeys;
  }
  
  // Fallback к открытым ключам
  const keysPath = path.join(process.cwd(), 'keys.txt');
  
  if (!fs.existsSync(keysPath)) {
    throw new Error('Файл keys.txt не найден. Создайте файл с приватными ключами кошельков или зашифруйте их.');
  }

  console.log('⚠️ Используются открытые ключи из keys.txt');
  console.log('Рекомендуется зашифровать ключи при следующем запуске');

  const content = fs.readFileSync(keysPath, 'utf8');
  const lines = content.split('\n');
  const privateKeys: string[] = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      let privateKey = trimmedLine;
      
      // Добавляем 0x если его нет
      if (!privateKey.startsWith('0x')) {
        privateKey = '0x' + privateKey;
      }
      
      // Проверяем формат приватного ключа (64 символа hex)
      if (/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
        privateKeys.push(privateKey);
      }
    }
  }
  
  if (privateKeys.length === 0) {
    throw new Error('Не найдено валидных приватных ключей в файле keys.txt');
  }
  
  return privateKeys;
}

/**
 * Перемешивание массива в случайном порядке
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Проверка доступных спинов на сегодняшнюю дату
 */
async function checkSpinsAvailableToday(database: WalletDatabase, address: string): Promise<boolean> {
  return await database.checkSpinsAvailable(address);
}

/**
 * Создание конфигурации кошелька из приватного ключа
 */
function createWalletConfig(privateKey: string): WalletConfig {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  
  return {
    privateKey,
    address: getAddress(account.address)
  };
}

/**
 * Выполнение всех доступных спинов для кошелька
 */
async function performAllAvailableSpins(bot: LineaSpinWheelBot, database: WalletDatabase, walletConfig: WalletConfig): Promise<void> {
  let spinCount = 0;
  const maxSpins = 10; // Максимальное количество спинов для безопасности
  
  while (spinCount < maxSpins) {
    // Проверяем количество доступных спинов в базе данных
    const spinsAvailable = await checkSpinsAvailableToday(database, walletConfig.address);
    
    if (!spinsAvailable) {
      console.log('⏰ Спины закончились, завершаем работу с кошельком');
      break;
    }
    
    // Выполняем спин
    spinCount++;
    console.log(`🎰 Выполняем спин ${spinCount}...`);
    
    const result = await bot.spinWheel();
    
    if (result.success) {
      // Спин успешно выполнен
      console.log('✅ Спин выполнен успешно');
      
      // Перезагружаем страницу и переподключаемся
      console.log('🔄 Перезагружаем страницу для получения актуальных данных...');
      const reloaded = await bot.reloadAndReconnect();
      
      if (!reloaded) {
        console.log('❌ Не удалось перезагрузить страницу, завершаем работу с кошельком');
        break;
      }
      
      // Обновляем данные кошелька после перезагрузки
      console.log('📊 Обновляем данные кошелька...');
      await bot.extractAndSaveWalletData();
      
      // Пауза между спинами (3 секунды)
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      console.log(`❌ Ошибка спина ${spinCount}: ${result.error || 'Неизвестная ошибка'}`);
      // Обновляем данные в базе, чтобы отразить актуальное состояние после ошибки
      await bot.extractAndSaveWalletData();
      break; // Прерываем цикл при ошибке
    }
  }
  
  if (spinCount >= maxSpins) {
    console.log('⚠️ Достигнуто максимальное количество спинов, завершаем работу с кошельком');
  }
}

/**
 * Обработка одного кошелька
 */
async function processWallet(privateKey: string, walletIndex: number, totalWallets: number): Promise<{
  hasWETHBalance: boolean;
  dailyTransferCompleted: boolean;
  hasAvailableSpins: boolean;
  spinsPerformed: boolean;
}> {
  const walletConfig = createWalletConfig(privateKey);
  const database = new WalletDatabase();
  
  console.log(''); // Пустая строка для разделения логов
  console.log(`🔄 Обработка кошелька ${walletIndex + 1}/${totalWallets}: ${walletConfig.address}`);
  
  let bot: LineaSpinWheelBot | undefined;
  
  // Переменные для отслеживания состояния кошелька
  let hasWETHBalance = false;
  let dailyTransferCompleted = false;
  let hasAvailableSpins = false;
  let spinsPerformed = false;
  
  try {
    // Проверяем и пополняем баланс WETH если он равен 0
    console.log('🔍 Проверяем баланс WETH...');
    const wethDepositResult = await database.checkAndDepositWETH(privateKey);
    
    // Проверяем и выполняем ежедневную транзакцию WETH
    console.log('🎯 Проверяем ежедневную транзакцию WETH...');
    const dailyTransferResult = await database.checkAndPerformDailyTransfer(privateKey);
    
    // Получаем актуальные данные кошелька для определения состояния
    // После выполнения транзакций кошелёк может быть создан в базе
    const walletData = await database.getWalletData(walletConfig.address);
    
    // Определяем состояние кошелька
    hasWETHBalance = walletData?.wethBalance ? parseFloat(walletData.wethBalance.replace(' WETH', '')) > 0 : false;
    dailyTransferCompleted = dailyTransferResult;
    
    // Проверяем доступные спины только если есть полные данные
    if (walletData && 
        walletData.spinsAvailable !== undefined && 
        walletData.prizesWon !== undefined && 
        walletData.gamesPlayed !== undefined) {
      hasAvailableSpins = await checkSpinsAvailableToday(database, walletConfig.address);
    } else {
      hasAvailableSpins = false; // Неизвестно, нужно получить данные из карточки
    }
    
    // Проверяем, есть ли кошелёк в базе данных (используем уже полученные данные)
    const existingWalletData = walletData;
    
    // Проверяем, наступил ли новый день для этого кошелька
    // Если кошелька нет в базе, считаем что это новый день
    const isNewDay = existingWalletData ? database.isNewDayForWallet(walletConfig.address) : true;
    
    // Сбрасываем флаг ежедневной транзакции если наступил новый день
    if (existingWalletData && isNewDay) {
      database.resetDailyTransferFlagIfNewDay(walletConfig.address);
    }
    
    // Проверяем, есть ли у кошелька полные данные (спины, призы и т.д.)
    const hasFullData = existingWalletData && 
      existingWalletData.spinsAvailable !== undefined && 
      existingWalletData.prizesWon !== undefined && 
      existingWalletData.gamesPlayed !== undefined;
    
    // Проверяем, была ли выполнена ежедневная транзакция сегодня
    const today = new Date().toISOString().split('T')[0];
    const dailyTransferDoneToday = existingWalletData?.lastTransferDate === today;
    
    // Проверяем, нужно ли обновить спины на новый день
    const shouldRefreshSpins = existingWalletData ? database.shouldRefreshSpinsForNewDay(walletConfig.address) : true;
    
    // Проверяем, полностью ли отработал кошелёк сегодня (ежедневная транзакция + 0 спинов + не нужно обновлять спины)
    const walletFullyCompletedToday = existingWalletData && 
      dailyTransferDoneToday && 
      existingWalletData.spinsAvailable === 0 &&
      !shouldRefreshSpins;
    
    if (walletFullyCompletedToday) {
      console.log('✅ Кошелёк уже полностью отработал сегодня (ежедневная транзакция выполнена + спины закончились) - пропускаем');
      return {
        hasWETHBalance,
        dailyTransferCompleted: true,
        hasAvailableSpins: false,
        spinsPerformed: false
      };
    }
    
    // Если ежедневная транзакция выполнена сегодня, но данные о спинах могут быть устаревшими
    // или нужно обновить спины на новый день
    if (existingWalletData && !isNewDay && hasFullData && (dailyTransferDoneToday || shouldRefreshSpins)) {
      if (shouldRefreshSpins) {
        console.log('🔄 Время обновления спинов наступило - обновляем данные из карточки');
      } else {
        console.log('🔄 Ежедневная транзакция выполнена сегодня - обновляем данные о спинах из карточки');
      }
      
      // Создаём бота для обновления данных
      bot = new LineaSpinWheelBot(walletConfig);
      await bot.initialize();
      
      const connected = await bot.connectToLineaRewards();
      if (!connected) {
        return {
          hasWETHBalance,
          dailyTransferCompleted,
          hasAvailableSpins,
          spinsPerformed: false
        };
      }
      
      // Данные автоматически извлекаются при подключении
      
      // Проверяем, есть ли доступные спины после обновления
      const spinsAvailable = await checkSpinsAvailableToday(database, walletConfig.address);
      
      if (spinsAvailable) {
        console.log('✅ После обновления данных найдены доступные спины, выполняем все спины');
        await performAllAvailableSpins(bot, database, walletConfig);
        spinsPerformed = true;
      } else {
        console.log('⏰ После обновления данных спинов не найдено');
        spinsPerformed = false;
      }
    } else if (existingWalletData && !isNewDay && hasFullData && !shouldRefreshSpins) {
      // Если кошелёк есть в базе, это не новый день и не нужно обновлять спины, проверяем доступные спины
      const spinsAvailable = await checkSpinsAvailableToday(database, walletConfig.address);
      
      if (spinsAvailable) {
        console.log('✅ Есть доступные спины, выполняем все спины');
        
        // Создаём бота и выполняем все доступные спины
        bot = new LineaSpinWheelBot(walletConfig);
        await bot.initialize();
        
        const connected = await bot.connectToLineaRewards();
        if (!connected) {
          return {
            hasWETHBalance,
            dailyTransferCompleted,
            hasAvailableSpins,
            spinsPerformed: false
          };
        }
        
        await performAllAvailableSpins(bot, database, walletConfig);
        spinsPerformed = true;
      } else {
        console.log('⏰ Нет доступных спинов на сегодня, пропускаем');
        spinsPerformed = false;
      }
    } else {
      // Если кошелька нет в базе, наступил новый день, нужно обновить спины или нет полных данных - обновляем данные из карточки
      if (!existingWalletData) {
        console.log('🔍 Кошелёк не найден в базе данных, создаём новую запись');
      } else if (isNewDay) {
        console.log('🌅 Наступил новый день - обновляем данные из карточки');
      } else if (shouldRefreshSpins) {
        console.log('⏰ Время обновления спинов наступило - обновляем данные из карточки');
      } else {
        console.log('📊 У кошелька нет полных данных - получаем данные из карточки');
      }
      // Создаём бота для извлечения данных
      bot = new LineaSpinWheelBot(walletConfig);
      await bot.initialize();
      
      const connected = await bot.connectToLineaRewards();
      if (!connected) {
        return {
          hasWETHBalance,
          dailyTransferCompleted,
          hasAvailableSpins,
          spinsPerformed: false
        };
      }
      
      // Данные автоматически извлекаются при подключении
      
      // Проверяем, есть ли доступные спины у нового кошелька
      const spinsAvailable = await checkSpinsAvailableToday(database, walletConfig.address);
      
      if (spinsAvailable) {
        console.log('✅ У нового кошелька есть доступные спины, выполняем все спины');
        await performAllAvailableSpins(bot, database, walletConfig);
        spinsPerformed = true;
      } else {
        console.log('⏰ У нового кошелька нет доступных спинов');
        spinsPerformed = false;
      }
    }
    
  } catch (error) {
    console.error(`❌ Ошибка обработки кошелька ${walletConfig.address}:`, error);
  } finally {
    // Закрытие браузера
    if (bot) {
      try {
        await bot.close();
      } catch (closeError) {
        console.error('❌ Ошибка закрытия браузера:', closeError);
      }
    }
  }
  
  // Возвращаем информацию о состоянии кошелька
  return {
    hasWETHBalance,
    dailyTransferCompleted,
    hasAvailableSpins,
    spinsPerformed
  };
}

/**
 * Основная функция автоматизации
 */
async function main() {
  try {
    // Проверяем, нужно ли предложить шифрование
    if (KeyEncryption.hasPlainKeys() && !KeyEncryption.hasEncryptedKeys()) {
      console.log('🔐 Обнаружен файл keys.txt с открытыми ключами');
      console.log('Рекомендуется зашифровать ключи для безопасности');
      
      const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question('Хотите зашифровать ключи сейчас? (y/n): ', (answer: string) => {
          rl.close();
          resolve(answer.toLowerCase());
        });
      });

      if (answer === 'y' || answer === 'yes') {
        try {
          await KeyEncryption.migratePlainKeys();
          console.log('\n✅ Шифрование завершено! Перезапустите бота: npm start');
          console.log('🗑️  Удалите файл keys.txt вручную для безопасности');
          return;
        } catch (error) {
          console.error('❌ Ошибка шифрования:', error);
          console.log('❌ Программа завершена из соображений безопасности');
          console.log('🔐 Исправьте ошибку и попробуйте снова');
          process.exit(1);
        }
      } else {
        console.log('ℹ️ Шифрование пропущено. Продолжаем работу...\n');
      }
    }

    // Загрузка всех приватных ключей
    const privateKeys = await loadAllPrivateKeys();
    
    // Сброс флагов ежедневных транзакций при наступлении нового дня
    const database = new WalletDatabase();
    await database.resetDailyTransferFlags();
    
    // Перемешивание ключей в случайном порядке
    const shuffledKeys = shuffleArray(privateKeys);
    
    // Обработка каждого кошелька
    for (let i = 0; i < shuffledKeys.length; i++) {
      const walletResult = await processWallet(shuffledKeys[i], i, shuffledKeys.length);
      
      // Пауза между кошельками (если это не последний)
      if (i < shuffledKeys.length - 1) {
        // Проверяем, нужна ли задержка между кошельками
        const shouldSkip = shouldSkipWalletDelay(
          walletResult.hasWETHBalance,
          walletResult.dailyTransferCompleted,
          walletResult.hasAvailableSpins
        );
        
        if (shouldSkip) {
          console.log('⏭️ Пропускаем задержку между кошельками (кошелёк готов)');
        } else {
          // Умная задержка между кошельками с учетом выполнения спинов
          await smartDelayBetweenWallets(walletResult.spinsPerformed);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
  }
}



// Запуск основного приложения
main();
