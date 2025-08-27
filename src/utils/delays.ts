/**
 * Утилиты для рандомных задержек
 */

/**
 * Генерация случайного числа в заданном диапазоне
 */
function getRandomNumber(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Задержка между успешными транзакциями (30 секунд - 2 минуты)
 */
export async function delayAfterSuccessfulTransaction(): Promise<void> {
  const minDelay = 30 * 1000; // 30 секунд
  const maxDelay = 2 * 60 * 1000; // 2 минуты
  const delay = getRandomNumber(minDelay, maxDelay);
  
  const delaySeconds = Math.round(delay / 1000);
  console.log(`⏳ Задержка после успешной транзакции: ${delaySeconds} секунд`);
  
  await new Promise(resolve => setTimeout(resolve, delay));
}



/**
 * Умная задержка между кошельками с учетом выполнения спинов
 */
export async function smartDelayBetweenWallets(spinsPerformed: boolean = false): Promise<void> {
  let minDelay: number;
  let maxDelay: number;
  
  if (spinsPerformed) {
    // Если спины выполнялись - меньшая задержка (15-45 секунд)
    minDelay = 15 * 1000; // 15 секунд
    maxDelay = 45 * 1000; // 45 секунд
  } else {
    // Если спины не выполнялись - стандартная задержка (30 секунд - 2 минуты)
    minDelay = 30 * 1000; // 30 секунд
    maxDelay = 2 * 60 * 1000; // 2 минуты
  }
  
  const delay = getRandomNumber(minDelay, maxDelay);
  const delaySeconds = Math.round(delay / 1000);
  
  if (spinsPerformed) {
    console.log(`⏳ Задержка между кошельками (после спинов): ${delaySeconds} секунд`);
  } else {
    console.log(`⏳ Задержка между кошельками: ${delaySeconds} секунд`);
  }
  
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Проверка, нужна ли задержка между кошельками
 * Задержка НЕ нужна если:
 * - У кошелька уже есть баланс WETH
 * - Выполнена ежедневная отправка транзакции
 * - Нет доступных спинов
 */
export function shouldSkipWalletDelay(
  hasWETHBalance: boolean,
  dailyTransferCompleted: boolean,
  hasAvailableSpins: boolean
): boolean {
  return hasWETHBalance && dailyTransferCompleted && !hasAvailableSpins;
}
