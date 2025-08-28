import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { linea } from 'viem/chains';
import { delayAfterSuccessfulTransaction } from '../utils/delays';

export interface WalletData {
  address: string;
  balance?: string;
  wethBalance?: string;
  transactionCount?: number;
  lastActivity?: string;
  connectedAt: string;
  spinsAvailable?: number;
  prizesWon?: number;
  gamesPlayed?: number;
  dayStreak?: number;
  nextSpinTime?: string;
  todayTransfer?: boolean;
  lastTransferDate?: string;
  transferAmount?: string;
  lastSpinDate?: string;
}

export interface DatabaseConfig {
  filePath?: string;
}

export class WalletDatabase {
  private config: DatabaseConfig;
  private dataPath: string;

  constructor(config: DatabaseConfig = {}) {
    this.config = {
      filePath: 'wallet_database.json',
      ...config
    };
    
    this.dataPath = path.resolve(process.cwd(), this.config.filePath!);
    this.ensureDatabaseExists();
  }

  /**
   * Создание базы данных если она не существует
   */
  private ensureDatabaseExists(): void {
    if (!fs.existsSync(this.dataPath)) {
      const initialData = {
        wallets: [],
        lastUpdate: new Date().toISOString()
      };
      fs.writeFileSync(this.dataPath, JSON.stringify(initialData, null, 2));
      console.log(`📁 Создана база данных: ${this.dataPath}`);
    }
  }

  /**
   * Загрузка данных из базы
   */
  private loadData(): { wallets: WalletData[]; lastUpdate: string } {
    try {
      const data = fs.readFileSync(this.dataPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Ошибка загрузки базы данных:', error);
      return { wallets: [], lastUpdate: new Date().toISOString() };
    }
  }

  /**
   * Сохранение данных в базу
   */
  private saveData(data: { wallets: WalletData[]; lastUpdate: string }): void {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Ошибка сохранения в базу данных:', error);
    }
  }

  /**
   * Добавление или обновление данных кошелька
   */
  async saveWalletData(walletData: WalletData): Promise<void> {
    const data = this.loadData();
    
    // Ищем существующий кошелёк
    const existingIndex = data.wallets.findIndex(w => w.address.toLowerCase() === walletData.address.toLowerCase());
    
    if (existingIndex >= 0) {
      // Сохраняем старые данные для сравнения
      const oldData = { ...data.wallets[existingIndex] };
      
      // Обновляем существующий кошелёк
      data.wallets[existingIndex] = {
        ...data.wallets[existingIndex],
        ...walletData,
        connectedAt: new Date().toISOString()
      };
      
      // Показываем конкретные изменения
      const changes: string[] = [];
      if (oldData.balance !== walletData.balance && walletData.balance) {
        changes.push(`баланс ETH: ${oldData.balance} → ${walletData.balance}`);
      }
      if (oldData.wethBalance !== walletData.wethBalance && walletData.wethBalance) {
        changes.push(`баланс WETH: ${oldData.wethBalance} → ${walletData.wethBalance}`);
      }
      if (oldData.spinsAvailable !== walletData.spinsAvailable && walletData.spinsAvailable !== undefined) {
        changes.push(`спины: ${oldData.spinsAvailable} → ${walletData.spinsAvailable}`);
      }
      if (oldData.prizesWon !== walletData.prizesWon && walletData.prizesWon !== undefined) {
        changes.push(`призы: ${oldData.prizesWon} → ${walletData.prizesWon}`);
      }
      if (oldData.gamesPlayed !== walletData.gamesPlayed && walletData.gamesPlayed !== undefined) {
        changes.push(`игры: ${oldData.gamesPlayed} → ${walletData.gamesPlayed}`);
      }
      if (oldData.dayStreak !== walletData.dayStreak && walletData.dayStreak !== undefined) {
        changes.push(`стрик: ${oldData.dayStreak} → ${walletData.dayStreak}`);
      }
             if (oldData.nextSpinTime !== walletData.nextSpinTime && walletData.nextSpinTime) {
         changes.push(`время спина: ${oldData.nextSpinTime} → ${walletData.nextSpinTime}`);
       }
       if (oldData.lastSpinDate !== walletData.lastSpinDate && walletData.lastSpinDate) {
         changes.push(`дата спина: ${oldData.lastSpinDate} → ${walletData.lastSpinDate}`);
       }
      
    } else {
      // Добавляем новый кошелёк
      data.wallets.push({
        ...walletData,
        connectedAt: new Date().toISOString()
      });
    }
    
    data.lastUpdate = new Date().toISOString();
    this.saveData(data);
  }

