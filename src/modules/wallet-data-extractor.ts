import { Page } from 'playwright';
import { WalletData } from './database';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatEther } from 'viem';
import { linea } from 'viem/chains';

export interface WalletDataExtractorConfig {
  timeout?: number;
  retryAttempts?: number;
}

export class WalletDataExtractor {
  private config: WalletDataExtractorConfig;

  constructor(config: WalletDataExtractorConfig = {}) {
    this.config = {
      timeout: 10000,
      retryAttempts: 3,
      ...config
    };
  }

  /**
   * Получение адреса из приватного ключа
   */
  private getAddressFromPrivateKey(privateKey: string): string {
    try {
      // Создаем аккаунт из приватного ключа
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      return account.address.toLowerCase();
    } catch (error) {
      console.error('❌ Ошибка получения адреса из приватного ключа:', error);
      throw error;
    }
  }

  /**
   * Извлечение данных о кошельке из карточки на странице
   */
  async extractWalletData(page: Page, privateKey: string): Promise<WalletData | null> {
    try {
      // Ждём загрузки страницы
      await page.waitForTimeout(3000);
      
      // Получаем адрес кошелька из приватного ключа
      const walletAddress = this.getAddressFromPrivateKey(privateKey);
      
      // Извлекаем баланс ETH (сначала через RPC, затем с страницы)
      const balance = await this.extractBalance(page, walletAddress);
      
      // Извлекаем баланс WETH через RPC
      const wethBalance = await this.getWETHBalanceViaRPC(walletAddress);
      
      // Извлекаем информацию о спинах
      const spinInfo = await this.extractSpinInfo(page);
      
      // Создаём объект с данными кошелька
      const walletData: WalletData = {
        address: walletAddress,
        balance: balance || undefined,
        wethBalance: wethBalance || undefined,
        spinsAvailable: spinInfo.spinsAvailable !== undefined ? spinInfo.spinsAvailable : undefined,
        prizesWon: spinInfo.prizesWon !== undefined ? spinInfo.prizesWon : undefined,
        gamesPlayed: spinInfo.gamesPlayed !== undefined ? spinInfo.gamesPlayed : undefined,
        dayStreak: spinInfo.dayStreak !== undefined ? spinInfo.dayStreak : undefined,
        nextSpinTime: spinInfo.nextSpinTime || undefined,
        connectedAt: new Date().toISOString()
      };
      
      return walletData;
      
    } catch (error) {
      console.error('❌ Ошибка извлечения данных о кошельке:', error);
      return null;
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
   * Извлечение баланса кошелька (сначала через RPC, затем с страницы)
   */
  private async extractBalance(page: Page, address?: string): Promise<string | undefined> {
    try {
      // Сначала пытаемся получить баланс через RPC
      if (address) {
        const rpcBalance = await this.getBalanceViaRPC(address);
        if (rpcBalance) {
          return rpcBalance;
        }
      }
      
      // Если RPC не сработал, пытаемся извлечь с страницы
      
      const balanceSelectors = [
        '[data-testid="balance"]',
        '.balance',
        'div[class*="balance"]',
        'span[class*="balance"]',
        'div:has-text("ETH")',
        'span:has-text("ETH")'
      ];
      
      for (const selector of balanceSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.textContent();
            if (text) {
              // Ищем баланс в формате числа с ETH
              const balanceMatch = text.match(/(\d+\.?\d*)\s*ETH/);
              if (balanceMatch) {
                return `${balanceMatch[1]} ETH`;
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
      
      return undefined;
    } catch (error) {
      console.error('❌ Ошибка извлечения баланса:', error);
      return undefined;
    }
  }

  /**
   * Извлечение информации о спинах и играх
   */
  private async extractSpinInfo(page: Page): Promise<{
    spinsAvailable: number | undefined;
    prizesWon: number | undefined;
    gamesPlayed: number | undefined;
    dayStreak: number | undefined;
    nextSpinTime: string | undefined;
  }> {
    try {
      // Ищем элементы с информацией о спинах, призах и играх
      const spinSelectors = [
        // Более специфичные селекторы для поиска элементов со спинами
        'div:has-text("x0 Spins")',
        'span:has-text("x0 Spins")',
        'div:has-text("x1 Spins")',
        'span:has-text("x1 Spins")',
        'div:has-text("x2 Spins")',
        'span:has-text("x2 Spins")',
        'div:has-text("x3 Spins")',
        'span:has-text("x3 Spins")',
        // Альтернативные форматы
        'div:has-text("0 Spins")',
        'span:has-text("0 Spins")',
        'div:has-text("1 Spins")',
        'span:has-text("1 Spins")',
        'div:has-text("2 Spins")',
        'span:has-text("2 Spins")',
        'div:has-text("3 Spins")',
        'span:has-text("3 Spins")',
        // Общие селекторы для спина
        'div:has-text("Spins")',
        'span:has-text("Spins")',
        '[data-testid="spins"]',
        '.spins'
      ];
      
      let spinsAvailable: number | undefined = undefined;
      let prizesWon: number | undefined = undefined;
      let gamesPlayed: number | undefined = undefined;
      let dayStreak: number | undefined = undefined;
      let nextSpinTime: string | undefined = undefined;
      
      // Извлекаем данные из всех найденных элементов
      for (const selector of spinSelectors) {
        try {
          const elements = await page.$$(selector);
          
          for (const element of elements) {
            const text = await element.textContent();
            if (text) {
              // Проверяем, что элемент не является адресом кошелька
              if (text.includes('0x') && text.length < 20) {
                continue;
              }
              
              // Ищем количество доступных спинов (разные форматы)
              let spinsMatch = text.match(/x(\d+)\s*Spins/i);
              if (!spinsMatch) {
                spinsMatch = text.match(/(\d+)\s*Spins/i);
              }
              if (!spinsMatch) {
                spinsMatch = text.match(/Spins\s*(\d+)/i);
              }
              
              if (spinsMatch) {
                spinsAvailable = parseInt(spinsMatch[1]);
              }
              
              // Ищем количество призов (0 prizes)
              const prizesMatch = text.match(/(\d+)\s*prizes?/i);
              if (prizesMatch) {
                prizesWon = parseInt(prizesMatch[1]);
              }
              
              // Ищем количество игр (2 plays)
              const playsMatch = text.match(/(\d+)\s*plays?/i);
              if (playsMatch) {
                gamesPlayed = parseInt(playsMatch[1]);
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
      
      // Ищем информацию о дневных стриках
      const streakSelectors = [
        'div:has-text("day streak")',
        'span:has-text("day streak")',
        'div:has-text("streak")',
        'span:has-text("streak")'
      ];
      
      for (const selector of streakSelectors) {
        try {
          const elements = await page.$$(selector);
          for (const element of elements) {
            const text = await element.textContent();
            if (text) {
              // Ищем дневные стрики (1 day streak)
              const streakMatch = text.match(/(\d+)\s*day\s*streak/i);
              if (streakMatch) {
                dayStreak = parseInt(streakMatch[1]);
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
      
      // Ищем время до следующего обновления спинов
      const timeSelectors = [
        'div:has-text("refresh")',
        'span:has-text("refresh")',
        'div:has-text("Your spins refresh")',
        'span:has-text("Your spins refresh")'
      ];
      
      for (const selector of timeSelectors) {
        try {
          const elements = await page.$$(selector);
          for (const element of elements) {
            const text = await element.textContent();
            if (text) {
              // Ищем время в формате 04h 08m 00s
              const timeMatch = text.match(/(\d{2})h\s*(\d{2})m\s*(\d{2})s/);
              if (timeMatch) {
                nextSpinTime = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`;
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
      
      return { spinsAvailable, prizesWon, gamesPlayed, dayStreak, nextSpinTime };
    } catch (error) {
      console.error('❌ Ошибка извлечения информации о спинах:', error);
      return { 
        spinsAvailable: undefined, 
        prizesWon: undefined, 
        gamesPlayed: undefined, 
        dayStreak: undefined, 
        nextSpinTime: undefined 
      };
    }
  }



  /**
   * Ожидание появления карточки кошелька
   */
  async waitForWalletCard(page: Page): Promise<boolean> {
    try {
      const cardSelectors = [
        '/html/body/div[2]/div/div[3]/main/div[1]/div[1]/div[2]/div[1]',
        '[data-testid="wallet-card"]',
        '.wallet-card',
        'div[class*="wallet"]'
      ];
      
      for (let attempt = 0; attempt < this.config.retryAttempts!; attempt++) {
        for (const selector of cardSelectors) {
          try {
            let element;
            
            // Проверяем, является ли селектор XPath
            if (selector.startsWith('/')) {
              // Используем XPath селектор через locator
              const elements = await page.locator(`xpath=${selector}`).all();
              element = elements[0];
            } else {
              // Используем CSS селектор
              element = await page.$(selector);
            }
            
            if (element) {
              return true;
            }
          } catch (error) {
            continue;
          }
        }
        
        if (attempt < this.config.retryAttempts! - 1) {
          await page.waitForTimeout(2000);
        }
      }
      
      return false;
    } catch (error) {
      console.error('❌ Ошибка ожидания карточки кошелька:', error);
      return false;
    }
  }
}