  /**
   * Получение данных кошелька по адресу
   */
  async getWalletData(address: string): Promise<WalletData | null> {
    const data = this.loadData();
    const wallet = data.wallets.find(w => w.address.toLowerCase() === address.toLowerCase());
    return wallet || null;
  }

  /**
   * Получение всех кошельков
   */
  async getAllWallets(): Promise<WalletData[]> {
    const data = this.loadData();
    return data.wallets;
  }

  /**
   * Удаление кошелька
   */
  async deleteWallet(address: string): Promise<boolean> {
    const data = this.loadData();
    const initialLength = data.wallets.length;
    
    data.wallets = data.wallets.filter(w => w.address.toLowerCase() !== address.toLowerCase());
    
    if (data.wallets.length < initialLength) {
      data.lastUpdate = new Date().toISOString();
      this.saveData(data);
      console.log(`🗑️ Удалён кошелёк: ${address}`);
      return true;
    }
    
    return false;
  }

  /**
   * Обновление статистики кошелька
   */
  async updateWalletStats(address: string, stats: Partial<WalletData>): Promise<void> {
    const data = this.loadData();
    const walletIndex = data.wallets.findIndex(w => w.address.toLowerCase() === address.toLowerCase());
    
    if (walletIndex >= 0) {
      data.wallets[walletIndex] = {
        ...data.wallets[walletIndex],
        ...stats,
        lastActivity: new Date().toISOString()
      };
      
      data.lastUpdate = new Date().toISOString();
      this.saveData(data);
    }
  }

  /**
   * Получение статистики базы данных
   */
  getDatabaseStats(): { totalWallets: number; lastUpdate: string } {
    const data = this.loadData();
    return {
      totalWallets: data.wallets.length,
      lastUpdate: data.lastUpdate
    };
  }

  /**
   * Проверка наступления нового дня для кошелька
   */
  isNewDayForWallet(address: string): boolean {
    const walletData = this.getWalletDataSync(address);
    if (!walletData) {
      return true; // Если кошелька нет в базе, считаем что нужно обновить данные
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Проверяем дату последней ежедневной транзакции
    // Это важно для синхронизации логики спинов с ежедневными транзакциями
    const lastTransferDate = walletData.lastTransferDate ? walletData.lastTransferDate.split('T')[0] : null;
    
    // Если последняя ежедневная транзакция была не сегодня - новый день
    if (lastTransferDate && lastTransferDate !== today) {
      return true;
    }
    
    // Проверяем последнюю активность
    const lastActivityDate = walletData.lastActivity ? walletData.lastActivity.split('T')[0] : null;
    const lastConnectedDate = walletData.connectedAt ? walletData.connectedAt.split('T')[0] : null;
    
    // Если последняя активность была не сегодня - новый день
    if (lastActivityDate && lastActivityDate !== today) {
      return true;
    }
    
    // Если нет lastActivity, но есть connectedAt и он не сегодня - новый день
    if (!lastActivityDate && lastConnectedDate && lastConnectedDate !== today) {
      return true;
    }
    
    return false;
  }

  /**
   * Проверка, нужно ли обновить спины на новый день
   * Спины сбрасываются в 3:00 UTC каждый день
   */
  shouldRefreshSpinsForNewDay(address: string): boolean {
    const walletData = this.getWalletDataSync(address);
    if (!walletData) {
      return true; // Если кошелька нет в базе, считаем что нужно обновить данные
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Если нет данных о последнем спине, считаем что нужно обновить
    if (!walletData.lastSpinDate) {
      return true;
    }
    
    // Проверяем дату последнего спина
    const lastSpinDate = walletData.lastSpinDate.split('T')[0];
    
    // Если последний спин был не сегодня - нужно обновить спины
    if (lastSpinDate !== today) {
      return true;
    }
    
    // Если последний спин был сегодня, проверяем время
    const lastSpin = new Date(walletData.lastSpinDate);
    const nowUTC = new Date();
    const nowUTCHours = nowUTC.getUTCHours();
    const lastSpinUTCHours = lastSpin.getUTCHours();
    
    // Если сейчас после 3:00 UTC, а последний спин был до 3:00 UTC - нужно обновить спины
    if (nowUTCHours >= 3 && lastSpinUTCHours < 3) {
      return true;
    }
    
    return false;
  }

  /**
   * Сброс флага ежедневной транзакции при наступлении нового дня
   */
  resetDailyTransferFlagIfNewDay(address: string): void {
    const walletData = this.getWalletDataSync(address);
    if (!walletData) {
      return;
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Проверяем дату последней ежедневной транзакции
    const lastTransferDate = walletData.lastTransferDate ? walletData.lastTransferDate.split('T')[0] : null;
    
    // Если последняя ежедневная транзакция была не сегодня - сбрасываем флаг
    if (lastTransferDate && lastTransferDate !== today) {
      const data = this.loadData();
      const walletIndex = data.wallets.findIndex(w => w.address.toLowerCase() === address.toLowerCase());
      
      if (walletIndex >= 0) {
        data.wallets[walletIndex].todayTransfer = false;
        data.lastUpdate = new Date().toISOString();
        this.saveData(data);
        console.log(`🔄 Сброшен флаг ежедневной транзакции для кошелька ${address} (новый день)`);
      }
    }
  }

  /**
   * Синхронное получение данных кошелька (без async)
   */
  private getWalletDataSync(address: string): WalletData | null {
    const data = this.loadData();
    return data.wallets.find(w => w.address.toLowerCase() === address.toLowerCase()) || null;
  }

  /**
   * Проверка доступных спинов для кошелька
   */
  async checkSpinsAvailable(address: string): Promise<boolean> {
    const walletData = await this.getWalletData(address);
    if (!walletData) {
      return false;
    }
    
    // Проверяем доступные спины
    return !!(walletData.spinsAvailable && walletData.spinsAvailable > 0);
  }

  /**
   * Уменьшение количества доступных спинов
   */
  async decrementSpins(address: string): Promise<void> {
    const data = this.loadData();
    const walletIndex = data.wallets.findIndex(w => w.address.toLowerCase() === address.toLowerCase());
    
    if (walletIndex >= 0) {
      const currentSpins = data.wallets[walletIndex].spinsAvailable || 0;
      if (currentSpins > 0) {
        data.wallets[walletIndex].spinsAvailable = currentSpins - 1;
        data.wallets[walletIndex].lastActivity = new Date().toISOString();
        data.lastUpdate = new Date().toISOString();
        this.saveData(data);
      }
    }
  }

  /**
   * Обновление времени последнего спина
   */
  async updateLastSpinDate(address: string): Promise<void> {
    const data = this.loadData();
    const walletIndex = data.wallets.findIndex(w => w.address.toLowerCase() === address.toLowerCase());
    
    if (walletIndex >= 0) {
      data.wallets[walletIndex].lastSpinDate = new Date().toISOString();
      data.wallets[walletIndex].lastActivity = new Date().toISOString();
      data.lastUpdate = new Date().toISOString();
      this.saveData(data);
      console.log(`🔄 Обновлено время последнего спина для кошелька ${address}`);
    }
  }

  /**
   * Принудительное обновление данных кошелька после спина
   */
  async forceUpdateWalletData(address: string, newData: Partial<WalletData>): Promise<void> {
    const data = this.loadData();
    const walletIndex = data.wallets.findIndex(w => w.address.toLowerCase() === address.toLowerCase());
    
    if (walletIndex >= 0) {
      const oldData = { ...data.wallets[walletIndex] };
      
      // Принудительно обновляем все переданные поля
      data.wallets[walletIndex] = {
        ...data.wallets[walletIndex],
        ...newData,
        lastActivity: new Date().toISOString()
      };
      
      data.lastUpdate = new Date().toISOString();
      this.saveData(data);
      
      // Показываем изменения
      const changes: string[] = [];
      Object.keys(newData).forEach(key => {
        const oldValue = oldData[key as keyof WalletData];
        const newValue = newData[key as keyof WalletData];
        if (oldValue !== newValue) {
          changes.push(`${key}: ${oldValue} → ${newValue}`);
        }
      });
      
      if (changes.length > 0) {
        console.log(`📊 Обновлены данные кошелька ${address}: ${changes.join(', ')}`);
      }
    }
  }

  /**
   * Получение баланса кошелька через RPC
   */
  private async getBalanceViaRPC(address: string): Promise<string | undefined> {
    try {
      const client = createPublicClient({
        chain: linea,
        transport: http('https://linea-mainnet.blastapi.io/0e189c72-1523-48e1-8727-7dd520f19c1f')
      });
      
      const balance = await client.getBalance({ address: address as `0x${string}` });
      const balanceInEth = formatEther(balance);
      
      return `${parseFloat(balanceInEth).toFixed(4)} ETH`;
      
    } catch (error) {
      console.error('❌ Ошибка получения баланса через RPC:', error);
      return undefined;
    }
  }

  /**
   * Получение баланса WETH кошелька через RPC
   */
  private async getWETHBalanceViaRPC(address: string): Promise<string | undefined> {
    try {
      const client = createPublicClient({
        chain: linea,
        transport: http('https://linea-mainnet.blastapi.io/0e189c72-1523-48e1-8727-7dd520f19c1f')
      });
      
      // ABI для функции balanceOf ERC20 токена
      const balanceOfAbi = [{
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
      }] as const;
      
      // Адрес WETH контракта на Linea
      const wethAddress = '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f';
      
      const balance = await client.readContract({
        address: wethAddress as `0x${string}`,
        abi: balanceOfAbi,
        functionName: 'balanceOf',
        args: [address as `0x${string}`]
      });
      
      const balanceInWeth = formatEther(balance);
      
      return `${parseFloat(balanceInWeth).toFixed(9)} WETH`;
      
    } catch (error) {
      console.error('❌ Ошибка получения баланса WETH через RPC:', error);
      return undefined;
    }
  }

  /**
   * Обновление баланса кошелька через RPC
   */
  async updateWalletBalance(address: string): Promise<boolean> {
    try {
      const balance = await this.getBalanceViaRPC(address);
      if (balance) {
        const data = this.loadData();
        const walletIndex = data.wallets.findIndex(w => w.address.toLowerCase() === address.toLowerCase());
        
        if (walletIndex >= 0) {
          data.wallets[walletIndex].balance = balance;
          data.lastUpdate = new Date().toISOString();
          this.saveData(data);
          return true;
        } else {
          return false;
        }
      }
      return false;
    } catch (error) {
      console.error('❌ Ошибка обновления баланса:', error);
      return false;
    }
  }

  /**
   * Обновление баланса WETH кошелька через RPC
   */
  async updateWalletWETHBalance(address: string): Promise<boolean> {
    try {
      const wethBalance = await this.getWETHBalanceViaRPC(address);
      if (wethBalance) {
        const data = this.loadData();
        const walletIndex = data.wallets.findIndex(w => w.address.toLowerCase() === address.toLowerCase());
        
        if (walletIndex >= 0) {
          data.wallets[walletIndex].wethBalance = wethBalance;
          data.lastUpdate = new Date().toISOString();
          this.saveData(data);
          return true;
        } else {
          return false;
        }
      }
      return false;
    } catch (error) {
      console.error('❌ Ошибка обновления баланса WETH:', error);
      return false;
    }
  }

  /**
   * Обновление балансов всех кошельков через RPC
   */
  async updateAllWalletBalances(): Promise<void> {
    try {
      const data = this.loadData();
      
      for (const wallet of data.wallets) {
        await this.updateWalletBalance(wallet.address);
        await this.updateWalletWETHBalance(wallet.address);
        // Небольшая задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('❌ Ошибка обновления балансов:', error);
    }
  }

  /**
   * Выполнение transfer WETH
   */
  async performWETHTransfer(privateKey: string, amount: string): Promise<{ success: boolean; hash?: string; error?: string }> {
    try {
      const client = createPublicClient({
        chain: linea,
        transport: http('https://linea-mainnet.blastapi.io/0e189c72-1523-48e1-8727-7dd520f19c1f')
      });

      const walletClient = createWalletClient({
        account: privateKeyToAccount(privateKey as `0x${string}`),
        chain: linea,
        transport: http('https://linea-mainnet.blastapi.io/0e189c72-1523-48e1-8727-7dd520f19c1f')
      });

      // Адрес WETH контракта на Linea
      const wethAddress = '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f';
      
      // ABI для функции transfer
      const transferAbi = [{
        name: 'transfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' }
        ],
        outputs: [{ name: '', type: 'bool' }]
      }] as const;

      // Отправляем самому себе
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const toAddress = account.address;

      // Конвертируем сумму в wei
      const amountInWei = parseEther(amount);

      console.log(`🔗 Выполняем transfer WETH на сумму ${amount} WETH самому себе...`);

      const hash = await walletClient.writeContract({
        address: wethAddress as `0x${string}`,
        abi: transferAbi,
        functionName: 'transfer',
        args: [toAddress as `0x${string}`, amountInWei]
      });

      console.log(`📝 Транзакция отправлена: ${hash}`);

      // Ждём подтверждения транзакции
      console.log('⏳ Ожидаем подтверждения транзакции...');
      const receipt = await client.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        console.log('✅ Транзакция подтверждена!');
        return { success: true, hash };
      } else {
        console.log('❌ Транзакция не прошла');
        return { success: false, error: 'Transaction failed' };
      }

    } catch (error) {
      console.error('❌ Ошибка выполнения transfer:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Выполнение deposit в WETH контракт
   */
  async performWETHDeposit(privateKey: string, amount: string): Promise<{ success: boolean; hash?: string; error?: string }> {
    try {
      const client = createPublicClient({
        chain: linea,
        transport: http('https://linea-mainnet.blastapi.io/0e189c72-1523-48e1-8727-7dd520f19c1f')
      });

      const walletClient = createWalletClient({
        account: privateKeyToAccount(privateKey as `0x${string}`),
        chain: linea,
        transport: http('https://linea-mainnet.blastapi.io/0e189c72-1523-48e1-8727-7dd520f19c1f')
      });

      // Адрес WETH контракта на Linea
      const wethAddress = '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f';
      
      // ABI для функции deposit
      const depositAbi = [{
        name: 'deposit',
        type: 'function',
        stateMutability: 'payable',
        inputs: [],
        outputs: []
      }] as const;

      // Конвертируем сумму в wei
      const amountInWei = parseEther(amount);

      console.log(`🔗 Выполняем deposit в WETH на сумму ${amount} ETH...`);

      const hash = await walletClient.writeContract({
        address: wethAddress as `0x${string}`,
        abi: depositAbi,
        functionName: 'deposit',
        value: amountInWei
      });

      console.log(`📝 Транзакция отправлена: ${hash}`);

      // Ждём подтверждения транзакции
      console.log('⏳ Ожидаем подтверждения транзакции...');
      const receipt = await client.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        console.log('✅ Транзакция подтверждена!');
        return { success: true, hash };
      } else {
        console.log('❌ Транзакция не прошла');
        return { success: false, error: 'Transaction failed' };
      }

    } catch (error) {
      console.error('❌ Ошибка выполнения deposit:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Проверка и пополнение баланса WETH если он равен 0
   */
  async checkAndDepositWETH(privateKey: string): Promise<boolean> {
    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const address = account.address;

      // Получаем текущий баланс WETH
      const currentWETHBalance = await this.getWETHBalanceViaRPC(address);
      
      if (!currentWETHBalance) {
        console.log('❌ Не удалось получить баланс WETH');
        return false;
      }

      const wethAmount = parseFloat(currentWETHBalance.replace(' WETH', ''));
      
      if (wethAmount > 0) {
        console.log(`✅ Баланс WETH: ${currentWETHBalance} - пополнение не требуется`);
        return true;
      }

      console.log(`💰 Баланс WETH равен 0, выполняем deposit...`);

      // Генерируем случайную сумму от 0.000000001 до 0.000001
      const minAmount = 0.000000001;
      const maxAmount = 0.000001;
      const randomAmount = (Math.random() * (maxAmount - minAmount) + minAmount).toFixed(9);

      console.log(`🎲 Случайная сумма для deposit: ${randomAmount} ETH`);

      // Выполняем deposit
      const result = await this.performWETHDeposit(privateKey, randomAmount);

      if (result.success) {
        // Ждём больше времени для обновления баланса в блокчейне
        console.log('⏳ Ждём обновления баланса в блокчейне...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Пробуем несколько раз получить обновленный баланс
        let newWETHBalance: string | undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
          newWETHBalance = await this.getWETHBalanceViaRPC(address);
          if (newWETHBalance) {
            const wethAmount = parseFloat(newWETHBalance.replace(' WETH', ''));
            if (wethAmount > 0) {
              break;
            }
          }
          if (attempt < 2) {
            console.log(`⏳ Попытка ${attempt + 2}/3 получения баланса...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        
        if (newWETHBalance) {
          // Обновляем данные в базе
          const data = this.loadData();
          const walletIndex = data.wallets.findIndex(w => w.address.toLowerCase() === address.toLowerCase());
          
          if (walletIndex >= 0) {
            // Обновляем существующий кошелёк
            data.wallets[walletIndex].wethBalance = newWETHBalance;
            data.wallets[walletIndex].lastActivity = new Date().toISOString();
          } else {
            // Создаём новую запись кошелька если его нет в базе
            const newWallet: WalletData = {
              address,
              wethBalance: newWETHBalance,
              lastActivity: new Date().toISOString(),
              connectedAt: new Date().toISOString()
            };
            data.wallets.push(newWallet);
            console.log(`📝 Создана новая запись кошелька: ${address}`);
          }
          
          data.lastUpdate = new Date().toISOString();
          this.saveData(data);
          
          console.log(`✅ Баланс WETH обновлён: ${newWETHBalance}`);
          
          // Задержка после успешной транзакции deposit
          await delayAfterSuccessfulTransaction();
          
          return true;
        } else {
          console.log('⚠️ Не удалось получить обновленный баланс WETH');
        }
      } else {
        console.log(`❌ Ошибка deposit: ${result.error}`);
      }

      return false;

    } catch (error) {
      console.error('❌ Ошибка проверки и пополнения WETH:', error);
      return false;
    }
  }

  /**
   * Обновление статуса ежедневной транзакции
   */
  async updateDailyTransferStatus(address: string, date: string, amount: string): Promise<void> {
    const data = this.loadData();
    const walletIndex = data.wallets.findIndex(w => w.address.toLowerCase() === address.toLowerCase());
    
    if (walletIndex >= 0) {
      // Обновляем существующий кошелёк
      data.wallets[walletIndex].todayTransfer = true;
      data.wallets[walletIndex].lastTransferDate = date;
      data.wallets[walletIndex].transferAmount = amount;
      data.wallets[walletIndex].lastActivity = new Date().toISOString();
    } else {
      // Создаём новую запись кошелька если его нет в базе
      const newWallet: WalletData = {
        address,
        todayTransfer: true,
        lastTransferDate: date,
        transferAmount: amount,
        lastActivity: new Date().toISOString(),
        connectedAt: new Date().toISOString()
      };
      data.wallets.push(newWallet);
      console.log(`📝 Создана новая запись кошелька: ${address}`);
    }
    
    data.lastUpdate = new Date().toISOString();
    this.saveData(data);
    
    console.log(`✅ Статус ежедневной транзакции обновлён: ${date}, сумма: ${amount} WETH`);
  }

  /**
   * Проверка и выполнение ежедневной транзакции WETH
   */
  async checkAndPerformDailyTransfer(privateKey: string): Promise<boolean> {
    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const address = account.address;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Получаем данные кошелька
      const walletData = await this.getWalletData(address);
      
      // Проверяем, была ли уже транзакция сегодня
      if (walletData?.lastTransferDate === today) {
        console.log('✅ Ежедневная транзакция WETH уже выполнена сегодня');
        return true;
      }

      // Проверяем баланс WETH
      const wethBalance = await this.getWETHBalanceViaRPC(address);
      if (!wethBalance) {
        console.log('❌ Не удалось получить баланс WETH');
        return false;
      }

      const wethAmount = parseFloat(wethBalance.replace(' WETH', ''));
      if (wethAmount <= 0) {
        console.log('❌ Недостаточно WETH для ежедневной транзакции');
        return false;
      }

      console.log(`🎯 Выполняем ежедневную транзакцию WETH...`);

      // Генерируем случайную сумму от 1% до 99%
      const minPercent = 0.01; // 1%
      const maxPercent = 0.99; // 99%
      const transferPercent = Math.random() * (maxPercent - minPercent) + minPercent;
      const transferAmount = (wethAmount * transferPercent).toFixed(9);

      console.log(`🎲 Случайная сумма для transfer: ${transferAmount} WETH (${(transferPercent * 100).toFixed(1)}%)`);

      // Выполняем transfer
      const result = await this.performWETHTransfer(privateKey, transferAmount);

      if (result.success) {
        // Обновляем статус в базе данных
        await this.updateDailyTransferStatus(address, today, transferAmount);
        console.log(`✅ Ежедневная транзакция WETH выполнена успешно`);
        
        // Задержка после успешной транзакции transfer
        await delayAfterSuccessfulTransaction();
        
        return true;
      } else {
        console.log(`❌ Ошибка ежедневной транзакции: ${result.error}`);
        return false;
      }

    } catch (error) {
      console.error('❌ Ошибка проверки и выполнения ежедневной транзакции:', error);
      return false;
    }
  }

  /**
   * Сброс флагов ежедневных транзакций в начале нового дня
   */
  async resetDailyTransferFlags(): Promise<void> {
    const data = this.loadData();
    const today = new Date().toISOString().split('T')[0];
    let updated = false;

    for (const wallet of data.wallets) {
      if (wallet.lastTransferDate && wallet.lastTransferDate !== today) {
        wallet.todayTransfer = false;
        updated = true;
      }
    }

    if (updated) {
      data.lastUpdate = new Date().toISOString();
      this.saveData(data);
      console.log('🔄 Сброшены флаги ежедневных транзакций для нового дня');
    }
  }
}
